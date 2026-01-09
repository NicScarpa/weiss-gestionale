/**
 * Utility functions for closure form data transformation
 */

import { ClosureFormData } from '@/components/chiusura/ClosureForm'

/**
 * API payload types for closure creation/update
 */
export interface ClosureStationPayload {
  name: string
  position: number
  receiptAmount?: number
  receiptVat?: number
  invoiceAmount?: number
  invoiceVat?: number
  suspendedAmount?: number
  cashAmount?: number
  posAmount?: number
  floatAmount?: number
  cashCount?: {
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
}

export interface ClosurePartialPayload {
  timeSlot: string
  receiptProgressive?: number
  posProgressive?: number
  coffeeCounter?: number
  coffeeDelta?: number
}

export interface ClosureExpensePayload {
  payee: string
  documentRef?: string
  documentType?: string
  amount: number
  vatAmount?: number
  accountId?: string
  paidBy?: string
}

export interface ClosureAttendancePayload {
  userId: string
  shift: 'MORNING' | 'EVENING'
  hours?: number
  statusCode?: string
  hourlyRate?: number
  notes?: string
}

export interface ClosureApiPayload {
  date: string
  venueId: string
  isEvent: boolean
  eventName?: string
  weatherMorning?: string
  weatherAfternoon?: string
  weatherEvening?: string
  notes?: string
  stations: ClosureStationPayload[]
  partials: ClosurePartialPayload[]
  expenses: ClosureExpensePayload[]
  attendance: ClosureAttendancePayload[]
}

/**
 * Maps a station from form data to API payload format
 */
function mapStationToPayload(station: ClosureFormData['stations'][0]): ClosureStationPayload {
  return {
    name: station.name,
    position: station.position,
    receiptAmount: station.receiptAmount,
    receiptVat: station.receiptVat,
    invoiceAmount: station.invoiceAmount,
    invoiceVat: station.invoiceVat,
    suspendedAmount: station.suspendedAmount,
    cashAmount: station.cashAmount,
    posAmount: station.posAmount,
    floatAmount: station.floatAmount,
    cashCount: station.cashCount,
  }
}

/**
 * Maps a partial from form data to API payload format
 */
function mapPartialToPayload(partial: ClosureFormData['partials'][0]): ClosurePartialPayload {
  return {
    timeSlot: partial.timeSlot,
    receiptProgressive: partial.receiptProgressive,
    posProgressive: partial.posProgressive,
    coffeeCounter: partial.coffeeCounter,
    coffeeDelta: partial.coffeeDelta,
  }
}

/**
 * Maps an expense from form data to API payload format
 */
function mapExpenseToPayload(expense: ClosureFormData['expenses'][0]): ClosureExpensePayload {
  return {
    payee: expense.payee,
    documentRef: expense.documentRef,
    documentType: expense.documentType,
    amount: expense.amount,
    vatAmount: expense.vatAmount,
    accountId: expense.accountId,
    paidBy: expense.paidBy,
  }
}

/**
 * Maps an attendance record from form data to API payload format
 */
function mapAttendanceToPayload(attendance: ClosureFormData['attendance'][0]): ClosureAttendancePayload {
  return {
    userId: attendance.userId,
    shift: attendance.shift,
    hours: attendance.hours,
    statusCode: attendance.statusCode,
    hourlyRate: attendance.hourlyRate,
    notes: attendance.notes,
  }
}

/**
 * Builds the complete API payload from form data
 *
 * This function transforms the form data structure into the format
 * expected by the /api/chiusure endpoint
 */
export function buildClosurePayload(
  data: ClosureFormData,
  venueId: string
): ClosureApiPayload {
  return {
    date: data.date.toISOString(),
    venueId,
    isEvent: data.isEvent,
    eventName: data.eventName,
    weatherMorning: data.weatherMorning,
    weatherAfternoon: data.weatherAfternoon,
    weatherEvening: data.weatherEvening,
    notes: data.notes,
    stations: data.stations.map(mapStationToPayload),
    partials: data.partials.map(mapPartialToPayload),
    expenses: data.expenses.map(mapExpenseToPayload),
    attendance: data.attendance.map(mapAttendanceToPayload),
  }
}

/**
 * Builds a partial update payload (metadata only, no relations)
 * Used for updating existing closures
 */
export function buildClosureUpdatePayload(
  data: ClosureFormData
): Partial<ClosureApiPayload> {
  return {
    date: data.date.toISOString().split('T')[0], // YYYY-MM-DD format
    isEvent: data.isEvent,
    eventName: data.eventName,
    weatherMorning: data.weatherMorning,
    weatherAfternoon: data.weatherAfternoon,
    weatherEvening: data.weatherEvening,
    notes: data.notes,
  }
}
