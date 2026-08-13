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
import { Prisma } from '@prisma/client'

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

/**
 * Il controllo applicativo legge e poi scrive: una corsa fra due richieste
 * concorrenti lo supera. `ux_bank_connections_sede_viva` è la rete che
 * ferma la seconda scrittura — questa funzione ne riconosce la violazione
 * perché arrivi all'amministratore come il 409 che già conosce, non come un
 * 500 anonimo.
 *
 * `meta.target` (la forma "da manuale" di Prisma) qui non c'è: con l'adapter
 * driver per Postgres il nome del vincolo violato arriva solo dentro
 * `meta.driverAdapterError.cause.originalMessage`, non in un campo dedicato.
 * Si cerca quindi il nome dell'indice nell'intero `meta` serializzato,
 * qualunque sia la forma esatta in cui è annidato.
 */
function eDoppioCollegamento(errore: unknown): boolean {
  return (
    errore instanceof Prisma.PrismaClientKnownRequestError &&
    errore.code === 'P2002' &&
    JSON.stringify(errore.meta ?? '').includes('ux_bank_connections_sede_viva')
  )
}

export const POST = withAuth(
  async (request, { venueId }) => {
    const analisi = corpoCreazione.safeParse(await request.json().catch(() => null))
    if (!analisi.success) {
      return NextResponse.json({ error: 'Manca l identificativo dell istituto' }, { status: 400 })
    }

    try {
      // Decisione del proprietario: due collegamenti vivi per la stessa sede
      // non sono ammessi, si rifiuta il secondo. Il controllo sta qui, prima
      // di ogni chiamata alla banca, per non sprecarne: scollegare resta una
      // scelta esplicita dell'amministratore.
      const collegamentoVivo = await prisma.bankConnection.findFirst({ where: { venueId, deletedAt: null } })
      if (collegamentoVivo) {
        return NextResponse.json(
          {
            error: `Esiste già un collegamento a ${collegamentoVivo.institutionName}: scollegalo prima di crearne un altro`,
          },
          { status: 409 }
        )
      }

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
          // Come sopra: ciò che la banca concede, non ciò che è stato
          // chiesto. Questo valore finisce all'amministratore come data di
          // scadenza del consenso.
          accessValidUntil: new Date(Date.now() + (agreement.dati.access_valid_for_days ?? accesso) * 86_400_000),
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
        // Il motivo del rifiuto va registrato SUBITO: se la pulizia sotto
        // fallisse a sua volta, non deve sparire nel nulla — è l'unica
        // traccia di perché la banca ha detto di no.
        logger.error('Creazione della requisition GoCardless fallita', erroreRequisition)

        try {
          // Una connessione rimasta in `CR` senza requisition il pannello la
          // mostrerebbe come «collegamento in corso» per sempre, e nessuno saprebbe
          // che non esiste nulla dall'altra parte.
          await prisma.bankConnection.delete({ where: { id: connessione.id } })
        } catch (errorePulizia) {
          // Anche se la cancellazione fallisce, la risposta resta quella
          // sull'errore della banca — è la causa vera. La riga rimasta a
          // metà si scopre dal log, non da un 500 che nasconde il motivo.
          logger.error('Pulizia della connessione orfana fallita dopo un errore della banca', errorePulizia)
        }

        return NextResponse.json({ error: 'La banca non ha accettato la richiesta di collegamento' }, { status: 502 })
      }
    } catch (errore) {
      if (eDoppioCollegamento(errore)) {
        return NextResponse.json(
          { error: 'Esiste già un collegamento attivo per questa sede: scollegalo prima di crearne uno nuovo' },
          { status: 409 }
        )
      }

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
