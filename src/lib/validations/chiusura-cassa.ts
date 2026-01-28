import { z } from 'zod'
import {
  ATTENDANCE_CODES,
  CLOSURE_STATUS,
  DEFAULT_CASH_FLOAT
} from '@/lib/constants'

// Schema per conteggio singolo taglio
export const cashCountItemSchema = z.object({
  denomination: z.number(),
  quantity: z.number().int().min(0),
})

// Schema per conteggio postazione
export const cashStationFormSchema = z.object({
  templateId: z.string().min(1, 'Seleziona una postazione'),
  name: z.string().min(1, 'Nome postazione richiesto'),
  code: z.string().min(1, 'Codice postazione richiesto'),
  counts: z.record(
    z.string(), // denomination as string key
    z.number().int().min(0)
  ),
})

// Schema per parziale orario
export const hourlyPartialFormSchema = z.object({
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato orario non valido (HH:MM)'),
  cashAmount: z.number().min(0, 'Importo non può essere negativo'),
  posAmount: z.number().min(0, 'Importo non può essere negativo'),
  notes: z.string().optional(),
})

// Schema per uscita giornaliera
export const dailyExpenseFormSchema = z.object({
  description: z.string().min(1, 'Descrizione richiesta'),
  amount: z.number().positive('Importo deve essere positivo'),
  accountId: z.string().optional(),
  supplierId: z.string().optional(),
  receiptNumber: z.string().optional(),
  notes: z.string().optional(),
})

// Schema per presenza staff
export const dailyAttendanceFormSchema = z.object({
  userId: z.string().min(1, 'Seleziona un dipendente'),
  code: z.enum([
    ATTENDANCE_CODES.PRESENT,
    ATTENDANCE_CODES.VACATION,
    ATTENDANCE_CODES.REST,
    ATTENDANCE_CODES.LEAVE,
    ATTENDANCE_CODES.OTHER_VENUE,
  ]),
  hoursWorked: z.number().min(0).max(24).optional(),
  notes: z.string().optional(),
})

// Schema per form chiusura completo
export const dailyClosureFormSchema = z.object({
  date: z.date({ error: 'Data non valida' }),
  venueId: z.string().min(1, 'Seleziona una sede'),
  cashStations: z.array(cashStationFormSchema).min(1, 'Almeno una postazione richiesta'),
  hourlyPartials: z.array(hourlyPartialFormSchema),
  expenses: z.array(dailyExpenseFormSchema),
  attendance: z.array(dailyAttendanceFormSchema),
  bankDeposit: z.number().min(0, 'Versamento non può essere negativo'),
  cashFloat: z.number().min(0).default(DEFAULT_CASH_FLOAT),
  notes: z.string().optional(),
})

// Schema per aggiornamento stato
export const closureStatusUpdateSchema = z.object({
  status: z.enum([
    CLOSURE_STATUS.DRAFT,
    CLOSURE_STATUS.SUBMITTED,
    CLOSURE_STATUS.VALIDATED,
  ]),
  notes: z.string().optional(),
})

// Schema per filtri lista chiusure
export const closureFiltersSchema = z.object({
  venueId: z.string().optional(),
  status: z.enum([
    CLOSURE_STATUS.DRAFT,
    CLOSURE_STATUS.SUBMITTED,
    CLOSURE_STATUS.VALIDATED,
  ]).optional(),
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
})

// Types derivati dagli schema
export type CashCountItemInput = z.infer<typeof cashCountItemSchema>
export type CashStationFormInput = z.infer<typeof cashStationFormSchema>
export type HourlyPartialFormInput = z.infer<typeof hourlyPartialFormSchema>
export type DailyExpenseFormInput = z.infer<typeof dailyExpenseFormSchema>
export type DailyAttendanceFormInput = z.infer<typeof dailyAttendanceFormSchema>
export type DailyClosureFormInput = z.infer<typeof dailyClosureFormSchema>
export type ClosureStatusUpdateInput = z.infer<typeof closureStatusUpdateSchema>
export type ClosureFiltersInput = z.infer<typeof closureFiltersSchema>
