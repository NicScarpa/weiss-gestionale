import { readFileSync } from 'node:fs'

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

/**
 * `/offline` non è un file sul disco: è una pagina che il service worker va a
 * prendere dal server mentre si installa. Va precacheata esplicitamente perché
 * il fallback dichiarato in `src/app/sw.ts` la cerca nel precache: senza,
 * puntava a qualcosa che in cache non c'era mai, e una rotta mai visitata dava
 * l'errore di rete del browser invece della pagina «Sei offline» scritta
 * apposta.
 *
 * La revisione è il BUILD_ID: cambia a ogni build, così il documento in cache
 * non resta indietro rispetto ai chunk che cita.
 */
function revisioneDellaBuild() {
  try {
    return readFileSync('.next/BUILD_ID', 'utf8').trim()
  } catch {
    throw new Error(
      '.next/BUILD_ID assente: `serwist build` va eseguito dopo `next build` (vedi lo script `build` in package.json).'
    )
  }
}

export default serwist.withNextConfig(() => ({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  globDirectory: '.next',
  globPatterns: ['static/**/*.{js,css,woff2}'],
  // I file precacheati sono serviti da /_next/, non dalla radice del progetto.
  modifyURLPrefix: { static: '/_next/static' },
  additionalPrecacheEntries: [{ url: '/offline', revision: revisioneDellaBuild() }],
}))
