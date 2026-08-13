import { TIPI_DOCUMENTO_NOTA_CREDITO } from '@/lib/services/invoice-schedule-service'

/**
 * L'importo con il segno da MOSTRARE, mai quello da salvare.
 *
 * Una nota di credito riduce il debito verso il fornitore: in un elenco va
 * letta in negativo, altrimenti il totale di una selezione somma crediti e
 * debiti come se fossero la stessa cosa.
 *
 * Il dato persistito resta positivo, e deve restarlo: la riconciliazione
 * sottrae le righe delle note alla fattura rettificata
 * (`righeDaSottrarreNote` in schedule-reconciliation-service.ts) partendo da
 * importi positivi. Negarli anche alla fonte li invertirebbe due volte.
 *
 * TD05 e TD09 — le note di DEBITO — restano positive: rettificano una fattura
 * nel verso opposto, aumentando il dovuto.
 */
export function segnoDiPresentazione(tipoDocumento: string, importo: number): number {
  if (!TIPI_DOCUMENTO_NOTA_CREDITO.has(tipoDocumento)) return importo
  // Il documento puo gia portare il segno: invertirlo di nuovo lo riporterebbe
  // positivo. E `importo <= 0` invece di `< 0` per non produrre -0.
  if (importo <= 0) return importo
  return -importo
}
