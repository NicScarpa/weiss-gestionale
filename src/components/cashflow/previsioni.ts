/**
 * Il vocabolario delle previsioni di cassa: i tipi che il database conosce e i
 * nomi con cui si mostrano.
 *
 * Gli enum di Prisma arrivano al client come stringhe maiuscole («PESSIMISTICO»,
 * «ARCHIVIATA»): le tabelle qui sotto sono l'unico punto in cui diventano
 * parole da leggere.
 */

export const STATI_PREVISIONE = ['BOZZA', 'ATTIVA', 'ARCHIVIATA'] as const
export type StatoPrevisione = (typeof STATI_PREVISIONE)[number]

export const TIPI_PREVISIONE = [
  'BASE',
  'OTTIMISTICO',
  'PESSIMISTICO',
  'PERSONALIZZATO',
] as const
export type TipoPrevisione = (typeof TIPI_PREVISIONE)[number]

export const NOME_STATO_PREVISIONE: Record<StatoPrevisione, string> = {
  BOZZA: 'Bozza',
  ATTIVA: 'Attiva',
  ARCHIVIATA: 'Archiviata',
}

export const NOME_TIPO_PREVISIONE: Record<TipoPrevisione, string> = {
  BASE: 'Base',
  OTTIMISTICO: 'Ottimistico',
  PESSIMISTICO: 'Pessimistico',
  PERSONALIZZATO: 'Personalizzato',
}

export const TIPI_RIGA = ['ENTRATA', 'USCITA'] as const
export type TipoRiga = (typeof TIPI_RIGA)[number]

export const CONFIDENZE = ['CERTA', 'ALTA', 'MEDIA', 'BASSA'] as const
export type Confidenza = (typeof CONFIDENZE)[number]

export const NOME_CONFIDENZA: Record<Confidenza, string> = {
  CERTA: 'Certa',
  ALTA: 'Alta',
  MEDIA: 'Media',
  BASSA: 'Bassa',
}

export interface Previsione {
  id: string
  nome: string
  descrizione?: string | null
  dataInizio: string
  dataFine: string
  saldoIniziale: string | number
  stato: StatoPrevisione
  tipo: TipoPrevisione
  _count?: { lines: number; alerts: number }
}

export interface RigaPrevisione {
  id: string
  data: string
  tipo: TipoRiga
  importo: string | number
  categoria?: string | null
  descrizione?: string | null
  confidenza: Confidenza
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
