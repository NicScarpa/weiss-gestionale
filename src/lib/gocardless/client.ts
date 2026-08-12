/**
 * Client HTTP per GoCardless Bank Account Data.
 *
 * Scritto in casa su `fetch`: non esiste un SDK ufficiale mantenuto per questa
 * API (`nordigen-node` è fermo ad aprile 2025 ed è CommonJS).
 *
 * `fetchImpl` e `attesa` sono iniettabili perché i test non devono toccare la
 * rete né aspettare davvero i backoff.
 */
import { z } from 'zod'

import { ErroreGoCardless, LimiteRaggiunto } from './errori'
import {
  istituzioneSchema,
  rispostaDettagliSchema,
  rispostaMovimentiSchema,
  rispostaSaldiSchema,
} from './types'

const BASE = 'https://bankaccountdata.gocardless.com/api/v2'

/** Tentativi oltre il primo, per gli errori che ha senso ritentare. */
const RITENTATIVI = 2
const ATTESA_BASE_MS = 500

export interface Limiti {
  restanti: number | null
  ripresaFraSecondi: number | null
}

export interface Risposta<T> {
  dati: T
  limiti: Limiti
}

export interface OpzioniClient {
  secretId: string
  secretKey: string
  fetchImpl?: typeof fetch
  attesa?: (ms: number) => Promise<void>
}

const tokenSchema = z.object({
  access: z.string(),
  access_expires: z.number().optional(),
})

/**
 * Gli header del contingente per conto. GoCardless li manda in stile Django
 * (`http_x_ratelimit_...`); si cerca per sottostringa invece che per nome
 * esatto, così un cambio di forma non li fa sparire in silenzio.
 */
function leggiLimiti(headers: Headers): Limiti {
  let restanti: number | null = null
  let ripresa: number | null = null
  headers.forEach((valore, nome) => {
    const n = nome.toLowerCase()
    if (!n.includes('ratelimit')) return
    const numero = Number.parseInt(valore, 10)
    if (!Number.isFinite(numero)) return
    if (n.includes('account') && n.includes('remaining')) restanti = numero
    if (n.includes('account') && n.includes('reset')) ripresa = numero
  })
  return { restanti, ripresaFraSecondi: ripresa }
}

export function creaClient(opzioni: OpzioniClient) {
  const eseguiFetch = opzioni.fetchImpl ?? fetch
  const attendi = opzioni.attesa ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))

  let token: { valore: string; scadenza: number } | null = null

  async function corpoDi(r: Response): Promise<unknown> {
    const testo = await r.text()
    if (testo === '') return null
    try {
      return JSON.parse(testo)
    } catch {
      return testo
    }
  }

  async function ottieniToken(): Promise<string> {
    const margine = 5 * 60 * 1000
    if (token && token.scadenza - margine > Date.now()) return token.valore

    const r = await eseguiFetch(`${BASE}/token/new/`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ secret_id: opzioni.secretId, secret_key: opzioni.secretKey }),
    })
    const corpo = await corpoDi(r)
    if (!r.ok) {
      throw new ErroreGoCardless('Autenticazione GoCardless fallita', r.status, corpo)
    }
    const dati = tokenSchema.parse(corpo)
    token = {
      valore: dati.access,
      scadenza: Date.now() + (dati.access_expires ?? 3600) * 1000,
    }
    return token.valore
  }

  async function chiama<T>(percorso: string, schema: z.ZodType<T>): Promise<Risposta<T>> {
    let ultimo: ErroreGoCardless | null = null

    for (let tentativo = 0; tentativo <= RITENTATIVI; tentativo++) {
      const accesso = await ottieniToken()
      const r = await eseguiFetch(`${BASE}${percorso}`, {
        method: 'GET',
        headers: { accept: 'application/json', authorization: `Bearer ${accesso}` },
      })
      const limiti = leggiLimiti(r.headers)
      const corpo = await corpoDi(r)

      if (r.ok) return { dati: schema.parse(corpo), limiti }

      // Il 429 non si ritenta: il contingente della banca è giornaliero, un
      // backoff da mezzo secondo non lo sblocca e le chiamate che restano
      // servono altrove.
      if (r.status === 429) {
        throw new LimiteRaggiunto(
          'Limite di chiamate raggiunto per questo conto',
          corpo,
          limiti.ripresaFraSecondi
        )
      }

      ultimo = new ErroreGoCardless(`GoCardless ha risposto ${r.status}`, r.status, corpo)

      // Un 4xx diverso dal 429 è una richiesta sbagliata: ripeterla identica
      // darebbe identico esito.
      if (r.status < 500) throw ultimo

      if (tentativo < RITENTATIVI) await attendi(ATTESA_BASE_MS * 2 ** tentativo)
    }

    throw ultimo ?? new ErroreGoCardless('Chiamata fallita', 0, null)
  }

  return {
    istituzioni: (paese = 'it') =>
      chiama(`/institutions/?country=${encodeURIComponent(paese)}`, z.array(istituzioneSchema)),

    dettagliConto: (conto: string) =>
      chiama(`/accounts/${encodeURIComponent(conto)}/details/`, rispostaDettagliSchema),

    saldiConto: (conto: string) =>
      chiama(`/accounts/${encodeURIComponent(conto)}/balances/`, rispostaSaldiSchema),

    movimentiConto: (conto: string, filtro?: { da?: string; a?: string }) => {
      const query: string[] = []
      if (filtro?.da) query.push(`date_from=${encodeURIComponent(filtro.da)}`)
      if (filtro?.a) query.push(`date_to=${encodeURIComponent(filtro.a)}`)
      const coda = query.length > 0 ? `?${query.join('&')}` : ''
      return chiama(`/accounts/${encodeURIComponent(conto)}/transactions/${coda}`, rispostaMovimentiSchema)
    },
  }
}

export type ClientGoCardless = ReturnType<typeof creaClient>
