/**
 * Rinnovare il consenso a una banca già collegata.
 *
 * Esiste come rotta a sé perché nessuna delle due strade disponibili andava
 * bene. Riusare `POST /collegamenti` è impossibile: il rifiuto del secondo
 * collegamento vivo sbarra la via, e una connessione scaduta è comunque viva
 * per quel controllo. Scollegare e ricollegare azzera abbinamenti,
 * interruttori e date — cioè costringerebbe a ridecidere le date di taglio
 * ogni sei mesi, che è l'operazione più facile da sbagliare di tutta
 * l'integrazione.
 *
 * Qui la riga resta la stessa e cambiano solo agreement, requisition, stato e
 * scadenza. I `BankAccount` non si toccano: al ritorno dalla banca il
 * riabbinamento per impronta aggiornerà `providerAccountId` se GoCardless
 * avrà cambiato gli identificativi — cosa che non sappiamo ancora se faccia.
 */
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { withAuth } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { clientDaAmbiente } from '@/lib/gocardless/servizio'
import { rispostaErroreGoCardless } from '@/lib/gocardless/risposte'

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

export const POST = withAuth<{ id: string }>(
  async (_request, { venueId, params }) => {
    try {
      const connessione = await prisma.bankConnection.findFirst({
        where: { id: params.id, venueId, deletedAt: null },
      })
      if (!connessione) return NextResponse.json({ error: 'Collegamento non trovato' }, { status: 404 })

      const client = clientDaAmbiente()
      const elenco = await client.istituzioni('it')
      const istituto = elenco.dati.find((i) => i.id === connessione.institutionId)
      if (!istituto) {
        return NextResponse.json({ error: 'L istituto collegato non è più fra quelli disponibili' }, { status: 409 })
      }

      const storico = Math.min(giorni(istituto.transaction_total_days, 90), 730)
      const accesso = Math.min(giorni(istituto.max_access_valid_for_days, 90), 180)

      const agreement = await client.creaAgreement({
        institution_id: connessione.institutionId,
        max_historical_days: storico,
        access_valid_for_days: accesso,
        access_scope: ['balances', 'details', 'transactions'],
      })

      const requisition = await client.creaRequisition({
        institution_id: connessione.institutionId,
        agreement: agreement.dati.id,
        redirect: urlDiRitorno(),
        reference: connessione.id,
        user_language: 'IT',
      })

      await prisma.bankConnection.update({
        where: { id: connessione.id },
        data: {
          agreementId: agreement.dati.id,
          requisitionId: requisition.dati.id,
          status: requisition.dati.status,
          maxHistoricalDays: agreement.dati.max_historical_days ?? storico,
          accessValidUntil: new Date(
            Date.now() + (agreement.dati.access_valid_for_days ?? accesso) * 86_400_000
          ),
          // I conti letti appartengono al consenso vecchio: dopo l'SCA la
          // banca potrebbe esporne un insieme diverso, e riabbinare su dati
          // vecchi produrrebbe corrispondenze inventate. Un campo Json si
          // azzera con `Prisma.DbNull` — NULL vero in colonna, come quando la
          // riga nasce e il campo non è mai stato scritto. `Prisma.JsonNull`
          // scriverebbe invece il valore JSON «null», che è un'altra cosa.
          contiLetti: Prisma.DbNull,
          contiLettiIl: null,
        },
      })

      return NextResponse.json({ link: requisition.dati.link })
    } catch (errore) {
      return rispostaErroreGoCardless(errore, 'POST /api/gocardless/collegamenti/[id]/rinnovo')
    }
  },
  { roles: ['admin'], venueScoped: true }
)
