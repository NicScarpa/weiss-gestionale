// Tipi per Sibill Cash Flow

export enum ForecastStatus {
  BOZZA = 'BOZZA',
  ATTIVA = 'ATTIVA',
  ARCHIVIATA = 'ARCHIVIATA',
}

export enum ForecastType {
  BASE = 'BASE',
  OTTIMISTICO = 'OTTIMISTICO',
  PESSIMISTICO = 'PESSIMISTICO',
  PERSONALIZZATO = 'PERSONALIZZATO',
}

export enum FlowType {
  ENTRATA = 'ENTRATA',
  USCITA = 'USCITA',
}

export enum ConfidenceLevel {
  CERTA = 'CERTA',
  ALTA = 'ALTA',
  MEDIA = 'MEDIA',
  BASSA = 'BASSA',
}

export enum AlertType {
  SOTTO_SOGLIA = 'SOTTO_SOGLIA',
  SOPRA_SOGLIA = 'SOPRA_SOGLIA',
  SALDO_NEGATIVO = 'SALDO_NEGATIVO',
  VARIANZA_ALTA = 'VARIANZA_ALTA',
}

export enum AlertStatus {
  ATTIVO = 'ATTIVO',
  RISOLTO = 'RISOLTO',
  IGNORATO = 'IGNORATO',
}

export interface CashFlowProjection {
  data: Date
  saldo: number
  entrata: number
  uscita: number
  confidenza: ConfidenceLevel
}

export interface CashFlowSummary {
  saldoAttuale: number
  trend7gg: number
  previsione30gg: number
  deltaPrevisione: number
  runwayMesi: number
  burnRateMensile: number
  prossimoAlert: {
    tipo: AlertType
    data: Date
    messaggio: string
  }
}

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
  lines: CashFlowForecastLine[]
  createdAt: Date
  updatedAt: Date
}

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
}

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
}

export const FORECAST_STATUS_LABELS: Record<ForecastStatus, string> = {
  [ForecastStatus.BOZZA]: 'Bozza',
  [ForecastStatus.ATTIVA]: 'Attiva',
  [ForecastStatus.ARCHIVIATA]: 'Archiviata',
} as const

export const FORECAST_TYPE_LABELS: Record<ForecastType, string> = {
  [ForecastType.BASE]: 'Base',
  [ForecastType.OTTIMISTICO]: 'Ottimistico',
  [ForecastType.PESSIMISTICO]: 'Pessimistico',
  [ForecastType.PERSONALIZZATO]: 'Personalizzato',
} as const

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  [AlertType.SOTTO_SOGLIA]: 'Sotto soglia',
  [AlertType.SOPRA_SOGLIA]: 'Sopra soglia',
  [AlertType.SALDO_NEGATIVO]: 'Saldo negativo',
  [AlertType.VARIANZA_ALTA]: 'Varianza alta',
} as const

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  [AlertStatus.ATTIVO]: 'Attivo',
  [AlertStatus.RISOLTO]: 'Risolto',
  [AlertStatus.IGNORATO]: 'Ignorato',
} as const

export const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  [ConfidenceLevel.CERTA]: 'Certa',
  [ConfidenceLevel.ALTA]: 'Alta',
  [ConfidenceLevel.MEDIA]: 'Media',
  [ConfidenceLevel.BASSA]: 'Bassa',
} as const
