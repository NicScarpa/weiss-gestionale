/**
 * Shared utility functions for cash station calculations.
 * Used by both POST (create) and PUT (update) closure endpoints.
 */

interface CashCountInput {
  bills500?: number
  bills200?: number
  bills100?: number
  bills50?: number
  bills20?: number
  bills10?: number
  bills5?: number
  coins2?: number
  coins1?: number
  coins050?: number
  coins020?: number
  coins010?: number
  coins005?: number
  coins002?: number
  coins001?: number
}

interface StationInput {
  name: string
  position?: number
  receiptAmount?: number
  receiptVat?: number
  invoiceAmount?: number
  invoiceVat?: number
  suspendedAmount?: number
  cashAmount?: number
  posAmount?: number
  floatAmount?: number
  cashCount?: CashCountInput
}

/**
 * Calculates the weighted total from a cash count (bills + coins).
 */
export function calculateTotalCounted(cashCount: CashCountInput): number {
  return (
    (cashCount.bills500 || 0) * 500 +
    (cashCount.bills200 || 0) * 200 +
    (cashCount.bills100 || 0) * 100 +
    (cashCount.bills50 || 0) * 50 +
    (cashCount.bills20 || 0) * 20 +
    (cashCount.bills10 || 0) * 10 +
    (cashCount.bills5 || 0) * 5 +
    (cashCount.coins2 || 0) * 2 +
    (cashCount.coins1 || 0) * 1 +
    (cashCount.coins050 || 0) * 0.5 +
    (cashCount.coins020 || 0) * 0.2 +
    (cashCount.coins010 || 0) * 0.1 +
    (cashCount.coins005 || 0) * 0.05 +
    (cashCount.coins002 || 0) * 0.02 +
    (cashCount.coins001 || 0) * 0.01
  )
}

/**
 * Builds the Prisma create data for a single cash station,
 * including computed fields (totalAmount, nonReceiptAmount, totalCounted).
 */
export function buildStationCreateData(station: StationInput, index: number) {
  const totalAmount = (station.cashAmount || 0) + (station.posAmount || 0)
  const nonReceiptAmount = totalAmount - (station.receiptAmount || 0)

  let totalCounted = 0
  if (station.cashCount) {
    totalCounted = calculateTotalCounted(station.cashCount)
  }

  return {
    name: station.name,
    position: station.position ?? index,
    receiptAmount: station.receiptAmount || 0,
    receiptVat: station.receiptVat || 0,
    invoiceAmount: station.invoiceAmount || 0,
    invoiceVat: station.invoiceVat || 0,
    suspendedAmount: station.suspendedAmount || 0,
    cashAmount: station.cashAmount || 0,
    posAmount: station.posAmount || 0,
    totalAmount,
    nonReceiptAmount,
    floatAmount: station.floatAmount || 114,
    cashCount: station.cashCount
      ? {
          create: {
            ...station.cashCount,
            totalCounted,
            expectedTotal: station.cashAmount || 0,
            difference: totalCounted - (station.cashAmount || 0),
          },
        }
      : undefined,
  }
}
