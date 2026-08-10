import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { money, toDb, type MoneyInput } from '@/lib/money'
import { toDebitCredit } from '@/lib/prima-nota-utils'
import { risolviCentroDiCosto } from '@/lib/services/cost-center-service'
import type { PaymentStatus } from '@prisma/client'

const eseguiSchema = z.object({
  costCenterId: z.string().optional().nullable(),
})

/**
 * Stati dai quali un pagamento può ancora entrare in contabilità.
 *
 * `DISPOSTO` e `COMPLETATO` sono esclusi di proposito: il movimento è già
 * stato scritto e rieseguirli lo duplicherebbe. Il vero sigillo però è
 * `journalEntryId: null` nella condizione di presa in carico — è il legame col
 * movimento, non lo stato, a dire se il pagamento è già in prima nota.
 */
const STATI_ESEGUIBILI: PaymentStatus[] = ['BOZZA', 'DA_APPROVARE', 'FALLITO']

type EsitoEsecuzione =
  | { esito: 'assente' }
  | { esito: 'conflitto'; motivo: string }
  | {
      esito: 'eseguito'
      payment: Awaited<ReturnType<typeof prisma.payment.update>>
      journalEntry: Awaited<ReturnType<typeof prisma.journalEntry.create>>
    }

/** Spiega perché la presa in carico non è andata a buon fine. */
function motivoDelRifiuto(pagamento: {
  stato: PaymentStatus
  journalEntryId: string | null
  importo: MoneyInput
}): string {
  if (pagamento.journalEntryId) {
    return 'Pagamento già registrato in prima nota'
  }

  if (money(pagamento.importo).lessThanOrEqualTo(0)) {
    return 'Importo del pagamento non valido'
  }

  return `Pagamento in stato ${pagamento.stato}: non è eseguibile`
}

/**
 * POST /api/pagamenti/[id]/esegui
 * Esegue un pagamento: scrive il movimento bancario e aggiorna lo stato.
 */
export async function POST(
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

    // La disposizione arriva anche senza corpo (è un bottone): un JSON assente
    // vale come nessun centro esplicito.
    const body = await request.json().catch(() => ({}))
    const { costCenterId } = eseguiSchema.parse(body)

    // Il movimento del pagamento non porta conto economico: il centro è quello
    // esplicito, se indicato, altrimenti il default. Si risolve prima della
    // transazione perché un centro non valido deve poter rifiutare la
    // richiesta senza aver preso in carico il pagamento: la presa in carico
    // scrive DISPOSTO, e un rollback dopo averlo scritto è lavoro sprecato su
    // una riga che altri stanno aspettando.
    const centro = await risolviCentroDiCosto(prisma, { accountId: null, costCenterId })
    if (centro.outcome === 'invalid') {
      return NextResponse.json(
        { error: centro.motivo, code: centro.code },
        { status: 400 }
      )
    }

    // Movimento e pagamento cambiano insieme o non cambiano affatto: senza
    // transazione un errore fra le due scritture lascerebbe in prima nota un
    // movimento che nessun pagamento rivendica.
    const esito = await prisma.$transaction<EsitoEsecuzione>(async (tx) => {
      // Presa in carico: è un aggiornamento condizionale, non una lettura
      // seguita da una scrittura. Due richieste simultanee si serializzano sul
      // lock di riga e la seconda rivaluta la condizione sullo stato appena
      // scritto dalla prima, trovando zero righe da aggiornare.
      const presoInCarico = await tx.payment.updateMany({
        where: {
          id,
          deletedAt: null,
          journalEntryId: null,
          stato: { in: STATI_ESEGUIBILI },
          importo: { gt: 0 },
        },
        data: { stato: 'DISPOSTO' },
      })

      if (presoInCarico.count === 0) {
        const esistente = await tx.payment.findUnique({
          where: { id },
          select: { stato: true, journalEntryId: true, importo: true, deletedAt: true },
        })

        if (!esistente || esistente.deletedAt) return { esito: 'assente' }
        return { esito: 'conflitto', motivo: motivoDelRifiuto(esistente) }
      }

      // Riga bloccata dalla presa in carico: quello che si legge qui è quello
      // che finisce nel movimento.
      const payment = await tx.payment.findUniqueOrThrow({ where: { id } })

      // Un pagamento è un'uscita di banca: l'importo va in AVERE. La direzione
      // non è scritta a mano qui ma decisa da getMovementDirection, l'unico
      // posto in cui vive la convenzione dare/avere del progetto.
      const { debitAmount, creditAmount } = toDebitCredit(
        'BANK',
        'USCITA',
        toDb(payment.importo)
      )

      const journalEntry = await tx.journalEntry.create({
        data: {
          venueId: payment.venueId,
          date: payment.dataEsecuzione,
          registerType: 'BANK',
          description: `Pagamento: ${payment.beneficiarioNome}${payment.causale ? ` - ${payment.causale}` : ''}`,
          documentRef: payment.riferimentoInterno || null,
          debitAmount,
          creditAmount,
          costCenterId: centro.costCenterId,
          costCenterSource: centro.origine,
          createdById: session.user.id,
          paymentId: payment.id,
          verified: true,
          notes: payment.note,
        },
      })

      const aggiornato = await tx.payment.update({
        where: { id },
        data: { journalEntryId: journalEntry.id },
      })

      return { esito: 'eseguito', payment: aggiornato, journalEntry }
    })

    if (esito.esito === 'assente') {
      return NextResponse.json({ error: 'Pagamento non trovato' }, { status: 404 })
    }

    if (esito.esito === 'conflitto') {
      return NextResponse.json({ error: esito.motivo }, { status: 409 })
    }

    return NextResponse.json({
      payment: esito.payment,
      journalEntry: esito.journalEntry,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/pagamenti/[id]/esegui', error)
    return NextResponse.json(
      { error: 'Errore nell\'esecuzione del pagamento' },
      { status: 500 }
    )
  }
}
