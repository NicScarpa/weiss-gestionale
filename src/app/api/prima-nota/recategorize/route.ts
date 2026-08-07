import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { createAuditLog } from '@/lib/audit'
import { derivaBudgetCategoryDaConto } from '@/lib/accounts/mapping'
import { risolviCentroDiCosto } from '@/lib/services/cost-center-service'
import { logger } from '@/lib/logger'

/**
 * POST /api/prima-nota/recategorize
 * Riesegue le regole di categorizzazione sulle entry non verificate
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const venueId = await getVenueId()

    // Recupera regole attive per la venue
    const rules = await prisma.categorizationRule.findMany({
      where: {
        venueId,
        isActive: true,
      },
      orderBy: { priority: 'desc' },
      include: {
        budgetCategory: {
          select: { id: true, code: true },
        },
        account: {
          select: { id: true, code: true },
        },
      },
    })

    // Recupera entry da ricategorizzare. I movimenti suddivisi in fette
    // (allocations) sono esclusi: la loro categoria/conto è governata dalla
    // suddivisione, non dal batch di regole (vedi finding review allocation).
    // I movimenti generati da una chiusura (closureId valorizzato) sono
    // esclusi allo stesso modo: la loro riclassifica resta un gesto
    // deliberato dell'admin (vedi [id]/route.ts), non un effetto collaterale
    // di un batch automatico che gira senza scelta puntuale dell'utente.
    const entries = await prisma.journalEntry.findMany({
      where: {
        venueId,
        verified: false,
        hiddenAt: null,
        allocations: { none: {} },
        closureId: null,
      },
      take: 100, // Batch processing
    })

    let updated = 0
    let saltati = 0

    for (const entry of entries) {
      for (const rule of rules) {
        let match = false

        // Controllo keywords
        if (rule.keywords.length > 0) {
          const description = entry.description.toLowerCase()
          match = rule.keywords.some((kw) =>
            description.includes(kw.toLowerCase())
          )
        }

        // Controllo direzione
        if (match) {
          const isInflow = entry.debitAmount && Number(entry.debitAmount) > 0
          const isOutflow = entry.creditAmount && Number(entry.creditAmount) > 0

          if (rule.direction === 'INFLOW' && !isInflow) {
            match = false
          }
          if (rule.direction === 'OUTFLOW' && !isOutflow) {
            match = false
          }
        }

        if (match) {
          // Se la regola indica un conto, è il conto a decidere la categoria
          // (deriva da AccountBudgetMapping): vince su rule.budgetCategoryId.
          // Senza conto sulla regola, resta il comportamento precedente.
          const budgetCategoryId = rule.accountId
            ? await derivaBudgetCategoryDaConto(rule.accountId)
            : rule.budgetCategoryId

          // Il conto della regola può richiedere un centro di costo che il
          // movimento non ha: una riga sola non deve far fallire il batch, si
          // salta e si conta. Resterà da categorizzare a mano, dove l'utente
          // può scegliere il centro.
          const centro = await risolviCentroDiCosto(prisma, {
            accountId: rule.accountId,
            costCenterId: entry.costCenterId,
          })
          if (centro.outcome === 'invalid') {
            logger.warn('Ricategorizzazione: movimento saltato per il centro di costo', {
              journalEntryId: entry.id,
              ruleId: rule.id,
              code: centro.code,
            })
            saltati++
            break // La regola vincente è questa: nessun'altra viene provata
          }

          await prisma.journalEntry.update({
            where: { id: entry.id },
            data: {
              budgetCategoryId,
              accountId: rule.accountId,
              costCenterId: centro.costCenterId,
              appliedRuleId: rule.id,
              verified: rule.autoVerify,
              categorizationSource: 'rule',
            },
          })
          updated++
          break // Prima regola che match
        }
      }
    }

    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'JournalEntry',
      entityId: 'bulk-recategorize',
      venueId,
      newValues: { processed: entries.length, updated, saltati, rules: rules.length },
    })

    return NextResponse.json({
      processed: entries.length,
      updated,
      /** Righe che una regola avrebbe categorizzato, se non mancasse il centro di costo */
      saltati,
      rules: rules.length,
    })
  } catch (error) {
    console.error('Errore POST /api/prima-nota/recategorize', error)
    return NextResponse.json(
      { error: 'Errore nella ricategorizzazione' },
      { status: 500 }
    )
  }
}
