/**
 * Invoice Utilities - Mapping e helper per la gestione fatture
 */

// Mapping tipi documento con abbreviazioni e colori
export const DOCUMENT_TYPE_MAP: Record<string, { abbrev: string; label: string; color: string }> = {
  TD01: { abbrev: 'FAT', label: 'Fattura', color: 'bg-blue-100 text-blue-700' },
  TD02: { abbrev: 'ACC', label: 'Acconto/Anticipo su fattura', color: 'bg-yellow-100 text-yellow-700' },
  TD03: { abbrev: 'ACC', label: 'Acconto/Anticipo su parcella', color: 'bg-yellow-100 text-yellow-700' },
  TD04: { abbrev: 'NC', label: 'Nota di Credito', color: 'bg-red-100 text-red-700' },
  TD05: { abbrev: 'ND', label: 'Nota di Debito', color: 'bg-orange-100 text-orange-700' },
  TD06: { abbrev: 'PAR', label: 'Parcella', color: 'bg-purple-100 text-purple-700' },
  TD16: { abbrev: 'INT', label: 'Integrazione reverse charge interno', color: 'bg-teal-100 text-teal-700' },
  TD17: { abbrev: 'AUTO', label: 'Autofattura servizi UE', color: 'bg-indigo-100 text-indigo-700' },
  TD18: { abbrev: 'INT', label: 'Integrazione acquisti intraUE', color: 'bg-teal-100 text-teal-700' },
  TD19: { abbrev: 'INT', label: 'Integrazione/autofattura acquisti beni art.17', color: 'bg-teal-100 text-teal-700' },
  TD20: { abbrev: 'AUTO', label: 'Autofattura regolarizzazione', color: 'bg-indigo-100 text-indigo-700' },
  TD21: { abbrev: 'AUTO', label: 'Autofattura splafonamento', color: 'bg-indigo-100 text-indigo-700' },
  TD22: { abbrev: 'EST', label: 'Estrazione beni da deposito IVA', color: 'bg-emerald-100 text-emerald-700' },
  TD23: { abbrev: 'EST', label: 'Estrazione beni da deposito IVA con versamento', color: 'bg-emerald-100 text-emerald-700' },
  TD24: { abbrev: 'FD', label: 'Fattura Differita art.21 c.4 lett.a', color: 'bg-cyan-100 text-cyan-700' },
  TD25: { abbrev: 'FD', label: 'Fattura Differita art.21 c.4 terzo periodo', color: 'bg-cyan-100 text-cyan-700' },
  TD26: { abbrev: 'CES', label: 'Cessione beni ammortizzabili', color: 'bg-amber-100 text-amber-700' },
  TD27: { abbrev: 'AUTO', label: 'Autofattura autoconsumo/cessioni gratuite', color: 'bg-indigo-100 text-indigo-700' },
  TD28: { abbrev: 'SM', label: 'Acquisti da San Marino', color: 'bg-lime-100 text-lime-700' },
}

// Mapping modalità pagamento
export const PAYMENT_METHOD_MAP: Record<string, string> = {
  MP01: 'Contanti',
  MP02: 'Assegno',
  MP03: 'Assegno circolare',
  MP04: 'Contanti presso Tesoreria',
  MP05: 'Bonifico',
  MP06: 'Vaglia cambiario',
  MP07: 'Bollettino bancario',
  MP08: 'Carta di pagamento',
  MP09: 'RID',
  MP10: 'RID utenze',
  MP11: 'RID veloce',
  MP12: 'RIBA',
  MP13: 'MAV',
  MP14: 'Quietanza erario',
  MP15: 'Giroconto su conti di contabilità speciale',
  MP16: 'Domiciliazione bancaria',
  MP17: 'Domiciliazione postale',
  MP18: 'Bollettino di c/c postale',
  MP19: 'SEPA Direct Debit',
  MP20: 'SEPA Direct Debit CORE',
  MP21: 'SEPA Direct Debit B2B',
  MP22: 'Trattenuta su somme già riscosse',
  MP23: 'PagoPA',
}

// Helper per ottenere l'abbreviazione del tipo documento
export function getDocumentTypeAbbrev(tipoDocumento: string | null | undefined): string {
  if (!tipoDocumento) return '-'
  return DOCUMENT_TYPE_MAP[tipoDocumento]?.abbrev || tipoDocumento
}

// Helper per ottenere il colore del tipo documento
export function getDocumentTypeColor(tipoDocumento: string | null | undefined): string {
  if (!tipoDocumento) return 'bg-slate-100 text-slate-600'
  return DOCUMENT_TYPE_MAP[tipoDocumento]?.color || 'bg-slate-100 text-slate-600'
}

// Helper per ottenere la label del tipo documento
export function getDocumentTypeLabel(tipoDocumento: string | null | undefined): string {
  if (!tipoDocumento) return 'Documento'
  return DOCUMENT_TYPE_MAP[tipoDocumento]?.label || tipoDocumento
}

// Helper per stato semplificato (registrata/non registrata)
export function getSimpleStatus(status: string): { label: string; color: string } {
  const isRegistered = status === 'RECORDED' || status === 'PAID'
  return {
    label: isRegistered ? 'Registrata' : 'Non registrata',
    color: isRegistered ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600',
  }
}

// Helper per ottenere la descrizione della modalità di pagamento
export function getPaymentMethodLabel(code: string | null | undefined): string {
  if (!code) return '-'
  return PAYMENT_METHOD_MAP[code] || code
}

// Mesi in italiano per i filtri
export const ITALIAN_MONTHS = [
  { value: '1', label: 'Gennaio' },
  { value: '2', label: 'Febbraio' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Aprile' },
  { value: '5', label: 'Maggio' },
  { value: '6', label: 'Giugno' },
  { value: '7', label: 'Luglio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Settembre' },
  { value: '10', label: 'Ottobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Dicembre' },
]

// Genera opzioni per anni (ultimi N anni)
export function generateYearOptions(yearsBack: number = 5): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear()
  return Array.from({ length: yearsBack }, (_, i) => ({
    value: String(currentYear - i),
    label: String(currentYear - i),
  }))
}

// Formatta valuta in italiano
export function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '€ 0,00'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '€ 0,00'
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(num)
}

// Formatta data in italiano
export function formatDateIT(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// Formatta data completa in italiano
export function formatDateFullIT(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
