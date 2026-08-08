/**
 * Il vocabolario delle spese ricorrenti: come si chiamano le frequenze, come si
 * descrive a parole una ricorrenza, quanto pesa al mese.
 *
 * Sta in un modulo a parte perché lo usano due schermate — la pagina delle
 * spese ricorrenti e il pannello che spiega la previsione di cassa — e perché
 * la quota mensile è una formula che deve restare uguale a quella con cui
 * `/api/recurring-expenses` calcola i totali: se le due divergono, l'elenco e
 * il suo piè di pagina si contraddicono a vista.
 */

export const FREQUENZE = [
  'DAILY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
] as const

export type Frequenza = (typeof FREQUENZE)[number]

export const NOME_FREQUENZA: Record<Frequenza, string> = {
  DAILY: 'Giornaliera',
  WEEKLY: 'Settimanale',
  BIWEEKLY: 'Quindicinale',
  MONTHLY: 'Mensile',
  QUARTERLY: 'Trimestrale',
  YEARLY: 'Annuale',
}

/** Quante volte la spesa ricorre in un mese, in media. */
const VOLTE_AL_MESE: Record<Frequenza, number> = {
  DAILY: 30,
  WEEKLY: 4.33,
  BIWEEKLY: 2,
  MONTHLY: 1,
  QUARTERLY: 1 / 3,
  YEARLY: 1 / 12,
}

/** Quante volte la spesa ricorre in un anno. */
const VOLTE_ALL_ANNO: Record<Frequenza, number> = {
  DAILY: 365,
  WEEKLY: 52,
  BIWEEKLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  YEARLY: 1,
}

export const GIORNI_SETTIMANA = [
  'domenica',
  'lunedì',
  'martedì',
  'mercoledì',
  'giovedì',
  'venerdì',
  'sabato',
] as const

export interface SpesaRicorrente {
  id: string
  name: string
  description?: string | null
  amount: string | number
  frequency: Frequenza
  dayOfMonth?: number | null
  dayOfWeek?: number | null
  startDate?: string | null
  endDate?: string | null
  isActive: boolean
  category?: string | null
  account?: { id: string; code: string; name: string } | null
}

function arrotonda(valore: number): number {
  return Math.round(valore * 100) / 100
}

/**
 * Quanto pesa la spesa su un mese medio. Stessi coefficienti di
 * `GET /api/recurring-expenses`: un test di integrazione verifica che la somma
 * di queste quote coincida col totale che l'API restituisce.
 */
export function quotaMensile(spesa: Pick<SpesaRicorrente, 'amount' | 'frequency'>): number {
  return arrotonda(Number(spesa.amount) * VOLTE_AL_MESE[spesa.frequency])
}

/** Quanto pesa la spesa su un anno. */
export function quotaAnnuale(spesa: Pick<SpesaRicorrente, 'amount' | 'frequency'>): number {
  return arrotonda(Number(spesa.amount) * VOLTE_ALL_ANNO[spesa.frequency])
}

/** Il numero ordinale con cui si nomina un giorno del mese: 1º, 2, 3, … */
function giornoDelMese(giorno: number): string {
  return giorno === 1 ? '1º' : String(giorno)
}

/**
 * La ricorrenza detta a parole, così com'è scritta accanto a ogni spesa:
 * «ogni mese il 15», «ogni lunedì», «ogni anno».
 */
export function descriviRicorrenza(
  spesa: Pick<SpesaRicorrente, 'frequency' | 'dayOfMonth' | 'dayOfWeek'>
): string {
  switch (spesa.frequency) {
    case 'DAILY':
      return 'ogni giorno'
    case 'WEEKLY':
      return spesa.dayOfWeek === null || spesa.dayOfWeek === undefined
        ? 'ogni settimana'
        : `ogni ${GIORNI_SETTIMANA[spesa.dayOfWeek]}`
    case 'BIWEEKLY':
      return spesa.dayOfWeek === null || spesa.dayOfWeek === undefined
        ? 'ogni due settimane'
        : `ogni due ${GIORNI_SETTIMANA[spesa.dayOfWeek]}`
    case 'MONTHLY':
      return spesa.dayOfMonth
        ? `ogni mese il ${giornoDelMese(spesa.dayOfMonth)}`
        : 'ogni mese'
    case 'QUARTERLY':
      return spesa.dayOfMonth
        ? `ogni tre mesi, il ${giornoDelMese(spesa.dayOfMonth)}`
        : 'ogni tre mesi'
    case 'YEARLY':
      return spesa.dayOfMonth
        ? `ogni anno, il ${giornoDelMese(spesa.dayOfMonth)}`
        : 'ogni anno'
  }
}

/** Il campo che la frequenza scelta rende obbligatorio, `null` se nessuno. */
export function campoRichiesto(frequenza: Frequenza): 'dayOfMonth' | 'dayOfWeek' | null {
  switch (frequenza) {
    case 'WEEKLY':
    case 'BIWEEKLY':
      return 'dayOfWeek'
    case 'MONTHLY':
    case 'QUARTERLY':
    case 'YEARLY':
      return 'dayOfMonth'
    case 'DAILY':
      return null
  }
}
