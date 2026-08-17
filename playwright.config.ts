import { defineConfig, devices } from '@playwright/test'
import { config as caricaEnv } from 'dotenv'
import { BASE_URL_E2E, PERCORSO_SESSIONE, PORTA_E2E } from './e2e/helpers/sessione'

// Le spec leggono il database direttamente (vedi e2e/helpers/db.ts) e il
// processo di Playwright non è il server Next: `.env.local` va caricato qui.
caricaEnv({ path: '.env.local' })

// Porta e indirizzo stanno in `e2e/helpers/sessione.ts`: li legge anche chi apre
// una sessione via API prima che esista un browser.
const PORTA = PORTA_E2E
const BASE_URL = BASE_URL_E2E

/**
 * Configurazione della suite end-to-end che gira contro il server di sviluppo.
 *
 * La prova offline NON sta qui: il service worker esiste solo nella build di
 * produzione (`ServiceWorkerRegistration` non lo registra affatto quando
 * `NODE_ENV !== 'production'`), quindi eseguirla contro `next dev` verificherebbe
 * l'assenza del service worker invece del comportamento offline. Vive in
 * `playwright.offline.config.ts`; vedi `e2e/README.md`.
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/offline.spec.ts'],
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // I test creano e cancellano le stesse righe (la chiusura di un giorno
  // preciso, una scadenza con una descrizione precisa): in parallelo si
  // pesterebbero i piedi e il rosso non direbbe nulla sul prodotto.
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    // Sessione aperta una volta sola dal global setup: il login è limitato a
    // cinque tentativi al minuto per utente e una suite che entra a ogni test
    // lo esaurisce. `login.spec.ts` la scarta, perché il login è il suo oggetto.
    storageState: PERCORSO_SESSIONE,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORTA}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
