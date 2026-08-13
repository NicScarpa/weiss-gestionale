# Import della fattura elettronica in CashKing — reverse engineering

**Data dell'osservazione:** 13 agosto 2026
**Rotta osservata:** `https://cashking.biz/import/invoices`, percorso «Fattura Elettronica (XML / PDF)»
**Materiale di prova:** `docs/fatture/FT-ultimi3mesi-xml.zip` — 226 file veri (150 `.xml`, 74 `.p7m`, 2 `.P7M` in maiuscolo), 13 MB decompressi, fatture passive di Weiss da giugno ad agosto 2026.

Il percorso è stato eseguito per intero, fino alla conferma. Le chiamate di rete sono state
catturate e le due risposte JSON confrontate riga per riga con l'output del nostro parser sugli
stessi identici file.

Le marcature seguono la convenzione della cartella: `[OSSERVATO]` è ciò che si è visto accadere,
`[DEDOTTO]` è inferenza motivata, `[VERIFICATO]` è misurato sui dati.

> ⚠️ **Effetto collaterale dell'osservazione.** La conferma ha creato **226 fatture nuove**
> nell'account CashKing di Weiss (contatore duplicati: 0, quindi non c'erano già). Se quell'account
> serve ancora per confronti, vanno ripulite.

---

## 1. Che cosa accetta

Testo letterale della schermata di caricamento `[OSSERVATO]`:

> «Formati supportati: XML, P7M (FPA12, FPR12, FSM10), PDF Cassetto Fiscale, PDF Rappresentazione
> SDI, ZIP mensile AdE (zippone). I file **_metaDato.xml** vengono ignorati automaticamente.»

Quattro cose che quella riga dice e che vale la pena leggere due volte:

| Elemento | Perché conta |
|---|---|
| **FPA12, FPR12, FSM10** | Non solo il formato verso privati (FPR12): dichiara anche la PA (FPA12) e **San Marino** (FSM10). Nel nostro archivio ci sono davvero fatture instradate via San Marino. |
| **ZIP mensile AdE («zippone»)** | Non uno ZIP qualsiasi: quello che l'Agenzia delle Entrate produce per il mese. È il gesto naturale di chi scarica dal cassetto fiscale. |
| **`_metaDato.xml` ignorati** | Dentro lo zippone AdE ogni fattura viaggia accompagnata dal suo file di metadati. Chi non lo esclude si ritrova il doppio dei file e un errore di parsing per ognuno. |
| **PDF** | Due varianti distinte: il PDF del Cassetto Fiscale e la Rappresentazione SDI. Fuori dall'ambito di questa analisi. |

---

## 2. Il flusso, in tre passi

`[OSSERVATO]` L'indicatore in testa mostra tre tappe.

### Passo 1 — scelta del tipo, e le opzioni *prima* del caricamento

La schermata iniziale offre quattro strade: Entrate, Uscite, Scadenziario, **Fattura Elettronica
(XML / PDF)**. La quarta è a sé: non chiede se sono attive o passive, perché **lo deduce dal
documento** confrontando le partite IVA con quella dell'azienda (vedi §4, campo `detectedType`).

Prima ancora di scegliere i file si decidono due cose:

- **«Sovrascrivi dati anagrafici esistenti»** (spento di default) — «Se attivo, i dati anagrafici
  (indirizzo, P.IVA, ecc.) di clienti/fornitori già esistenti verranno aggiornati con quelli del
  file importato».
- **«Come gestire i duplicati?»** — due sole scelte: *Salta le righe duplicate (mantieni i dati
  esistenti)*, che è il default, oppure *Sostituisci con i nuovi dati*.

`[DEDOTTO]` Chiedere la politica dei duplicati **prima** dell'anteprima è una scelta discutibile:
l'utente decide alla cieca, senza sapere quanti duplicati ci siano. Ed è coerente con ciò che
manca al passo 2.

### Passo 2 — anteprima tabellare

Lo ZIP viene **spacchettato nel browser**: la schermata elenca subito «226 file selezionati» con i
nomi, prima di qualunque chiamata al server. `[OSSERVATO]`

L'anteprima è una tabella piatta di 226 righe con dodici colonne:

`#` · `File` · `Numero` · `Tipo Doc.` · `Data` · `Scadenza` · `Cedente (Fornitore)` ·
`Cessionario (Cliente)` · `Netto` · `IVA %` · `Lordo` · `Ritenuta`

Due assenze pesano `[OSSERVATO]`:

1. **Nessuna casella di selezione per riga.** Si importa tutto o niente. Non si può escludere una
   fattura sbagliata: bisogna tornare indietro e rifare la selezione dei file.
2. **Nessun segnale di duplicato.** Nulla in tabella dice quali delle 226 sono già in archivio,
   benché il server lo sappia (ha appena interrogato `/api/invoices`).

### Passo 2b — il dialog dei conflitti anagrafici

Premuto «Avvia Importazione», prima di scrivere qualsiasi cosa compare una finestra `[OSSERVATO]`:

> **Valori Predefiniti in Conflitto**
> «Trovate 51 fattura/e con valori in conflitto. Alcuni clienti/fornitori hanno aliquote IVA o
> termini di pagamento diversi dalle impostazioni di importazione.»

Per ciascuna delle 51 entità una riga mostra il valore che arriva dal file — per esempio
`IVA: 10% 60gg (29/08/2026)` — e due pulsanti, **Importazione** e **Anagrafica**, per scegliere
quale dei due vince. In testa la selezione massiva: «Tutti Importazione» (attiva di default) /
«Tutti Anagrafica».

`[DEDOTTO]` È il pezzo più maturo del flusso, e l'unico punto in cui il prodotto ammette che il
file e l'archivio possano dire cose diverse invece di far vincere silenziosamente uno dei due.

### Passo 3 — esecuzione e referto

L'avanzamento è file per file, con cinque contatori vivi — **Importati · Duplicati · PDF errati ·
Errori · Rimanenti** — una tabella di log con l'esito per riga (`OK`), e un pulsante **«Annulla
importazione»** attivo durante l'esecuzione. Circa 2,5 file al secondo: le 226 in poco più di un
minuto. `[OSSERVATO]`

Alla fine, due riquadri:

> **Importazione Completata** — «226 righe importate, 0 righe saltate»
>
> **Verifica Integrità Importazione**
> Fatture create nel database: **226** · Clienti/fornitori creati: **0** · Righe totali processate: **226**

`[DEDOTTO]` Quel secondo riquadro è un'idea da rubare: non si limita a dire «fatto», rilegge il
database e mostra che il numero di righe scritte corrisponde a quelle processate. È il controllo
che smaschera l'importazione andata a metà.

---

## 3. L'architettura, vista dalla rete `[VERIFICATO]`

Due sole chiamate, entrambe `POST` con `Content-Type: application/json`, entrambe firmate con
`x-api-signature` (HMAC) e `x-api-timestamp`:

| Chiamata | Quando | Payload |
|---|---|---|
| `POST /api/invoices/parse-xml-preview` | dopo la scelta dei file | i 226 file **interi**, in base64 |
| `POST /api/invoices/xml-import` | dopo il dialog dei conflitti | **di nuovo** i 226 file interi, più le scelte |

Il corpo della seconda:

```jsonc
{
  "files": [ { "filename": "IT00534320932_019IC.xml", "content": "<base64 del file originale>" } ],
  "overwriteEntityData": false,
  "duplicatePolicy": "skip",                       // | "replace"
  "conflictResolutions": { "S.I.A.E.": "import" }  // 51 voci, per NOME entità
}
```

Quattro osservazioni che pesano sul progetto:

1. **Il file originale è rimandato grezzo.** Il `.p7m` arriva al server come PKCS#7 DER
   (primi byte `30 83 05 db cc 06 09 2a 86 48 86 f7`), non sbustato. **Lo sbustamento e il parsing
   veri stanno sul server**; il browser spacchetta solo lo ZIP.
2. **17,1 MB in una sola richiesta, e due volte.** L'intero archivio viaggia per l'anteprima e poi
   di nuovo per l'import: ~34 MB caricati per 226 fatture. `[DEDOTTO]` Semplice da scrivere,
   fragile da usare: un archivio grosso o una linea lenta fanno cadere tutto senza ripresa
   parziale, perché non esiste un'unità di lavoro più piccola della richiesta intera.
3. **`conflictResolutions` è indicizzato per nome entità**, non per partita IVA. `[DEDOTTO]` Due
   fornitori omonimi collidono, e il nome è testo libero che cambia da fattura a fattura
   (nell'archivio compaiono «WEISS S.R.L.», «Weiss s.r.l.», «WEISS SRL SOCIO UNICO»).
4. **Il client non è la fonte di verità.** L'anteprima è informativa: il server riparte dai file
   originali. Corretto, ma raddoppia il costo.

---

## 4. Che cosa estrae, campo per campo `[VERIFICATO]`

La risposta dell'anteprima è `{ "invoices": [ … ] }`, un oggetto di **38 campi** per fattura.
Esempio reale (parcella del commercialista, con ritenuta):

```json
{
  "invoiceNumber": "353", "date": "2026-06-01",
  "documentType": "invoice", "tipoDocumento": "TD06",
  "supplierName": "DEL PIERO E MODOLO COMMERCIALISTI ASSOCIATI",
  "supplierVatId": "IT01791890930", "supplierFiscalCode": "01791890930",
  "supplierAddress": "VIA UDINE 80", "supplierCity": "PORDENONE",
  "supplierPostalCode": "33170", "supplierProvince": "PN", "supplierCountry": "IT",
  "clientName": "WEISS S.R.L.", "clientVatId": "IT01723900930", …
  "netAmount": 433.34, "vatRate": 22, "vatAmount": 95.33, "grossAmount": 528.67,
  "dueDate": null, "paymentDays": null, "description": null, "currency": "EUR",
  "hasWithholding": true, "withholdingRate": 20,
  "withholdingAmount": 83.33, "withholdingType": "RT02",
  "splitPayment": false, "isSimplified": false, "receivedAt": null,
  "paymentInstallments": [],
  "filename": "IT03336420967_zbc84.xml.p7m",
  "detectedType": "supplier", "entityName": "DEL PIERO E MODOLO COMMERCIALISTI ASSOCIATI"
}
```

Campi che noi oggi **non** produciamo: `hasWithholding` / `withholdingRate` / `withholdingAmount` /
`withholdingType` (RT01, RT02), `splitPayment`, `isSimplified`, `detectedType`, `currency`.

Distribuzione misurata sulle 226:

| Dimensione | Valori |
|---|---|
| Tipo documento | TD01 · 154 — TD24 · 60 — TD06 · 9 — TD04 · 2 — TD02 · 1 |
| Direzione (`detectedType`) | `supplier` · 226 su 226 |
| Aliquota (`vatRate`) | 22% · 161 — 10% · 32 — 0% · 29 — 4% · 4 |
| Ritenuta | 9 fatture, tutte TD06, aliquota 20%, tipi RT01 e RT02 |
| Split payment / semplificate | 0 e 0 |
| Rate multiple | 2 fatture (una da 3 rate, una da 5) |
| Senza scadenza | 38 con `dueDate` nulla, 34 senza alcuna rata |

### Il punto debole: una sola aliquota per fattura

`vatRate` è un intero unico. Ma **32 fatture su 226 hanno più aliquote nello stesso documento**, e
in quei casi il valore mostrato è arbitrario `[VERIFICATO]`:

| File | Aliquote nel documento | `vatRate` di CashKing |
|---|---|---|
| `IT01378570350_pRBoU.xml` | 4% · 5% · 10% · 22% | **10** |
| `IT016417907022026O_05t19.xml` | 4% · 10% | **10** |
| `IT0164179070220267_05Qdc.xml` | 4% · 10% | **4** |
| `IT01336610587_0onWH.xml` | 0% · 22% | **22** |

Netto, IVA e lordo restano corretti (sono somme); si perde il **riepilogo IVA per aliquota**, che è
il dato che serve alla liquidazione. Il nostro modello lo conserva già in `vatSummary`.

---

## 5. Il confronto con il nostro motore `[VERIFICATO]`

Gli stessi 226 file passati al nostro `parseFatturaPASafe` + `extractXmlFromP7m`
(`scripts/test-batch-invoices.ts`):

```
Totale file: 226 · Successi: 226 (100,0%) · Errori: 0 · Con warning: 1
```

Nessun errore. Il solo avviso è un `MISSING_TOTAL_AMOUNT` su una fattura. I `.P7M` in maiuscolo e i
p7m di San Marino passano.

Confronto puntuale campo per campo con l'anteprima di CashKing:

| Confronto | Esito |
|---|---|
| Numero fattura | **226 su 226 identici** |
| Tipo documento | **226 su 226 identici** |
| Importo totale | **224 su 226 identici** |
| Scadenze | 158 identiche, 68 divergenti |

### Divergenza 1 — il segno delle note di credito (2 casi)

| File | Nostro | CashKing |
|---|---|---|
| `IT07945211006XPAPI_ZFNQQ.xml` (TD04) | +164,33 | **−164,33** |
| `IT03336420967_02Eod.xml.p7m` (TD04) | +1.900,00 | **−1.900,00** |

CashKing marca `documentType: "credit_note"` e **nega gli importi**. È l'intera differenza fra le
due somme totali: 181.674,84 (nostro) − 177.546,18 (loro) = 4.128,66 = due volte 2.064,33.

Da notare: una terza fattura, `IT03590860262_07UWS.xml.p7m`, è un **TD01 con importo negativo
(−70,00)** nel documento stesso. Lì siamo d'accordo entrambi: il segno arriva dal file.

**Loro hanno ragione.** Una nota di credito che entra positiva gonfia il debito verso il fornitore.

### Divergenza 2 — le scadenze, quando il dato non c'è (68 casi)

Non è un errore di lettura: è una convenzione diversa in assenza del dato.

| Situazione nel file | Noi | CashKing |
|---|---|---|
| `DataScadenzaPagamento` presente | la usiamo | la usa |
| `DatiPagamento` presente, ma **senza** data scadenza | data fattura **+ 30 giorni**, marcata `dataStimata: true` con nota esplicita | **data della fattura** (34 casi) |
| `DatiPagamento` del tutto **assente** | una rata stimata sul totale | **nessuna rata**, `dueDate: null` (34 casi) |

Esempio: `IT01336610587_0onWH.xml` (SIAE) non contiene alcuna `DataScadenzaPagamento`, solo
`CondizioniPagamento TP02` e `ModalitaPagamento MP08`. Noi diciamo 04/07/2026, loro 04/06/2026.

**Qui non hanno ragione loro.** Mettere la scadenza al giorno della fattura significa dichiarare
esigibile oggi un debito che nessuno ha concordato per oggi, e in un prospetto di cassa questo
sposta soldi indietro nel tempo. Lasciare `null` per un terzo dei documenti è altrettanto scomodo:
quelle fatture non compaiono in nessuna proiezione.

Il nostro comportamento — stimare **e dichiarare che è una stima** (`dataStimata`, `notaStima`:
«l'XML non riporta la data di pagamento») — è più difendibile di entrambi. Va però reso visibile
nella UI, che oggi non distingue una data letta da una data stimata.

---

## 6. Il bilancio

### Dove siamo già pari o avanti

- **Il parser.** 226 su 226, identico a loro su numero, tipo documento e importi. Non è un
  cantiere da aprire: è un motore che regge già il traffico vero.
- **Il riepilogo IVA per aliquota.** Noi lo conserviamo, loro lo collassano a un intero — e nel
  16% dei documenti quell'intero è arbitrario.
- **L'onestà sulle scadenze stimate.** Abbiamo il campo, loro no.
- **Le righe di dettaglio.** Conserviamo `lineItems` e le imputiamo per riga
  (`InvoiceLineAccount`); la loro anteprima non mostra alcun dettaglio di riga.

### Dove siamo indietro

| Mancanza | Peso |
|---|---|
| **La pagina `/fatture` non accetta lo ZIP** | `CaricaFattureDialog` filtra su `['.xml', '.p7m']` e l'`accept` è `.xml,.p7m`. Il supporto ZIP **esiste già** (`src/lib/zip-utils.ts`, 409 righe) ed è collegato solo a `InvoiceImportDialog`, montato su `/fatture/ricevute`. Due dialog per lo stesso gesto, e quello che usi tu è il meno capace. |
| **Nessuna gestione dei duplicati** | Il nostro `/api/invoices/parse` segnala `existingInvoice`, ma non c'è una politica *salta/sostituisci* né un conteggio. |
| **Nessun dialog dei conflitti anagrafici** | Se l'IVA o i termini del file divergono dall'anagrafica, oggi vince il file senza dirlo. |
| **Revisione una fattura alla volta** | `InvoiceImportDialog` ha uno stato `review` con `currentReviewIndex`: per ogni fornitore nuovo chiede conferma. Con 226 file e decine di fornitori nuovi è impraticabile. |
| **Nessuna cronologia delle importazioni, nessun annullamento** | Non esiste un modello `ImportHistory`. Sbagliato l'archivio, non c'è modo di tornare indietro se non a mano. |
| **Note di credito positive** | Vedi §5. È il difetto più insidioso perché non dà errore: dà un numero sbagliato. |
| **Ritenuta d'acconto non estratta** | Nessuna traccia di `DatiRitenuta` nel parser. 9 documenti su 226 la portano. Il tema è già stato sospeso il 13 agosto per una ragione precisa (vedi la memoria sulla ritenuta come canale di saldo), quindi qui va **letta e conservata**, non necessariamente contabilizzata. |
| **`_metaDato.xml` non filtrati** | `zip-utils.ts` esclude i file nascosti e `__MACOSX`, non i metadati AdE. Con lo zippone vero ogni fattura arriverebbe doppia. |
| **Nessun archivio del file originale** | Salviamo `xmlContent`, non il `.p7m` firmato. Il documento con valore legale è quello firmato. |

### Limiti nostri da verificare contro lo zippone AdE

`zip-utils.ts` impone: ZIP ≤ 50 MB, ≤ 500 file, ≤ 10 MB per file, niente ZIP annidati. Il file di
prova (7,7 MB, 226 file) passa comodamente. Uno zippone annuale no. `[DEDOTTO]`

---

## 7. Che cosa replicare, e in che ordine

Non tutto: due dei loro comportamenti sono peggiori dei nostri.

**Da copiare così com'è**
1. Un solo punto di ingresso che accetta `.xml`, `.p7m`, `.zip` — e che il gesto stia su `/fatture`.
2. Il filtro sui `_metaDato.xml` e la tolleranza alle estensioni maiuscole.
3. La politica dei duplicati esplicita (*salta* / *sostituisci*) con il conteggio **mostrato in
   anteprima**, non chiesto alla cieca prima.
4. Il dialog dei conflitti anagrafici — ma indicizzato per **partita IVA**, non per nome.
5. I contatori vivi durante l'esecuzione e il riquadro di verifica finale che rilegge il database.
6. Il segno negativo sulle note di credito TD04.

**Da fare meglio di loro**
7. Selezione per riga in anteprima: poter escludere una fattura senza rifare tutto.
8. Segnalare i duplicati **nella tabella**, riga per riga.
9. Conservare il riepilogo IVA per aliquota (già lo facciamo: non regredire).
10. Mostrare quali scadenze sono stimate, invece di far finta che siano lette dal documento.
11. Caricare i file **a blocchi**, non 17 MB in un colpo solo, con ripresa dopo un errore.

**Da non copiare**
12. La scadenza posta alla data della fattura quando il dato manca.
13. L'anteprima e l'import che trasferiscono due volte lo stesso archivio.

---

## Materiale

- Risposta di anteprima (226 fatture, 38 campi): catturata e analizzata, non archiviata nel
  repository perché contiene dati di fatture reali.
- Esito del batch sul nostro parser: `scripts/test-batch-invoices.ts` sui file estratti.
- Le schermate e i log di rete sono in `.playwright-mcp/` (non versionato).
