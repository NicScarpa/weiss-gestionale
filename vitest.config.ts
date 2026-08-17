import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // I test girano nello stesso fuso del server di produzione, non in quello
    // di chi sviluppa. Su un Mac italiano un errore di fuso passerebbe
    // inosservato: è così che le ore notturne sono rimaste sbagliate a lungo.
    env: {
      TZ: 'UTC',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.ts'],
      exclude: [
        'src/lib/**/*.test.ts',
        'src/lib/**/*.spec.ts',
        // I test d'integrazione girano con un'altra configurazione
        // (`vitest.integration.config.ts`), quindi qui non vengono mai
        // eseguiti: senza questa riga entravano nel denominatore con lo 0 %
        // e ogni itest scritto *abbassava* la copertura. Sono 26 file e 6757
        // righe, cioè abbastanza da far fallire il gate della CI per il solo
        // fatto di aver aggiunto delle prove — che è l'incentivo rovesciato.
        // `.test.ts` e `.spec.ts` erano già esclusi per la stessa ragione:
        // `.itest.ts` è la grafia che era rimasta fuori.
        'src/lib/**/*.itest.ts',
        'src/lib/prisma.ts',
      ],
      // Le soglie stavano scritte a mano nello script `test:coverage:ci`, in
      // quattro opzioni da riga di comando: chi lanciava `test:coverage` in
      // locale misurava una cosa e la CI un'altra, e per sapere quale fosse il
      // minimo bisognava leggere package.json. Qui valgono per entrambi.
      thresholds: {
        lines: 40,
        statements: 40,
        functions: 40,
        branches: 40,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Il webpack di Next risolve 'server-only' con la condizione degli
      // `exports` 'react-server' (un no-op), diversa da quella che usa nel
      // bundle client (che lancia). Vite non conosce quella condizione e non
      // trova affatto il pacchetto — non esiste in node_modules di primo
      // livello, solo vendorizzato dentro next/dist/compiled. I test girano
      // lato server come il bundle server di Next, quindi puntano allo
      // stesso no-op, senza installare nulla di nuovo.
      'server-only': path.resolve(
        __dirname,
        'node_modules/next/dist/compiled/server-only/empty.js'
      ),
    },
  },
})
