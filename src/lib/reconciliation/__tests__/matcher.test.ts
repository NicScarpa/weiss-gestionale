import { describe, it, expect } from 'vitest'

import { numeroDistintaNellaCausale } from '../numero-distinta'

/**
 * Il bonus del numero di distinta: se il `documentRef` di un movimento — sul
 * versamento, il numero della distinta — compare nella causale della
 * transazione bancaria, il punteggio dell'abbinamento sale. È il meccanismo su
 * cui poggia l'etichetta «Numero distinta» del modulo di prima nota: senza un
 * test, una modifica al matcher potrebbe disattivarlo senza che nessuno se ne
 * accorga.
 *
 * Il test guarda la regola, non il punteggio. Nasceva come prova su
 * `calculateMatchScore`, che nel frattempo è diventata privata di proposito
 * («un export senza chiamanti è un invito a costruirci sopra»): riesportarla
 * per far girare un test avrebbe rovesciato quella decisione. Il confronto è
 * invece un modulo foglia, senza import, che il matcher usa e il test può
 * interrogare da solo.
 */

describe('il numero di distinta dentro la causale bancaria', () => {
  it('lo riconosce quando compare tale e quale', () => {
    expect(numeroDistintaNellaCausale('884213', 'VERSAMENTO CONTANTI 884213')).toBe(true)
  })

  it('non lo riconosce se nella causale non c\'è', () => {
    // Senza questa guardia il bonus andrebbe a ogni movimento che *ha* un
    // riferimento, invece che a quelli che si ritrovano davvero nella causale.
    expect(numeroDistintaNellaCausale('884213', 'VERSAMENTO CONTANTI 990000')).toBe(false)
  })

  it('ignora la punteggiatura, da una parte e dall\'altra', () => {
    // La banca scrive il numero senza separatori, l'operatore col trattino:
    // il confronto avviene fra le due stringhe normalizzate.
    expect(numeroDistintaNellaCausale('88-4213', 'VERSAMENTO CONTANTI 884213')).toBe(true)
    expect(numeroDistintaNellaCausale('884213', 'VERSAMENTO CONTANTI 88/4213')).toBe(true)
  })

  it('non guarda le maiuscole', () => {
    expect(numeroDistintaNellaCausale('ab12', 'bonifico AB12 saldo')).toBe(true)
  })

  it('si tira indietro sotto i tre caratteri', () => {
    // Un riferimento di una o due cifre comparirebbe in quasi ogni causale, e
    // il bonus finirebbe a caso.
    expect(numeroDistintaNellaCausale('12', 'VERSAMENTO CONTANTI 123456')).toBe(false)
    expect(numeroDistintaNellaCausale('1', 'VERSAMENTO 1 CONTANTI')).toBe(false)
  })

  it('si tira indietro quando il riferimento non c\'è', () => {
    expect(numeroDistintaNellaCausale(null, 'VERSAMENTO CONTANTI 884213')).toBe(false)
    expect(numeroDistintaNellaCausale('', 'VERSAMENTO CONTANTI')).toBe(false)
  })

  it('si tira indietro se dopo la pulizia resta meno di tre caratteri', () => {
    // '-.-' normalizzato è vuoto: non deve diventare una sottostringa che
    // combacia con qualunque cosa.
    expect(numeroDistintaNellaCausale('-.-', 'VERSAMENTO CONTANTI')).toBe(false)
  })
})
