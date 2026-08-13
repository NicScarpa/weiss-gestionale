# Area funzionale — Stampe, Importazione e Pianificazione ricavi

Passata di ampiezza sulle tre aree rimaste chiuse fino all'11 agosto. Non è
un'esplorazione profonda: l'obiettivo era non lasciare zone bianche sulla mappa.
Convenzione dei tag come in `../01-inventario-rotte.md`.

---

## 1. Stampe

Undici rotte `/prints/*`, servite dagli endpoint `/api/reports/*`. Ne è stata
aperta una, la più promettente.

### 1.1 Incongruenze Fatture `[OSSERVATO]`
Rotta `/prints/invoice-inconsistencies`.
Sottotitolo: «Fatture con status incoerente rispetto ai pagamenti registrati».

Un solo blocco di risultati, intitolato **«Pagate senza pagamenti»**, con la
glossa «Fatture con status *pagata* ma senza alcun pagamento registrato»:

| Misura | Valore |
|---|---|
| N. Fatture | 15 |
| Importo Totale | 57.545,37 € |

Colonne: N. Fattura · Data · Cliente/Fornitore · Tipo · Status Attuale ·
Importo. La colonna Tipo distingue **Acquisto** e **Vendita**; lo Status Attuale
è «Pagato» su tutte e quindici.

`[OSSERVATO]` In alto compare il pulsante **«Correggi Tutte»**.

`[DEDOTTO]` È lo stesso insieme di documenti del riquadro «Saldate fuori
sistema» dello Scadenziario, che ne mostrava il conteggio (15) senza l'importo.
Qui la stessa anomalia è esposta come report con un'azione correttiva in blocco.
Lo stesso problema compare quindi in due punti con due scopi diversi:
nello scadenzario come **avvertimento** in mezzo al lavoro quotidiano, nelle
stampe come **lista da bonificare**.

⚠️ Il pulsante «Correggi Tutte» **non è stato premuto**: avrebbe modificato
quindici documenti, cancellando l'anomalia più istruttiva del dataset e
alterando il riferimento dell'osservazione longitudinale.

### Cosa fa davvero la correzione `[VERIFICATO]`

C'è anche un pulsante **per riga** (`button-fix-<idFattura>`), non solo quello
in blocco. Per non intaccare il dataset dimostrativo è stata creata
un'incongruenza propria: la fattura `TEST_CK_PAGATA_SENZA_MOVIMENTO`, 100 € più
IVA, salvata direttamente in stato «Pagato» senza alcun movimento collegato.

**Il rilevamento funziona come dichiarato.** La fattura è comparsa subito nel
report, che è passato a 16 righe e a 57.667,37 €, cioè i 57.545,37 € di partenza
più i 122,00 € della nuova. Nessun ritardo, nessun processo da attendere.

**La correzione chiede conferma:** «Conferma Correzione — Vuoi correggere lo
status di questa fattura?» con i pulsanti «Annulla» e «Correggi Status».

**L'effetto**, misurato prima e dopo sullo stesso documento:

| Campo | Prima | Dopo |
|---|---|---|
| `status` | `paid` | **`due`** |
| `totalPaid` | 0 | 0 |
| `dueDate` | 31/08/2026 | invariata |
| `isEdited` | false | **false** |

Il report è tornato a 15 righe e 57.545,37 €, il valore originario.

`[DEDOTTO]` La correzione fa esattamente una cosa: riporta lo stato a «Da
Pagare». Non crea un pagamento fittizio, non cancella nulla, non tocca le date.
È la scelta giusta, perché l'informazione mancante è proprio il pagamento e il
sistema non può inventarla.

`[OSSERVATO]` Ha scelto `due` e non `overdue`, coerentemente col fatto che la
scadenza del 31 agosto è ancora futura.

⚠️ `[OSSERVATO]` **Il flag `isEdited` resta `false`** dopo la correzione. Una
modifica di stato eseguita dal sistema su richiesta dell'utente non lascia
traccia sul documento. Chi lo guarderà domani non potrà distinguere una fattura
il cui stato è sempre stato «Da Pagare» da una che è stata riportata indietro da
questo report.

`[DEDOTTO]` Su un'azione di massa che può toccare quindici documenti in un clic,
l'assenza di traccia è la parte che preoccupa di più. «Correggi Tutte» è
irreversibile e invisibile a posteriori.

### 1.2 Le altre dieci stampe `[OSSERVATO]`, non aperte
`/prints/treasury-control` · `/prints/dso-dpo` · `/prints/expected-collections` ·
`/prints/expected-invoices` · `/prints/open-invoices` ·
`/prints/open-bank-movements` · `/prints/open-creditcard-movements` ·
`/prints/payment-reconciliation` · `/prints/vat-overview` ·
`/prints/withholding-f24`.

`[DEDOTTO]` I nomi disegnano due famiglie: le stampe di **posizione aperta**
(fatture, movimenti banca, movimenti carta) e quelle di **analisi** (DSO/DPO,
controllo tesoreria, incassi previsti, riepilogo IVA). Non risultano report
schedulati né invii periodici: sono viste generate su richiesta.

---

## 2. Importazione

### 2.1 Le quattro modalità di import fatture `[OSSERVATO]`
Rotta `/import/invoices`, sottotitolo «Importa fatture da file CSV o Excel».
La prima schermata chiede «Che tipo di fatture stai importando?» e offre:

| Modalità | Glossa mostrata |
|---|---|
| **Entrate** | Fatture verso clienti |
| **Uscite** | Fatture da fornitori |
| **Scadenziario** | Pagamenti in scadenza (misto clienti e fornitori) |
| **Fattura Elettronica (XML / PDF)** | «XML, P7M, PDF Cassetto Fiscale o SDI», etichetta «Formato SDI» |

`[DEDOTTO]` La terza modalità è la più pragmatica: consente di caricare uno
scadenzario già pronto, misto attivo e passivo, senza passare dai documenti.
È la scorciatoia per chi arriva da un foglio di calcolo e vuole vedere subito
una previsione, che è esattamente il cliente a cui il prodotto si rivolge.

`[OSSERVATO]` Il supporto dichiarato copre **XML**, **P7M** (l'XML firmato
digitalmente della fattura elettronica) e il **PDF del Cassetto Fiscale**.

`[DEDOTTO]` Il P7M è il formato in cui le fatture arrivano davvero dallo SDI, e
accettarlo evita all'utente di doverle sbustare. Il PDF del Cassetto Fiscale
implica un parser che estrae i dati da un documento pensato per la lettura
umana, non per l'interscambio.

Contrasto da segnalare: nulla di tutto questo compare sulle pagine pubbliche,
che parlano solo di «import da Excel e CSV». Vedi `../00-ricognizione-pubblica.md`,
capitolo 7.

### 2.2 Modelli di importazione `[OSSERVATO]`
Rotta `/import/models`, sottotitolo «Gestisci i modelli di importazione salvati
per riutilizzarli velocemente». Stato vuoto: «Nessun modello salvato — Salva un
modello durante l'importazione per vederlo qui».

`[DEDOTTO]` I modelli si creano **durante** un'importazione, non da questa
pagina, che è solo il magazzino. Lo stato vuoto lo dice invece di limitarsi a
constatare l'assenza, ed è il modo giusto di scrivere uno stato vuoto.

`[DEDOTTO]` Un modello salva presumibilmente la mappatura fra le colonne del
file e i campi del sistema. È ciò che rende sopportabile un'importazione
ricorrente dallo stesso home banking, che altrimenti va rimappata ogni mese.

---

## 3. Pianificazione ricavi

### 3.1 Calendario Fatture `[OSSERVATO]`
Rotta `/revenue/invoice-calendar`, sottotitolo «Visualizzazione mensile delle
fatture pianificate con collegamento fatture emesse». Due tab, **Entrate** e
**Uscite**.

Quattro indicatori in testa, ciascuno con l'importo netto e, sotto, quello IVA
inclusa:

| Indicatore | Netto | IVA inclusa |
|---|---|---|
| Totale Ordini Pianificati | 198.000,00 | 241.560,00 |
| Fatture non Emesse | 18.000,00 | 21.960,00 |
| Fatture da Emettere | 162.000,00 | 197.640,00 |
| Totale Fatture Emesse | 18.000,00 | 21.960,00 |

Poi il mese corrente: «Agosto 2026 — Fatture Pianificate 1 · Importo Netto
35.000,00 · Importo Lordo 42.700,00 · **Fatturato 0/1**».

Colonne della tabella: Data · Origine · **ODA / RDA / Preventivo** · Cliente ·
Descrizione · Importo Netto · Importo Lordo · Stato · Dettagli Fattura · Azioni.

Unica riga presente: 15/08/26 · «Carnet 50 giornate Consulenza» · ORD-2025/005 ·
Euro Electronics GmbH · «Carnet 50 giornate - saldo anticipato» · 35.000,00 ·
42.700,00 · **Pianificato**.

`[DEDOTTO]` Il prodotto modella il ciclo **prima** della fattura: dall'ordine —
con i riferimenti italiani ODA, RDA e preventivo — alla fattura pianificata,
fino alla fattura emessa che la consuma. Il previsionale di cassa può così
attingere a ricavi che non hanno ancora un documento.

`[DEDOTTO]` Il contatore **«Fatturato 0/1»** è un rapporto di avanzamento sul
mese: quante delle fatture pianificate sono state effettivamente emesse. Piccolo
e utile.

`[OSSERVATO]` Le aliquote tornano: `198.000 × 1,22 = 241.560` e
`35.000 × 1,22 = 42.700`.

### 3.2 I quattro indicatori: nessun errore, un nome sbagliato `[VERIFICATO]`

Il sospetto iniziale era un difetto di calcolo, perché due schede con nomi
opposti mostravano lo stesso 18.000,00 € e la somma sembrava non tornare.
Ricostruendo i dati da `/api/orders` e `/api/planned-billing-rows` il sospetto
si scioglie.

Gli ordini sono cinque, tutti `income`:

| Ordine | Tipo | Stato | Pianificato |
|---|---|---|---|
| Progetto Piattaforma E-commerce | `step` | confirmed | 45.000 |
| Consulenza Digital Transformation | `step` | in_progress | 72.000 |
| Abbonamento Supporto Premium Annuale | `consumo` | confirmed | 18.000 |
| Migrazione Infrastruttura Cloud | `step` | planned | 28.000 |
| Carnet 50 giornate Consulenza | `consumo` | confirmed | 35.000 |
| **Totale** | | | **198.000** |

Le quattordici righe di fatturazione pianificata, raggruppate per stato:

| Stato della riga | Righe | Netto |
|---|---|---|
| `planned` | 11 | 162.000 |
| `invoiced` | 2 | 18.000 |
| `awaiting_final` | 1 | 18.000 |
| **Totale** | **14** | **198.000** |

Le tre schede quindi **sommano esattamente** al totale degli ordini. Il mio
conto precedente era sbagliato perché avevo trattato due schede come se
contassero la stessa cosa: i due 18.000 € sono una **coincidenza numerica** fra
due stati diversi.

`[DEDOTTO]` La corrispondenza è: «Totale Fatture Emesse» = righe `invoiced`;
«Fatture da Emettere» = righe `planned`; **«Fatture non Emesse» = righe
`awaiting_final`**, cioè in attesa dell'importo definitivo.

`[DEDOTTO]` Lo stato `awaiting_final` ha senso solo per gli ordini di tipo
`consumo`, dove l'importo effettivo dipende dal consumato e non è noto in
anticipo. Il modello lo prevede esplicitamente con il campo `amountFinal`,
distinto da `amountPlanned`. E infatti l'unica riga in quello stato vale 18.000 €,
esattamente il totale dell'ordine «Abbonamento Supporto Premium Annuale», che è
di tipo `consumo`.

**Il difetto quindi non è nei numeri, è nel nome.** «Fatture non Emesse» e
«Fatture da Emettere» in italiano sono quasi sinonimi, e qui designano due stati
diversi e non intercambiabili. Nessun utente può dedurre dalle etichette che la
prima significhi «in attesa dell'importo definitivo». Basterebbe chiamarla «In
attesa di consuntivo».

`[OSSERVATO]` Il modello degli ordini distingue due tipi, **`step`** (a
milestone) e **`consumo`**, e quattro stati: planned, confirmed, in_progress e
— desumibile — completed.

### 3.3 Rotte affini non aperte
`/revenue/orders` · `/revenue/payment-planning` · `/orders-planning` ·
`/payment-terms`.

---

## 4. Cosa ne ricaviamo

| Accorgimento | Perché funziona | Come lo faremmo |
|---|---|---|
| Lo stesso controllo di integrità in due posti con due scopi | Avvertimento durante il lavoro, lista bonificabile quando ci si dedica | Una query sola, esposta come contatore nello scadenzario e come report con azione in blocco |
| Import «Scadenziario» misto attivo e passivo | Scorciatoia per chi arriva da un foglio di calcolo e vuole subito una previsione | Un tipo di import che crea partite in scadenza senza pretendere il documento |
| Accettare il P7M oltre all'XML | È il formato in cui le fatture arrivano davvero dallo SDI | Sbustamento del P7M prima del parsing, trasparente per l'utente |
| Modelli di importazione riutilizzabili | Rende sopportabile l'import ricorrente dallo stesso tracciato | Entità con la mappatura colonne→campi, salvabile a fine importazione |
| Lo stato vuoto che spiega come riempirlo | «Salva un modello durante l'importazione per vederlo qui» risolve il dubbio sul posto | Testo dello stato vuoto che nomina l'azione e dove si trova |
| Pianificato → emesso, con rapporto di avanzamento | Misura quanto del pianificato è stato davvero fatturato nel mese | Contatore `emesse/pianificate` sul raggruppamento mensile |
| Riferimenti ODA e RDA sull'ordine | Sono i codici con cui il cliente italiano identifica la fornitura, e senza non si viene pagati | Campi dedicati sull'ordine, riportati poi in fattura |

---

## 5. Qualità degli export `[VERIFICATO]`

Il metodo chiede di valutare «formati supportati, struttura dei file, qualità
degli export». Sono stati scaricati due export reali dal report DSO/DPO,
archiviati in `assets/cashking/export/`.

### Formati offerti
Tre pulsanti: **CSV**, **Excel**, **Stampa**. I nomi dei file generati dal prodotto sono parlanti e datati:
`dso_dpo_clients_2026-08-11.csv` e `.xlsx`. **In archivio sono stati rinominati
con i trattini alti** — `dso-dpo-clients-2026-08-11.csv` e `.xlsx` — dal
meccanismo di download.

### L'Excel è un vero xlsx, fatto bene `[VERIFICATO]`
Il file è un archivio OOXML regolare, con `xl/workbook.xml`, `styles.xml`,
`theme1.xml` e `metadata.xml`: non è un CSV rinominato né un HTML travestito,
come capita spesso.

Soprattutto, **i numeri sono celle numeriche vere**:

```xml
<c r="B2"><v>28855.4</v></c>          ← numero
<c r="A2" t="str"><v>Innovation Labs Inc</v></c>   ← testo
```

`[DEDOTTO]` È il comportamento corretto: in un xlsx il numero va scritto in
formato invariante e la formattazione locale la applica Excel all'apertura. Chi
sbaglia questa parte produce fogli in cui gli importi arrivano come testo e non
si possono sommare. Qui no.

### Il CSV ha un difetto che il prodotto stesso contraddice `[OSSERVATO]`

Il file si apre con il **BOM UTF-8**, scelta deliberata e giusta: è ciò che fa
aprire correttamente le lettere accentate a Excel in ambiente italiano. Tutti i
campi sono quotati, le intestazioni corrispondono esattamente a quelle a schermo,
ed è presente la riga dei totali, in cui il «0/2» mostrato in pagina viene
espanso nel più leggibile «0 migliori / 2 peggiori».

Ma il separatore decimale è il **punto**:

```
"Innovation Labs Inc","28855.40","Bonifico Anticipato","-7","4","4","+11","Peggiore"
```

`[OSSERVATO]` L'intera applicazione mostra gli importi all'italiana con la
virgola, e nelle impostazioni azienda esiste un campo esplicito
`decimalNotation` che sul nostro account vale **`comma`**.

`[DEDOTTO]` L'export CSV **ignora l'impostazione che il prodotto stesso offre**.
Su un Excel con impostazioni locali italiane quei valori arrivano come testo, e
il file va ripulito prima di poterci fare una somma — cioè esattamente la
seccatura che un export dovrebbe evitare, in un prodotto che si vende come
alternativa al foglio di calcolo.

`[OSSERVATO]` Differenza minore fra i due formati: la colonna «Differenza» è
`"+11"` nel CSV, cioè una stringa col segno, e `11` numerico nell'xlsx.

### Cosa ne ricaviamo

| Accorgimento | Perché funziona | Come lo faremmo |
|---|---|---|
| BOM UTF-8 in testa al CSV | È ciò che fa aprire bene gli accenti a Excel italiano, e costa tre byte | Anteporre `﻿` a ogni CSV generato |
| Nome file parlante e datato | Chi ne scarica dieci in un mese li ritrova | `<report>_<ambito>_<data ISO>.<est>` |
| Riga dei totali nell'export | L'export vale quanto la schermata, non meno | Includere sempre l'aggregato finale |
| Sigle espanse in parole nell'export | «0 migliori / 2 peggiori» si legge senza aver visto la pagina | Testo esteso al posto delle abbreviazioni della UI |
| Numeri come celle numeriche nell'xlsx | Altrimenti gli importi non si sommano | Scrittura in formato invariante, formattazione lasciata a Excel |

**Da non copiare:** il separatore decimale del CSV che ignora l'impostazione di
notazione configurata dall'utente. Se offriamo l'impostazione, ogni export deve
rispettarla.

---

## 6. Controllo Tesoreria, tour e sinonimi — passata finale

### 6.1 Il report «Controllo Tesoreria» `[OSSERVATO]`
Rotta `/prints/treasury-control`, «Genera il report completo della tesoreria per
la stampa».

Parametri: **Data inizio**, **Periodo** (7, 14, 30, 60, 90 giorni) e **Tipo di
stampa** con due modalità, «Con dettagli» e «Solo riepilogo». Export in Excel,
CSV e Stampa.

Il contenuto è la griglia della Tesoreria resa stampabile, spezzata in blocchi
di dieci giorni numerati — «11/08/2026 — 20/08/2026 (1/3)» — con le stesse righe:
Saldo Totale, Margine Disponibile, Interessi Stimati, Stato, Totale Banche
attive e passive con i rispettivi tassi medi.

`[DEDOTTO]` La paginazione a blocchi di dieci giorni con l'indicazione «(1/3)»
serve alla carta: una griglia di novanta colonne non si stampa, dieci sì. È un
adattamento al supporto, non una limitazione.

`[OSSERVATO]` **Questo report usa la base di calcolo corretta.** Il Saldo Totale
dell'11 agosto vale 172.546,33 €, cioè il valore di Cash Command, che esclude il
movimento datato 20/08, e non i 179.193,07 € del cruscotto. Delle tre versioni
del saldo aziendale, la stampa adotta quella giusta.

⚠️ `[OSSERVATO]` Il **tasso medio creditore al 113,333%** si propaga
integralmente nel report stampabile, su tutte le colonne di tutti e tre i
blocchi. Non è quindi un difetto di una schermata: finisce nel documento che
l'utente porta in banca o dal commercialista, insieme alla riga «Interessi
Stimati» che ne discende.

### 6.2 Tour guidati `[OSSERVATO]`
Rotta `/help/tours`, «Scopri le funzionalità principali con tour interattivi».
Quattro tour, ciascuno con il proprio pulsante «Inizia Tour»:

| Tour | Promessa |
|---|---|
| Tour Dashboard | «Scopri la panoramica finanziaria» |
| Tour Fatture | «Impara a gestire fatture e pagamenti» |
| Tour Movimenti Banca | «Scopri come categorizzare i movimenti» |
| Tour Importazione | «Scopri come importare dati da file» |

`[OSSERVATO]` Dalla guida interna risultano di tre o quattro passi ciascuno:
il tour del cruscotto tocca Saldo Totale, Previsione Cash Flow e Fatture in
Scadenza; quello dell'importazione si ferma su Carica File e Mappatura Colonne.

`[DEDOTTO]` Coprono le quattro schermate da cui si parte davvero, non tutte le
novantatré rotte. È la scelta giusta: un tour esaustivo non lo finisce nessuno.
I tour non sono stati avviati perché avrebbero sovrapposto elementi
all'interfaccia durante altre misurazioni.

### 6.3 Gestione sinonimi `[OSSERVATO]`
Rotta `/synonyms`, «Gestisci i sinonimi per clienti e fornitori, e i sinonimi
scartati».

Due schede con contatore, **Attivi (0)** e **Scartati (0)**, entrambe vuote sul
dataset dimostrativo. Colonne: Sinonimo · Entità · Tipo · **Origine** · Creato
il · Azioni. Filtri per tipo di entità e **per origine**.

`[DEDOTTO]` La colonna **Origine** con il relativo filtro conferma che il
sistema registra *da dove viene* ciascun sinonimo — inserimento manuale,
approvazione di una riconciliazione, oppure unione di due anagrafiche. È la
stessa idea di provenienza già vista sul flag `isManuallyMatched` dei movimenti:
il prodotto distingue sistematicamente ciò che ha deciso la macchina da ciò che
ha deciso una persona, e permette di filtrarci sopra.

`[DEDOTTO]` Che il dizionario sia vuoto su un dataset dimostrativo con
ventuno clienti e quarantanove movimenti dice però che i sinonimi **non vengono
precaricati**: nascono solo dall'uso. Un cliente nuovo parte quindi con il
fattore «controparte» della riconciliazione al minimo della sua efficacia, e la
qualità degli abbinamenti migliora solo col tempo.
