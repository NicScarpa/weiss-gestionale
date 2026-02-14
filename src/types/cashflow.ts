// Tipi per il modulo Cash Flow Previsionale (Sibill)

export type ForecastStatus = 'BOZZA' | 'ATTIVA' | 'ARCHIVIATA'

export type ForecastType = 'BASE' | 'OTTIMISTICO' | 'PESSIMISTICO' | 'PERSONALIZZATO'

export type FlowType = 'ENTRATA' | 'USCITA'

export type ConfidenceLevel = 'CERTA' | 'ALTA' | 'MEDIA' | 'BASSA'

export type AlertType = 'SOTTO_SOGLIA' | 'SOVRA_SOGLIA' | 'SALDO_NEGATIVO' | 'VARIANZA_ALTA'

export type AlertStatus = 'ATTIVO' | 'RISOLTO' | 'IGNORATO'

export const FORECAST_STATUS_LABELS: Record<ForecastStatus, string> = {
  BOZZA: 'Bozza',
  ATTIVA: 'Attiva',
  ARCHIVIATA: 'Archiviata',
}

export const FORECAST_TYPE_LABELS: Record<ForecastType, string> = {
  BASE: 'Base',
  OTTIMISTICO: 'Ottimistico',
  PESSIMISTICO: 'Pessimistico',
  PERSONALIZZATO: 'Personalizzato',
}

export const FLOW_TYPE_LABELS: Record<FlowType, string> = {
  ENTRATA: 'Entrata',
  USCITA: 'Uscita',
}

export const FLOW_TYPE_COLORS: Record<FlowType, string> = {
  ENTRATA: 'text-green-600',
  USCITA: 'text-red-600',
}

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  CERTA: 'Certa',
  ALTA: 'Alta',
  MEDIA: 'Media',
  BASSA: 'Bassa',
}

export const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  CERTA: 'bg-green-100 text-green-700',
  ALTA: 'bg-blue-100 text-blue-700',
  MEDIA: 'bg-yellow-100 text-yellow-700',
  BASSA: 'bg-orange-100 text-orange-700',
}

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  SOTTO_SOGLIA: 'Sotto Soglia',
  SOVRA_SOGLIA: 'Sovra Soglia',
  SALDO_NEGATIVO: 'Saldo Negativo',
  VARIANZA_ALTA: 'Varianza Alta',
}

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  ATTIVO: 'Attivo',
  RISOLTO: 'Risolto',
  IGNORATO: 'Ignorato',
}

// Cash Flow Forecast
export interface CashFlowForecast {
  id: string
  venueId: string
  createdById: string
  nome: string
  descrizione?: string
  dataInizio: Date
  dataFine: Date
  saldoIniziale: number
  saldoFinale: number
  totaleEntrate: number
  totaleUscite: number
  stato: ForecastStatus
  tipo: ForecastType
  createdAt: Date
  updatedAt: Date
  // Relations
  venue?: {
    id: string
    name: string
    code: string
  }
  createdBy?: {
    id: string
    firstName: string
    lastName: string
  }
  lines?: CashFlowForecastLine[]
  alerts?: CashFlowAlert[]
}

// Linea del cash flow
export interface CashFlowForecastLine {
  id: string
  forecastId: string
  data: Date
  tipo: FlowType
  importo: number
  categoria?: string
  descrizione?: string
  fonte?: string
  confidenza: ConfidenceLevel
  saldoProgressivo?: number
  isRealizzata: boolean
  createdAt: Date
}

// Alert cash flow
export interface CashFlowAlert {
  id: string
  venueId: string
  forecastId?: string
  tipo: AlertType
  dataPrevista: Date
  saldoPrevisto: number
  soglia?: number
  messaggio?: string
  stato: AlertStatus
  createdAt: Date
  updatedAt: Date
}

// Scenario what-if
export interface CashFlowScenario {
  id: string
  forecastId: string
  nome: string
  descrizione?: string
  tipoAggiustamento?: string
  importiModificati: boolean
  dateModificate: boolean
  createdAt: Date
}

// Form data
export interface CashFlowForecastFormData {
  venueId: string
  nome: string
  descrizione?: string
  dataInizio: Date
  dataFine: Date
  saldoIniziale: number
  tipo: ForecastType
}

export interface CashFlowLineFormData {
  forecastId: string
  data: Date
  tipo: FlowType
  importo: number
  categoria?: string
  descrizione?: string
  fonte?: string
  confidenza: ConfidenceLevel
}

// Filtri
export interface CashFlowForecastFilters {
  venueId?: string
  stato?: ForecastStatus
  tipo?: ForecastType
  dateFrom?: Date
  dateTo?: Date
}

// Riepilogo cash flow
export interface CashFlowSummary {
  saldoIniziale: number
  totaleEntrate: number
  totaleUscite: number
  saldoFinale: number
  saldoMinimo: number
  dataSaldoMinimo: Date
  giorniSottoSoglia: number
  alertAttivi: number
}

// Dati grafico cash flow
export interface CashFlowChartData {
  date: Date
  saldo: number
  entrate: number
  uscite: number
  saldoPrevisto?: number
}
