/**
 * Dove la banca rimanda a fine autenticazione.
 *
 * Non mostra nulla e non decide nulla: riporta al pannello, che interrogherà
 * la requisition e saprà com'è andata davvero. Tenere qui la logica
 * significherebbe metterla in una pagina che l'utente può chiudere per
 * sbaglio — e che, se l'autenticazione è avvenuta sul telefono, potrebbe
 * aprirsi su un dispositivo diverso da quello dove stava lavorando.
 *
 * **Deliberatamente senza `withAuth`.** Questa rotta è il bersaglio di una
 * navigazione del browser che arriva da fuori: se la sessione fosse scaduta,
 * `withAuth` risponderebbe con un JSON 401 e l'utente vedrebbe del testo
 * grezzo al ritorno dalla banca. Non legge nulla e non scrive nulla — prende
 * un identificativo dalla query e lo rimette in un'altra query — quindi non
 * c'è niente da proteggere qui: a proteggere è il pannello di destinazione,
 * che ha la sua autorizzazione e manderà al login chi deve autenticarsi.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PANNELLO = '/impostazioni/banche-e-conti'

export async function GET(request: NextRequest) {
  const riferimento = new URL(request.url).searchParams.get('ref')
  const destinazione = riferimento
    ? `${PANNELLO}?collegamento=${encodeURIComponent(riferimento)}`
    : PANNELLO

  return NextResponse.redirect(new URL(destinazione, request.url), 307)
}
