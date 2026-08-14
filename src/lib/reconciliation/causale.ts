/**
 * Leggere una causale bancaria.
 *
 * Modulo puro: nessun accesso al database, nessun effetto. È qui perché tutto
 * ciò che il motore sa di un movimento arriva da una stringa — GoCardless
 * restituisce il campo controparte vuoto sul 100% dei movimenti osservati, e
 * l'unica fonte del nome e del numero fattura è il testo.
 *
 * La forma delle causali di Banca Della Marca è documentata negli snapshot in
 * `scripts/gocardless/snapshots/`: prima un blocco sintetico, poi "Info
 * aggiuntive" con coppie etichetta-valore. Il numero fattura compare due volte,
 * una appiccicato alla ragione sociale ("SRLFT 4320") e una dopo l'etichetta
 * "Causale:". La prima è il motivo per cui le espressioni regolari qui sotto
 * non usano `\b` prima di FT.
 */

/** Lunghezza minima di un riferimento perché cercarlo abbia senso. */
const LUNGHEZZA_MINIMA_RIFERIMENTO = 3

/**
 * Maiuscolo, senza accenti, senza punteggiatura, spazi singoli.
 *
 * Gli accenti si tolgono perché la banca li perde già per conto suo: nelle
 * causali osservate "Località" arriva come "Localit?", e confrontare una
 * ragione sociale accentata con la sua versione mutilata non funzionerebbe.
 *
 * **Il punto si cancella, il resto della punteggiatura diventa spazio.** Non è
 * un capriccio: in italiano il punto è il segno dell'abbreviazione societaria —
 * `S.r.l.`, `S.p.A.`, `S.n.c.` — e la banca scrive quelle sigle *senza* punti.
 * Se il punto diventasse spazio, `S.r.l.` darebbe `S R L` e non troverebbe mai
 * `SRL` nella causale. Gli altri segni invece separano parole (`PAGAMENTO-FATTURA`
 * deve dare due parole, non una), e cancellarli tutti creerebbe il difetto
 * opposto.
 */
export function normalizzaTesto(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Solo cifre e lettere, per confronti che ignorano barre, punti e spazi. */
function soloAlfanumerici(testo: string): string {
  return testo.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Il numero documento compare nella causale?
 *
 * Il confronto ignora la punteggiatura da entrambi i lati, così "2026/123"
 * trova "fatt. 2026 123". Sotto i tre caratteri non si cerca: un "12"
 * comparirebbe dentro l'identificativo operazione di qualunque bonifico, e
 * regalerebbe venti punti a ogni coppia.
 *
 * **L'ancoraggio sulle cifre, e perché è solo sulle cifre.** La ricerca senza
 * ancoraggio è stata misurata sulle 621 causali vere: falsi positivi all'1,63%
 * con numeri a 3 cifre, 0,16% a 4, 0,02% a 5 — il "432" della fattura trovato
 * dentro il "07084000412224084864990649901" dell'identificativo operazione.
 * Venti punti non creano da soli una proposta, ma bastano a spingere in fascia
 * Alta la coppia col fornitore giusto e la fattura sbagliata, che è l'errore
 * peggiore possibile: quella fascia si approva in blocco senza aprire le
 * schede.
 *
 * Si usano le stesse lookaround di `estraiPartiteIva`, e per la stessa
 * ragione. Delimitano **solo le cifre**, non le lettere, e non è una svista:
 * nelle causali vere il numero arriva appiccicato alla ragione sociale
 * ("SRLFT 4320", che normalizzato diventa "SRLFT4320"), quindi pretendere un
 * confine anche a sinistra delle lettere perderebbe proprio i riferimenti che
 * il motore trova più spesso.
 */
export function contieneRiferimento(causale: string, numeroDocumento: string): boolean {
  const ago = soloAlfanumerici(numeroDocumento)
  if (ago.length < LUNGHEZZA_MINIMA_RIFERIMENTO) return false
  // `ago` è già ridotto ad A-Z0-9 da `soloAlfanumerici`: non c'è nulla da
  // proteggere dall'interpolazione in un'espressione regolare.
  const ancorato = new RegExp(`(?<![0-9])${ago}(?![0-9])`)
  return ancorato.test(soloAlfanumerici(causale))
}

/**
 * I riferimenti a documento che la causale nomina esplicitamente.
 *
 * Serve a precompilare la ricerca manuale, non al punteggio — il punteggio usa
 * `contieneRiferimento`, che parte dal numero vero della scadenza e non deve
 * indovinare nulla.
 */
export function estraiRiferimentiDocumento(causale: string): string[] {
  // Niente \b prima di FT: nelle causali vere compare come "SRLFT 4320"
  const espressioni = [
    /FT\.?\s*(\d[\d/\-]{1,15})/gi,
    /FATT(?:URA)?\.?\s*N?\.?\s*(\d[\d/\-]{1,15})/gi,
    /N\.\s*DOC\.?\s*(\d[\d/\-]{1,15})/gi,
  ]

  const trovati = new Set<string>()
  for (const espressione of espressioni) {
    for (const occorrenza of causale.matchAll(espressione)) {
      const valore = occorrenza[1].replace(/[-/]+$/, '')
      if (soloAlfanumerici(valore).length >= LUNGHEZZA_MINIMA_RIFERIMENTO) {
        trovati.add(valore)
      }
    }
  }
  return [...trovati]
}

/**
 * Le partite IVA nominate nella causale.
 *
 * Undici cifre esatte, delimitate: senza il delimitatore si estrarrebbero
 * undici cifre qualunque dall'identificativo operazione, che ne ha ventinove.
 */
export function estraiPartiteIva(causale: string): string[] {
  const trovate = new Set<string>()
  for (const occorrenza of causale.matchAll(/(?<![0-9])(\d{11})(?![0-9])/g)) {
    trovate.add(occorrenza[1])
  }
  return [...trovate]
}
