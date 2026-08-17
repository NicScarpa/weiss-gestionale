# Suddivisione di una fattura per righe — design

**Data:** 12 agosto 2026
**Stato:** approvato. Pronto per il piano di implementazione.
**Sostituisce:** la versione incompleta del 12 agosto (commit `ac32006`).

---

## Il problema, in una riga

Quando si divide un pagamento su più conti, l'IVA viene ripartita in proporzione agli importi invece che secondo l'aliquota di ciascuna riga. Su una fattura con aliquote miste — alimentari al 10% e detersivi al 22%, cioè la fattura normale di un fornitore di ristorazione — la famiglia piccola sbaglia fino al 10%. Il totale resta sempre esatto: è la ripartizione fra le famiglie a essere approssimata.

Richiesta del committente: poter **selezionare le righe della fattura** e imputarle ai conti, invece di digitare importi. E l'obbligo di attribuire tutto: o si copre l'intero documento, o non si divide.

---

## Quanto esiste già

Metà di quanto serve è costruita, e va collegata invece che scritta.

| Cosa | Dove | Stato |
|---|---|---|
| Righe della fattura con **aliquota per riga** | `ElectronicInvoice.lineItems` (Json), più `vatSummary` e l'XML originale | già persistite dal parser SDI |
| Imputazione riga → conto, con proposta AI, confidenza, motivazione e conferma umana | `InvoiceLineAccount`, route `/api/invoices/[id]/righe-conti`, motore in `src/lib/line-categorization/` | già funzionante |
| **Tabella a schermo** con descrizione, quantità, prezzo, aliquota, totale, tendina del conto, pallino di stato e «Accetta tutte» | `LineItemsTable` in `src/components/invoices/InvoiceDetailSections.tsx:317` | già funzionante |
| Fette del movimento, con origine `manuale` o `ereditata` | `JournalEntryAllocation` | già funzionante |
| Calcolo dei pesi **al lordo, con l'aliquota della singola riga** | `src/lib/services/schedule-reconciliation-service.ts` — `alLordo()` alla riga 83, chiamata alla 213, aliquote lette alla 178 | **già corretto** |
| Guardia di copertura totale delle righe | stesso file, riga 161 | già presente, ma non conta le righe di sistema |
| Collegamento nota di credito → fattura rettificata | `ElectronicInvoice.references.datiFattureCollegate`, estratto dal parser | già persistito, mai letto |

Il commento in `schedule-reconciliation-service.ts:170-177` descrive il problema delle aliquote miste con lo stesso esempio numerico usato in questa discussione, e quello in `src/lib/cashflow/movimenti.ts:125-155` ne descrive già la soluzione: *«il limite sta nel dato persistito, non in un dato che non esiste»*.

**Dove si perde la precisione**: la fetta conserva solo l'importo lordo, non quanta IVA contiene. Il prospetto, non trovandola, la ricalcola in proporzione — buttando via un risultato che era esatto un istante prima.

---

## Le cinque decisioni di partenza

1. **I movimenti senza fattura elettronica restano divisibili per importo.** Sono scontrini o spese senza diritto di detrazione: l'IVA è un costo aggregato all'imponibile e non c'è nulla da ripartire. Là la divisione per importi non è un ripiego, è la cosa giusta.

2. **Bollo virtuale e arrotondamento diventano righe di sistema, imputabili come le altre.** Stanno fuori da `lineItems` (`parseDatiBollo`, `arrotondamento` nel parser), quindi senza di loro la somma non torna mai al totale del documento e il vincolo «tutto o niente» sarebbe insoddisfacibile. Il bollo nasce proposto su `30.01 — Imposta di bollo` (famiglia E, sottogruppo E8 della riclassificazione).

3. **Una singola riga può essere divisa fra più conti, per importo.** Copre il fornitore che accorpa voci diverse in una riga sola. Non costa precisione: dentro una riga l'aliquota è unica, quindi la proporzione la rispetta esattamente.

4. **L'imputazione si fa sulla fattura; il movimento eredita.** Si imputa una volta sola, con la fattura sotto gli occhi e le proposte dell'AI, invece di ritrovarsi mesi dopo davanti a un bonifico che dice solo «Fornitore SRL».

5. **Attribuzione totale obbligatoria.** Non è possibile lasciare un residuo non attribuito: o si copre l'intero documento, o non lo si divide.

---

## 1. La fetta porta la propria IVA

Un campo su `JournalEntryAllocation`, valorizzato da chi crea la fetta:

```prisma
/// Quanta IVA contiene questa fetta. `null` = non nota: il consumatore
/// ricade sulla ripartizione pro-quota. Diverso da `0`, che significa
/// "IVA assente" (spesa senza diritto di detrazione, decisione 1).
iva Decimal? @db.Decimal(10, 2)
```

Ciascuno dei quattro creatori sa già il numero esatto:

| Chi crea la fetta | Valore scritto |
|---|---|
| riconciliazione (`origine: 'ereditata'`) | IVA esatta, da `aliquotePerLinea` riga per riga |
| suddivisione su fattura | dalle righe selezionate, con la loro aliquota |
| divisione di una riga singola | proporzione su un'aliquota unica, quindi esatta |
| suddivisione manuale su movimento (`origine: 'manuale'`) | `null` — chi divide a mano non dichiara un'IVA |

Sull'ultimo caso vale la pena essere espliciti: si scrive `null`, non `0`. Il ripiego pro-quota su un movimento senza IVA dà comunque zero, quindi il risultato è identico, ma il dato resta onesto — dice «non lo so» invece di affermare un'assenza.

**Il verso.** L'IVA della fetta segue il verso dell'importo, con la stessa condizione di `ripartisciIva()`: una suddivisione non cambia il segno di ciò che è stato pagato o incassato. Importo e IVA non possono divergere di verso.

**Il residuo.** La testata trattiene ciò che le fette non coprono, IVA compresa. Sulle fatture, con la decisione 5, il residuo è sempre zero.

**Effetto collaterale gradito.** Il pagamento parziale diventa esatto: pagando metà fattura ogni fetta si dimezza con la propria IVA — 550 con dentro 50, 61 con dentro 11 — invece di ereditare una media.

**Perché persistere invece di ricalcolare.** L'alternativa era far puntare la fetta alle righe e ricalcolare l'IVA a ogni lettura. Lega il prospetto allo snapshot della fattura, cioè fa muovere i numeri di un mese chiuso. La tracciabilità che sembrerebbe guadagnare c'è già: dalla fetta si risale alla riconciliazione, alla scadenza, alla fattura e alle sue righe imputate.

### Ripiego e casi degeneri

- `iva = null` → il consumatore ripartisce pro-quota come oggi. Il ripiego **resta in piedi**, non si rimuove.
- Se **anche una sola** riga imputata della fattura non ha un'aliquota leggibile (`aliquoteDelloSnapshot` la scarta), l'ereditarietà scrive `null` su **tutte** le fette di quella fattura. Mescolare fette esatte e fette stimate produrrebbe un totale che non torna con nessuna delle due logiche; meglio un'intera fattura approssimata in modo dichiarato.

---

## 2. Le fette sono una fotografia, e la fotografia parla

**La fattura non è modificabile.** `xmlContent`, `lineItems`, `vatSummary` e gli importi si scrivono una volta sola all'import, in transazione. La `PATCH` su `/api/invoices/[id]` tocca fornitore, conto di testata, note e stato — mai le righe. Il re-import della stessa terna (numero, data, P.IVA) risponde «Fattura già importata». Il documento fiscale è immutabile per costruzione.

Resta il caso in cui **l'imputazione di una riga cambia dopo che le fette sono nate**. Oggi non succede nulla: l'ereditarietà gira solo al momento della riconciliazione, e le fette manuali vincono sempre. Il prospetto continua a raccontare i conti vecchi e la fattura ne mostra di nuovi, senza che nessuno se ne accorga.

**Decisione: la fetta resta com'è, e il sistema segnala la divergenza.**

- Nessuna propagazione automatica. Un mese già chiuso e già letto non si riscrive da solo.
- La divergenza è **rilevabile con i dati che ci sono**: esiste una `InvoiceLineAccount` di quella fattura con `updatedAt` posteriore al `createdAt` delle fette generate dalla riconciliazione collegata.
- Dove si vede: sul dettaglio fattura e sul movimento, come avviso — *«Questa fattura è stata reimputata dopo il pagamento. Il movimento del 31/03 usa ancora l'imputazione precedente»* — con un pulsante **Riallinea**.
- **Riallinea** cancella le fette `ereditata` di quella riconciliazione e le rigenera dalle imputazioni correnti. Le fette `manuale` restano intoccate, coerentemente con la regola che vincono sempre. L'azione è registrata a audit con utente e data.

---

## 3. L'avanzo del movimento

Un movimento può riconciliare più scadenze: ogni riconciliazione crea le proprie fette, marcate col proprio `reconciliationId`. Due fatture che finiscono sullo stesso conto restano **due righe distinte** in archivio — servono così per poter disfare una sola riconciliazione — e vengono sommate in lettura. Questo funziona già e non cambia.

**Decisione: la regola dell'attribuzione totale vale per il documento, non per il movimento.**

Un bonifico da 2.000 € che salda una fattura da 1.222 € genera fette per 1.222 €; i restanti 778 € — un acconto, o un importo non ancora abbinato — **restano sul conto di testata**. Il vincolo è sul documento. Estenderlo al movimento renderebbe impossibile registrare un acconto o un pagamento misto: si sarebbe costretti a inventare un conto per il resto, subito, anche senza sapere cos'è.

### Conseguenza obbligata: una sola semantica per il residuo

Con questa decisione un movimento può legittimamente avere una parte non divisa, e oggi i tre moduli che leggono le fette non concordano su cosa farne:

| Modulo | Trattamento del residuo di testata |
|---|---|
| `src/lib/saldi.ts:385-448` | lo lascia sul conto di testata |
| `src/lib/cashflow/movimenti.ts` | lo lascia sul conto di testata |
| `src/lib/report/conto-economico.ts:272-296` | **ignora del tutto la testata**: il residuo sparisce |

Stesso movimento, due report, due numeri. Finché la suddivisione parziale era un caso di bordo la divergenza era rimandabile; ora è la normalità.

**Vince la semantica del cash flow: la testata tiene il resto.** L'allineamento di `conto-economico.ts` fa parte di questo lavoro, con test che confrontano i tre moduli sullo stesso movimento parzialmente diviso.

---

## 4. La nota di credito entra nel calcolo dei pesi

Una nota di credito (TD04) non genera scadenza — `invoice-schedule-service.ts:32` — quindi non produce un movimento proprio: si compensa sul pagamento successivo. Oggi quel pagamento si riconcilia solo con la fattura piena e l'ereditarietà lo spalma sulle righe di quella, ignorando la nota.

Fattura da 1.222 € (alimentari 1.100 + pulizia 122), nota di credito da 122 € per i detersivi resi, pagamento di 1.100 €:

| | Oggi | Atteso |
|---|---|---|
| Alimentari | 990 € | **1.100 €** |
| Pulizia | 110 € | **0 €** |

**Decisione: le righe imputate della nota di credito si sottraggono dai pesi della fattura rettificata.** Nessuna scadenza negativa, nessuna modifica allo scadenzario.

- Il collegamento si risolve **all'import della nota di credito**, leggendo `references.datiFattureCollegate` e cercando la fattura dello stesso fornitore con quel numero e quella data. Il risultato si persiste in un campo nuovo — `ElectronicInvoice.rettificaInvoiceId`, autorelazione facoltativa — invece di essere ricalcolato interrogando il JSON a ogni lettura.
- Al calcolo dei pesi si cercano le note di credito che rettificano la fattura e si sottraggono, riga per riga e al lordo della rispettiva aliquota, gli importi imputati.
- **Se la nota di credito non è imputata per intero, l'ereditarietà si astiene** (log info, come le altre guardie): sottrarne una parte darebbe un risultato peggiore di non sottrarre nulla, perché sembrerebbe corretto.
- **Se un peso risulta negativo** — nota di credito più grande della riga corrispondente — l'ereditarietà si astiene e registra un warning. È un caso che va guardato da un umano, non indovinato.
- Nota di credito arrivata **dopo** il pagamento: nessun meccanismo nuovo. È il caso della sezione 2 — divergenza rilevata, avviso, pulsante *Riallinea*.

### Fuori perimetro, dichiarato

La scadenza della fattura resta di 1.222 € mentre ne paghi 1.100: quei 122 € restano come residuo aperto, a scadere per sempre. **Succede già oggi**, indipendentemente da questo lavoro: è un buco dello scadenzario, non delle fette, e non viene né introdotto né peggiorato qui. Va chiuso separatamente, con il suo ragionamento — probabilmente con una compensazione esplicita che riduce il dovuto.

---

## 5. L'interfaccia

La tabella esiste. Si aggiungono tre cose.

```
 Dettaglio Linee                                      [Accetta tutte]
 ─────────────────────────────────────────────────────────────────────
  #   Descrizione        Q.tà    Prezzo   IVA     Totale   Conto
 ─────────────────────────────────────────────────────────────────────
  1   Farina tipo 0     50 kg    20,00    10%   1.000,00   Alimentari ●
  2   Detersivi          5 pz    20,00    22%     100,00   [÷ dividi]
  └─                                               60,00   Pulizia    ●
  └─                                               40,00   Consumo    ●
  ⚙   Bollo virtuale         —       —      —       2,00   Imposte    ●
 ─────────────────────────────────────────────────────────────────────
  Attribuito   1.224,00 / 1.224,00   ✓ completa
```

**a. Righe di sistema.** Bollo e arrotondamento compaiono nella stessa tabella, distinti da un'icona, non modificabili nell'importo e imputabili come le altre. Il bollo nasce proposto su `30.01 — Imposta di bollo` (famiglia E, sottogruppo E8 della riclassificazione).

**b. Contatore di copertura.** Una riga in chiusura: quanto è attribuito sul totale del documento. Quando manca qualcosa lo dice e indica dove — `Attribuito 1.102,00 / 1.224,00 — manca la riga 2`. È il volto visibile della decisione 5; il controllo corrispondente nel back end è la guardia di riga 161, che va estesa alle righe di sistema.

**c. Divisione di una riga.** Il pulsante `÷` apre la riga in righe figlie, sul posto. La somma delle figlie deve fare l'importo della riga madre, e il vincolo si vede mentre si compila. Restare dentro la tabella conta: si decide guardando le altre righe della fattura, non una finestra che le copre.

**d. Il filtro dei tipi di conto.** `LineItemsTable` passa `types={['COSTO']}` alla tendina (`InvoiceDetailSections.tsx:427`). Col piano v4 questo esclude i conti patrimoniali: un frigorifero in fattura è un cespite, non un costo, e oggi non è imputabile. Il filtro diventa `['COSTO', 'PATRIMONIALE']` — i due tipi che una riga di fattura d'acquisto può ricevere. `RICAVO`, `ATTIVO` e `PASSIVO` restano esclusi.

---

## Vincoli e fatti utili all'implementazione

- **Nessuna migrazione dati.** `journal_entries` è vuota in produzione: le fette sono necessariamente zero, e `JournalEntryAllocation.iva` nasce senza storico da riempire.
- **`@@unique([invoiceId, numeroLinea])` su `InvoiceLineAccount` vieta oggi due imputazioni per la stessa riga**, cioè vieta la decisione 3. Va aggiunto un progressivo e spostato il vincolo su `[invoiceId, numeroLinea, progressivo]`.
- **Le righe di sistema hanno bisogno di un numero di linea che non collida** con quelli dell'XML. Numeri negativi riservati — `-1` bollo, `-2` arrotondamento — tengono il vincolo di unicità e restano riconoscibili a colpo d'occhio in una query.
- **`DATABASE_URL` punta alla produzione**: nessun comando Prisma che scrive. Le migrazioni si preparano e si applicano con la procedura già usata per il piano v4.
- **Il prospetto di cash flow è in produzione** e legge le fette: `src/lib/cashflow/movimenti.ts` è il consumatore da aggiornare per primo, e il suo commento va riscritto — descrive un limite che questo lavoro rimuove.
- **`strict: true` è attivo** da `b38b0d0`: un campo nullable nuovo viene segnalato in ogni punto che lo usa senza controllarlo. È un aiuto.
- `SupplierProductAccount` — la memoria «il pane di questo fornitore va su questo conto» — alimenta le proposte dell'AI. Con la decisione 3 va deciso se una riga divisa alimenta la memoria: la proposta è **no**, perché una divisione è specifica di quella fattura e insegnarla produrrebbe proposte sbagliate sulle successive.

## Come si verifica

- **Unità** sul calcolo dei pesi: aliquote miste, aliquota mancante su una riga, nota di credito che azzera una riga, nota di credito che eccede, riga divisa in due.
- **Unità** sui consumatori: stesso movimento parzialmente diviso letto da `saldi.ts`, `cashflow/movimenti.ts` e `report/conto-economico.ts` deve dare lo stesso residuo di testata.
- **Integrazione** sulla riconciliazione: fattura ad aliquote miste pagata per intero, pagata a metà, pagata con nota di credito compensata.
- **Per inversione**: rompere il calcolo dell'IVA per fetta e verificare che il test dell'aliquota mista fallisca. Il rischio concreto è un test che passa perché confronta la stessa sorgente con sé stessa — è già successo su questo prospetto.

---

## Passo successivo

Piano di implementazione con la skill `superpowers:writing-plans`, da questo documento.
