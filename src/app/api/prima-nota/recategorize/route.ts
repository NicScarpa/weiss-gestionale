import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { createAuditLog } from '@/lib/audit'
import { derivaBudgetCategoryDaConto } from '@/lib/accounts/mapping'
import {
  centroDaRiproporre,
  risolviCentroDiCosto,
  trovaCentroStrutturale,
} from '@/lib/services/cost-center-service'
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
    let daApprovare = 0
    let saltati = 0

    // Il centro di sistema serve a `centroDaRiproporre` per i movimenti che
    // non portano una provenienza (anteriori alla colonna): si legge una volta
    // per batch, non a ogni riga.
    const strutturale = await trovaCentroStrutturale(prisma)

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

          // Il batch gira senza nessuno davanti: se il conto della regola
          // pretende un centro che il movimento non ha, non c'è a chi
          // chiederlo, quindi il centro si suppone (operativo) invece di
          // saltare la riga. Il where del batch tocca solo movimenti non
          // verificati e senza fette: nulla di ciò che un umano ha approvato.
          //
          // La regola assegna un conto NUOVO: il centro che il movimento si
          // porta dietro va riproposto solo se qualcuno l'ha scelto. Se
          // l'aveva dettato la regola del conto di prima, o l'aveva supposto
          // il sistema, non giustifica più niente e si rivaluta sul conto
          // nuovo (stessa regola dell'ereditarietà delle fette).
          const centro = await risolviCentroDiCosto(
            prisma,
            {
              accountId: rule.accountId,
              costCenterId: centroDaRiproporre(entry, strutturale?.id ?? null),
            },
            'automatico'
          )
          if (centro.outcome === 'invalid') {
            // Resta possibile solo se il centro scelto sul movimento è sparito
            // o è stato disattivato: lì la regola non c'entra, si lascia stare.
            logger.warn('Ricategorizzazione: movimento saltato, il suo centro non è più valido', {
              journalEntryId: entry.id,
              ruleId: rule.id,
              code: centro.code,
            })
            saltati++
            break // La regola vincente è questa: nessun'altra viene provata
          }

          // Nessuna automazione può promuovere a verificato un movimento il
          // cui centro è stato indovinato: la spunta `autoVerify` della regola
          // vale per il conto che l'utente ha configurato, non per un centro
          // supposto dopo. Un centro dettato dal piano ('piano') invece la
          // rispetta, altrimenti `autoVerify` non si applicherebbe più a
          // nulla. La provenienza ignota è già stata trattata come non scelta
          // da `centroDaRiproporre`, quindi qui il centro è stato appena
          // rivalutato e l'origine è quella vera.
          const centroSupposto = centro.origine === 'supposto'
          if (centroSupposto) daApprovare++

          await prisma.journalEntry.update({
            where: { id: entry.id },
            data: {
              budgetCategoryId,
              accountId: rule.accountId,
              costCenterId: centro.costCenterId,
              costCenterSource: centro.origine,
              appliedRuleId: rule.id,
              verified: centroSupposto ? false : rule.autoVerify,
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
      newValues: { processed: entries.length, updated, daApprovare, saltati, rules: rules.length },
    })

    return NextResponse.json({
      processed: entries.length,
      updated,
      /** Righe categorizzate su un centro supposto dal sistema: restano da approvare a mano */
      daApprovare,
      /** Righe non toccate perché il centro scelto sul movimento non è più valido */
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
