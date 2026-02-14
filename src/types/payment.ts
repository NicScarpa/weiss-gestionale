// Tipi per Sibill Payments

export enum PaymentType {
  BONIFICO = 'BONIFICO',
  F24 = 'F24',
  ALTRO = 'ALTRO',
}

export enum PaymentStatus {
  BOZZA = 'BOZZA',
  DA_APPROVARE = 'DA_APPROVARE',
  DISPOSTO = 'DISPOSTO',
  COMPLETATO = 'COMPLETATO',
  FALLITO = 'FALLITO',
  ANNULLATO = 'ANNULLATO',
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
}

export interface PaymentSummary {
  bozza: number
  daApprovare: number
  disposto: number
  completato: number
  fallito: number
  annullato: number
}

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  [PaymentType.BONIFICO]: 'Bonifico',
  [PaymentType.F24]: 'F24',
  [PaymentType.ALTRO]: 'Altro',
} as const

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PaymentStatus.BOZZA]: 'Bozza',
  [PaymentStatus.DA_APPROVARE]: 'Da approvare',
  [PaymentStatus.DISPOSTO]: 'Disposto',
  [PaymentStatus.COMPLETATO]: 'Completato',
  [PaymentStatus.FALLITO]: 'Fallito',
  [PaymentStatus.ANNULLATO]: 'Annullato',
} as const

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  [PaymentStatus.BOZZA]: 'bg-gray-100 text-gray-700',
  [PaymentStatus.DA_APPROVARE]: 'bg-amber-100 text-amber-700',
  [PaymentStatus.DISPOSTO]: 'bg-blue-100 text-blue-700',
  [PaymentStatus.COMPLETATO]: 'bg-green-100 text-green-700',
  [PaymentStatus.FALLITO]: 'bg-red-100 text-red-700',
  [PaymentStatus.ANNULLATO]: 'bg-gray-100 text-gray-500 line-through',
} as const
