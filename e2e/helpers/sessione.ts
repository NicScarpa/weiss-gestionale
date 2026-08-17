import os from 'node:os'
import path from 'node:path'
import { request } from '@playwright/test'

/**
 * Dove finisce la sessione dell'admin usata da tutte le spec.
 *
 * Sta nella cartella temporanea del sistema e non nel repository per due
 * motivi: è un file con dentro un cookie di sessione, e non c'è nessuna riga di
 * `.gitignore` che lo copra (quel file appartiene a un altro proprietario).
 * Viene riscritto a ogni esecuzione dal global setup, quindi non invecchia.
 */
export const PERCORSO_SESSIONE = path.join(os.tmpdir(), 'weiss-e2e-sessione-admin.json')

/**
 * Sessione di un dipendente (ruolo `staff`), usata da `accesso-dipendente.spec.ts`.
 * Serve un file a parte perché quella spec verifica cosa il gestionale nega a
 * chi non è admin: con la sessione condivisa non verificherebbe nulla.
 */
export const PERCORSO_SESSIONE_DIPENDENTE = path.join(
  os.tmpdir(),
  'weiss-e2e-sessione-dipendente.json'
)

/**
 * Indirizzo del server sotto prova. Vive qui, e non solo in
 * `playwright.config.ts`, perché lo leggono anche i setup che aprono una
 * sessione via API prima che esista un browser: due calcoli separati dello
 * stesso indirizzo si scollano al primo cambio di porta.
 */
export const PORTA_E2E = process.env.E2E_PORT ?? '3010'
export const BASE_URL_E2E = process.env.E2E_BASE_URL ?? `http://localhost:${PORTA_E2E}`

/**
 * Apre una sessione via API e ne salva i cookie in `percorso`.
 *
 * Passa dalle chiamate HTTP e non dal form perché il login è limitato a cinque
 * tentativi al minuto per coppia IP+utente (`RATE_LIMIT_CONFIGS.AUTH`): una
 * spec in cui ogni test entra per conto suo esaurisce la soglia e i test
 * successivi falliscono con «credenziali non corrette», che somiglia a un
 * difetto di autenticazione e non lo è.
 */
export async function apriSessione({
  baseURL,
  username,
  password,
  percorso,
}: {
  baseURL: string
  username: string
  password: string
  percorso: string
}): Promise<void> {
  // Contesto senza cookie, dichiarato: `newContext` eredita le opzioni della
  // configurazione, quindi chiamato da dentro una spec cercherebbe di aprire il
  // file di sessione che questa funzione deve ancora scrivere (ENOENT) — e nel
  // caso peggiore entrerebbe con i cookie di un altro ruolo.
  const ctx = await request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })

  try {
    // `next dev` compila ogni rotta alla prima richiesta: la primissima
    // chiamata a `/api/auth/csrf` arriverebbe mentre la rotta si compila e
    // tornerebbe senza token, facendo fallire il login con `MissingCSRF` —
    // che sembra un difetto di autenticazione e non lo è.
    const csrf = await ctx.get('/api/auth/csrf', { timeout: 120_000 })
    if (!csrf.ok()) throw new Error(`/api/auth/csrf ha risposto ${csrf.status()}`)
    const { csrfToken } = (await csrf.json()) as { csrfToken: string }

    await ctx.post('/api/auth/callback/credentials', {
      form: { csrfToken, identifier: username, password, callbackUrl: baseURL },
      timeout: 120_000,
    })

    // Il POST risponde con un redirect anche quando le credenziali sono
    // sbagliate: l'unica prova che la sessione esista è chiederla.
    const sessione = await ctx.get('/api/auth/session')
    const corpo = (await sessione.json()) as { user?: { email?: string } } | null
    if (!corpo?.user?.email) {
      throw new Error(
        `Login di ${username} non riuscito: /api/auth/session non restituisce un ` +
          'utente. Database seedato? Server giusto? ' +
          `Risposta: ${JSON.stringify(corpo)}`
      )
    }

    await ctx.storageState({ path: percorso })
  } finally {
    await ctx.dispose()
  }
}
