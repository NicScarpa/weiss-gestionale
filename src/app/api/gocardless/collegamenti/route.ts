/**
 * Creare e leggere il collegamento a una banca.
 *
 * La riga si scrive PRIMA di restituire il link, non dopo: `POST
 * /requisitions/` crea una risorsa vera presso GoCardless, e se l'utente
 * chiude la scheda a metà quel consenso esiste comunque mentre il gestionale
 * non ne saprebbe nulla. Scrivere prima non costa niente — quella riga serve
 * comunque per mostrare «collegato a…» — e cambia solo il momento.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { withAuth } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { clientDaAmbiente } from '@/lib/gocardless/servizio'
import { rispostaErroreGoCardless } from '@/lib/gocardless/risposte'
import { descriviStato } from '@/lib/gocardless/stati'
import { logger } from '@/lib/logger'

const corpoCreazione = z.object({ istitutoId: z.string().min(1) })

/** Dove la banca rimanda a fine autenticazione. */
function urlDiRitorno(): string {
  const esplicito = process.env.GOCARDLESS_REDIRECT_URI
  if (esplicito) return esplicito
  const base = process.env.APP_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'
  return `${base}/api/gocardless/callback`
}

function giorni(valore: unknown, difetto: number): number {
  const n = typeof valore === 'string' ? Number.parseInt(valore, 10) : typeof valore === 'number' ? valore : NaN
  return Number.isFinite(n) ? n : difetto
}

export const POST = withAuth(
  async (request, { venueId }) => {
    const analisi = corpoCreazione.safeParse(await request.json().catch(() => null))
    if (!analisi.success) {
      return NextResponse.json({ error: 'Manca l identificativo dell istituto' }, { status: 400 })
    }

    try {
      const client = clientDaAmbiente()

      const elenco = await client.istituzioni('it')
      const istituto = elenco.dati.find((i) => i.id === analisi.data.istitutoId)
      if (!istituto) {
        return NextResponse.json({ error: 'Istituto sconosciuto' }, { status: 404 })
      }

      // Si chiede sempre il massimo che l'istituto concede, per entrambi: meno
      // storico significa meno movimenti recuperabili, e meno giorni di accesso
      // significa più autenticazioni in banca.
      const storico = Math.min(giorni(istituto.transaction_total_days, 90), 730)
      const accesso = Math.min(giorni(istituto.max_access_valid_for_days, 90), 180)

      const agreement = await client.creaAgreement({
        institution_id: istituto.id,
        max_historical_days: storico,
        access_valid_for_days: accesso,
        access_scope: ['balances', 'details', 'transactions'],
      })

      // La riga nasce qui, prima della requisition: il suo id è anche il
      // riferimento che GoCardless ci rimanda indietro nel redirect.
      //
      // `requisitionId` è `@unique` e la requisition non esiste ancora, quindi
      // si mette un segnaposto derivato dall'agreement — unico per costruzione.
      // Se la requisition non nasce, la riga viene cancellata poche righe più in
      // basso e il segnaposto non sopravvive.
      const connessione = await prisma.bankConnection.create({
        data: {
          venueId,
          institutionId: istituto.id,
          institutionName: istituto.name,
          requisitionId: `in-attesa:${agreement.dati.id}`,
          agreementId: agreement.dati.id,
          status: 'CR',
          maxHistoricalDays: agreement.dati.max_historical_days ?? storico,
          accessValidUntil: new Date(Date.now() + accesso * 86_400_000),
        },
      })

      try {
        const requisition = await client.creaRequisition({
          institution_id: istituto.id,
          agreement: agreement.dati.id,
          redirect: urlDiRitorno(),
          reference: connessione.id,
          user_language: 'IT',
        })

        await prisma.bankConnection.update({
          where: { id: connessione.id },
          data: { requisitionId: requisition.dati.id, status: requisition.dati.status },
        })

        return NextResponse.json({ connessioneId: connessione.id, link: requisition.dati.link }, { status: 201 })
      } catch (erroreRequisition) {
        // Una connessione rimasta in `CR` senza requisition il pannello la
        // mostrerebbe come «collegamento in corso» per sempre, e nessuno saprebbe
        // che non esiste nulla dall'altra parte.
        await prisma.bankConnection.delete({ where: { id: connessione.id } })
        logger.error('Creazione della requisition GoCardless fallita', erroreRequisition)
        return NextResponse.json({ error: 'La banca non ha accettato la richiesta di collegamento' }, { status: 502 })
      }
    } catch (errore) {
      return rispostaErroreGoCardless(errore, 'POST /api/gocardless/collegamenti')
    }
  },
  { roles: ['admin'], venueScoped: true }
)

export const GET = withAuth(
  async (_request, { venueId }) => {
    try {
      const connessione = await prisma.bankConnection.findFirst({
        where: { venueId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      })

      if (!connessione) return NextResponse.json({ connessione: null })

      return NextResponse.json({
        connessione: {
          id: connessione.id,
          istitutoNome: connessione.institutionName,
          stato: descriviStato(connessione.status),
          scadeIl: connessione.accessValidUntil?.toISOString() ?? null,
        },
      })
    } catch (errore) {
      return rispostaErroreGoCardless(errore, 'GET /api/gocardless/collegamenti')
    }
  },
  { roles: ['admin'], venueScoped: true }
)
