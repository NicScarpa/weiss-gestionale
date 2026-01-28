// Tagli banconote (in euro)
export const BILL_DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5] as const

// Tagli monete (in euro)
export const COIN_DENOMINATIONS = [2, 1, 0.5, 0.2, 0.1, 0.05, 0.01] as const

// Tutti i tagli
export const ALL_DENOMINATIONS = [...BILL_DENOMINATIONS, ...COIN_DENOMINATIONS] as const

// Fondo cassa default
export const DEFAULT_CASH_FLOAT = 114.0

// IVA default
export const DEFAULT_VAT_RATE = 0.10

// Soglia allarme differenza cassa
export const CASH_DIFFERENCE_THRESHOLD = 5.0

// Orari parziali default
export const DEFAULT_PARTIAL_HOURS = ['16:00', '21:00'] as const

// Codici presenza staff
export const ATTENDANCE_CODES = {
  PRESENT: 'P',      // Presente
  VACATION: 'FE',    // Ferie
  REST: 'R',         // Riposo
  LEAVE: 'Z',        // Permesso
  OTHER_VENUE: 'C',  // Altra sede
} as const

export type AttendanceCode = typeof ATTENDANCE_CODES[keyof typeof ATTENDANCE_CODES]

// Stati chiusura cassa
export const CLOSURE_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  VALIDATED: 'VALIDATED',
} as const

export type ClosureStatus = typeof CLOSURE_STATUS[keyof typeof CLOSURE_STATUS]

// Emoji meteo condivise
export const WEATHER_EMOJI: Record<string, string> = {
  sunny: '☀️',
  cloudy: '☁️',
  rainy: '🌧️',
  stormy: '⛈️',
  snowy: '❄️',
  foggy: '🌫️',
}

export function getWeatherEmoji(value?: string | null): string {
  if (!value) return ''
  return WEATHER_EMOJI[value] ?? value
}

// Formattazione importi in italiano
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

// Formattazione data in italiano
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) {
    return '-'
  }
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d)
}

// Formattazione data breve
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) {
    return '-'
  }
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}
