/**
 * I conti che il consenso copre, e le decisioni dell'amministratore su ognuno.
 *
 * Tre azioni possibili, e nessuna è il default:
 *  - `importa`  accende il conto, richiede un conto del gestionale e una data
 *               di taglio;
 *  - `ignora`   lo mette nella lista dei conti che il pannello non chiederà
 *               più (tipicamente un conto personale);
 *  - `lascia`   non fa niente, ed è quello che succede se non si decide.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { withAuth } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { lookupHash } from '@/lib/encryption'
import { clientDaAmbiente } from '@/lib/gocardless/servizio'
import { rispostaErroreGoCardless } from '@/lib/gocardless/risposte'
import { descriviStato, eCollegata } from '@/lib/gocardless/stati'
import { abbinaConti, type ContoDaBanca } from '@/lib/gocardless/abbinamento'

const corpoSalvataggio = z.object({
  conti: z.array(
    z.object({
      providerAccountId: z.string().min(1),
      azione: z.enum(['importa', 'ignora', 'lascia']),
      bankAccountId: z.string().optional(),
      /** `YYYY-MM-DD`. Obbligatoria solo per `importa`. */
      dataTaglio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
  ),
})

async function connessioneDellaSede(id: string, venueId: string) {
  return prisma.bankConnection.findFirst({ where: { id, venueId, deletedAt: null } })
}

/**
 * `YYYY-MM-DD` sintatticamente valido non è una data che esiste: `new
 * Date('2026-02-30...')` non lancia, normalizza in silenzio al primo marzo.
 * Si ricostruiscono i tre componenti e si confrontano con quelli scritti:
 * se il motore li ha corretti, la data non esisteva.
 */
function dataDiTaglioValida(valore: string): boolean {
  const [anno, mese, giorno] = valore.split('-').map(Number)
  const d = new Date(Date.UTC(anno, mese - 1, giorno))
  return d.getUTCFullYear() === anno && d.getUTCMonth() === mese - 1 && d.getUTCDate() === giorno
}

export const GET = withAuth<{ id: string }>(
  async (_request, { venueId, params }) => {
    try {
      const connessione = await connessioneDellaSede(params.id, venueId)
      if (!connessione) return NextResponse.json({ error: 'Collegamento non trovato' }, { status: 404 })

      const client = clientDaAmbiente()
      const requisition = await client.leggiRequisition(connessione.requisitionId)
      const stato = requisition.dati.status

      if (connessione.status !== stato) {
        await prisma.bankConnection.update({ where: { id: connessione.id }, data: { status: stato } })
      }

      if (!eCollegata(stato)) {
        return NextResponse.json({ stato: descriviStato(stato), conti: [] })
      }

      // I dettagli si chiedono un conto alla volta: è l'API a non avere una
      // lettura in blocco. Sono chiamate contate contro il limite giornaliero
      // (una per la requisition, più una per conto): questa è la rotta più
      // costosa della fase, e non va invocata a ogni render del pannello.
      const contiBanca: ContoDaBanca[] = []
      for (const id of requisition.dati.accounts) {
        const dettagli = await client.dettagliConto(id)
        contiBanca.push({
          providerAccountId: id,
          iban: dettagli.dati.account.iban ?? null,
          intestatario: dettagli.dati.account.ownerName ?? null,
          valuta: dettagli.dati.account.currency ?? null,
        })
      }

      const contiGestionale = (
        await prisma.bankAccount.findMany({
          where: { venueId, accountType: 'BANK' },
          select: { id: true, name: true, ibanHash: true, connectionId: true },
        })
      ).map((c) => ({ id: c.id, nome: c.name, ibanHash: c.ibanHash, connectionId: c.connectionId }))

      const abbinati = abbinaConti({
        contiBanca,
        contiGestionale,
        ignorati: connessione.contiIgnorati,
        impronta: lookupHash,
      })

      // La data dell'ultimo movimento che il gestionale possiede per ciascun
      // conto riconosciuto. Non è un valore da precompilare — la data di
      // taglio la sceglie l'amministratore — ma è il numero che gli serve
      // davanti per sceglierla: senza, deciderebbe a memoria.
      const idRiconosciuti = abbinati
        .filter((a) => a.tipo === 'riconosciuto' || a.tipo === 'gia-collegato')
        .map((a) => (a as { bankAccountId: string }).bankAccountId)

      const ultimi = new Map<string, string>()
      if (idRiconosciuti.length > 0) {
        const righe = await prisma.bankTransaction.groupBy({
          by: ['bankAccountId'],
          where: { bankAccountId: { in: idRiconosciuti }, deletedAt: null },
          _max: { transactionDate: true },
        })
        for (const r of righe) {
          const quando = r._max.transactionDate
          if (r.bankAccountId && quando) ultimi.set(r.bankAccountId, quando.toISOString().slice(0, 10))
        }
      }

      return NextResponse.json({
        stato: descriviStato(stato),
        conti: abbinati.map((a) =>
          'bankAccountId' in a
            ? { ...a, ultimoMovimento: ultimi.get(a.bankAccountId) ?? null }
            : { ...a, ultimoMovimento: null }
        ),
      })
    } catch (errore) {
      return rispostaErroreGoCardless(errore, 'GET /api/gocardless/collegamenti/[id]/conti')
    }
  },
  { roles: ['admin'], venueScoped: true }
)

export const PUT = withAuth<{ id: string }>(
  async (request, { venueId, params }) => {
    try {
      const connessione = await connessioneDellaSede(params.id, venueId)
      if (!connessione) return NextResponse.json({ error: 'Collegamento non trovato' }, { status: 404 })

      const analisi = corpoSalvataggio.safeParse(await request.json().catch(() => null))
      if (!analisi.success) return NextResponse.json({ error: 'Corpo non valido' }, { status: 400 })

      // Si valida tutto prima di scrivere qualsiasi cosa: metà configurazione
      // salvata è peggio di nessuna, perché sembra riuscita.

      // Due voci sullo stesso conto banca, con azioni in conflitto, non hanno
      // un vincitore sensato da dedurre: nella stessa transazione vince
      // l'ultima scritta, e se è `ignora` dopo un `importa` il conto resta
      // acceso ma sparisce dal pannello — irraggiungibile per spegnerlo.
      // Si rifiuta il corpo, non si sceglie per l'amministratore.
      const conteggio = new Map<string, number>()
      for (const c of analisi.data.conti) {
        conteggio.set(c.providerAccountId, (conteggio.get(c.providerAccountId) ?? 0) + 1)
      }
      const duplicato = [...conteggio.entries()].find(([, n]) => n > 1)
      if (duplicato) {
        return NextResponse.json(
          { error: `Il conto ${duplicato[0]} compare più di una volta nella richiesta, con azioni in conflitto` },
          { status: 400 }
        )
      }

      for (const c of analisi.data.conti) {
        if (c.azione !== 'importa') continue
        if (!c.bankAccountId) {
          return NextResponse.json({ error: `Il conto ${c.providerAccountId} è da importare ma non è abbinato` }, { status: 400 })
        }
        if (!c.dataTaglio) {
          return NextResponse.json({ error: `Il conto ${c.providerAccountId} è da importare ma non ha una data di taglio` }, { status: 400 })
        }
        if (!dataDiTaglioValida(c.dataTaglio)) {
          return NextResponse.json(
            { error: `Il conto ${c.providerAccountId} ha una data di taglio che non esiste (${c.dataTaglio})` },
            { status: 400 }
          )
        }
        // `accountType: 'BANK'`: la lettura propone come candidati solo i
        // conti bancari, e la scrittura deve rifiutare lo stesso l'id di una
        // cassa — altrimenti la si trasforma in un conto sincronizzato. È la
        // stessa tabella che nella Fase 1 aveva già morso per lo stesso
        // motivo, sul backfill.
        const esiste = await prisma.bankAccount.count({
          where: { id: c.bankAccountId, venueId, accountType: 'BANK' },
        })
        if (esiste === 0) {
          return NextResponse.json({ error: 'Conto del gestionale inesistente' }, { status: 400 })
        }
      }

      const ignorati = new Set(connessione.contiIgnorati)
      let salvati = 0

      await prisma.$transaction(async (tx) => {
        for (const c of analisi.data.conti) {
          if (c.azione === 'ignora') {
            ignorati.add(c.providerAccountId)
            salvati++
            continue
          }
          if (c.azione === 'lascia') continue

          ignorati.delete(c.providerAccountId)
          await tx.bankAccount.update({
            where: { id: c.bankAccountId! },
            data: {
              providerAccountId: c.providerAccountId,
              connectionId: connessione.id,
              syncEnabled: true,
              syncCutoffDate: new Date(`${c.dataTaglio}T00:00:00.000Z`),
            },
          })
          salvati++
        }

        await tx.bankConnection.update({
          where: { id: connessione.id },
          data: { contiIgnorati: [...ignorati] },
        })
      })

      return NextResponse.json({ salvati })
    } catch (errore) {
      return rispostaErroreGoCardless(errore, 'PUT /api/gocardless/collegamenti/[id]/conti')
    }
  },
  { roles: ['admin'], venueScoped: true }
)
