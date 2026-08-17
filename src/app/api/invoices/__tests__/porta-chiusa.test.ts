import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * Il divieto che regge tutto il resto: da un documento fiscale non nasce un
 * movimento di prima nota.
 *
 * Non è un test di comportamento ma di struttura, perché la regola è
 * strutturale: in App Router il file *è* la rotta, e un modulo che chiama
 * `journalEntry.create` sotto `/api/invoices` è già la porta riaperta, quali
 * che siano le sue condizioni.
 *
 * Spec: docs/superpowers/specs/2026-08-15-fatture-non-generano-movimenti-design.md
 */

const RADICE = resolve(import.meta.dirname, '../../../../..')

/** Tutti i .ts sotto una cartella, esclusi i test. */
function moduliIn(cartella: string): string[] {
  const trovati: string[] = []

  for (const voce of readdirSync(cartella, { withFileTypes: true })) {
    const percorso = join(cartella, voce.name)

    if (voce.isDirectory()) {
      if (voce.name === '__tests__') continue
      trovati.push(...moduliIn(percorso))
      continue
    }

    if (voce.name.endsWith('.ts') && !voce.name.includes('.test.')) {
      trovati.push(percorso)
    }
  }

  return trovati
}

describe('una fattura non genera un movimento di prima nota', () => {
  it('la rotta /api/invoices/[id]/record non esiste più', () => {
    const percorso = resolve(RADICE, 'src/app/api/invoices/[id]/record/route.ts')

    expect(existsSync(percorso)).toBe(false)
  })

  it('nessun modulo sotto /api/invoices crea un JournalEntry', () => {
    const moduli = moduliIn(resolve(RADICE, 'src/app/api/invoices'))

    const colpevoli = moduli
      .filter((f) => readFileSync(f, 'utf8').includes('journalEntry.create'))
      .map((f) => f.slice(RADICE.length + 1))

    expect(colpevoli).toEqual([])
  })
})
