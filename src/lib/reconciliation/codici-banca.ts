import { SchedulePaymentMethod } from '@/types/schedule'

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
 * ## Cosa costa davvero una riga sbagliata
 *
 * Meno di quanto sembri, ed è bene saperlo con precisione perché è su questo
 * che si decide quanto essere prudenti. `punteggioCodiceBanca` restituisce
 * **0 in entrambi i casi**: sia quando il codice è sconosciuto, sia quando è
 * noto e contraddice il metodo della scadenza. Nel secondo caso aggiunge anche
 * una motivazione col segno meno — ma è una *frase*, non un punto. **La mappa
 * può solo aggiungere punti, mai toglierne.**
 *
 * Quindi il rischio si inverte rispetto all'intuizione: il pericolo non è la
 * riga mancante (costa al massimo dieci punti non dati), è la riga **troppo
 * larga**, che regala dieci punti a una coppia che non li merita — e quei
 * punti spingono verso la fascia Alta, che si approva in blocco senza aprire
 * le schede. Per questo l'elenco dei metodi accettati resta stretto anche dove
 * si potrebbe allargarlo per prudenza apparente.
 *
 * ## Chi decide `metodoPagamento` sulla scadenza — e perché conta
 *
 * **Per le fatture importate non è la scelta di chi registra: è il codice SDI
 * che il fornitore ha scritto nel proprio XML.** `invoice-schedule-service.ts`
 * lo passa da `tipoPagamentoDaCodiceSdi`, che traduce `MODALITA_PAGAMENTO_SDI`
 * (`schedule-rules/engine.ts`): MP05 → `bonifico`, MP09/MP10/MP11/MP19 →
 * `sdd`, MP12 → `riba`, e così via.
 *
 * La conseguenza pratica è su `31//21`: un fornitore che incassa via SDD B2B
 * ma dichiara MP05 nella fattura produce una scadenza marcata `bonifico`, e
 * l'abbinamento — corretto — si porta dietro la frase «il codice operazione
 * indica sdd, ma la scadenza dice bonifico». **È un difetto di prosa, non di
 * punteggio**, e la scelta è stata di tenerlo: aggiungere `bonifico` fra i
 * valori accettati di `31//21` toglierebbe la frase fuorviante, ma regalerebbe
 * dieci punti veri a ogni scadenza marcata `bonifico` — cioè al metodo di gran
 * lunga più frequente — ogni volta che il movimento è un SDD B2B. Si scambia
 * una frase sbagliata con dei punti sbagliati, e i punti pesano di più.
 *
 * ## Cosa resta fuori, e perché
 *
 * - **le commissioni** (`16//37`, `16//33`, `16//32`, `16//00`, `16//40`) e gli
 *   **interessi** (`18//00`): non pagano una scadenza per costruzione, e
 *   nessuno dei metodi disponibili le descrive;
 * - **gli emolumenti** (`39//11`, `39//00`): le buste paga non passano dallo
 *   scadenzario con un metodo dichiarato, quindi non c'è un valore atteso;
 * - **il giroconto** (`34//00`) e il **prelievo di contante** (`52//30`): non
 *   pagano nessuno, spostano denaro fra conti propri — dalla banca alla cassa
 *   nel secondo caso. Sono materia della R5, non di una scadenza. `52//30` è
 *   stato tolto dalla mappa proprio per applicare a entrambi lo stesso
 *   criterio;
 * - **la rata mutuo** (`15//10`), **l'imposta di bollo** (`19//05`) e le
 *   **utenze CBILL/PagoPA** (`11//70`): il metodo con cui vengono registrate
 *   non è deducibile dal codice — potrebbe essere `sdd`, `bollettino` o
 *   `altro`.
 *
 * ## Un limite da tenere presente
 *
 * `proprietaryBankTransactionCode` è, come dice il nome, **proprietario della
 * banca**. Questi codici sono quelli di Banca Della Marca, l'unico istituto
 * collegato oggi. Se un domani si collega una seconda banca che usa la stessa
 * forma `NN//NN` con un significato diverso, questa mappa va spezzata per
 * istituto: oggi non lo è perché non c'è un secondo istituto da distinguere e
 * inventare la chiave adesso significherebbe indovinarne la forma.
 */

/**
 * Codice operazione → metodi di pagamento compatibili.
 *
 * I valori sono tipizzati `SchedulePaymentMethod[]` e non `string[]`: sono le
 * stesse costanti che `MODALITA_PAGAMENTO_SDI` scrive sulla scadenza, quindi un
 * refuso qui non compila invece di restare invisibile fino alla prima
 * motivazione sbagliata su una scheda.
 *
 * Più di un valore solo dove **lo stesso fatto** ammette due registrazioni
 * entrambe corrette — non come cautela generica: allargare l'elenco regala
 * dieci punti, e i punti spingono verso la fascia che si approva in blocco.
 */
export const MAPPA_CODICI_BANCA: ReadonlyMap<string, SchedulePaymentMethod[]> = new Map([
  // Bonifico tramite internet banking: 96 uscite, il 24,5% del campione, ed è
  // il codice dei pagamenti fornitore veri (36,5% cita un riferimento).
  ['26//11', [SchedulePaymentMethod.BONIFICO]],
  // Disposizione permanente: un bonifico ricorrente disposto una volta sola.
  ['26//20', [SchedulePaymentMethod.BONIFICO]],
  // SDD B2B: addebito diretto fra imprese, 21 uscite. Volutamente il solo
  // `sdd`: vedi in cima al file perché `bonifico` non è stato aggiunto anche
  // sapendo che il codice SDI del fornitore può dire MP05.
  ['31//21', [SchedulePaymentMethod.SDD]],
  // SDD CORE, 50 uscite. Il README osserva che nel campione sono addebiti di
  // carte aziendali (American Express): lo strumento bancario è un SDD, ma la
  // spesa sottostante è una carta. Sono due letture entrambe corrette dello
  // *stesso* fatto — non due ipotesi su fatti diversi — e la scadenza può
  // legittimamente portare l'una o l'altra.
  ['31//22', [SchedulePaymentMethod.SDD, SchedulePaymentMethod.CARTA]],
  // Carta di credito addebitata direttamente.
  ['45//15', [SchedulePaymentMethod.CARTA]],
  // F24 / delega unificata.
  ['19//83', [SchedulePaymentMethod.F24]],
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
