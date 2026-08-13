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
 * Qui la riga resta la stessa e cambiano solo agreement, requisition e
 * stato. I `BankAccount` non si toccano: `providerAccountId` resta quello di
 * prima, e nessun riabbinamento automatico li aggiorna al ritorno dalla
 * banca — la GET dei conti riabbina solo per **mostrare** a schermo, l'unica
 * scrittura è la PUT dietro «Salva», che dopo un rinnovo riuscito nessuno
 * preme perché il pannello mostra già tutto in ordine. Se GoCardless
 * cambiasse gli identificativi dei conti a un rinnovo, riscriverli è un
 * lavoro della Fase 3, non di questa rotta.
 *
 * **Non scrive `accessValidUntil`.** Il consenso non è ancora concesso al
 * momento di questa POST — lo sarà solo se l'amministratore completa
 * l'autenticazione in banca, un passo fuori dal controllo del gestionale che
 * può fallire nel modo più ordinario (OTP sbagliato, app scaduta, scheda
 * chiusa). Scrivere già qui una scadenza futura farebbe sparire l'avviso di
 * rinnovo — e il pulsante per rifarlo — per un consenso che in realtà non è
 * mai stato concesso: l'unica uscita rimasta sarebbe scollegare, cioè
 * esattamente ciò che questa rotta esiste per evitare. La scadenza si scrive
 * in `GET /api/gocardless/collegamenti/[id]/conti`, nel punto in cui quella
 * rotta scopre che lo stato è diventato `LN` — l'unico momento in cui il
 * consenso è davvero attivo.
 */
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

import { withAuth } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { clientDaAmbiente } from '@/lib/gocardless/servizio'
import { rispostaErroreGoCardless } from '@/lib/gocardless/risposte'
import { giorni, urlDiRitorno } from '@/lib/gocardless/parametri'

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
          // `accessValidUntil` non si tocca qui: vedi il commento in testa al
          // file. La si scrive quando il consenso è davvero concesso, non
          // quando lo si è solo richiesto.
          //
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
