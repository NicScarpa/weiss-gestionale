import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { createAuditLog } from '@/lib/audit'
import { derivaBudgetCategoryDaConto } from '@/lib/accounts/mapping'
import { risolviCentroDiCosto } from '@/lib/services/cost-center-service'

// A differenza di PUT /api/prima-nota/[id] (CAMPI_RICLASSIFICABILI in
// [id]/route.ts: accountId + costCenterId, entrambi scelte indipendenti),
// questo schema non ha mai avuto un campo costCenterId proprio: l'unica leva
// è il conto, da cui centro di costo e categoria seguono come conseguenza
// automatica (risolviCentroDiCosto/derivaBudgetCategoryDaConto), non come
// scelte a parte. Riusare qui la lista di PUT sarebbe stato lo stesso
// difetto del bankAccountId in scadenzario/regole: una chiave che sembra
// ammessa ma che lo schema scarta comunque in silenzio.
const CAMPI_RICLASSIFICABILI_CHIUSURA: readonly string[] = ['accountId']

const categorizeSchema = z.object({
  budgetCategoryId: z.string().optional(),
  accountId: z.string().optional(),
  notes: z.string().optional(),
})

/**
 * PATCH /api/prima-nota/[id]/categorize
 * Assegna o modifica la categoria budget di una journal entry
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validated = categorizeSchema.parse(body)

    // Recupera la entry corrente
    const current = await prisma.journalEntry.findUnique({
      where: { id: id },
      select: { id: true, costCenterId: true, closureId: true, _count: { select: { allocations: true } } },
    })

    if (!current) {
      return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })
    }

    // Un movimento generato da chiusura segue lo stesso gate di ruolo del
    // PUT (solo admin) e un perimetro di scrittura altrettanto stretto, qui
    // ristretto a CAMPI_RICLASSIFICABILI_CHIUSURA (vedi commento in testa al
    // file sul perché è più stretto della whitelist del PUT).
    const isMovimentoDaChiusura = Boolean(current.closureId)

    if (isMovimentoDaChiusura) {
      if (session.user.role !== 'admin') {
        return NextResponse.json(
          { error: 'Solo un amministratore può riclassificare i movimenti generati da chiusura' },
          { status: 403 }
        )
      }

      const chiaviExtra = Object.keys(body).filter(
        (chiave) => !CAMPI_RICLASSIFICABILI_CHIUSURA.includes(chiave)
      )
      if (chiaviExtra.length > 0) {
        return NextResponse.json(
          {
            error: 'Sui movimenti generati da chiusura si possono modificare solo conto e centro di costo.',
            code: 'MOVIMENTO_DA_CHIUSURA_SOLO_RICLASSIFICA',
          },
          { status: 400 }
        )
      }
    }

    // Un movimento suddiviso in fette (Allocation) è governato dalla
    // suddivisione: la categorizzazione manuale non deve poterla scavalcare.
    if (current._count.allocations > 0) {
      return NextResponse.json(
        { error: 'Il movimento è suddiviso in fette: rimuovi prima la suddivisione' },
        { status: 409 }
      )
    }

    // Il conto è l'asse di imputazione: se arriva, la categoria si deriva
    // sempre dalla mappatura (il conto vince su una categoria esplicita).
    // Una categoria senza conto resta accettata durante la transizione.
    // `undefined` e non `null` quando non arriva né l'uno né l'altra: un
    // corpo senza categoria non è una richiesta di cancellarla, e con `null`
    // una PATCH vuota azzererebbe la categoria del movimento — anche di uno
    // da chiusura, che il filtro sulle chiavi lascia passare proprio perché
    // non porta chiavi.
    const budgetCategoryId = validated.accountId
      ? await derivaBudgetCategoryDaConto(validated.accountId)
      : validated.budgetCategoryId || undefined

    // Il nuovo conto può richiedere un centro di costo che il movimento non
    // ha: in quel caso la categorizzazione si ferma qui, il centro va scelto
    // prima (dal dettaglio del movimento).
    let costCenterId: string | undefined
    let costCenterSource: string | undefined
    if (validated.accountId) {
      const centro = await risolviCentroDiCosto(prisma, {
        accountId: validated.accountId,
        costCenterId: current.costCenterId,
      })
      if (centro.outcome === 'invalid') {
        return NextResponse.json(
          { error: centro.motivo, code: centro.code },
          { status: 400 }
        )
      }
      costCenterId = centro.costCenterId
      // Il centro si scrive sempre accompagnato dalla sua provenienza: senza,
      // resterebbe indistinguibile da uno indovinato dal sistema e le
      // automazioni lo tratterebbero come tale.
      costCenterSource = centro.origine
    }

    // Sui movimenti da chiusura la scrittura resta dentro il perimetro
    // dichiarato sopra: solo il conto (con centro di costo, provenienza del
    // centro e categoria budget come conseguenza automatica del conto, non
    // campi scelti a parte — il perimetro riguarda le chiavi ammesse nel
    // body, non i campi che il server ne deriva). notes,
    // categorizationSource e verified restano quelli del movimento da
    // chiusura: non è la categorizzazione manuale a deciderli qui.
    const data = isMovimentoDaChiusura
      ? {
          accountId: validated.accountId || undefined,
          costCenterId,
          costCenterSource,
          budgetCategoryId,
        }
      : {
          budgetCategoryId,
          accountId: validated.accountId || undefined,
          costCenterId,
          costCenterSource,
          notes: validated.notes || undefined,
          categorizationSource: 'manual',
          verified: true, // Auto-verify su categorizzazione manuale
        }

    const updated = await prisma.journalEntry.update({
      where: { id: id },
      data,
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'JournalEntry',
      entityId: id,
      newValues: { budgetCategoryId, accountId: validated.accountId },
    })

    return NextResponse.json({
      id: updated.id,
      budgetCategoryId: updated.budgetCategoryId,
      verified: updated.verified,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore PATCH /api/prima-nota/[id]/categorize', error)
    return NextResponse.json(
      { error: 'Errore nella categorizzazione' },
      { status: 500 }
    )
  }
}
