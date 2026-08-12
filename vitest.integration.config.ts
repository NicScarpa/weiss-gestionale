import { defineConfig } from 'vitest/config'
import path from 'path'
import { MAX_WORKERS } from './src/test/integration/env-guard'

/**
 * Configurazione dei test di integrazione: PostgreSQL locale vero, niente mock
 * di Prisma.
 *
 * Sta in un file separato da `vitest.config.ts` perché le due suite hanno
 * esigenze opposte: gli unit test devono restare veloci e senza infrastruttura,
 * questi hanno bisogno di un database e di parecchi secondi di preparazione.
 * Il suffisso `.itest.ts` tiene le due raccolte separate: il glob degli unit
 * test (`*.{test,spec}.ts`) non lo intercetta.
 */
export default defineConfig({
  test: {
    // Le route e i service girano su Node, non nel browser: jsdom qui
    // falserebbe l'ambiente (fetch, stream, moduli node).
    environment: 'node',
    globals: true,
    include: ['src/**/*.itest.ts'],
    setupFiles: './vitest.integration.setup.ts',
    globalSetup: './src/test/integration/global-setup.ts',
    // Processi separati: ogni worker ha la sua Pool `pg` e il suo database, e
    // un test che pianta una connessione non trascina gli altri.
    pool: 'forks',
    maxWorkers: MAX_WORKERS,
    // Preparazione del database e transazioni vere: i tempi degli unit test
    // qui produrrebbero solo falsi rossi.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    teardownTimeout: 30_000,
    // Stesso fuso del server di produzione: su un Mac italiano un errore di
    // fuso su date e chiusure passerebbe inosservato.
    env: {
      TZ: 'UTC',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Stesso alias di `vitest.config.ts`, e serve a maggior ragione qui: i
      // test d'integrazione importano le rotte, che importano `@/lib/prisma`,
      // che porta `import 'server-only'`. Senza, Vite non risolve il
      // pacchetto — non esiste in node_modules di primo livello, solo
      // vendorizzato dentro next/dist/compiled con `exports` condizionali che
      // Vite non conosce — e **tutti** i file falliscono al caricamento.
      'server-only': path.resolve(
        __dirname,
        'node_modules/next/dist/compiled/server-only/empty.js'
      ),
    },
  },
})
