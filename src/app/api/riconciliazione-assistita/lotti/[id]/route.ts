import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { fascia } from '@/lib/reconciliation/punteggio'
import { aggiornaFreschezza } from '@/lib/services/reconciliation-freshness'

interface Parametri {
  id: string
}

/**
 * Anche queste due rotte non hanno oggi un consumer di produzione: la deroga
 * alla regola di `src/CLAUDE.md` sul codice irraggiungibile è argomentata per
 * intero in cima a `../route.ts`, e vale per tutte e quattro.
 */

/**
 * GET — il lotto con le sue proposte.
 *
 * Prima di rispondere si ricontrolla la freschezza: una proposta la cui
 * scadenza è stata saldata altrove si marca superata invece di comparire come
 * approvabile.
 *
 * I contatori contano **proposte**, sempre. La somma delle tre fasce deve fare
 * il totale in attesa: è il difetto più visibile di CashKing, e nasce dal
 * contare proposte in un posto e schede in un altro.
 *
 * Per la stessa ragione i quattro campi `conta*` del lotto **non compaiono in
 * questa risposta**, benché esistano sulla riga: sono un'istantanea scritta a
 * fine generazione, mentre `contatori` è ricalcolato adesso, dopo
 * `aggiornaFreschezza`. Metterli entrambi nello stesso payload significa che
 * sulla richiesta stessa in cui N proposte vengono superate, il lotto direbbe
 * `contaSuperate: 0` e i contatori direbbero `superate: N` — di nuovo due
 * numeri discordi nella stessa schermata, la forma del difetto solo spostata.
 * `contatori` è la fonte unica; per lo storico sintetico c'è `GET /lotti`.
 */
export const GET = withAuth<Parametri>(
  async (_request, { venueId, params }) => {
    try {
      const lotto = await prisma.reconciliationBatch.findFirst({
        where: { id: params.id, venueId },
        select: {
          id: true,
          dateFrom: true,
          dateTo: true,
          regoleUsate: true,
          sogliaMinima: true,
          stato: true,
          aiReferto: true,
          aiRefertoAt: true,
          createdAt: true,
        },
      })

      if (!lotto) {
        return NextResponse.json({ error: 'Lotto non trovato' }, { status: 404 })
      }

      await aggiornaFreschezza(lotto.id, venueId)

      const proposte = await prisma.reconciliationProposal.findMany({
        where: { batchId: lotto.id },
        orderBy: [{ stato: 'asc' }, { punteggio: 'desc' }],
        select: {
          id: true,
          regola: true,
          punteggio: true,
          fattori: true,
          motivazioni: true,
          stato: true,
          bankTransaction: {
            select: { id: true, transactionDate: true, description: true, amount: true },
          },
          gambe: {
            select: {
              id: true,
              importo: true,
              schedule: {
                select: {
                  id: true,
                  descrizione: true,
                  dataScadenza: true,
                  numeroDocumento: true,
                  controparteNome: true,
                  importoTotale: true,
                  importoPagato: true,
                  invoice: { select: { id: true, invoiceNumber: true, supplierName: true } },
                },
              },
            },
          },
        },
      })

      const inAttesa = proposte.filter((p) => p.stato === 'in_attesa')
      const contatori = {
        totali: proposte.length,
        inAttesa: inAttesa.length,
        approvate: proposte.filter((p) => p.stato === 'approvata').length,
        scartate: proposte.filter((p) => p.stato === 'scartata').length,
        superate: proposte.filter((p) => p.stato === 'superata').length,
        alta: inAttesa.filter((p) => fascia(p.punteggio) === 'alta').length,
        media: inAttesa.filter((p) => fascia(p.punteggio) === 'media').length,
        bassa: inAttesa.filter((p) => fascia(p.punteggio) === 'bassa').length,
      }

      return NextResponse.json({ lotto, proposte, contatori })
    } catch (errore) {
      logger.error('Lettura del lotto fallita', errore)
      return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)

/** DELETE — cancella un lotto su cui non è stato deciso nulla. */
export const DELETE = withAuth<Parametri>(
  async (_request, { venueId, user, params }) => {
    try {
      const lotto = await prisma.reconciliationBatch.findFirst({
        where: { id: params.id, venueId },
        select: { id: true, dateFrom: true, dateTo: true, contaProposte: true, contaApprovate: true },
      })

      if (!lotto) {
        return NextResponse.json({ error: 'Lotto non trovato' }, { status: 404 })
      }

      if (lotto.contaApprovate > 0) {
        return NextResponse.json(
          { error: 'Il lotto contiene approvazioni: cancellarlo perderebbe la traccia di cosa è stato deciso' },
          { status: 409 }
        )
      }

      // Le proposte e le gambe cadono per cascata (vedi la migrazione)
      await prisma.reconciliationBatch.delete({ where: { id: lotto.id } })

      // Simmetrico alla scrittura del POST: la creazione lascia traccia, la
      // distruzione anche. `ReconciliationBatch` non è a cancellazione
      // logica, quindi senza questo l'unica prova che il lotto sia esistito
      // sparirebbe con lui.
      await createAuditLog({
        action: 'DELETE',
        entityType: 'ReconciliationBatch',
        entityId: lotto.id,
        userId: user.id ?? null,
        venueId,
        oldValues: {
          dateFrom: lotto.dateFrom.toISOString(),
          dateTo: lotto.dateTo.toISOString(),
          contaProposte: lotto.contaProposte,
        },
      })

      return new NextResponse(null, { status: 204 })
    } catch (errore) {
      logger.error('Cancellazione del lotto fallita', errore)
      return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
