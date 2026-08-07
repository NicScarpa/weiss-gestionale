/**
 * Chiamate all'API degli inviti dipendente, lato client.
 *
 * Stanno qui e non nella schermata perché la regola che le governa è una sola e
 * va rispettata da chiunque le usi: `GET /api/staff/invite` legge soltanto, e
 * l'emissione — che produce una credenziale valida sette giorni — passa sempre
 * dalla POST. Tenere quella scelta in un punto solo evita che una schermata
 * futura torni a dare per scontato che la lettura crei l'invito.
 */

export interface LinkInvito {
  token: string
  url: string
  expiresAt: string | null
  /** L'invito è stato anche spedito al dipendente (solo se vincolato a un'email). */
  emailSent: boolean
  email?: string | null
}

interface RispostaInvito {
  token: string | null
  url: string | null
  expiresAt: string | null
  emailSent: boolean
  email?: string | null
  error?: string
}

async function leggiRisposta(risposta: Response, azione: string): Promise<RispostaInvito> {
  const dati = (await risposta.json()) as RispostaInvito

  if (!risposta.ok) {
    throw new Error(dati.error || `Errore ${azione} dell'invito`)
  }

  return dati
}

export interface OpzioniInvito {
  /** Vincola l'invito a questa email e lo spedisce al dipendente. */
  email?: string
  firstName?: string
  lastName?: string
}

/**
 * Emette un nuovo invito, invalidando quelli generici ancora attivi.
 */
export async function rigeneraLinkInvito(opzioni: OpzioniInvito = {}): Promise<LinkInvito> {
  const risposta = await fetch('/api/staff/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'regenerate', ...opzioni }),
  })

  const dati = await leggiRisposta(risposta, 'nella rigenerazione')

  return dati as LinkInvito
}

/**
 * Restituisce l'invito attivo; se non ce n'è uno, ne fa emettere uno nuovo.
 */
export async function ottieniLinkInvito(): Promise<LinkInvito> {
  const risposta = await fetch('/api/staff/invite')
  const dati = await leggiRisposta(risposta, 'nel recupero')

  if (dati.url) return dati as LinkInvito

  return rigeneraLinkInvito()
}
