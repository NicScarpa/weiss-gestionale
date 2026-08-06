/**
 * Deposito dei rapporti su file. Nessun accesso al database.
 *
 * Il rapporto a schermo serve al titolare per decidere; il JSON scritto qui
 * serve agli script di bonifica che verranno dopo, che devono poter ritrovare
 * per identificativo esattamente le righe fotografate da questa esecuzione.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Marcatore temporale usabile in un nome di file: `2026-08-06T14-30-12`.
 * Tutti i file di una stessa esecuzione ne condividono uno solo, così restano
 * riconoscibili come un unico censimento.
 */
export function marcatoreEsecuzione(momento: Date = new Date()): string {
  return momento.toISOString().replace(/\.\d{3}Z$/, '').replace(/:/g, '-')
}

/**
 * Cartella dei rapporti, ricavata dalla posizione dello script in esecuzione
 * e non dalla cartella di lavoro: il comando funziona da qualunque directory.
 */
export function cartellaRapportiPredefinita(): string {
  const avvio = process.argv[1]
  const base = avvio ? dirname(resolve(avvio)) : resolve(process.cwd(), 'scripts/remediation/assess')
  return join(base, 'report')
}

export function scriviRapporto(
  cartella: string,
  nome: string,
  esecuzione: string,
  contenuto: unknown
): string {
  mkdirSync(cartella, { recursive: true })
  const percorso = join(cartella, `${nome}-${esecuzione}.json`)
  writeFileSync(percorso, `${JSON.stringify(contenuto, null, 2)}\n`, 'utf8')
  return percorso
}
