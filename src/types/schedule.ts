// Tipi per Scadenzario

export enum ScheduleType {
  ATTIVA = 'attiva',   // Da incassare
  PASSIVA = 'passiva',  // Da pagare
}

export enum ScheduleStatus {
  APERTA = 'aperta',
  PARZIALMENTE_PAGATA = 'parzialmente_pagata',
  PAGATA = 'pagata',
  SCADUTA = 'scaduta',
  ANNULLATA = 'annullata',
}

export enum ScheduleDocumentType {
  FATTURA_VENDITA = 'fattura_vendita',
  FATTURA_ACQUISTO = 'fattura_acquisto',
  NOTA_CREDITO = 'nota_credito',
  NOTA_DEBITO = 'nota_debito',
  STIPENDIO = 'stipendio',
  TASSA_F24 = 'tassa_f24',
  CONTRIBUTO = 'contributo',
  AFFITTO = 'affitto',
  UTENZA = 'utenza',
  RATA_PRESTITO = 'rata_prestito',
  ALTRO = 'altro',
}

export enum SchedulePriority {
  BASSA = 'bassa',
  NORMALE = 'normale',
  ALTA = 'alta',
  URGENTE = 'urgente',
}

export enum RecurrenceType {
  SETTIMANALE = 'settimanale',
  BISETTIMANALE = 'bisettimanale',
  MENSILE = 'mensile',
  BIMESTRALE = 'bimestrale',
  TRIMESTRALE = 'trimestrale',
  SEMESTRALE = 'semestrale',
  ANNUALE = 'annuale',
}

export enum ScheduleSource {
  MANUALE = 'manuale',
  IMPORT_CSV = 'import_csv',
  IMPORT_FATTURE_SDI = 'import_fatture_sdi',
  RICORRENZA_AUTO = 'ricorrenza_auto',
}

export enum SchedulePaymentMethod {
  BONIFICO = 'bonifico',
  RIBA = 'riba',
  SDD = 'sdd',
  CARTA = 'carta',
  CONTANTI = 'contanti',
  F24 = 'f24',
  ASSEGNO = 'assegno',
  BOLLETTINO = 'bollettino',
  CREDITO_FISCALE = 'credito_fiscale',
  SENZA_INCASSO = 'senza_incasso',
  ALTRO = 'altro',
}

export interface Schedule {
  id: string
  venueId: string
  tipo: ScheduleType
  stato: ScheduleStatus
  descrizione: string
  importoTotale: number
  importoPagato: number
  importoResiduo: number  // calcolato = totale - pagato
  valuta: string
  dataScadenza: Date
  dataEmissione: Date | null
  dataPagamento: Date | null
  tipoDocumento: ScheduleDocumentType
  numeroDocumento: string | null
  riferimentoDocumento: string | null
  controparteNome: string | null
  controparteIban: string | null
  supplierId: string | null
  priorita: SchedulePriority
  metodoPagamento: SchedulePaymentMethod | null
  isRicorrente: boolean
  ricorrenzaTipo: RecurrenceType | null
  ricorrenzaFine: Date | null
  ricorrenzaProssimaGenerazione: Date | null
  ricorrenzaParentId: string | null
  ricorrenzaParent?: {
    id: string
    descrizione: string
  }
  ricorrenzaAttiva: boolean
  source: ScheduleSource
  note: string | null
  createdById: string | null
  createdAt: Date
  updatedAt: Date
  supplier?: {
    id: string
    name: string
  }
  createdBy?: {
    id: string
    firstName: string | null
    lastName: string | null
  }
  payments?: SchedulePayment[]
}

export interface SchedulePayment {
  id: string
  scheduleId: string
  importo: number
  dataPagamento: Date
  metodo: SchedulePaymentMethod | null
  riferimento: string | null
  note: string | null
  createdAt: Date
}

export interface ScheduleAttachment {
  id: string
  scheduleId: string
  filename: string
  originalFilename: string
  contentType: string
  fileSize: number
  uploadedByUserId: string | null
  createdAt: Date
}

export interface ScheduleReminder {
  id: string
  scheduleId: string
  giorniPrima: number
  tipo: 'email' | 'in_app' | 'entrambi'
  messaggio: string | null
  inviato: boolean
  dataInvio: Date | null
  createdAt: Date
}

export interface ScheduleSummary {
  totaleAttive: number
  totalePassive: number
  totaleScadute: number
  totaleScaduteImporto: number
  totaleInScadenza7Giorni: number
  totaleInScadenza7GiorniImporto: number
  totaleAperte: number
  totalePagate: number
}

export interface ScheduleFilters {
  stato?: ScheduleStatus | ScheduleStatus[]
  tipo?: ScheduleType | ScheduleType[]
  priorita?: SchedulePriority | SchedulePriority[]
  search?: string
  dataInizio?: Date
  dataFine?: Date
  isRicorrente?: boolean
}

export interface CreateScheduleInput {
  tipo: ScheduleType
  descrizione: string
  importoTotale: number
  valuta?: string
  dataScadenza: Date
  dataEmissione?: Date
  tipoDocumento?: ScheduleDocumentType
  numeroDocumento?: string
  riferimentoDocumento?: string
  controparteNome?: string
  controparteIban?: string
  supplierId?: string
  priorita?: SchedulePriority
  metodoPagamento?: SchedulePaymentMethod
  isRicorrente?: boolean
  ricorrenzaTipo?: RecurrenceType
  ricorrenzaFine?: Date
  ricorrenzaAttiva?: boolean
  note?: string
}

export interface UpdateScheduleInput {
  descrizione?: string
  importoTotale?: number
  dataScadenza?: Date
  dataEmissione?: Date
  dataPagamento?: Date
  tipoDocumento?: ScheduleDocumentType
  numeroDocumento?: string
  riferimentoDocumento?: string
  controparteNome?: string
  controparteIban?: string
  supplierId?: string
  priorita?: SchedulePriority
  metodoPagamento?: SchedulePaymentMethod
  isRicorrente?: boolean
  ricorrenzaTipo?: RecurrenceType | null
  ricorrenzaFine?: Date | null
  ricorrenzaProssimaGenerazione?: Date | null
  ricorrenzaAttiva?: boolean
  note?: string
}

export interface CreatePaymentInput {
  importo: number
  dataPagamento: Date
  metodo?: SchedulePaymentMethod
  riferimento?: string
  note?: string
}

export interface CalendarEvent {
  id: string
  title: string
  date: Date
  amount: number
  tipo: ScheduleType
  stato: ScheduleStatus
  priorita: SchedulePriority
}

export interface AgingData {
  scadute: number
  scaduteImporto: number
  a30Giorni: number
  a30GiorniImporto: number
  a60Giorni: number
  a60GiorniImporto: number
  oltre60Giorni: number
  oltre60GiorniImporto: number
}

// Label per enum
export const SCHEDULE_TYPE_LABELS: Record<ScheduleType, string> = {
  [ScheduleType.ATTIVA]: 'Attiva',
  [ScheduleType.PASSIVA]: 'Passiva',
} as const

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  [ScheduleStatus.APERTA]: 'Aperta',
  [ScheduleStatus.PARZIALMENTE_PAGATA]: 'Parzial. pagata',
  [ScheduleStatus.PAGATA]: 'Pagata',
  [ScheduleStatus.SCADUTA]: 'Scaduta',
  [ScheduleStatus.ANNULLATA]: 'Annullata',
} as const

export const SCHEDULE_DOCUMENT_TYPE_LABELS: Record<ScheduleDocumentType, string> = {
  [ScheduleDocumentType.FATTURA_VENDITA]: 'Fatt. di vendita',
  [ScheduleDocumentType.FATTURA_ACQUISTO]: 'Fatt. di acquisto',
  [ScheduleDocumentType.NOTA_CREDITO]: 'Nota di credito',
  [ScheduleDocumentType.NOTA_DEBITO]: 'Nota di debito',
  [ScheduleDocumentType.STIPENDIO]: 'Stipendio',
  [ScheduleDocumentType.TASSA_F24]: 'Tassa F24',
  [ScheduleDocumentType.CONTRIBUTO]: 'Contributo',
  [ScheduleDocumentType.AFFITTO]: 'Affitto',
  [ScheduleDocumentType.UTENZA]: 'Utenza',
  [ScheduleDocumentType.RATA_PRESTITO]: 'Rata prestito',
  [ScheduleDocumentType.ALTRO]: 'Altro',
} as const

export const SCHEDULE_PRIORITY_LABELS: Record<SchedulePriority, string> = {
  [SchedulePriority.BASSA]: 'Bassa',
  [SchedulePriority.NORMALE]: 'Normale',
  [SchedulePriority.ALTA]: 'Alta',
  [SchedulePriority.URGENTE]: 'Urgente',
} as const

export const RECURRENCE_TYPE_LABELS: Record<RecurrenceType, string> = {
  [RecurrenceType.SETTIMANALE]: 'Settimanale',
  [RecurrenceType.BISETTIMANALE]: 'Ogni 2 settimane',
  [RecurrenceType.MENSILE]: 'Mensile',
  [RecurrenceType.BIMESTRALE]: 'Ogni 2 mesi',
  [RecurrenceType.TRIMESTRALE]: 'Trimestrale',
  [RecurrenceType.SEMESTRALE]: 'Semestrale',
  [RecurrenceType.ANNUALE]: 'Annuale',
} as const

export const SCHEDULE_PAYMENT_METHOD_LABELS: Record<SchedulePaymentMethod, string> = {
  [SchedulePaymentMethod.BONIFICO]: 'Bonifico',
  [SchedulePaymentMethod.RIBA]: 'RiBa',
  [SchedulePaymentMethod.SDD]: 'SDD',
  [SchedulePaymentMethod.CARTA]: 'Carta',
  [SchedulePaymentMethod.CONTANTI]: 'Contanti',
  [SchedulePaymentMethod.F24]: 'F24',
  [SchedulePaymentMethod.ASSEGNO]: 'Assegno',
  [SchedulePaymentMethod.BOLLETTINO]: 'Bollettino',
  [SchedulePaymentMethod.CREDITO_FISCALE]: 'Credito fiscale',
  [SchedulePaymentMethod.SENZA_INCASSO]: 'Senza incasso',
  [SchedulePaymentMethod.ALTRO]: 'Altro',
} as const

// Colori per stato
export const SCHEDULE_STATUS_COLORS: Record<ScheduleStatus, string> = {
  [ScheduleStatus.APERTA]: 'bg-blue-100 text-blue-700 border-blue-200',
  [ScheduleStatus.PARZIALMENTE_PAGATA]: 'bg-amber-100 text-amber-700 border-amber-200',
  [ScheduleStatus.PAGATA]: 'bg-green-100 text-green-700 border-green-200',
  [ScheduleStatus.SCADUTA]: 'bg-red-100 text-red-700 border-red-200',
  [ScheduleStatus.ANNULLATA]: 'bg-gray-100 text-gray-500 border-gray-200 line-through',
} as const

// Colori per priorità
export const SCHEDULE_PRIORITY_COLORS: Record<SchedulePriority, string> = {
  [SchedulePriority.BASSA]: 'bg-gray-100 text-gray-600',
  [SchedulePriority.NORMALE]: 'bg-blue-100 text-blue-600',
  [SchedulePriority.ALTA]: 'bg-amber-100 text-amber-600',
  [SchedulePriority.URGENTE]: 'bg-red-100 text-red-600',
} as const

// Icone per priorità (da usare con Lucide)
export const SCHEDULE_PRIORITY_ICONS: Record<SchedulePriority, string> = {
  [SchedulePriority.BASSA]: 'ArrowDown',
  [SchedulePriority.NORMALE]: 'Minus',
  [SchedulePriority.ALTA]: 'ArrowUp',
  [SchedulePriority.URGENTE]: 'AlertCircle',
} as const

// Icone per tipo
export const SCHEDULE_TYPE_ICONS: Record<ScheduleType, string> = {
  [ScheduleType.ATTIVA]: 'ArrowDownCircle',  // Entrata
  [ScheduleType.PASSIVA]: 'ArrowUpCircle',   // Uscita
} as const

// Badge colors per tipo attiva/passiva
export const SCHEDULE_TYPE_COLORS: Record<ScheduleType, string> = {
  [ScheduleType.ATTIVA]: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  [ScheduleType.PASSIVA]: 'bg-rose-100 text-rose-700 border-rose-200',
} as const

// Giorni della settimana (0=Lunedi..6=Domenica)
export const DAY_OF_WEEK_LABELS: Record<number, string> = {
  0: 'Lunedì',
  1: 'Martedì',
  2: 'Mercoledì',
  3: 'Giovedì',
  4: 'Venerdì',
  5: 'Sabato',
  6: 'Domenica',
} as const

// Interfacce Recurrence (template ricorrenze)
export interface Recurrence {
  id: string
  venueId: string
  tipo: string
  descrizione: string
  importo: number
  categoriaId: string | null
  contoDiPagamentoId: string | null
  metodoPagamento: string | null
  frequenza: string
  giornoDelMese: number | null
  giornoDellSettimana: number | null
  dataInizio: Date
  dataFine: Date | null
  isActive: boolean
  prossimaGenerazione: Date | null
  note: string | null
  createdById: string | null
  createdAt: Date
  updatedAt: Date
  categoria?: {
    id: string
    name: string
    parent?: {
      id: string
      name: string
    }
  }
  contoDiPagamento?: {
    id: string
    name: string
  }
  createdBy?: {
    id: string
    firstName: string | null
    lastName: string | null
  }
  _count?: {
    generatedSchedules: number
  }
}

export interface CreateRecurrenceInput {
  tipo: string
  descrizione: string
  importo: number
  categoriaId?: string
  contoDiPagamentoId?: string
  metodoPagamento?: string
  frequenza: string
  giornoDelMese?: number
  giornoDellSettimana?: number
  dataInizio: Date | string
  dataFine?: Date | string
  note?: string
}

export interface UpdateRecurrenceInput {
  descrizione?: string
  importo?: number
  categoriaId?: string | null
  contoDiPagamentoId?: string | null
  metodoPagamento?: string | null
  frequenza?: string
  giornoDelMese?: number | null
  giornoDellSettimana?: number | null
  dataInizio?: Date | string
  dataFine?: Date | string | null
  isActive?: boolean
  note?: string | null
}

export interface RecurrenceFilters {
  tipo?: string
  search?: string
  isActive?: boolean
}

// ==================== REGOLE SCADENZARIO ====================

export enum ScheduleRuleDirection {
  EMESSI = 'emessi',
  RICEVUTI = 'ricevuti',
}

export const SCHEDULE_RULE_DIRECTION_LABELS: Record<ScheduleRuleDirection, string> = {
  [ScheduleRuleDirection.EMESSI]: 'Regole documenti emessi',
  [ScheduleRuleDirection.RICEVUTI]: 'Regole documenti ricevuti',
} as const

export enum ScheduleRuleAction {
  CREA_RICONCILIA_MOVIMENTO = 'crea_riconcilia_movimento',
}

export const SCHEDULE_RULE_ACTION_LABELS: Record<ScheduleRuleAction, string> = {
  [ScheduleRuleAction.CREA_RICONCILIA_MOVIMENTO]: 'Crea e Riconcilia Movimento',
} as const

export interface ScheduleRule {
  id: string
  venueId: string
  direzione: ScheduleRuleDirection
  tipoDocumento: ScheduleDocumentType | null
  tipoPagamento: SchedulePaymentMethod | null
  azione: ScheduleRuleAction
  contoId: string | null
  ordine: number
  isActive: boolean
  createdById: string | null
  createdAt: Date
  updatedAt: Date
  conto?: { id: string; code: string; name: string; type: string }
  createdBy?: { id: string; firstName: string | null; lastName: string | null }
}

export interface CreateScheduleRuleInput {
  direzione: ScheduleRuleDirection
  tipoDocumento?: ScheduleDocumentType
  tipoPagamento?: SchedulePaymentMethod
  azione?: ScheduleRuleAction
  contoId: string
}

export interface UpdateScheduleRuleInput {
  tipoDocumento?: ScheduleDocumentType | null
  tipoPagamento?: SchedulePaymentMethod | null
  azione?: ScheduleRuleAction
  contoId?: string | null
  isActive?: boolean
}

// Dot colors per tipo documento (categoria)
export const SCHEDULE_DOCUMENT_TYPE_COLORS: Record<ScheduleDocumentType, string> = {
  [ScheduleDocumentType.FATTURA_VENDITA]: 'bg-emerald-500',
  [ScheduleDocumentType.FATTURA_ACQUISTO]: 'bg-blue-500',
  [ScheduleDocumentType.NOTA_CREDITO]: 'bg-teal-500',
  [ScheduleDocumentType.NOTA_DEBITO]: 'bg-orange-500',
  [ScheduleDocumentType.STIPENDIO]: 'bg-purple-500',
  [ScheduleDocumentType.TASSA_F24]: 'bg-red-500',
  [ScheduleDocumentType.CONTRIBUTO]: 'bg-indigo-500',
  [ScheduleDocumentType.AFFITTO]: 'bg-amber-500',
  [ScheduleDocumentType.UTENZA]: 'bg-cyan-500',
  [ScheduleDocumentType.RATA_PRESTITO]: 'bg-pink-500',
  [ScheduleDocumentType.ALTRO]: 'bg-gray-400',
} as const
