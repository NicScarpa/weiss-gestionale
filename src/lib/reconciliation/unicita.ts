import { PESI, type Fattori, type Motivazione, type Valutazione } from './punteggio'

/**
 * Il sesto fattore: quanto è isolato questo abbinamento.
 *
 * Modulo puro. Sta qui e non in `punteggio.ts` perché è il solo fattore che
 * non dipende dalla coppia ma dagli *altri* candidati: lo si può calcolare
 * solo dopo aver valutato tutti. La stessa rata di affitto vale di più quando
 * è l'unica candidata e di meno quando ce ne sono tre identiche — che è
 * l'unica cosa che le distingue.
 */

export interface Valutata {
  punteggio: number
  fattori: Fattori
  motivazioni: Motivazione[]
}

/**
 * Aggiunge il fattore unicità. Non modifica la valutazione ricevuta: il
 * chiamante la riusa per calcolare l'unicità di altre coppie dello stesso
 * movimento.
 */
export function applicaUnicita(valutazione: Valutazione, alternative: number): Valutata {
  const motivazioni = [...valutazione.motivazioni]
  let unicita = 0

  if (alternative <= 1) {
    unicita = PESI.UNICITA
    motivazioni.push({ testo: 'Unico abbinamento possibile', segno: '+' })
  } else if (alternative === 2) {
    unicita = 2
    motivazioni.push({ testo: 'Esiste un\'altra alternativa plausibile', segno: '-' })
  } else {
    unicita = 0
    motivazioni.push({ testo: `${alternative} alternative plausibili`, segno: '-' })
  }

  return {
    punteggio: Math.min(100, valutazione.punteggioParziale + unicita),
    fattori: { ...valutazione.fattori, unicita },
    motivazioni,
  }
}
