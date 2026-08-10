import { defineConfig, devices } from '@playwright/test'
import { config as caricaEnv } from 'dotenv'
import { PERCORSO_SESSIONE } from './e2e/helpers/sessione'

caricaEnv({ path: '.env.local' })

const PORTA = process.env.E2E_PROD_PORT ?? '3011'
const BASE_URL = process.env.E2E_PROD_URL ?? `http://localhost:${PORTA}`

/**
 * Prova del funzionamento offline. Configurazione separata perché richiede una
 * build di produzione, non `next dev`.
 *
 * Il motivo non è pignoleria: `ServiceWorkerRegistration` esce subito quando
 * `process.env.NODE_ENV !== 'production'`
 * (src/components/pwa/ServiceWorkerRegistration.tsx:22), e `public/sw.js` viene
 * prodotto da `npm run build:sw`, cioè solo dentro `npm run build`. Girare
 * contro il server di sviluppo verificherebbe l'assenza del service worker, non
 * il comportamento offline.
 *
 *   npm run build
 *   npm run start -- -p 3011
 *   npm run test:e2e:offline
 *
 * `webServer` non è configurato apposta: far partire `npm start` da qui
 * nasconderebbe il fatto che serve una build fatta prima, e la prima
 * esecuzione fallirebbe con un errore che non spiega niente.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/offline.spec.ts'],
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    storageState: PERCORSO_SESSIONE,
    // Il service worker non si installa se il contesto non è sicuro; localhost
    // lo è, ma la registrazione va comunque consentita esplicitamente quando si
    // simula un dispositivo.
    serviceWorkers: 'allow',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
