import { serwist } from '@serwist/next/config'

/**
 * Configurazione del service worker.
 *
 * Il service worker non passa più dal plugin `withSerwist` di next.config.ts:
 * quel plugin è un plugin webpack, e da Next 16 la build usa Turbopack, che lo
 * ignora in silenzio — il risultato era che `public/sw.js` non veniva prodotto
 * affatto e la PWA girava senza service worker (niente offline, niente push).
 *
 * Qui il service worker viene compilato dalla CLI di Serwist come passo a sé
 * (`npm run build:sw`, incluso in `npm run build`), che con Turbopack non ha
 * nulla da spartire.
 */
export default serwist.withNextConfig(() => ({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  globDirectory: '.next',
  globPatterns: ['static/**/*.{js,css,woff2}'],
  // I file precacheati sono serviti da /_next/, non dalla radice del progetto.
  modifyURLPrefix: { static: '/_next/static' },
}))
