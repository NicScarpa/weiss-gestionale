// Tipi per il modulo Pagamenti (Sibill)

export type PaymentType = 'BONIFICO' | 'F24' | 'ALTRO'

export type PaymentStatus = 'BOZZA' | 'DA_APPROVARE' | 'DISPOSTO' | 'COMPLETATO' | 'FALLITO' | 'ANNULLATO'

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  BONIFICO: 'Bonifico',
  F24: 'Modello F24',
  ALTRO: 'Altro',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  BOZZA: 'Bozza',
  DA_APPROVARE: 'Da Approvare',
  DISPOSTO: 'Disposto',
  COMPLETATO: 'Completato',
  FALLITO: 'Fallito',
  ANNULLATO: 'Annullato',
}

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  BOZZA: 'bg-gray-100 text-gray-700',
  DA_APPROVARE: 'bg-yellow-100 text-yellow-700',
  DISPOSTO: 'bg-blue-100 text-blue-700',
  COMPLETATO: 'bg-green-100 text-green-700',
  FALLITO: 'bg-red-100 text-red-700',
  ANNULLATO: 'bg-gray-200 text-gray-600',
}

export interface Payment {
  id: string
  venueId: string
  tipo: PaymentType
  stato: PaymentStatus
  riferimentoInterno?: string
  dataEsecuzione: Date
  importo: number
  beneficiarioNome: string
  beneficiarioIban?: string
  causale?: string
  journalEntryId?: string
  createdById?: string
  note?: string
  createdAt: Date
  updatedAt: Date
  // Relations
  venue?: {
    id: string
    name: string
    code: string
  }
  journalEntry?: {
    id: string
    description: string
  }
  createdBy?: {
    id: string
    firstName: string
    lastName: string
  }
}

export interface PaymentFormData {
  venueId: string
  tipo: PaymentType
  dataEsecuzione: Date
  importo: number
  beneficiarioNome: string
  beneficiarioIban?: string
  causale?: string
  riferimentoInterno?: string
  note?: string
}

export interface PaymentFilters {
  venueId?: string
  stato?: PaymentStatus
  tipo?: PaymentType
  dateFrom?: Date
  dateTo?: Date
  beneficiario?: string
  search?: string
}

export interface PaymentListResponse {
  data: Payment[]
  summary: {
    totaleBozza: number
    totaleInAttesa: number
    totaleDisposto: number
    totaleCompletato: number
    count: number
  }
}

// Tipi per approvazione mass paymenti
export interface BulkPaymentAction {
  paymentIds: string[]
  action: 'approve' | 'cancel' | 'delete'
}
