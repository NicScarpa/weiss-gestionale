import {
  ConfidenceLevel,
  FlowType,
  ForecastStatus,
  ForecastType,
  CONFIDENCE_LABELS,
  FORECAST_STATUS_LABELS,
  FORECAST_TYPE_LABELS,
} from '@/types/cash-flow'

/**
 * Quel poco che serve alle schermate delle previsioni oltre a `@/types/cash-flow`.
 *
 * Gli enum e le loro etichette stanno lì e da lì si prendono: riscriverli qui
 * significherebbe tenere allineati a mano due elenchi di stati, che è il modo in
 * cui `formatCurrency` è finita definita quindici volte in questo progetto.
 * Restano di competenza di questo file solo gli ordini in cui le voci compaiono
 * nei menu — una scelta di interfaccia, non un dato del dominio — e la forma dei
 * dati che le route restituiscono.
 */

export {
  ConfidenceLevel,
  FlowType,
  ForecastStatus,
  ForecastType,
  CONFIDENCE_LABELS,
  FORECAST_STATUS_LABELS,
  FORECAST_TYPE_LABELS,
}

/** Gli stati nell'ordine in cui una previsione li attraversa. */
export const STATI_PREVISIONE = [
  ForecastStatus.BOZZA,
  ForecastStatus.ATTIVA,
  ForecastStatus.ARCHIVIATA,
] as const

/** Gli scenari, dal più neutro ai più connotati. */
export const TIPI_PREVISIONE = [
  ForecastType.BASE,
  ForecastType.OTTIMISTICO,
  ForecastType.PESSIMISTICO,
  ForecastType.PERSONALIZZATO,
] as const

export const TIPI_RIGA = [FlowType.ENTRATA, FlowType.USCITA] as const

/** Dalla più sicura alla più incerta. */
export const CONFIDENZE = [
  ConfidenceLevel.CERTA,
  ConfidenceLevel.ALTA,
  ConfidenceLevel.MEDIA,
  ConfidenceLevel.BASSA,
] as const

export interface Previsione {
  id: string
  nome: string
  descrizione?: string | null
  dataInizio: string
  dataFine: string
  saldoIniziale: string | number
  stato: ForecastStatus
  tipo: ForecastType
  _count?: { lines: number; alerts: number }
}

export interface RigaPrevisione {
  id: string
  data: string
  tipo: FlowType
  importo: string | number
  categoria?: string | null
  descrizione?: string | null
  confidenza: ConfidenceLevel
  saldoProgressivo: number
}

export interface DettaglioPrevisione extends Previsione {
  lines: RigaPrevisione[]
  summary: {
    totaleEntrate: number
    totaleUscite: number
    saldoFinale: number
    saldoMinimo: number
    alertAttivi: number
  }
}

/** Il giorno civile 'yyyy-MM-dd' scritto all'italiana. */
export function giornoItaliano(valore: string | Date): string {
  const giorno = String(valore).slice(0, 10)
  const [anno, mese, data] = giorno.split('-')
  return data && mese && anno ? `${data}/${mese}/${anno}` : giorno
}
