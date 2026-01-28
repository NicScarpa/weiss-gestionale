// Utilities per il modulo Budget

import {
  type MonthKey,
  type MonthlyValues,
  MONTH_KEYS,
  MONTH_NUMBER_TO_KEY,
  BUDGET_VARIANCE_THRESHOLD,
  BUDGET_WARNING_THRESHOLD,
} from '@/types/budget'

/**
 * Calcola il totale annuale da valori mensili
 */
export function calculateAnnualTotal(values: Partial<MonthlyValues>): number {
  return MONTH_KEYS.reduce((sum, key) => sum + (values[key] || 0), 0)
}

/**
 * Crea un oggetto MonthlyValues con tutti zeri
 */
export function emptyMonthlyValues(): MonthlyValues {
  return MONTH_KEYS.reduce((acc, key) => {
    acc[key] = 0
    return acc
  }, {} as MonthlyValues)
}

/**
 * Calcola la varianza tra budget e actual
 * Positivo = sopra budget (buono per ricavi, cattivo per costi)
 * Negativo = sotto budget (cattivo per ricavi, buono per costi)
 */
export function calculateVariance(budget: number, actual: number): number {
  return actual - budget
}

/**
 * Calcola la percentuale di varianza
 * Gestisce il caso budget = 0
 */
export function calculateVariancePercent(budget: number, actual: number): number {
  if (budget === 0) {
    if (actual === 0) return 0
    return actual > 0 ? 100 : -100
  }
  return ((actual - budget) / Math.abs(budget)) * 100
}

/**
 * Determina se la varianza supera la soglia di alert
 */
export function isVarianceAlert(
  variancePercent: number,
  accountType: 'RICAVO' | 'COSTO'
): boolean {
  const threshold = BUDGET_VARIANCE_THRESHOLD * 100 // 10%

  if (accountType === 'COSTO') {
    // Per i costi, alert se actual > budget oltre soglia
    return variancePercent > threshold
  } else {
    // Per i ricavi, alert se actual < budget oltre soglia
    return variancePercent < -threshold
  }
}

/**
 * Determina se la varianza supera la soglia di warning (ma non alert)
 */
export function isVarianceWarning(
  variancePercent: number,
  accountType: 'RICAVO' | 'COSTO'
): boolean {
  const warningThreshold = BUDGET_WARNING_THRESHOLD * 100 // 5%
  const alertThreshold = BUDGET_VARIANCE_THRESHOLD * 100  // 10%

  if (accountType === 'COSTO') {
    return variancePercent > warningThreshold && variancePercent <= alertThreshold
  } else {
    return variancePercent < -warningThreshold && variancePercent >= -alertThreshold
  }
}

/**
 * Ottiene il colore della varianza basato sul tipo conto e percentuale
 */
export function getVarianceColor(
  variancePercent: number,
  accountType: 'RICAVO' | 'COSTO'
): 'green' | 'red' | 'amber' | 'gray' {
  if (isVarianceAlert(variancePercent, accountType)) {
    return 'red'
  }
  if (isVarianceWarning(variancePercent, accountType)) {
    return 'amber'
  }

  // Buona performance
  if (accountType === 'COSTO' && variancePercent < 0) {
    return 'green' // Costi sotto budget = buono
  }
  if (accountType === 'RICAVO' && variancePercent > 0) {
    return 'green' // Ricavi sopra budget = buono
  }

  return 'gray'
}

/**
 * Converte numero mese (1-12) in MonthKey
 */
export function monthNumberToKey(month: number): MonthKey {
  return MONTH_NUMBER_TO_KEY[month] || 'jan'
}

/**
 * Converte MonthKey in numero mese (1-12)
 */
export function monthKeyToNumber(key: MonthKey): number {
  return MONTH_KEYS.indexOf(key) + 1
}

/**
 * Ottiene il valore di un mese specifico da MonthlyValues
 */
export function getMonthValue(values: MonthlyValues, month: number): number {
  const key = monthNumberToKey(month)
  return values[key] || 0
}

/**
 * Imposta il valore di un mese specifico in MonthlyValues
 */
export function setMonthValue(
  values: MonthlyValues,
  month: number,
  value: number
): MonthlyValues {
  const key = monthNumberToKey(month)
  return { ...values, [key]: value }
}

/**
 * Formatta la percentuale di varianza
 */
export function formatVariancePercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

/**
 * Calcola i totali YTD (Year To Date) fino al mese specificato
 */
export function calculateYTD(values: MonthlyValues, upToMonth: number): number {
  return MONTH_KEYS
    .slice(0, upToMonth)
    .reduce((sum, key) => sum + (values[key] || 0), 0)
}

/**
 * Distribuisce un valore annuale uniformemente sui 12 mesi
 */
export function distributeAnnualEqually(annual: number): MonthlyValues {
  const monthly = annual / 12
  return MONTH_KEYS.reduce((acc, key) => {
    acc[key] = monthly
    return acc
  }, {} as MonthlyValues)
}

/**
 * Distribuisce un valore annuale con pesi mensili personalizzati
 */
export function distributeAnnualWeighted(
  annual: number,
  weights: Partial<MonthlyValues>
): MonthlyValues {
  const totalWeight = MONTH_KEYS.reduce((sum, key) => sum + (weights[key] || 1), 0)

  return MONTH_KEYS.reduce((acc, key) => {
    const weight = weights[key] || 1
    acc[key] = (annual * weight) / totalWeight
    return acc
  }, {} as MonthlyValues)
}

/**
 * Converte una BudgetLine Prisma in MonthlyValues
 */
export function budgetLineToMonthlyValues(line: {
  jan: number | null
  feb: number | null
  mar: number | null
  apr: number | null
  may: number | null
  jun: number | null
  jul: number | null
  aug: number | null
  sep: number | null
  oct: number | null
  nov: number | null
  dec: number | null
}): MonthlyValues {
  return {
    jan: Number(line.jan) || 0,
    feb: Number(line.feb) || 0,
    mar: Number(line.mar) || 0,
    apr: Number(line.apr) || 0,
    may: Number(line.may) || 0,
    jun: Number(line.jun) || 0,
    jul: Number(line.jul) || 0,
    aug: Number(line.aug) || 0,
    sep: Number(line.sep) || 0,
    oct: Number(line.oct) || 0,
    nov: Number(line.nov) || 0,
    dec: Number(line.dec) || 0,
  }
}

/**
 * Calcola MonthlyValues di varianza tra due set di valori
 */
export function calculateMonthlyVariance(
  budget: MonthlyValues,
  actual: MonthlyValues
): MonthlyValues {
  return MONTH_KEYS.reduce((acc, key) => {
    acc[key] = calculateVariance(budget[key], actual[key])
    return acc
  }, {} as MonthlyValues)
}

/**
 * Calcola MonthlyValues di percentuale varianza
 */
export function calculateMonthlyVariancePercent(
  budget: MonthlyValues,
  actual: MonthlyValues
): MonthlyValues {
  return MONTH_KEYS.reduce((acc, key) => {
    acc[key] = calculateVariancePercent(budget[key], actual[key])
    return acc
  }, {} as MonthlyValues)
}

/**
 * Range di anni disponibili per budget
 */
export function getAvailableYears(): number[] {
  const currentYear = new Date().getFullYear()
  const years: number[] = []
  for (let y = currentYear - 2; y <= currentYear + 2; y++) {
    years.push(y)
  }
  return years
}
