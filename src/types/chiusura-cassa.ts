import type { ClosureStatus, AttendanceCode } from '@/lib/constants'

// Conteggio singolo taglio
export interface CashCountItem {
  denomination: number  // Valore del taglio (es. 50, 20, 0.50)
  quantity: number      // Quantità contata
  total: number         // denomination * quantity
}

// Conteggio completo di una postazione
export interface CashCount {
  id?: string
  cashStationId: string
  bills: CashCountItem[]
  coins: CashCountItem[]
  totalBills: number
  totalCoins: number
  grandTotal: number
}

// Postazione cassa
export interface CashStation {
  id: string
  dailyClosureId: string
  templateId: string
  name: string
  code: string
  sortOrder: number
  cashCount?: CashCount
  total: number
}

// Parziale orario
export interface HourlyPartial {
  id?: string
  dailyClosureId: string
  time: string          // "16:00" o "21:00"
  cashAmount: number    // Contante
  posAmount: number     // POS
  totalAmount: number   // Totale
  notes?: string
}

// Uscita giornaliera
export interface DailyExpense {
  id?: string
  dailyClosureId: string
  description: string
  amount: number
  accountId?: string    // Conto di riferimento
  supplierId?: string   // Fornitore (opzionale)
  receiptNumber?: string
  notes?: string
}

// Presenza staff
export interface DailyAttendance {
  id?: string
  dailyClosureId: string
  userId: string
  userName: string
  code: AttendanceCode
  hoursWorked?: number
  notes?: string
}

// Chiusura cassa completa
export interface DailyClosure {
  id: string
  date: Date
  venueId: string
  venueName: string
  status: ClosureStatus

  // Postazioni cassa
  cashStations: CashStation[]

  // Parziali orari
  hourlyPartials: HourlyPartial[]

  // Uscite
  expenses: DailyExpense[]

  // Presenze
  attendance: DailyAttendance[]

  // Totali calcolati
  grossTotal: number        // Totale lordo (somma postazioni)
  vatAmount: number         // IVA
  netTotal: number          // Totale netto
  expensesTotal: number     // Totale uscite
  cashFloat: number         // Fondo cassa
  bankDeposit: number       // Versamento banca
  expectedCash: number      // Contante atteso
  actualCash: number        // Contante effettivo
  cashDifference: number    // Differenza

  // POS
  posTotal: number

  // Metadata
  notes?: string
  createdById: string
  createdByName: string
  validatedById?: string
  validatedByName?: string
  createdAt: Date
  updatedAt: Date
  validatedAt?: Date
}

// Form per creazione/modifica chiusura
export interface DailyClosureFormData {
  date: Date
  venueId: string
  cashStations: CashStationFormData[]
  hourlyPartials: HourlyPartialFormData[]
  expenses: DailyExpenseFormData[]
  attendance: DailyAttendanceFormData[]
  bankDeposit: number
  cashFloat: number
  notes?: string
}

export interface CashStationFormData {
  templateId: string
  name: string
  code: string
  counts: Record<number, number>  // { denomination: quantity }
}

export interface HourlyPartialFormData {
  time: string
  cashAmount: number
  posAmount: number
  notes?: string
}

export interface DailyExpenseFormData {
  description: string
  amount: number
  accountId?: string
  supplierId?: string
  receiptNumber?: string
  notes?: string
}

export interface DailyAttendanceFormData {
  userId: string
  code: AttendanceCode
  hoursWorked?: number
  notes?: string
}

// Riepilogo calcoli
export interface ClosureCalculations {
  grossTotal: number
  vatRate: number
  vatAmount: number
  netTotal: number
  expensesTotal: number
  cashFloat: number
  bankDeposit: number
  posTotal: number
  expectedCash: number
  actualCash: number
  cashDifference: number
  isWithinThreshold: boolean
}
