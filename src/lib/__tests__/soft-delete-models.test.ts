import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SOFT_DELETE_MODELS } from '../prisma'

/**
 * `SOFT_DELETE_MODELS` deve dire la stessa cosa dello schema.
 *
 * È una lista scritta a mano, e le liste scritte a mano si disallineano in
 * silenzio: aggiungere `deletedAt` a un modello senza aggiungerlo qui produce
 * un modello che si crede cancellabile mentre il client continua a mostrarne le
 * righe cancellate — un buco che nessun altro test noterebbe, perché tutto
 * continua a funzionare. Il caso opposto è meno grave ma altrettanto muto: un
 * modello elencato qui e privo della colonna farebbe fallire ogni query con un
 * errore su un campo inesistente.
 */
describe('SOFT_DELETE_MODELS rispecchia lo schema', () => {
  it('elenca esattamente i modelli che hanno deletedAt', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')

    const conDeletedAt: string[] = []
    let modelloCorrente: string | null = null

    for (const riga of schema.split('\n')) {
      const inizio = riga.match(/^model\s+(\w+)\s*\{/)
      if (inizio) {
        modelloCorrente = inizio[1]
        continue
      }
      if (riga.startsWith('}')) {
        modelloCorrente = null
        continue
      }
      if (modelloCorrente && /^\s*deletedAt\s/.test(riga)) {
        conDeletedAt.push(modelloCorrente)
      }
    }

    expect([...conDeletedAt].sort()).toEqual([...SOFT_DELETE_MODELS].sort())
  })
})
