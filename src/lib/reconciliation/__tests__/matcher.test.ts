import { describe, it, expect } from 'vitest'
import { calculateMatchScore } from '../matcher'

/**
 * Bonus di riconciliazione bancaria: se il `documentRef` di un movimento
 * (sul versamento, il numero di distinta) compare nella causale della
 * transazione bancaria, il punteggio sale del 10% (fino al tetto di 1). È il
 * meccanismo su cui poggia l'etichetta "Numero distinta" del form (Task 15,
 * RET-07): senza un test, una modifica futura al matcher potrebbe
 * disattivarlo senza che nessuno se ne accorga.
 *
 * `BankTx` e `JournalEntry` non sono esportati da `matcher.ts`: le fabbriche
 * qui sotto passano oggetti letterali la cui forma è verificata
 * strutturalmente dal compilatore contro i parametri di `calculateMatchScore`.
 */

interface BankTx {
  id: string
  transactionDate: Date
  description: string
  amount: number
}

interface JournalEntry {
  id: string
  date: Date
  description: string
  debitAmount: number | null
  creditAmount: number | null
  documentRef: string | null
}

function bankTx(over: Partial<BankTx> = {}): BankTx {
  return {
    id: 't1',
    transactionDate: new Date('2026-09-10'),
    description: 'VERSAMENTO CONTANTI',
    amount: 500,
    ...over,
  }
}

function entry(over: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'm1',
    date: new Date('2026-09-10'),
    description: 'Versamento',
    debitAmount: 500,
    creditAmount: null,
    documentRef: null,
    ...over,
  }
}

describe('calculateMatchScore — bonus numero di distinta', () => {
  it('il numero di distinta nella causale bancaria alza il punteggio', () => {
    const senza = calculateMatchScore(bankTx(), entry())

    const con = calculateMatchScore(
      bankTx({ description: 'VERSAMENTO CONTANTI DIST 884213' }),
      entry({ documentRef: '884213' })
    )

    expect(con).toBeGreaterThan(senza)
  })

  // Caso di confine: senza questo test, il primo passerebbe anche se il
  // bonus si applicasse indiscriminatamente a ogni documentRef valorizzato,
  // invece che solo a quelli che si ritrovano davvero nella causale.
  it('un documentRef che non compare nella causale non alza il punteggio', () => {
    const senza = calculateMatchScore(bankTx(), entry())

    const conRiferimentoAssente = calculateMatchScore(
      bankTx(),
      entry({ documentRef: '999999' })
    )

    expect(conRiferimentoAssente).toBe(senza)
  })
})
