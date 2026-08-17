# Trezy — Flusso di cassa, previsioni e scenari

Il flusso di cassa è la rotta di atterraggio dell'applicazione (`/cashflow`) e ne costituisce
l'impianto: una tabella pivot *categorie × periodi* che mostra a sinistra il passato ricostruito dai
movimenti bancari e a destra il futuro, separati da un confine verticale «Effettivo | Previsione»,
con in testa il saldo consolidato dei conti. Il lavoro che si propone di risolvere è «so quanti soldi
ho, ma non so quanti ne avrò»: la proiezione nasce da previsioni che l'utente inserisce a mano nelle
celle e si consuma man mano che le transazioni reali vengono collegate alle previsioni stesse.

Osservazione svolta l'11 agosto 2026 su ambiente di produzione, account reale, piano Premium in
prova. Salvo diversa indicazione, i fatti sono `[OSSERVATO]` in interfaccia o nelle risposte API.

---

## 1. Che cosa fa e per chi

`[DA DOCUMENTAZIONE]` La pagina prodotto dichiara quattro promesse per quest'area: posizione di cassa
in tempo reale con consolidamento multibanca, previsione IA a 12 mesi, «scenari illimitati» con
confronto affiancato, avvisi di tensione «con settimane di anticipo». Il gating dichiarato è netto:
la *visualizzazione* della proiezione è gratuita, la **modifica manuale delle previsioni** e la
**pianificazione scenari** partono dal piano Starter.

`[OSSERVATO]` Ciò che si vede in applicazione è più sobrio e più artigianale della promessa: una
griglia in cui la previsione è un valore che qualcuno deve scrivere, cella per cella. `[DEDOTTO]`
Il job-to-be-done coperto davvero è **la costruzione e il mantenimento di un budget di cassa
scorrevole**, non la previsione automatica: il motore non estrapola nulla da solo finché l'utente non
alimenta la griglia (si veda § 5 sul perché, su questo account, la proiezione è una retta).

---

## 2. Struttura della vista

### 2.1 Le righe

La griglia è organizzata in blocchi, nell'ordine:

| Blocco | Contenuto osservato |
|---|---|
| `Contanti all'inizio` | riga singola, saldo di apertura del periodo |
| `Entrata di cassa` | riga di totale + **6** righe di categoria di entrata + riga `Documenti` |
| `Uscita di cassa` | riga di totale + **31** righe di categoria di uscita + riga `Documenti` |
| `Contanti alla fine` | riga singola, saldo di chiusura del periodo |
| Blocco IVA | `IVA a debito` · `IVA a credito` · `Saldo IVA` |

Il numero di righe corrisponde esattamente alle categorie restituite da `GET /categories?used=true`
(6 `inflow`, 31 `outflow`): la griglia mostra **solo le categorie effettivamente usate**, non l'intero
piano di categorie.

Notevole: la riga **`Documenti` è distinta dalle categorie** e chiude ciascun blocco. Non è una
categoria: è il canale con cui fatture e documenti entrano nella vista, tenuti separati dai movimenti
bancari categorizzati. È la traduzione visiva di una scelta di modello — le fatture non sono
previsioni, sono un terzo genere di oggetto (§ 4.6).

Il blocco IVA è **fuori** dai blocchi entrata/uscita e **sotto** `Contanti alla fine`: non concorre
al saldo, è un promemoria fiscale a parte.

### 2.2 Il confine «Effettivo | Previsione»

Il confine non cade *fra* due colonne ma **dentro la colonna del periodo corrente**, che è spezzata
in due sotto-colonne: a sinistra `Effettivo` (ciò che è già transitato in banca), a destra
`Previsione` (ciò che ci si aspetta ancora nel resto del periodo). Sopra la griglia una linea nera
sottolinea la parte «Effettivo» dell'asse; la colonna corrente è evidenziata in grigio
(screenshot `30-cashflow-mensile.png`, `34-cashflow-settimanale.png`).

Su questo account la sotto-colonna `Previsione` del periodo corrente è vuota (`-`) su tutte le
categorie e ripete il valore di `Contanti alla fine` della sotto-colonna `Effettivo`: coerente con
l'assenza di previsioni residue.

### 2.3 Risoluzione e orizzonte

Quattro pulsanti in testata: `Giornaliero` · `Settimanale` · `Mensile` · `Trimestrale`.

**La griglia rende sempre esattamente 21 colonne**, qualunque sia la risoluzione, e il corpo della
richiesta `POST /cashflow/batch` contiene sempre 21 periodi. La ripartizione osservata è costante:
**10 periodi passati + il periodo corrente + 10 periodi futuri**.

| Risoluzione | Primo periodo | Ultimo periodo | Ampiezza totale | Futuro coperto |
|---|---|---|---|---|
| Giornaliero | — | — | — | vedi nota |
| Settimanale | settimana dell'1 giu 2026 | settimana del 19 ott 2026 | ~21 settimane | ~10 settimane |
| Mensile | ott 2025 | giu 2027 | 21 mesi | 10 mesi |
| Trimestrale | Q1 2024 | Q1 2029 | 21 trimestri | 10 trimestri (2 anni e mezzo) |

Gli intervalli sono presi dai corpi di richiesta reali (`periods[]` di `cashflow/batch`), non dedotti
dalle etichette.

**Nota sul giornaliero**: alla pressione di `Giornaliero` la griglia è rimasta mensile e **non è
stata emessa alcuna chiamata API**; il pulsante `Mensile` è rimasto quello selezionato
(screenshot `34-cashflow-giornaliero.png`, in cui l'asse mostra `apr. mag. giu. lug. ago. set. ott.`).
Il click era andato a buon fine lato browser — nella stessa sessione, con la stessa meccanica,
`Settimanale` e `Trimestrale` hanno funzionato ed emesso ciascuno la propria richiesta. Il fatto è
`[OSSERVATO]`; la causa resta `[IPOTESI]` (pulsante inerte, oppure errore lato client silenzioso).

`[DA DOCUMENTAZIONE]` Le fonti pubbliche affermano che «la risoluzione determina l'orizzonte:
giornaliera → il mese successivo; settimanale → l'anno successivo; mensile e trimestrale → i prossimi
3 anni». `[OSSERVATO]` La finestra effettivamente calcolata e resa è molto più corta: 10 periodi
futuri in tutte e tre le risoluzioni verificate (≈ 2 mesi e mezzo in settimanale, 10 mesi in mensile,
2 anni e mezzo in trimestrale). `[IPOTESI]` La dichiarazione riguarda probabilmente la finestra in
cui è possibile *inserire* previsioni, non quella che la griglia mostra; non è stato verificato se lo
scorrimento orizzontale oltre il bordo carichi altri periodi (`[NON VERIFICABILE]`, non provato).

### 2.4 Testata: saldo e variazione

`Saldo totale di 3 account` · `Saldo attuale 31 140.40 €` · una variazione percentuale con la dicitura
`vs mese scorso`. Il saldo coincide con la somma dei tre conti restituiti da `bank-accounts`
(9 278,43 + 14 080,66 + 7 781,31 = 31 140,40; verifica già svolta e superata).

La percentuale, invece, **cambia con la risoluzione mentre la dicitura resta «vs mese scorso»**:

| Risoluzione | Variazione mostrata | Base di confronto ricostruita | Verifica |
|---|---|---|---|
| Mensile | −8,7 % | apertura del mese corrente 34 119,36 € | 31 140,40 / 34 119,36 − 1 = −8,73 % ✔ |
| Settimanale | +23,5 % | apertura della settimana corrente 25 219 € | 31 140,40 / 25 219 − 1 = +23,48 % ✔ |
| Trimestrale | +20,6 % | apertura del trimestre corrente 25 822,13 € | 31 140,40 / 25 822,13 − 1 = +20,59 % ✔ |

`[DEDOTTO]` La formula reale è «saldo attuale / saldo di apertura del **periodo corrente** − 1», cioè
la variazione da inizio periodo; l'etichetta è corretta solo in risoluzione mensile. In settimanale e
trimestrale l'utente legge un numero giusto con una didascalia sbagliata.

---

## 3. Modello dati inferito

### 3.1 Scenario

`GET /api/v2/scenarios` restituisce un solo oggetto:

```json
{ "id": "…", "accountId": "…", "name": "default", "color": "#8B5CF6",
  "systemType": null, "aiMetadata": null, "createdAt": "2026-08-05T11:15:23.285Z" }
```

`[DEDOTTO]` Lo scenario è l'entità radice del previsionale: previsioni e riconciliazioni sono
scoped per scenario (`scenarioId` compare come parametro obbligatorio in `cashflow/batch`,
`forecast-breakdown`, `forecasts/reconciliation`, `forecasts/scenario/{id}/period` e persino nel
`summary` di categoria del drill-down). Il campo `color` serve al confronto affiancato; `systemType`
e `aiMetadata` sono nulli e suggeriscono l'esistenza di scenari di sistema e di scenari generati
dall'IA (`[IPOTESI]`, nessuno osservato).

### 3.2 Previsione

`[NON POPOLATO]` Nessuna previsione esiste su questo account: `GET /forecasts/scenario/{id}/period`
risponde `[]`, così come `GET /forecasts/reconciliation` e `GET /fec/pl-forecasts/scenario/{id}`.
La struttura di una previsione non è quindi osservabile direttamente in questa fase.

`[DA DOCUMENTAZIONE]` Dalle FAQ interne e dalle stringhe dell'app: una previsione è un valore su una
cella *categoria × periodo*, generabile con metodi «Stabile / Crescita / Duplica A-1 / Costante /
Media personalizzata / Ricorrente / Formula»; la ricorrenza ha frequenza, giorno del mese, giorni
della settimana, numero di occorrenze o data di fine, crescita annuale. `[DEDOTTO]` Il modello
minimo è quindi: `previsione(scenarioId, categoryId, periodo, importo, ricorrenza?, formula?, statoPagamento)`.

Un indizio strutturale conferma la parte «Formula»: le categorie portano un campo
`forecast_formula` (nullo su tutte quelle osservate), cioè **la regola di previsione è persistita
sulla categoria**, non solo sulla singola cella.

### 3.3 Categoria

`GET /categories?used=true` → due liste `inflow` / `outflow`, elementi così fatti:

```json
{ "id": "…", "category_name": "Postal and telecommunications costs",
  "category_code": "ADM-0100", "category_type": "outflow",
  "parentCategoryId": null, "display_order": null,
  "forecast_formula": null, "vat_injection": false, "vat_injection_frequency": null,
  "enrichment": { "accounting_code": "ADM-0100", "vat_rate": "0.2000", "payment_delay_days": 0 },
  "children": {} }
```

Tre elementi meritano attenzione:

- **`enrichment.vat_rate`** — l'aliquota vive sulla categoria e alimenta il blocco IVA (§ 4.5). Il
  valore di default osservato è `0.2000`, cioè 20 %, mentre l'ordinaria italiana è 22 %.
- **`enrichment.payment_delay_days`** — i termini di pagamento, in giorni, per categoria (0 su questa,
  30 su altre). `[DA DOCUMENTAZIONE]` Sono usati **solo** in contabilità/prestazioni, **non** nel
  cashflow: è la separazione cassa/competenza, ed è la ragione per cui il flusso di cassa resta un
  puro modello per cassa.
- **`vat_injection` / `vat_injection_frequency`** — `[IPOTESI]` innestano il versamento IVA come
  movimento di cassa previsto a cadenza data; entrambi nulli/falsi qui, comportamento
  `[NON VERIFICABILE]`.

La gerarchia è a **tre livelli**: il drill-down restituisce `breakdown: {parent, children,
grandchildren}` e ogni transazione porta `category_*`, `parent_category_*`, `grandparent_category_*`.

**Difetto di risoluzione dei nomi.** Una categoria di entrata con codice `BNK-000` è restituita da
`forecast-breakdown` come `"categoryName": "Category not found"` pur avendo un importo non nullo
(504,90 €). L'interfaccia, che traduce per codice, la rende correttamente come «Altro» — e infatti la
riga «Altro» di agosto mostra 505. `[DEDOTTO]` Il guasto è nella risoluzione del nome lato API, non
nel front-end: qualunque consumatore che si fidi di `categoryName` (assistente IA, esportazioni,
integrazioni) vedrà «Category not found» al posto di una categoria vera.

Nota di localizzazione correlata: le API restituiscono i nomi in inglese (`Revenue`, `Salaries and
wages`) e l'interfaccia li rende in italiano (`Ricavi`, `Stipendi e salari`) mappando per
`category_code`; le categorie personalizzate, prive di codice, restano invece letterali
(`Versamento contanti`, `Commissioni RID`, `Royal`).

### 3.4 Collegamento previsione ↔ transazione

`[DA DOCUMENTAZIONE]` Il collegamento è **manuale** e vale per *stessa categoria e stesso periodo*;
l'importo pagato riduce il residuo, a copertura totale la previsione diventa «pagata» (grigia e
barrata); **la riconciliazione è per scenario**, quindi la stessa transazione può essere legata a
previsioni diverse in scenari diversi. `[NON POPOLATO]` Non osservabile: la coda di riconciliazione
è vuota.

`[DEDOTTO]` Il collegamento è la chiave di volta di tutto il modello: senza di esso il residuo non
scende e la proiezione doppia il reale. È anche il punto in cui il prodotto scarica sull'utente il
lavoro che altri automatizzano.

---

## 4. Logiche di calcolo

### 4.1 La catena dei saldi — verificata

`Contanti alla fine(t) = Contanti all'inizio(t) + Entrata di cassa(t) − Uscita di cassa(t)`, e
`Contanti all'inizio(t+1) = Contanti alla fine(t)`. Ricostruzione a ritroso dal saldo attuale, in
risoluzione mensile:

| Mese | Apertura | Entrate | Uscite | Chiusura |
|---|---|---|---|---|
| mag 2026 | 50 754,60 | 66 208,08 | 49 402,78 | 67 559,90 |
| giu 2026 | 67 559,90 | 137 308,89 | 179 046,66 | 25 822,13 |
| lug 2026 | 25 822,13 | 116 096,93 | 107 799,80 | 34 119,26 |
| ago 2026 (a oggi) | 34 119,26 | 38 905,82 | 41 884,68 | **31 140,40** |

La chiusura di agosto coincide **al centesimo** con il `Saldo attuale` di testata. ✔ verifica
superata. L'apertura ricostruita (50 754,60 €) è coerente con il 50 755 mostrato in griglia.

**Coerenza fra risoluzioni** ✔: le entrate del Q2 2026 (203 517) sono la somma dei mesi apr+mag+giu
(0 + 66 208 + 137 309 = 203 517); le uscite Q2 (228 449) sono mag+giu (49 403 + 179 047 = 228 450, a
meno degli arrotondamenti di visualizzazione). L'aggregazione è quindi consistente.

### 4.2 Saldo futuro

`[DA DOCUMENTAZIONE]` `saldo finale = saldo bancario attuale + Σ previsioni di entrata residue −
Σ previsioni di uscita residue`, dove «residuo» è al netto delle transazioni già collegate, e il
risultato è invariante rispetto alla risoluzione.

`[OSSERVATO]` Il payload lo conferma nella sua forma degenere: per tutti i 10 periodi futuri
`totalForecastInflow = 0`, `totalForecastOutflow = 0`, `netInflowWithForecast = 0`,
`netOutflowWithForecast = 0`, e `Contanti alla fine` resta 31 140 € su tutta la proiezione, in
mensile come in settimanale come in trimestrale. ✔ coerente con la formula.

### 4.3 Tre fonti di previsione e un arbitro

`GET /forecast-breakdown` restituisce, per ogni categoria, questa struttura:

```json
{ "categoryName": "Revenue", "displayOrder": null,
  "totalAmount": 34356.95,
  "forecast": 0, "invoiceForecast": 0,
  "futureInvoiceForecast": 0, "lateInvoiceForecast": 0,
  "picked": 0, "pickedSource": "none",
  "calculation": "future remaining (aggregated) = 0" }
```

Il motore tiene **tre stime concorrenti** della stessa cella e poi ne sceglie una:

| Campo | Fonte | Lettura |
|---|---|---|
| `forecast` | previsione inserita a mano dall'utente | il budget dichiarato |
| `futureInvoiceForecast` | fatture con scadenza futura | l'atteso contrattuale |
| `lateInvoiceForecast` | fatture già scadute e non incassate/pagate | l'atteso in ritardo |
| `invoiceForecast` | `[IPOTESI]` aggregato delle due precedenti | |
| `picked` / `pickedSource` | l'importo effettivamente usato e da dove viene | l'arbitro |

`[DEDOTTO]` Questa è la scelta di modello più interessante dell'area. Tenere separate le tre fonti
invece di sommarle è corretto — sommare budget e fatture aperte è il modo classico di contare due
volte lo stesso incasso — ma **scegliere** significa scartare: se `pickedSource` privilegia la
previsione manuale, le fatture reali di quella categoria spariscono dal saldo previsto; se
privilegia le fatture, il budget dell'utente viene ignorato. In nessun punto dell'interfaccia
osservata l'utente vede *quale* fonte ha vinto e perché: `pickedSource` esiste nel payload e non
affiora nella griglia.

`[NON POPOLATO]` Su questo account l'unico valore osservato è `pickedSource: "none"` su **tutte** le
138 occorrenze rilevate (23 categorie × 6 catture). Il ventaglio dei valori possibili e la regola di
arbitraggio restano `[NON VERIFICABILE]`.

### 4.4 Il campo `calculation`: il motore che si spiega da solo

Ogni cella porta una stringa in linguaggio quasi naturale che descrive il calcolo applicato. L'unica
variante osservabile qui è `"future remaining (aggregated) = 0"`, ma la presenza stessa del campo
dice tre cose.

È **auto-documentazione del motore**: la formula viaggia insieme al risultato, il che rende un
previsionale — l'oggetto software più opaco che un imprenditore si trovi davanti — potenzialmente
ispezionabile. È la premessa tecnica per un «perché questo numero?» accanto a ogni cella, ed è una
scelta che vale la pena imitare.

È anche **esposizione di logica interna**: la stringa è in inglese, contiene il vocabolario del
motore (`future remaining`, `aggregated`) e viene servita al browser di ogni utente. `[DEDOTTO]`
Chiunque apra gli strumenti di sviluppo legge come Trezy calcola. Non è un problema di sicurezza, è
una scelta di trasparenza involontaria: il campo sembra pensato per il debug e non per l'utente, ma
finisce nella stessa risposta.

Il terzo punto è che `"aggregated"` è la spia della modalità di previsione (§ 9): il residuo qui è
calcolato **in forma aggregata**, coerente con `forecastMode: "default"`.

### 4.5 IVA — formula verificata

Il blocco IVA è alimentato da `vatDetails[]`, una voce per categoria con `vatRate`, `totalAmount`,
`vatAmount`, `flowType`. Tre invarianti verificate sui quattro periodi popolati (maggio–agosto 2026):

1. **Scorporo dal lordo**: `vatAmount = totalAmount × vatRate / (1 + vatRate)`. Conforme su tutte e
   20 le voci di maggio (es. 47 045,08 × 0,2/1,2 = 7 840,85 ✔) e sugli altri periodi.
2. `IVA a debito` = Σ IVA sulle **entrate**; `IVA a credito` = Σ IVA sulle **uscite**.
3. `Saldo IVA = IVA a credito − IVA a debito` (negativo = da versare).

| Mese | IVA a debito | IVA a credito | Saldo IVA | Ricalcolo |
|---|---|---|---|---|
| mag 2026 | 7 868,01 | 2 512,68 | −5 355,34 | ✔ |
| giu 2026 | 15 955,61 | 19 467,04 | +3 511,42 | ✔ |
| lug 2026 | 14 787,05 | 10 205,02 | −4 582,04 | ✔ |
| ago 2026 | 5 043,30 | 2 316,96 | −2 726,34 | ✔ |

Le uniche aliquote presenti sono 0 % e 20 %.

`[DEDOTTO]` Due limiti sostanziali per un'azienda italiana. Primo, **l'IVA è calcolata per cassa**,
sul movimento bancario del periodo, mentre la liquidazione italiana segue le date dei documenti: il
«Saldo IVA» è quindi un'approssimazione, non un importo da portare in F24. Secondo, l'aliquota è
attribuita **per categoria**, non per riga di documento: una categoria che raccoglie acquisti al 4 %,
10 % e 22 % produrrà un'IVA sbagliata per costruzione, e il default 20 % non corrisponde ad alcuna
aliquota italiana.

Sui periodi futuri il blocco IVA è a zero: nessuna IVA previsionale viene generata dalle fatture
attese (§ 4.6).

### 4.6 Le fatture: presenti nella riga, assenti dal saldo

È il ritrovamento più rilevante dell'area, e regge su tre osservazioni indipendenti.

**Primo**, la richiesta della griglia porta `includeInvoices: false`. Il corpo di `cashflow/batch` è
identico in tutte le sei sessioni catturate:

```json
{ "periods": [ …21 elementi… ], "selectedBankAccountIds": [ …3 conti… ],
  "currency": "EUR", "scenarioId": "…",
  "includeInvoices": false, "documentForecastMode": true,
  "useNativeResolutionRemaining": true }
```

**Secondo**, la riga `Documenti` è invece popolata sul futuro, e i suoi valori coincidono con le
fatture attese aggregate per mese:

| Mese | `totalDocumentComingOutflow` (API) | Riga «Documenti» in griglia | Fatture attese nel mese |
|---|---|---|---|
| ago 2026 | 3 597,98 | 3 598 | 10 |
| set 2026 | 4 770,20 | 4 770 | 4 |
| ott 2026 | 336,72 | 337 | 1 |

**Terzo**, negli stessi periodi `totalOutflow`, `totalForecastOutflow` e `netOutflowWithForecast`
valgono **0**, e `Contanti alla fine` non si muove di un centesimo.

`[OSSERVATO]` Settembre 2026 mostra dunque 4 770,20 € di fatture da pagare nella riga «Documenti» e,
due righe più sotto, un saldo di cassa previsto invariato a 31 140 €. `[DEDOTTO]` L'utente vede
l'informazione e il grafico non la usa: le fatture entrano nella vista come *promemoria*, non come
flussi. È la conferma operativa di ciò che le fonti pubbliche lasciavano intuire — le fatture sono
oggetti da riconciliare e da tracciare, non il motore del previsionale.

**Tre numeri diversi per la stessa domanda.** «Quanto devo pagare nei prossimi mesi?» riceve tre
risposte da tre endpoint:

| Fonte | Finestra | Totale | Fatture |
|---|---|---|---|
| Riga «Documenti» in griglia (in arrivo) | ago + set + ott 2026 | 8 704,90 € | 15 |
| `forecast-breakdown` → `documentOutflowTotal` | 1 ago – 31 ott 2026 (nominale) | 11 515,43 € | 19 |
| `invoices/future-cumulative` | 11 ago – 9 nov 2026 | 7 986,84 € | 14 |

La differenza fra le prime due è esattamente **2 810,53 €**: quattro fatture datate 31 luglio, cioè
**fuori dalla finestra richiesta**, che `forecast-breakdown` restituisce comunque — e con
`isLate: false`, benché la data di pagamento attesa sia già passata. Non compaiono in nessuna colonna
della griglia. La terza fonte è un servizio distinto (gateway `p8080`, `GET /api/invoices/future-cumulative`)
che produce una serie giornaliera cumulata a 90 giorni con un proprio filtro. `[DEDOTTO]` Non esiste
un unico numero riconciliato delle uscite attese, e nulla nell'interfaccia segnala la divergenza.

Infine, tutte le 19 voci fattura hanno `categoryId: null`: nessuna è imputata a una categoria, il che
spiega perché confluiscano nella riga «Documenti» anziché nelle righe di categoria, e perché il
payload preveda i campi `uncategorizedInvoiceForecastInflow/Outflow`.

---

## 5. Perché su questo account la proiezione è piatta

La retta a 31 140 € che si estende su tutto il futuro **non è un limite del prodotto**: è
`[NON POPOLATO]`. Le cause sono tre, tutte verificate:

1. **Nessuna previsione manuale inserita**: `GET /forecasts/scenario/{id}/period` → `[]`. Senza
   previsioni residue la formula del saldo futuro restituisce, correttamente, una costante.
2. **Le fatture attese non entrano nel calcolo** per scelta della chiamata (`includeInvoices: false`,
   § 4.6): esistono 14–19 fatture per 8–11,5 mila euro nei tre mesi successivi, e non spostano il
   saldo.
3. **Nessuna coda di lavoro arretrata**: `transactions/verification-stats` riporta 749 transazioni su
   749 verificate e `forecasts/reconciliation` è vuoto, quindi non c'è nemmeno il residuo di
   previsioni parzialmente pagate.

Il primo punto è una condizione dell'account; il secondo è una proprietà del prodotto e va contata
fra i limiti.

---

## 6. Scenari

`[OSSERVATO]` Il selettore in alto a sinistra apre un menù con due sole voci: lo scenario corrente
(`Scenario Principale`, spuntato) e `Crea nuovo scenario` (screenshot `35-scenari.png`). Non sono
osservabili nell'interfaccia: rinomina, duplicazione, eliminazione, confronto affiancato, né il
colore associato — `[NON VERIFICABILE]`, non si è creato un secondo scenario.

L'API espone un unico scenario di nome `default`, che l'interfaccia rende come «Scenario Principale»:
il nome mostrato è quindi una traduzione dell'etichetta di sistema, non un dato dell'utente.
`[DEDOTTO]` Esiste **uno scenario predefinito creato con l'account** (stesso giorno dell'iscrizione,
5 agosto 2026), non uno scenario vuoto da configurare.

`[DA DOCUMENTAZIONE]` Il sito promette «scenari illimitati» con confronto affiancato e modellazione
di assunzioni, investimenti, caso peggiore; la pianificazione scenari è dichiarata dal piano Starter
in su. `[DEDOTTO]` Poiché la riconciliazione è per scenario, uno scenario non è una vista alternativa
sugli stessi dati ma **una copia del piano di lavoro**: cambiando scenario cambiano previsioni,
collegamenti e stati di pagamento. È potente e, insieme, un moltiplicatore di lavoro manuale.

---

## 7. La casella di posta delle previsioni

All'ingresso in `/cashflow` si apre **da sola** una finestra modale intitolata
«2 elemento/i richiedono la tua attenzione» (screenshot `30-cashflow-mensile.png`,
`33-cashflow-casella-previsioni.png`), con un testo esplicativo che vale come dichiarazione del
modello di calcolo:

> «Collega le transazioni alle tue previsioni per tenere traccia di ciò che è stato pagato e di ciò
> che è ancora atteso. **Solo l'importo residuo di ogni previsione viene utilizzato per calcolare la
> liquidità prevista a fine periodo.** Le previsioni passate non vengono più mostrate qui. Se una
> previsione è completamente pagata, contrassegnala semplicemente come pagata — non è necessario
> collegare transazioni.»

`[DA DOCUMENTAZIONE]` Le code sono tre, in ordine imposto: **verifica transazioni → riconciliazione
previsioni → monitoraggio fatture**. `[OSSERVATO]` Su questo account solo la terza ha contenuto, e
infatti la modale mostra due sole schede — `Tutto (2)` e `Documenti (2)` — con due documenti di
uscita datati 4 e 5 agosto, più un pulsante `Ignora`. Le prime due code non compaiono affatto quando
sono vuote, coerentemente con `verification-stats` (749/749 verificate) e `forecasts/reconciliation`
(vuoto).

`[DEDOTTO]` È una scelta di prodotto netta: al posto degli avvisi «di tensione» promessi dal sito,
Trezy mette una **coda di lavoro** che apre da sola e chiede all'utente di fare la manutenzione del
modello. Il costo di questa scelta si è manifestato in modo misurabile durante l'osservazione: la
modale **intercetta gli eventi del puntatore** e ha bloccato *tutti* i controlli della pagina —
i quattro pulsanti di risoluzione e il selettore di scenario — finché non è stata chiusa
(log di sessione: `<div …> intercepts pointer events`, su cinque tentativi di click consecutivi).
Un utente che voglia solo guardare il grafico deve prima sbrigare, o rifiutare, la coda.

---

## 8. Drill-down su cella

Il click su una cella di categoria apre un pannello laterale destro (screenshot
`36-cashflow-drilldown-cella.png`) con, dall'alto:

- l'etichetta del blocco (`USCITA DI CASSA`) e il nome della categoria;
- un navigatore di periodo `‹ apr 2026 ›`, cioè i pulsanti **`Periodo precedente` / `Periodo successivo`**;
- un mini-grafico con legenda `Effettivo` / `Previsionato`;
- il riquadro `EFFETTIVO −17 583€ · 19 Transazioni`, con un'icona di esportazione;
- la sezione `Previsioni 0` con il pulsante **`Aggiungi previsione`** e il messaggio «Nessuna
  previsione in questo periodo»;
- la sezione `Transactions & Documents 19`, elenco raggruppato per data, con nota di chiusura
  «Tutte le transazioni caricate (19 totali)»;
- il pulsante **`Chiudi`**.

Il pannello è quindi al tempo stesso ispezione (da dove viene il numero) e punto di **inserimento**
della previsione: è qui che si costruisce il budget, cella per cella.

Il click emette esattamente cinque chiamate, tutte sul trimestre della cella
(`startDate=2026-04-01&endDate=2026-07-01`):

| Chiamata | Risposta osservata |
|---|---|
| `GET /categories?used=false` | elenco categorie per il selettore |
| `GET /categories/category-with-children/{id}?…&offset=0&limit=25&includeChildren=true&includeGrandchildren=true` | `{transactions[19], totalCount: 19, breakdown:{parent,children,grandchildren}}` |
| `GET /forecasts/scenario/{scenarioId}/period?…&categoryId={id}` | `[]` |
| `GET /categories/category/{id}/summary?…&includeInvoices=false&scenarioId=…` | `{totalActual: −17583.30, totalRemaining: 0}` |
| `GET /categorization-rules` | regole di classificazione |

Due osservazioni. Il `summary` porta anch'esso `includeInvoices=false`, coerente con la griglia: il
drill-down non mostra le fatture attese nemmeno qui. E l'intestazione del pannello **etichetta il
periodo con il suo mese iniziale**: la cella era il trimestre Q2 2026, il pannello scrive «apr 2026»
e sotto elenca transazioni di maggio e giugno.

---

## 9. Configurabilità

**Impostazioni › Funzionalità › Modalità di previsione** offre due opzioni, con testo dell'app:

> **Dettagliato** — «Calcola il rimanente per sottocategoria in modo indipendente: (previsione −
> reale) per ciascuna. Ideale quando previsioni e transazioni sono allo stesso livello. Consigliato
> per la maggior parte degli utenti.»
>
> **Globale** — «Calcola il rimanente a livello di categoria principale: (previsione totale − reale
> totale). Ideale quando le previsioni sono sulle categorie principali ma le transazioni sono
> distribuite nelle sottocategorie.»

`GET /account-forecast-config` restituisce però `forecastMode: "default"`, valore che non compare in
interfaccia; lo stesso `default` si ritrova in ogni cella di `cashflow/batch` e di
`forecast-breakdown`. `[DEDOTTO]` `"default"` corrisponde a «Dettagliato», ma il vocabolario dell'API
e quello dell'interfaccia non coincidono, e il campo `calculation` parla di `aggregated` — un terzo
termine ancora.

`[DEDOTTO]` La distinzione è reale e tutt'altro che cosmetica: decide se un budget messo sulla
categoria madre viene consumato dalle transazioni che cadono sulle figlie. Il fatto che sia
un'impostazione **di account**, globale, e non una proprietà della singola categoria, è un limite:
in una stessa azienda convivono di norma categorie budgettate in aggregato (personale) e categorie
budgettate in dettaglio (utenze).

Altri elementi di configurazione che toccano quest'area: la selezione dei conti bancari inclusi
(`Saldo totale di 3 account`, con `selectedBankAccountIds` propagato a ogni chiamata), la valuta
(`currency=EUR`), il piano dei conti e il settore. In testata sono presenti anche un controllo di
**esportazione** e un ingranaggio di impostazioni della vista, entrambi `[NON VERIFICABILE]` (non
aperti).

---

## 10. API osservate

Origini: `p3001-….prm.sh/api/v2` per il dominio applicativo, `p8080-….prm.sh/api` per il servizio
fatture.

| Endpoint | Metodo | Parametri chiave | Risposta |
|---|---|---|---|
| `/cashflow/batch` | POST | `periods[21]`, `selectedBankAccountIds[]`, `currency`, `scenarioId`, `includeInvoices`, `documentForecastMode`, `useNativeResolutionRemaining` | `{success, count: 21, data[21]}`, un oggetto per periodo |
| `/forecast-breakdown` | GET | `startDate`, `endDate`, `currency`, `includeInvoices=true`, `scenarioId`, `documentForecastMode=true`, `useNativeResolutionRemaining=true` | `{forecastMode, isCurrentPeriod, isFuturePeriod, period, totali, inflow{}, outflow{}, invoiceEntries[]}` |
| `/forecasts/scenario/{scenarioId}/period` | GET | `startDate`, `endDate`, `categoryId?` | `[]` (nessuna previsione) |
| `/forecasts/reconciliation` | GET | `scenarioId`, `selectedBankAccountIds` | `[]` |
| `/scenarios` | GET | — | `[{id, accountId, name, color, systemType, aiMetadata, createdAt, updatedAt}]` |
| `/account-forecast-config` | GET | — | `{id, accountId, forecastMode: "default", …}` |
| `/transactions/verification-stats` | GET | `selectedBankAccountIds` | `{total: 749, verified: 749, unverified: 0, hasTransactionsToVerify: false}` |
| `/categories?used=true` | GET | — | `{inflow[6], outflow[31]}` |
| `/bank-accounts?currency=EUR&grouped=true` | GET | — | `{connections[]}`, conti con `balance`, `source: "enablebanking"` |
| `/categories/category-with-children/{id}` | GET | `startDate`, `endDate`, `offset`, `limit=25`, `includeChildren`, `includeGrandchildren` | `{transactions[], totalCount, breakdown}` |
| `/categories/category/{id}/summary` | GET | `startDate`, `endDate`, `scenarioId`, `includeInvoices=false` | `{totalActual, totalRemaining}` |
| `/api/invoices/future-cumulative` (p8080) | GET | `include_paid=false`, `targetCurrency` | `{currency, start_date, end_date, data_points[91], summary}` |

Struttura di una cella in `cashflow/batch` → `data[i].inflow|outflow[categoryId]`:
`{id, categoryName, categoryCode, totalAmount, forecast, invoiceForecast, parentCategoryId,
displayOrder, _futureRemaining, _futureAdjusted}` — i due campi con prefisso underscore sono
evidentemente interni e vengono serviti al client così come sono.

Ogni oggetto periodo porta inoltre: `totalInflow`, `totalOutflow`, `totalForecastInflow`,
`totalForecastOutflow`, `netInflowWithForecast`, `netOutflowWithForecast`, `vatToPay`,
`vatToReceive`, `vatBalance`, `vatDetails[]`, `totalDocumentPaidInflow/Outflow`,
`totalDocumentComingInflow/Outflow`, `uncategorizedInvoiceForecastInflow/Outflow`, `forecastMode`,
`currency`, `period`.

**Nota su una doppia chiamata.** In una delle sei sessioni, al caricamento della pagina sono state
emesse **due** `POST /cashflow/batch` a un millisecondo di distanza, identiche salvo
`documentForecastMode` (prima `false`, poi `true`): la griglia viene calcolata due volte, la seconda
con l'impostazione dell'account. Nelle altre sessioni la chiamata è una sola. `[IPOTESI]` corsa fra
il rendering iniziale e la risoluzione di `account-settings`.

---

## 11. Debolezze e limiti osservati

1. **Le fatture attese non entrano nel saldo previsto.** `includeInvoices: false` in ogni chiamata
   della griglia. Settembre 2026 mostra 4 770,20 € di uscite documentali e un saldo previsto
   invariato. Per un'azienda che lavora con fatture differite, questo è il previsionale mancato:
   resta un budget manuale con le fatture a margine.
2. **Nessun numero riconciliato delle uscite attese**: 8 704,90 € (griglia), 11 515,43 €
   (`forecast-breakdown`), 7 986,84 € (`future-cumulative`) per finestre in gran parte sovrapposte,
   senza alcuna indicazione all'utente.
3. **Fatture fuori finestra e stato `isLate` inattendibile**: 2 810,53 € di fatture datate 31 luglio
   sono restituite per una finestra che inizia il 1° agosto, con `isLate: false` benché già scadute,
   e non compaiono in nessuna colonna.
4. **Il pulsante `Giornaliero` non produce alcun effetto** (nessun cambio di griglia, nessuna
   chiamata API), mentre gli altri tre funzionano.
5. **La casella di posta blocca la pagina**: si apre da sola e intercetta i click su tutti i
   controlli finché non viene chiusa.
6. **La variazione percentuale in testata ha la didascalia sbagliata**: recita sempre «vs mese
   scorso» ma confronta con l'apertura del periodo della risoluzione scelta (verificato: −8,7 %
   mensile, +23,5 % settimanale, +20,6 % trimestrale).
7. **Etichette di periodo disallineate**: nella vista trimestrale il riquadro dell'anno più a
   sinistra recita `2024` sopra colonne che sono Q3 e Q4 **2025** (accertato dai periodi restituiti
   dall'API e dalla posizione della colonna corrente); nella vista settimanale il riquadro più a
   sinistra recita `giu 26` sopra settimane di luglio. Nel DOM le etichette di gruppo sono sempre
   **una in meno** dei gruppi renderizzati, in tutte e tre le risoluzioni. Causa `[IPOTESI]`.
8. **Il drill-down etichetta il trimestre col mese iniziale** («apr 2026» per Q2 2026).
9. **Orizzonte fisso e corto**: 21 colonne sempre, cioè 10 periodi futuri. In settimanale si vede a
   due mesi e mezzo; la documentazione promette un anno.
10. **IVA per cassa e per categoria**: aliquota unica per categoria, default 20 % in un paese in cui
    l'ordinaria è 22 %, calcolo sul movimento bancario anziché sul documento. Il «Saldo IVA» non è
    utilizzabile come importo da versare.
11. **`"Category not found"` nei payload API** per una categoria reale con importi non nulli: il
    front-end la salva traducendo per codice, ogni altro consumatore no.
12. **La modalità di previsione è un'impostazione globale di account**, non per categoria.
13. **Vocabolario incoerente su tre livelli**: `Previsione` (griglia), `Previsionato` (legenda del
    drill-down), `Previsioni` (sezione del pannello); `default` (API) contro `Dettagliato`/`Globale`
    (interfaccia) contro `aggregated` (campo `calculation`). In più, sezione `Transactions &
    Documents` in inglese dentro un pannello italiano.
14. **Formati numerici misti nella stessa riga**: nella vista trimestrale convivono `203 517` e
    `155K`, `117.8K`, `17.6K`.
15. **Campi interni esposti al client**: `_futureRemaining`, `_futureAdjusted`, e la stringa
    `calculation` che descrive la logica del motore. Utile per chi analizza, discutibile come
    superficie pubblica.
16. **Storia inventata a sinistra**: i mesi precedenti all'inizio dei dati bancari (da ott 2025 a
    apr 2026) mostrano `Contanti all'inizio` e `Contanti alla fine` costanti a 50 755 € con tutte le
    categorie a zero, dando l'impressione di un conto fermo anziché di un'assenza di dati.

---

## 12. Cosa non è stato valutabile

| Elemento | Tassonomia | Motivo |
|---|---|---|
| Struttura di una previsione (ricorrenza, formula, stato) | `[NON POPOLATO]` | nessuna previsione esistente sull'account; `forecasts/scenario/{id}/period` → `[]` |
| Regola di arbitraggio fra le tre fonti (`picked` / `pickedSource`) | `[NON POPOLATO]` + `[NON VERIFICABILE]` | unico valore osservato `"none"` su 138 occorrenze |
| Varianti della stringa `calculation` | `[NON POPOLATO]` | unica variante osservata `"future remaining (aggregated) = 0"` |
| Riconciliazione previsione ↔ transazione in azione | `[NON POPOLATO]` | coda vuota, `forecasts/reconciliation` → `[]` |
| Confronto affiancato di scenari, rinomina, duplicazione, eliminazione | `[NON VERIFICABILE]` | non è stato creato un secondo scenario |
| Previsione con IA (`/scenarios/ai-forecast`) | `[NON ACCESSIBILE]` | richiede il caricamento di dati contabili in tracciato FEC (francese) |
| Prime due code della casella di posta (verifica transazioni, riconciliazione) | `[NON POPOLATO]` | 749/749 transazioni già verificate, nessuna previsione da riconciliare |
| Modalità di previsione «Globale» | `[NON VERIFICABILE]` | impostazione non modificata; effetto misurabile solo con previsioni presenti |
| Comportamento del giornaliero | `[NON VERIFICABILE]` | il controllo non ha risposto; impossibile distinguere pulsante inerte da errore client |
| Esportazione e impostazioni della vista (icone di testata) | `[NON VERIFICABILE]` | controlli non aperti |
| Caricamento di periodi oltre le 21 colonne per scorrimento | `[NON VERIFICABILE]` | non provato |
| `vat_injection` / `vat_injection_frequency` | `[NON POPOLATO]` | falsi/nulli su tutte le categorie osservate |
| Avvisi di tensione di cassa promessi dal sito | `[NON POPOLATO]` | il saldo previsto non scende mai sotto zero su questo account, nessun avviso poteva scattare |
