import type { FatturaParsata } from './types'

/**
 * Numeri di linea riservati alle righe che non stanno nell'XML.
 *
 * Negativi di proposito: `DettaglioLinee/NumeroLinea` in FatturaPA è un intero
 * positivo, quindi lo spazio negativo non può collidere con nessuna riga vera,
 * e una riga di sistema resta riconoscibile a colpo d'occhio anche in una
 * query fatta a mano sul database.
 */
export const LINEA_BOLLO = -1
export const LINEA_ARROTONDAMENTO = -2

/** Il conto su cui il bollo nasce proposto: 30.01 — Imposta di bollo. */
export const CONTO_PROPOSTO_BOLLO = '30.01'

export interface RigaDiSistema {
  numeroLinea: number
  descrizione: string
  importo: number
  /** Sempre 0: né il bollo né l'arrotondamento portano IVA. */
  aliquota: 0
}

/**
 * Bollo virtuale e arrotondamento come righe imputabili.
 *
 * Stanno fuori da `DettaglioLinee` ma dentro il totale del documento: senza di
 * loro la somma delle righe non arriva mai al totale, e la regola «o si
 * attribuisce tutto o non si divide» non sarebbe mai soddisfacibile su una
 * fattura che porta il bollo.
 *
 * L'arrotondamento può essere negativo, ed è giusto che lo sia: è la differenza
 * fra la somma delle righe e quanto il fornitore ha davvero chiesto.
 */
export function righeDiSistema(fattura: FatturaParsata): RigaDiSistema[] {
  const righe: RigaDiSistema[] = []

  const bollo = fattura.datiBollo?.importoBollo
  if (bollo !== undefined && bollo !== 0) {
    righe.push({ numeroLinea: LINEA_BOLLO, descrizione: 'Imposta di bollo', importo: bollo, aliquota: 0 })
  }

  const arrotondamento = fattura.arrotondamento
  if (arrotondamento !== undefined && arrotondamento !== 0) {
    righe.push({
      numeroLinea: LINEA_ARROTONDAMENTO,
      descrizione: 'Arrotondamento',
      importo: arrotondamento,
      aliquota: 0,
    })
  }

  return righe
}
