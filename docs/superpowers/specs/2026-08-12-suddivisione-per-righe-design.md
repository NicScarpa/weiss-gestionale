# Suddivisione di una fattura per righe — design IN CORSO

**Data:** 12 agosto 2026
**Stato:** ⚠️ **INCOMPLETO** — cinque decisioni prese, la prima sezione del design presentata e non ancora confermata, quattro domande aperte. **Non è un piano di implementazione e non va eseguito.**
**Come riprendere:** il prompt sta in fondo.

---

## Il problema, in una riga

Quando si divide un pagamento su più conti, l'IVA viene ripartita in proporzione agli importi invece che secondo l'aliquota di ciascuna riga. Su una fattura con aliquote miste — food al 10% e detersivi al 22%, cioè la fattura normale di un fornitore di ristorazione — la famiglia piccola sbaglia fino al 10%. Il totale resta sempre esatto: è la ripartizione fra le famiglie a essere approssimata.

Richiesta del committente: poter **selezionare le righe della fattura** e imputarle ai conti, invece di digitare importi. E l'obbligo di attribuire tutto: o si copre l'intero documento, o non si divide.

---

## La scoperta che ridimensiona il lavoro

Metà di quanto serve **esiste già**, e va collegato invece che costruito.

| Cosa | Dove | Stato |
|---|---|---|
| Righe della fattura con **aliquota per riga** | `ElectronicInvoice.lineItems` (Json), più `vatSummary` e l'XML originale | già persistite dal parser SDI |
| Imputazione riga → conto, con proposta AI, confidenza, motivazione e conferma umana | modello `InvoiceLineAccount`, route `/api/invoices/[id]/righe-conti`, UI in `InvoiceDetail.tsx`, motore in `src/lib/line-categorization/` | già funzionante |
| Fette del movimento, con origine `manuale` o `ereditata` | `JournalEntryAllocation` | già funzionante |
| Calcolo dei pesi **al lordo, con l'aliquota della singola riga** | `schedule-reconciliation-service.ts:178`, funzione `alLordo()` | **già corretto** |

Il commento sopra quel calcolo, in `schedule-reconciliation-service.ts:170-177`, descrive il problema delle aliquote miste con lo stesso esempio numerico usato in questa discussione. Qualcuno c'era già arrivato.

**Dove si perde la precisione**: la fetta conserva solo l'importo lordo, non quanta IVA contiene. Il prospetto, non trovandola, la ricalcola in proporzione — buttando via un risultato che era già esatto un istante prima.

---

## Le cinque decisioni prese

1. **I movimenti senza fattura elettronica restano divisibili per importo.** Motivo del committente: sono scontrini o spese senza diritto di detrazione, quindi l'IVA è un costo aggregato all'imponibile e non c'è nulla da ripartire. Là la divisione per importi non è un ripiego, è la cosa giusta.

2. **Bollo virtuale e arrotondamento diventano righe di sistema, imputabili come le altre.** Stanno fuori dalle righe della fattura (`parseDatiBollo`, `arrotondamento` nel parser), quindi senza di loro la somma non torna mai al totale del documento e il vincolo «tutto o niente» sarebbe insoddisfacibile. Marcate come di sistema, il bollo tipicamente su `30.01`.

3. **Una singola riga può essere divisa fra più conti, per importo.** Copre il caso in cui il fornitore accorpa voci diverse in una riga sola. **Non costa precisione**: dentro una riga l'aliquota è unica, quindi la proporzione la rispetta esattamente.

4. **L'imputazione si fa sulla fattura; il movimento eredita.** Si usa la schermata che già esiste, con le proposte dell'AI, nel momento in cui si ha la fattura sotto gli occhi. Quando quella fattura diventa un pagamento, le fette nascono da lì. Si imputa una volta sola, e non ci si ritrova mesi dopo davanti a un bonifico che dice solo «Fornitore SRL».

5. **Attribuzione totale obbligatoria.** Non deve essere possibile lasciare un residuo non attribuito: o si copre l'intero importo della fattura, o non la si divide.

---

## Sezione 1 del design — presentata, NON confermata

**La fetta porta la propria IVA.** Un campo in più su `JournalEntryAllocation`, valorizzato da chi la crea:

- **dalla riconciliazione**: conosce già l'aliquota di ogni riga e calcola l'IVA esatta — il codice ha già tutto in mano;
- **dalla suddivisione manuale su fattura**: le righe selezionate portano la loro aliquota;
- **dalla suddivisione manuale senza fattura**: IVA a zero, per la decisione 1;
- **dividendo una singola riga**: proporzione sull'aliquota unica, quindi esatta.

Il prospetto smette di dedurre e legge. Sparisce il ripiego pro-quota e con esso l'errore sulle aliquote miste.

**Effetto collaterale gradito**: il pagamento parziale diventa esatto. Pagando metà fattura, ogni fetta si dimezza con la propria IVA — 550 con dentro 50, 61 con dentro 11 — invece di ereditare una media.

**Questa sezione aspetta la conferma del committente.**

---

## Le domande ancora aperte

1. **Conferma della sezione 1** — è il punto di ripartenza.
2. **La fattura modificata dopo l'imputazione.** Se arriva una nota di credito o la fattura viene sostituita, cosa succede alle imputazioni già confermate e alle fette già generate?
3. **Un pagamento che copre più fatture.** Il codice attuale se ne accorge e si astiene (`schedule-reconciliation-service`, guardia sullo sforamento). Con l'imputazione per righe, le fette di due fatture diverse convivono sullo stesso movimento: va deciso se sommarle o tenerle distinte.
4. **La forma dell'interfaccia.** La schermata delle righe esiste; va deciso come mostrare le righe di sistema (decisione 2), come si divide una riga (decisione 3) e come si comunica che manca ancora qualcosa da attribuire (decisione 5).

---

## Vincoli e fatti utili all'implementazione

- **Nessuna migrazione dati.** `journal_entries` è vuota in produzione, quindi le fette sono necessariamente zero: il campo nuovo nasce senza storico da riempire.
- **Il prospetto di cash flow è già in produzione** e legge le fette: `src/lib/cashflow/movimenti.ts` fa oggi la ripartizione pro-quota, con il limite documentato nel proprio commento. È il consumatore da aggiornare.
- **Tre copie della logica delle fette, con due semantiche.** `saldi.ts:385-448` e `cashflow/movimenti.ts` tolgono alla testata solo la somma delle fette; `report/conto-economico.ts:272-296` ignora del tutto la testata. Con la decisione 5 (attribuzione totale) la differenza sparisce sulle fatture, **ma resta sui movimenti senza fattura**, dove la suddivisione parziale continua a essere possibile. Da decidere quale semantica vince.
- **`strict: true` è attivo** da `b38b0d0`: un campo nullable nuovo verrà segnalato in ogni punto che lo usa senza controllarlo. È un aiuto, non un ostacolo.
- Il modello `SupplierProductAccount` esiste e lega prodotti ricorrenti di un fornitore a un conto: è la memoria che alimenta le proposte dell'AI. Potrebbe entrare in gioco per la decisione 3.

---

## Prompt per riprendere in una sessione nuova

> Riprendiamo il design della suddivisione delle fatture per righe. Leggi `docs/superpowers/specs/2026-08-12-suddivisione-per-righe-design.md`: contiene il problema, cosa esiste già nel codice, cinque decisioni già prese e la prima sezione del design in attesa di conferma.
>
> Usa la skill `superpowers:brainstorming` e riparti dalla conferma della sezione 1 — la fetta che porta la propria IVA — poi affronta le quattro domande aperte, una alla volta.
>
> Contesto d'ambiente: si lavora nel worktree `~/Desktop/accounting-wt/cash-flow`; `DATABASE_URL` punta alla **produzione**, quindi nessun comando Prisma che scrive; Node 22 con `nvm use 22 &&` davanti a ogni npm/npx; test di integrazione con `TEST_DB_SUFFIX` distinto. Baseline verde: 1417 test unitari su 106 file, 405 di integrazione su 54.
