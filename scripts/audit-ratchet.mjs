#!/usr/bin/env node
/**
 * Cricchetto per `npm audit`.
 *
 * Il job di sicurezza della CI girava con continue-on-error: falliva da mesi
 * senza che nessuno se ne accorgesse. Renderlo bloccante così com'era avrebbe
 * spento la CI il giorno stesso, perché l'albero ha già vulnerabilità note che
 * non si risolvono con un aggiornamento indolore. Allora misuriamo quante ne
 * abbiamo e impediamo che aumentino.
 *
 * Contiamo solo le dipendenze di PRODUZIONE (--omit=dev): sono quelle che
 * finiscono sul server. Le vulnerabilità delle dev-dependency (il server web
 * di vitest, il ws di puppeteer) non sono raggiungibili da un attaccante in
 * produzione e bloccherebbero la CI su rumore.
 *
 * COME AGGIORNARE LE BASELINE
 * Solo verso il basso, dopo un aggiornamento che risolve davvero qualcosa:
 *   npm audit --omit=dev
 * e riporta qui i nuovi numeri. Se la CI diventa rossa senza che il codice sia
 * cambiato, vuol dire che è stata pubblicata una CVE nuova su un pacchetto che
 * usiamo: la risposta è aggiornare il pacchetto, non alzare la soglia.
 */

import { spawnSync } from 'node:child_process'

const BASELINE = {
  critical: 5,
  high: 16,
}

const esito = spawnSync('npm', ['audit', '--json', '--omit=dev'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  shell: process.platform === 'win32',
})

if (esito.error) {
  console.error(`[audit-ratchet] impossibile eseguire npm audit: ${esito.error.message}`)
  process.exit(2)
}

// npm audit esce con codice != 0 quando trova vulnerabilità: è il caso normale
// qui, quindi lo status non ci dice nulla. Conta se il JSON è leggibile.
let rapporto
try {
  rapporto = JSON.parse(esito.stdout)
} catch {
  console.error('[audit-ratchet] npm audit non ha restituito JSON leggibile:')
  console.error((esito.stdout || esito.stderr || '(nessun output)').slice(0, 2000))
  process.exit(2)
}

const conteggi = rapporto?.metadata?.vulnerabilities
if (!conteggi) {
  console.error('[audit-ratchet] rapporto senza metadata.vulnerabilities: formato inatteso.')
  process.exit(2)
}

console.log(
  '[audit-ratchet] vulnerabilità in produzione: ' +
    `critical ${conteggi.critical} (baseline ${BASELINE.critical}), ` +
    `high ${conteggi.high} (baseline ${BASELINE.high})`
)

const superate = Object.entries(BASELINE).filter(([gravita, soglia]) => conteggi[gravita] > soglia)

if (superate.length > 0) {
  for (const [gravita, soglia] of superate) {
    console.error(
      `[audit-ratchet] FALLITO: ${conteggi[gravita]} vulnerabilità ${gravita}, la baseline è ${soglia}.`
    )
  }
  console.error('Dettaglio:  npm audit --omit=dev')
  process.exit(1)
}

const migliorate = Object.entries(BASELINE).filter(([gravita, soglia]) => conteggi[gravita] < soglia)
for (const [gravita, soglia] of migliorate) {
  console.log(
    `[audit-ratchet] ${gravita}: ${conteggi[gravita]} contro una baseline di ${soglia}, ` +
      'abbassala in scripts/audit-ratchet.mjs.'
  )
}

process.exit(0)
