/**
 * I codici operazione della banca, tradotti in metodi di pagamento.
 *
 * ## Da dove viene questa tabella
 *
 * Non è inventata: viene dalla misurazione del Task 9 su **621 movimenti veri**
 * di Banca Della Marca, scaricati nella Fase 0 dell'open banking. La tabella
 * completa dei diciannove codici osservati — con frequenza, percentuale sulle
 * uscite e quanti citano un riferimento in causale — sta in
 * `scripts/riconciliazione/README.md`, sezione «Le causali». Quel documento è
 * la fonte; questo file ne è la parte azionabile.
 *
 * ## Perché la mappa è più corta della tabella
 *
 * Deliberatamente. Quando il codice è noto ma **contraddice** il metodo atteso,
 * `punteggioCodiceBanca` non si limita a non dare i dieci punti: aggiunge una
 * **motivazione negativa**, cioè spiega all'utente che l'abbinamento è
 * sospetto. Una mappatura sbagliata quindi non è neutra — penalizza
 * attivamente abbinamenti corretti, ed è peggio di una mappa vuota. Un codice
 * *assente* dalla mappa vale invece 0 senza motivazione negativa, che è il
 * comportamento sicuro.
 *
 * Quindi qui stanno solo i codici la cui lettura è univoca. Restano fuori, di
 * proposito:
 *
 * - **le commissioni** (`16//37`, `16//33`, `16//32`, `16//00`, `16//40`) e gli
 *   **interessi** (`18//00`): non pagano una scadenza per costruzione, e
 *   nessuno dei metodi disponibili le descrive;
 * - **gli emolumenti** (`39//11`, `39//00`): le buste paga non passano dallo
 *   scadenzario con un metodo dichiarato, quindi non c'è un valore atteso;
 * - **il giroconto** (`34//00`): è materia della regola R5, non di una scadenza;
 * - **la rata mutuo** (`15//10`), **l'imposta di bollo** (`19//05`) e le
 *   **utenze CBILL/PagoPA** (`11//70`): il metodo con cui l'operatore le
 *   registra non è deducibile dal codice — potrebbe essere `sdd`, `bollettino`
 *   o `altro`, e sbagliare costerebbe una motivazione negativa.
 *
 * ## Un limite da tenere presente
 *
 * `proprietaryBankTransactionCode` è, come dice il nome, **proprietario della
 * banca**. Questi codici sono quelli di Banca Della Marca, l'unico istituto
 * collegato oggi. Se un domani si collega una seconda banca che usa la stessa
 * forma `NN//NN` con un significato diverso, questa mappa va spezzata per
 * istituto: oggi non lo è perché non c'è un secondo istituto da distinguere e
 * inventare la chiave adesso significherebbe indovinarne la forma.
 *
 * I valori sono quelli di `SchedulePaymentMethod` (`src/types/schedule.ts`).
 */

/**
 * Codice operazione → metodi di pagamento compatibili.
 *
 * Più di un valore dove la lettura ammette due registrazioni entrambe legittime:
 * l'elenco è un «uno qualsiasi di questi va bene», e serve proprio a non
 * penalizzare la lettura che non avevamo previsto.
 */
export const MAPPA_CODICI_BANCA: ReadonlyMap<string, string[]> = new Map([
  // Bonifico tramite internet banking: 96 uscite, il 24,5% del campione, ed è
  // il codice dei pagamenti fornitore veri (36,5% cita un riferimento).
  ['26//11', ['bonifico']],
  // Disposizione permanente: un bonifico ricorrente disposto una volta sola.
  ['26//20', ['bonifico']],
  // SDD B2B: addebito diretto fra imprese, 21 uscite.
  ['31//21', ['sdd']],
  // SDD CORE, 50 uscite. Il README osserva che nel campione sono addebiti di
  // carte aziendali (American Express): lo strumento bancario è un SDD, ma chi
  // registra la scadenza può averla marcata «carta» guardando la spesa. Sono
  // due letture entrambe corrette dello stesso fatto, e nessuna delle due
  // dev'essere penalizzata.
  ['31//22', ['sdd', 'carta']],
  // Carta di credito addebitata direttamente.
  ['45//15', ['carta']],
  // F24 / delega unificata.
  ['19//83', ['f24']],
  // Prelievo contante: se salda una scadenza, l'ha saldata in contanti.
  ['52//30', ['contanti']],
])

/**
 * La mappa nella forma che `ContestoValutazione` richiede.
 *
 * Copia difensiva: il contesto la riceve come `Map` mutabile, e restituire
 * quella condivisa lascerebbe che un chiamante distratto la modifichi per
 * tutti.
 *
 * Nota: `riba` non compare fra i valori. Non è una dimenticanza — nei 621
 * movimenti osservati non è mai comparso un codice riconducibile alla Ri.Ba., e
 * mapparne uno per simmetria sarebbe esattamente l'indovinello che questo file
 * evita.
 */
export function mappaCodiciBanca(): Map<string, string[]> {
  return new Map([...MAPPA_CODICI_BANCA].map(([codice, metodi]) => [codice, [...metodi]]))
}
