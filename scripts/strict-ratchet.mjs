#!/usr/bin/env node
/**
 * Cricchetto per la modalità strict di TypeScript.
 *
 * tsconfig.strict.json descrive dove vogliamo arrivare, non dove siamo: oggi
 * il codice non ci passa. Invece di lasciare quel file come buon proposito
 * ignorato, lo misuriamo a ogni build e impediamo che il numero di errori
 * salga. Chi introduce codice nuovo non può peggiorare il conto; chi ne
 * sistema uno abbassa la soglia.
 *
 * COME AGGIORNARE LA BASELINE
 * Solo verso il basso. Dopo aver corretto degli errori, esegui
 *   node scripts/strict-ratchet.mjs
 * e riporta qui sotto il numero che lo script stampa. Alzare questa soglia
 * per far passare la CI vanifica il cricchetto: se un tuo commit la supera,
 * l'errore va corretto, non tollerato.
 */

import { spawnSync } from 'node:child_process'

const BASELINE = 27

const esito = spawnSync(
  'npx',
  ['tsc', '-p', 'tsconfig.strict.json', '--noEmit', '--pretty', 'false'],
  { encoding: 'utf8', shell: process.platform === 'win32' }
)

if (esito.error) {
  console.error(`[strict-ratchet] impossibile eseguire tsc: ${esito.error.message}`)
  process.exit(2)
}

const output = `${esito.stdout ?? ''}${esito.stderr ?? ''}`

// `.next/types/**` è rigenerato da `next build` e resta indietro: dopo aver
// cancellato una route continua a importarla, e tsc riporta un TS2307 per
// ciascuna finché non si ricompila. Sono errori di un artefatto, non del
// sorgente, e conteggiarli produce un falso allarme proprio quando si fa
// pulizia — successo davvero il 7 ago 2026, con tre route rimosse.
const GENERATI = /^\.next[/\\]/

const errori = output
  .split('\n')
  .filter((riga) => /: error TS\d+:/.test(riga))
  .filter((riga) => !GENERATI.test(riga.trim()))
const conteggio = errori.length

// tsc esce con codice != 0 anche per problemi suoi (config illeggibile, tsc
// assente): se non ha prodotto nemmeno una riga di errore, non è un caso di
// codice pulito ma di misura fallita.
if (conteggio === 0 && esito.status !== 0) {
  console.error('[strict-ratchet] tsc è fallito senza riportare errori di tipo:')
  console.error(output.trim() || '(nessun output)')
  process.exit(2)
}

console.log(`[strict-ratchet] errori in modalità strict: ${conteggio} (baseline ${BASELINE})`)

if (conteggio > BASELINE) {
  const nuovi = conteggio - BASELINE
  console.error(
    `[strict-ratchet] FALLITO: ${nuovi} error${nuovi === 1 ? 'e' : 'i'} in più rispetto alla baseline.`
  )
  console.error('Elenco completo:')
  for (const riga of errori) console.error(`  ${riga}`)
  process.exit(1)
}

if (conteggio < BASELINE) {
  console.log(
    `[strict-ratchet] ${BASELINE - conteggio} errori in meno della baseline: ` +
      `abbassa BASELINE a ${conteggio} in scripts/strict-ratchet.mjs.`
  )
}

process.exit(0)
