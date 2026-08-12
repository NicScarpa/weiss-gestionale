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

async function corpoDi(r: Response): Promise<unknown> {
  const testo = await r.text()
  if (testo === '') return null
  try {
    return JSON.parse(testo)
  } catch {
    return testo
  }
}

/**
 * Esito di una chiamata HTTP grezza, già classificato secondo la politica
 * dei tentativi: `ok` porta il valore, `limite` è un 429 (mai ritentato),
 * `ritenta` è un 5xx o un errore di rete (vale la pena riprovare), `fatale`
 * è ogni altro 4xx (ripeterlo darebbe lo stesso esito).
 *
 * `eseguiClassificato` è condivisa fra il rinnovo del token e la chiamata
 * dati così questa decisione vive in un solo posto: due copie della stessa
 * politica divergono al primo che ne tocca una sola.
 */
type Esito<T> =
  | { tipo: 'ok'; valore: T }
  | { tipo: 'limite'; errore: LimiteRaggiunto }
  | { tipo: 'ritenta'; errore: ErroreGoCardless }
  | { tipo: 'fatale'; errore: ErroreGoCardless }

async function eseguiClassificato(
  eseguiFetch: typeof fetch,
  url: string,
  init: RequestInit,
  contesto: string
): Promise<Esito<{ corpo: unknown; limiti: Limiti }>> {
  let r: Response
  try {
    r = await eseguiFetch(url, init)
  } catch (causa) {
    // Un guasto di rete (DNS, connessione rifiutata, timeout) rigetta la
    // promise invece di risolversi con uno status HTTP: va trattato come un
    // 5xx, non come un fallimento immediato — anche qui vale la pena
    // riprovare, il server potrebbe non c'entrare affatto.
    const messaggio = causa instanceof Error ? causa.message : String(causa)
    return {
      tipo: 'ritenta',
      errore: new ErroreGoCardless(`${contesto}: errore di rete (${messaggio})`, 0, null),
    }
  }

  const limiti = leggiLimiti(r.headers)
  const corpo = await corpoDi(r)

  if (r.ok) return { tipo: 'ok', valore: { corpo, limiti } }

  // Il 429 non si ritenta mai: il contingente della banca è giornaliero, un
  // backoff da mezzo secondo non lo sblocca e le chiamate che restano
  // servono altrove. Vale sia per il rinnovo del token sia per i dati.
  if (r.status === 429) {
    return {
      tipo: 'limite',
      errore: new LimiteRaggiunto(`${contesto}: limite raggiunto`, corpo, limiti.ripresaFraSecondi),
    }
  }

  const errore = new ErroreGoCardless(`${contesto} (${r.status})`, r.status, corpo)
  return { tipo: r.status >= 500 ? 'ritenta' : 'fatale', errore }
}

/**
 * Esegue `azione` con tentativi ripetuti secondo un'unica politica: sui 5xx
 * e sugli errori di rete riprova con attesa crescente fino a `RITENTATIVI`
 * volte extra; su un 429 o un 4xx qualsiasi si ferma subito, perché
 * ripetere la stessa richiesta darebbe lo stesso esito (il 429 addirittura
 * lo peggiorerebbe, consumando contingente che non si rigenera).
 */
async function conRitentativi<T>(
  azione: () => Promise<Esito<T>>,
  attendi: (ms: number) => Promise<void>
): Promise<T> {
  let ultimo: ErroreGoCardless | null = null

  for (let tentativo = 0; tentativo <= RITENTATIVI; tentativo++) {
    const esito = await azione()
    if (esito.tipo === 'ok') return esito.valore
    if (esito.tipo !== 'ritenta') throw esito.errore

    ultimo = esito.errore
    if (tentativo < RITENTATIVI) await attendi(ATTESA_BASE_MS * 2 ** tentativo)
  }

  throw ultimo ?? new ErroreGoCardless('Chiamata fallita', 0, null)
}

export function creaClient(opzioni: OpzioniClient) {
  const eseguiFetch = opzioni.fetchImpl ?? fetch
  const attendi = opzioni.attesa ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))

  let token: { valore: string; scadenza: number } | null = null

  async function ottieniToken(): Promise<string> {
    const margine = 5 * 60 * 1000
    if (token && token.scadenza - margine > Date.now()) return token.valore

    const { corpo } = await conRitentativi(
      () =>
        eseguiClassificato(
          eseguiFetch,
          `${BASE}/token/new/`,
          {
            method: 'POST',
            headers: { accept: 'application/json', 'content-type': 'application/json' },
            body: JSON.stringify({ secret_id: opzioni.secretId, secret_key: opzioni.secretKey }),
          },
          'Autenticazione GoCardless fallita'
        ),
      attendi
    )
    const dati = tokenSchema.parse(corpo)
    token = {
      valore: dati.access,
      scadenza: Date.now() + (dati.access_expires ?? 3600) * 1000,
    }
    return token.valore
  }

  async function chiama<T>(percorso: string, schema: z.ZodType<T>): Promise<Risposta<T>> {
    // Un 401 sulla chiamata dati non è coperto dalla politica sui 5xx: non è
    // un guasto transitorio del server, è la cache locale del token che
    // mente (revoca lato GoCardless, o disallineamento rispetto alla
    // scadenza dichiarata). Va scartato e ritentato con uno nuovo — ma una
    // volta sola, non in un ciclo che potrebbe girare a vuoto se il server
    // continuasse a rispondere 401.
    let token401GiaRinnovato = false

    for (;;) {
      try {
        return await conRitentativi(async () => {
          const accesso = await ottieniToken()
          const esito = await eseguiClassificato(
            eseguiFetch,
            `${BASE}${percorso}`,
            { method: 'GET', headers: { accept: 'application/json', authorization: `Bearer ${accesso}` } },
            `Chiamata a ${percorso} fallita`
          )
          if (esito.tipo !== 'ok') return esito
          return { tipo: 'ok', valore: { dati: schema.parse(esito.valore.corpo), limiti: esito.valore.limiti } }
        }, attendi)
      } catch (e) {
        if (e instanceof ErroreGoCardless && e.stato === 401 && !token401GiaRinnovato) {
          token401GiaRinnovato = true
          token = null
          continue
        }
        throw e
      }
    }
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
