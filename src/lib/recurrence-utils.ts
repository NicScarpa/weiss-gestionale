/**
 * Utility per calcolo date ricorrenza
 */

const FREQUENZA_MESI: Record<string, number> = {
  mensile: 1,
  bimestrale: 2,
  trimestrale: 3,
  semestrale: 6,
  annuale: 12,
}

/**
 * Calcola la prossima data di generazione basandosi sulla frequenza.
 * Per frequenze settimanali/bisettimanali aggiunge 7/14 giorni.
 * Per frequenze mensili+ aggiunge il numero di mesi corrispondente.
 */
export function calcolaProssimaGenerazione(
  baseDate: Date,
  frequenza: string
): Date {
  const result = new Date(baseDate)

  if (frequenza === 'settimanale') {
    result.setDate(result.getDate() + 7)
    return result
  }

  if (frequenza === 'bisettimanale') {
    result.setDate(result.getDate() + 14)
    return result
  }

  const mesi = FREQUENZA_MESI[frequenza]
  if (mesi) {
    const giornoOriginale = result.getDate()
    result.setMonth(result.getMonth() + mesi)
    // Clamp: se il giorno originale era 31 e il nuovo mese ha meno giorni,
    // setMonth lo fa avanzare al mese successivo. Correggiamo.
    if (result.getDate() !== giornoOriginale) {
      result.setDate(0) // torna all'ultimo giorno del mese precedente
    }
    return result
  }

  return result
}

/**
 * Calcola la data specifica per una ricorrenza dato il giorno del mese
 * o della settimana, con gestione edge case per mesi corti.
 */
export function calcolaDataDallaRicorrenza(
  frequenza: string,
  giornoDelMese: number | null,
  giornoDellSettimana: number | null,
  baseDate: Date
): Date {
  const result = new Date(baseDate)

  const isSettimanale = frequenza === 'settimanale' || frequenza === 'bisettimanale'

  if (isSettimanale && giornoDellSettimana !== null) {
    // Trova il prossimo giorno della settimana specificato
    // 0=Lun..6=Dom in nostra convenzione, JS: 0=Dom..6=Sab
    const targetJsDay = giornoDellSettimana === 6 ? 0 : giornoDellSettimana + 1
    const currentJsDay = result.getDay()
    let diff = targetJsDay - currentJsDay
    if (diff <= 0) diff += 7
    result.setDate(result.getDate() + diff)
    return result
  }

  if (!isSettimanale && giornoDelMese !== null) {
    // Imposta il giorno del mese, clamped all'ultimo giorno disponibile
    const anno = result.getFullYear()
    const mese = result.getMonth()
    const ultimoGiorno = new Date(anno, mese + 1, 0).getDate()
    result.setDate(Math.min(giornoDelMese, ultimoGiorno))
    return result
  }

  return result
}

/**
 * Verifica se una frequenza richiede il giorno della settimana
 */
export function isFrequenzaSettimanale(frequenza: string): boolean {
  return frequenza === 'settimanale' || frequenza === 'bisettimanale'
}

/**
 * Verifica se una frequenza richiede il giorno del mese
 */
export function isFrequenzaMensile(frequenza: string): boolean {
  return ['mensile', 'bimestrale', 'trimestrale', 'semestrale', 'annuale'].includes(frequenza)
}
