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
 * La causale ridotta ad A-Z0-9, con la mappa verso le posizioni originali.
 *
 * Serve a decidere il confine di un riferimento guardando i caratteri VERI.
 * Togliere i separatori salda fra loro campi che nell'originale erano
 * distinti — `Ft.N.3300/00/2026 30/05/2026` diventa `FTN330000202630052026` —
 * e un confine giudicato sul normalizzato scambia quella cucitura per
 * contiguità, rifiutando un riferimento che c'è.
 */
function normalizzaConPosizioni(testo: string): {
  normalizzato: string
  posizioni: number[]
} {
  const caratteri: string[] = []
  const posizioni: number[] = []

  for (let i = 0; i < testo.length; i++) {
    const c = testo[i].toUpperCase()
    if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) {
      caratteri.push(c)
      posizioni.push(i)
    }
  }

  return { normalizzato: caratteri.join(''), posizioni }
}

/** Il carattere in quella posizione dell'originale è una cifra? */
function cifraIn(testo: string, indice: number): boolean {
  return indice >= 0 && indice < testo.length && testo[indice] >= '0' && testo[indice] <= '9'
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
 * La delimitazione riguarda **solo le cifre**, non le lettere, e non è una
 * svista: nelle causali vere il numero arriva appiccicato alla ragione sociale
 * ("SRLFT 4320", che normalizzato diventa "SRLFT4320"), quindi pretendere un
 * confine anche a sinistra delle lettere perderebbe proprio i riferimenti che
 * il motore trova più spesso.
 *
 * **E si delimita un lato solo se quel bordo del riferimento è una cifra.**
 * Farlo sempre creava il difetto simmetrico, nella direzione opposta e più
 * costosa: `FT/2026/432` — la forma col prefisso alfabetico, ordinaria in
 * Italia, che arriva tale e quale da `invoice.invoiceNumber` — diventa
 * `FT2026432`, e il confine a sinistra lo rifiutava ogni volta che la causale
 * aveva una cifra appiccicata prima, cioè quasi sempre. Erano venti punti persi
 * sul fattore più discriminante, e un falso negativo qui **non lascia traccia**:
 * la proposta semplicemente non nasce, e non c'è sintomo da osservare dopo.
 *
 * Il guadagno misurato resta intero: l'1,63% di falsi positivi riguarda i
 * numeri a tre cifre, che sono numerici per definizione e quindi ancora
 * delimitati da entrambi i lati.
 *
 * **Il confine si giudica sui caratteri originali (16 agosto 2026).** Prima si
 * usavano due lookaround sulla causale *normalizzata*, e lì stava un secondo
 * falso negativo: togliere i separatori salda fra loro campi che nel testo
 * della banca erano distinti. `Ft.N.3300/00/2026 30/05/2026` diventa
 * `FTN330000202630052026`, e la data appiccicata faceva fallire il confine
 * destro di un riferimento perfettamente delimitato nell'originale. Sui
 * movimenti sincronizzati il 16 agosto erano **sette proposte**, sei delle
 * quali restavano fuori dalla fascia Alta: la fascia passa da 7 a 13.
 *
 * Da qui il ciclo sulle occorrenze invece di una singola espressione regolare:
 * la prima occorrenza può essere quella dentro l'identificativo operazione —
 * dove il confine blocca, correttamente — e il riferimento vero arrivare dopo.
 */
export function contieneRiferimento(causale: string, numeroDocumento: string): boolean {
  const ago = soloAlfanumerici(numeroDocumento)
  if (ago.length < LUNGHEZZA_MINIMA_RIFERIMENTO) return false

  const { normalizzato, posizioni } = normalizzaConPosizioni(causale)

  // Si scorrono TUTTE le occorrenze, non solo la prima: quella iniziale può
  // essere dentro l'identificativo operazione — dove la guardia blocca, ed è
  // giusto — e fermarsi lì perderebbe il riferimento vero più avanti.
  let da = normalizzato.indexOf(ago)
  while (da !== -1) {
    const inizioOriginale = posizioni[da]
    const fineOriginale = posizioni[da + ago.length - 1]

    // Ogni lato si ancora solo se il bordo corrispondente dell'ago è una cifra:
    // su un bordo alfabetico la delimitazione non separerebbe nulla,
    // escluderebbe e basta — nelle causali vere il numero arriva appiccicato
    // alla ragione sociale ("SRLFT 4320").
    //
    // Il confronto avviene però sui caratteri ORIGINALI, non sul normalizzato:
    // è la correzione del 16 agosto 2026. Lì uno spazio o una barra separano
    // davvero, mentre il normalizzato li ha fatti sparire creando adiacenze
    // che nel testo della banca non esistono.
    const bloccatoPrima = /^[0-9]/.test(ago) && cifraIn(causale, inizioOriginale - 1)
    const bloccatoDopo = /[0-9]$/.test(ago) && cifraIn(causale, fineOriginale + 1)

    if (!bloccatoPrima && !bloccatoDopo) return true

    da = normalizzato.indexOf(ago, da + 1)
  }

  return false
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
