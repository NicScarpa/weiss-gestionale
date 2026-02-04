import { useMemo } from 'react'
import { CashStationData } from '../CashStationCard'
import { ExpenseData } from '../ExpensesSection'
import { calculateCashCountTotal } from '../CashCountGrid'
import { CASH_DIFFERENCE_THRESHOLD } from '@/lib/constants'

export interface ClosureTotals {
  grossTotal: number
  salesTotal: number
  cashTotal: number
  cashWithExpenses: number
  posTotal: number
  countedTotal: number
  expensesTotal: number
  cashIncomeTotal: number
  cashDifference: number
  estimatedVat: number
  netTotal: number
  bankDeposit: number
  hasSignificantDifference: boolean
}

interface UseClosureCalculationsParams {
  stations: CashStationData[]
  expenses: ExpenseData[]
  vatRate: number
}

/**
 * Hook to calculate all closure totals
 *
 * Centralizes the complex calculation logic for:
 * - Cash totals from all stations
 * - POS totals
 * - Physical cash count totals
 * - Expense totals
 * - Cash difference (counted vs registered)
 * - VAT estimates
 * - Bank deposit amounts
 */
export function useClosureCalculations({
  stations,
  expenses,
  vatRate,
}: UseClosureCalculationsParams): ClosureTotals {
  return useMemo(() => {
    // Totale contanti incassati (da scontrino)
    const cashTotal = stations.reduce(
      (sum, s) => sum + (s.cashAmount || 0),
      0
    )

    // Totale POS
    const posTotal = stations.reduce(
      (sum, s) => sum + (s.posAmount || 0),
      0
    )

    // Totale contato (somma conteggio fisico banconote/monete)
    const countedTotal = stations.reduce(
      (sum, s) => sum + calculateCashCountTotal(s.cashCount),
      0
    )

    // Totale uscite
    const expensesTotal = expenses.reduce(
      (sum, e) => sum + (e.amount || 0),
      0
    )

    // QUADRATURA CASSA:
    // Confronto diretto tra cassa contata e vendite contanti da scontrino
    // Le uscite sono mostrate separatamente ma NON influenzano la quadratura
    // (potrebbero essere pagate da varie fonti, non solo dalla cassa)
    const cashDifference = countedTotal - cashTotal

    // Totale vendite (solo incassi, senza uscite)
    const salesTotal = cashTotal + posTotal

    // Totale movimentazione = vendite + uscite (tutto il denaro movimentato)
    const grossTotal = salesTotal + expensesTotal

    // Contanti con uscite = vendite contanti + uscite pagate (per display riepilogo)
    const cashWithExpenses = cashTotal + expensesTotal

    // Incasso contanti totale = vendite contanti + uscite pagate
    // Perché: se ho 550€ in cassa e ho pagato 37,90€ di uscite,
    // significa che l'incasso contanti totale era 587,90€
    const cashIncomeTotal = cashTotal + expensesTotal

    // IVA stimata (solo sulle vendite)
    const estimatedVat = salesTotal * vatRate

    // Totale netto (vendite meno IVA)
    const netTotal = salesTotal - estimatedVat

    // Versamento banca = totale POS (i contanti restano in cassa)
    const bankDeposit = posTotal

    return {
      grossTotal,
      salesTotal,
      cashTotal,
      cashWithExpenses,
      posTotal,
      countedTotal,
      expensesTotal,
      cashIncomeTotal,
      cashDifference,
      estimatedVat,
      netTotal,
      bankDeposit,
      hasSignificantDifference:
        countedTotal > 0 &&
        Math.abs(cashDifference) > CASH_DIFFERENCE_THRESHOLD,
    }
  }, [stations, expenses, vatRate])
}
