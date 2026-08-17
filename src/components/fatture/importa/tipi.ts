// Tipi condivisi dai passi del wizard di importazione fatture.
// Modulo puro (nessun import da servizi, Prisma o next/server): viene
// importato anche dai componenti client dei singoli passi.

export type PoliticaDuplicati = 'salta' | 'sostituisci'

export interface OpzioniImport {
  sovrascriviAnagrafica: boolean
  politicaDuplicati: PoliticaDuplicati
}

export const OPZIONI_PREDEFINITE: OpzioniImport = {
  sovrascriviAnagrafica: false,
  politicaDuplicati: 'salta',
}

export type StatoRiga = 'importata' | 'duplicata' | 'errore' | 'esclusa'

/** Etichetta italiana per ogni stato: un solo posto, usata sia dal log vivo
 * del passo 3 sia dal riepilogo finale, per non farle divergere. */
export const ETICHETTE_STATO: Record<StatoRiga, string> = {
  importata: 'Importata',
  duplicata: 'Duplicata',
  errore: 'Errore',
  esclusa: 'Esclusa',
}

/**
 * `YYYY-MM-DD` (o null) in `gg/mm/aaaa`: qui non serve altro che uno split.
 *
 * Volutamente diversa da `formatDateIT` (`invoice-utils.ts`), che passa da
 * `new Date()` e `toLocaleDateString`: su una data senza orario quel giro
 * introduce lo scarto di fuso, e una scadenza può risultare il giorno prima.
 * Lo split non tocca il fuso perché non costruisce mai una data.
 */
export function formattaData(data: string | null): string {
  if (!data) return '—'
  const [anno, mese, giorno] = data.split('-')
  return `${giorno}/${mese}/${anno}`
}
