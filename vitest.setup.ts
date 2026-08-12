import '@testing-library/jest-dom'

/**
 * Bandiera che React legge per sapere di essere dentro un `act()`: senza,
 * ogni render nei test stampa l'avviso «not wrapped in act». La impostano una
 * decina di suite con `global.IS_REACT_ACT_ENVIRONMENT = true`, ma né React né
 * @types/react la dichiarano da nessuna parte, e per il compilatore
 * `globalThis` non ha quella proprietà. Dichiararla qui la rende nota a tutta
 * la compilazione dei test: questo file sta solo in `tsconfig.test.json`, così
 * la build di produzione non se la ritrova fra i piedi.
 */
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

// Mock delle variabili d'ambiente per i test
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.NEXTAUTH_SECRET = 'test-secret-for-vitest'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
