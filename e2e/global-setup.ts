/**
 * Prepara lo stato di partenza comune a tutte le spec: l'admin sbloccato e una
 * sessione già aperta.
 *
 * Perché una sessione sola. Il login è limitato a cinque tentativi al minuto
 * per coppia IP+utente (src/lib/auth.ts:79, RATE_LIMIT_CONFIGS.AUTH): una
 * suite in cui ogni test entra per conto suo supera la soglia intorno al sesto
 * test, e da lì in poi l'applicazione risponde «credenziali non corrette».
 * Sarebbero fallimenti che non dicono niente sul prodotto — e che, peggio,
 * somigliano a un difetto di autenticazione. Si entra una volta e si riusa il
 * cookie; `login.spec.ts` è l'unico che parte senza sessione, perché il login è
 * proprio quello che verifica.
 *
 * Il flag `mustChangePassword` resta acceso sul manager apposta: sempre
 * `login.spec.ts` lo usa per verificare che la modale di cambio obbligatorio
 * compaia davvero.
 */
import { request, type FullConfig } from '@playwright/test'
import { config as caricaEnv } from 'dotenv'
import { chiudiDb, rimettiCambioPasswordObbligatorio, sbloccaUtente } from './helpers/db'
import { UTENTI } from './helpers/app'
import { PERCORSO_SESSIONE } from './helpers/sessione'

export default async function globalSetup(config: FullConfig) {
  // Il processo di Playwright non è il server Next: le variabili del `.env.local`
  // vanno caricate a mano. `override: false` (default) lascia vincere una
  // DATABASE_URL già presente nell'ambiente, che è come si punta il database
  // della prova offline.
  caricaEnv({ path: '.env.local' })

  await sbloccaUtente(UTENTI.admin.username)
  await rimettiCambioPasswordObbligatorio(UTENTI.managerDaSbloccare.username)
  await chiudiDb()

  const baseURL = config.projects[0]?.use?.baseURL
  if (!baseURL) throw new Error('baseURL mancante nella configurazione Playwright')

  await apriSessioneAdmin(baseURL)
}

async function apriSessioneAdmin(baseURL: string) {
  const ctx = await request.newContext({ baseURL })

  try {
    // `next dev` compila ogni rotta alla prima richiesta: la primissima
    // chiamata a `/api/auth/csrf` arriverebbe mentre la rotta si compila e
    // tornerebbe senza token, facendo fallire il login con `MissingCSRF` —
    // che sembra un difetto di autenticazione e non lo è.
    const csrf = await ctx.get('/api/auth/csrf', { timeout: 120_000 })
    if (!csrf.ok()) throw new Error(`/api/auth/csrf ha risposto ${csrf.status()}`)
    const { csrfToken } = (await csrf.json()) as { csrfToken: string }

    await ctx.post('/api/auth/callback/credentials', {
      form: {
        csrfToken,
        identifier: UTENTI.admin.username,
        password: UTENTI.admin.password,
        callbackUrl: baseURL,
      },
      timeout: 120_000,
    })

    // Il POST risponde con un redirect anche quando le credenziali sono
    // sbagliate: l'unica prova che la sessione esista è chiederla.
    const sessione = await ctx.get('/api/auth/session')
    const corpo = (await sessione.json()) as { user?: { email?: string } } | null
    if (!corpo?.user?.email) {
      throw new Error(
        "Login dell'admin non riuscito nel global setup: /api/auth/session non " +
          'restituisce un utente. Database seedato? Server giusto? ' +
          `Risposta: ${JSON.stringify(corpo)}`
      )
    }

    await ctx.storageState({ path: PERCORSO_SESSIONE })
  } finally {
    await ctx.dispose()
  }
}
