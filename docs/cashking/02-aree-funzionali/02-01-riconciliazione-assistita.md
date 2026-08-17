# Area funzionale — Riconciliazione Assistita

Rotta `/assisted-reconciliation` · endpoint `/api/assisted-reconciliation/batches`
Rilevazione: 11 agosto 2026, dataset dimostrativo.
Convenzione dei tag come in `../01-inventario-rotte.md`.

---

## 1. Cosa fa

`[OSSERVATO]` Sottotitolo della pagina: «Analisi intelligente per abbinare
movimenti e fatture con punteggio di confidenza».

Il job-to-be-done è quello classico della tesoreria: ho centinaia di righe di
estratto conto e centinaia di fatture, e devo capire quale bonifico paga quale
documento. Qui però l'abbinamento non è presentato come un risultato ma come una
**proposta motivata che l'utente approva o scarta**.

---

## 2. Il flusso operativo

`[OSSERVATO]` Tre stati successivi:

1. **Selezione del periodo.** Due date (preimpostate 01/05/2026 → 31/08/2026)
   con due scorciatoie: «Quest'anno» e «Tutto». Poi il pulsante «Calcola Proposte».
2. **Stato di attesa didattico** — vedi capitolo 4.
3. **Elenco delle proposte**, ciascuna approvabile o saltabile singolarmente.

`[OSSERVATO]` Dopo l'analisi compare anche un pulsante «Nuova Analisi» accanto a
«Calcola Proposte», e in fondo alla pagina uno **«Storico Analisi»** con una riga
per esecuzione: `11/08 00:22 · 01/05/26 - 31/08/26 · 0 approvati · 0 saltati · / 10 · 0%`.

`[DEDOTTO]` Ogni esecuzione è persistita come lotto — coerente con l'endpoint
`/api/assisted-reconciliation/batches` — e non è un calcolo effimero. Si può
tornare su un'analisi passata e vedere quanto ne è stato lavorato.

---

## 3. Le sei regole di abbinamento `[OSSERVATO]`

Sono dichiarate **prima** di lanciare l'analisi, con sigla e descrizione:

| Sigla | Regola | Descrizione mostrata |
|---|---|---|
| R1 | Nota Credito ↔ Fattura | Compensazione NC con fattura dello stesso soggetto |
| R2 | Banca ↔ Fattura | Pagamento bancario che corrisponde a una fattura |
| R3 | Prevista ↔ Fattura | Fattura prevista dal piano di fatturazione abbinata a una fattura emessa/ricevuta |
| R4 | Banca ↔ Rata Ricorrente | Movimento bancario abbinato a una rata di uscita/entrata ricorrente |
| R5 | Carta ↔ Fattura | Movimento carta di credito abbinato a una fattura fornitore |
| R6 | Estratto Conto ↔ Banca | Estratto conto mensile carta abbinato al movimento bancario di addebito |

`[DEDOTTO]` Le sei regole coprono tre canali di pagamento (banca, carta,
gateway implicito), la compensazione documentale (note di credito), la
pianificazione (fatture previste) e la ricorrenza. La R6 è la più specifica e
la più interessante: chiude il cerchio fra l'estratto conto mensile della carta
e l'unico addebito bancario che lo salda.

### La guida in-app ne elenca solo cinque `[OSSERVATO]`
La documentazione interna del prodotto (vedi cap. 5b) dichiara **cinque** regole
— R1, R2, R3, R5, R6 — e **salta la R4**. Ma l'interfaccia mostra sei regole, e
tutte e dieci le proposte generate sul dataset dimostrativo sono di tipo R4.

`[DEDOTTO]` La R4, l'abbinamento con le rate ricorrenti, è stata aggiunta dopo
la stesura della guida. La numerazione lo conferma: la sigla mancante è quella
centrale, non l'ultima. La guida dichiara in fondo di essere «aggiornata alla versione» seguita da un
numero interpolato a runtime, letto a schermo come **0.24.78** contro la 0.26.5
dell'applicazione. Il numero non è archiviato nell'estratto del bundle, dove la
chiave `wikiVersion` contiene la sola etichetta; l'argomento però non ne
dipende, perché la parte verificabile lo sostiene da sola: l'estratto elenca
davvero cinque regole, «R1, R2, R3, R5, R6», saltando la R4.

**Perché dichiararle in anticipo funziona.** Un motore di abbinamento
automatico è una scatola nera che l'utente deve imparare a fidarsi. Mostrare
l'elenco delle regole prima di eseguire trasforma «il software ha deciso» in
«il software ha applicato la regola R4», che è contestabile e quindi credibile.

---

## 4. Lo stato di attesa è didattico `[OSSERVATO]`

Prima di lanciare l'analisi la pagina non è vuota: mostra il titolo «Seleziona
un periodo e avvia l'analisi» e il testo «Il motore di riconciliazione
analizzerà movimenti bancari, note di credito e fatture nel periodo selezionato,
generando proposte di abbinamento con punteggio di confidenza da 0 a 100»,
seguito dalla tabella delle sei regole.

Vedi `assets/cashking/screenshots/08-riconciliazione-empty-state-didattico.png`.

`[DEDOTTO]` Lo spazio che in molti prodotti è occupato da un'illustrazione o da
un «nessun dato» viene qui usato per spiegare il funzionamento, cioè esattamente
nel momento in cui l'utente ha una domanda e nessuna risposta.

---

## 5. La proposta: punteggio più motivazioni `[OSSERVATO]`

Ogni proposta è una scheda che affianca il movimento bancario e il candidato,
con in mezzo il punteggio.

Esempio integrale osservato:

```
MOVIMENTO BANCA                     RATA RICORRENTE
Addebito Telecom Italia             Telefonia e Internet
Canone mensile                      Utenze
31/07/2026                          10/08/2026
180,00                              180,00
                                    Rata #3 · Uscita ricorrente

                    72
        Importo identico alla rata
        Rata #3 di "Telefonia e Internet"
        Unico match possibile

        [Approva]  [Salta]
```

`[OSSERVATO]` Le motivazioni raccolte sulle quattro proposte esaminate:

- «Importo identico alla rata»
- «Importo simile alla rata»
- «Controparte probabile»
- «Nome ricorrente nel testo»
- «Unico match possibile»
- «Rata #N di "<nome della ricorrenza>"»
- «3 alternative»

`[DEDOTTO]` Il punteggio è composto da contributi indipendenti — corrispondenza
dell'importo (esatta o approssimata), riconoscimento della controparte,
presenza del nome nel testo del movimento, e unicità del candidato. La presenza
di alternative **abbassa** il punteggio: la stessa rata affitto vale 77 quando
c'è un candidato preferito e 67 quando i tre candidati sono equivalenti.

**Questo è l'accorgimento più trasferibile dell'intero prodotto.** Non il
punteggio in sé, che è banale, ma il fatto che accanto al numero ci siano le
frasi che lo giustificano. L'utente non deve fidarsi di un 72: legge «importo
identico, unico match possibile» e decide in un secondo.

---

## 5b. Come funziona davvero il punteggio, secondo la guida in-app `[OSSERVATO]`

La «Guida Completa» del prodotto documenta il motore con una precisione che
l'interfaccia non espone. Estratti testuali in
`assets/cashking/export/guida-in-app-estratta-dal-bundle.txt`.

### Le soglie sono dichiarate
| Fascia | Intervallo | Glossa della guida |
|---|---|---|
| ALTA | 80-100 | «quasi sicuramente corretto» |
| MEDIA | 50-79 | «probabile ma da verificare» |
| BASSA | 0-49 | «possibile ma incerto» |

### I sei fattori del punteggio
La guida spiega che la barra colorata sotto il punteggio è **segmentata**, e che
«ogni segmento rappresenta un fattore (**importo, controparte, data, testo,
segno, unicità**). Se un segmento è grande, quel fattore è molto favorevole
all'abbinamento.»

`[DEDOTTO]` Il punteggio è la somma pesata di sei contributi, e la barra ne
mostra la composizione senza numeri. Le frasi osservate in interfaccia sono le
etichette dei fattori che hanno contribuito di più: «importo identico» è il
fattore importo, «controparte probabile» è il fattore controparte, «nome
ricorrente nel testo» è il fattore testo, «unico match possibile» è l'unicità.

Il fattore **segno** — entrata contro uscita — è quello che nessuna delle
proposte osservate menzionava, presumibilmente perché è sempre soddisfatto e
quindi non discriminante.

### Rilevamento dei conflitti
`[OSSERVATO]` «Se vedi una proposta con un triangolo giallo di *Conflitto*,
significa che lo stesso movimento o la stessa fattura appare in più proposte.
Approva solo quella corretta, le altre verranno risolte automaticamente.»

`[DEDOTTO]` Il motore ammette che le sue proposte possano essere mutuamente
incompatibili, lo segnala, e propaga la risoluzione. È diverso dal caso delle
«alternative»: lì sono più candidati per lo stesso movimento dentro una scheda,
qui sono proposte separate che si contendono lo stesso oggetto.

### Lo scarto può essere permanente
`[OSSERVATO]` Saltando una proposta si può scegliere se ignorarla «per sempre o
solo per questa volta», e «il sistema non te li riproporrà mai più».

`[DEDOTTO]` Senza questa opzione ogni riesecuzione ripropone gli stessi falsi
positivi, e il costo di usare il motore cresce a ogni giro invece di calare.

### Il motore impara i sinonimi
`[OSSERVATO]` «Quando approvi un abbinamento con un nome controparte diverso, il
sistema ti suggerisce di salvare un sinonimo. Accettando, le prossime
riconciliazioni saranno più accurate e veloci.»

`[DEDOTTO]` È l'anello che chiude il ciclo di apprendimento: ogni correzione
manuale alimenta il dizionario dei sinonimi, che a sua volta alza il fattore
«controparte» delle analisi successive. Il motore non impara da solo, impara dal
lavoro che l'utente stava già facendo — che è il modo più economico di imparare.

### Rieseguire è previsto
`[OSSERVATO]` «Puoi rieseguire l'analisi sullo stesso periodo dopo aver
approvato alcune proposte: il sistema escluderà i movimenti e le fatture già
riconciliati e troverà nuovi abbinamenti.»

`[DEDOTTO]` Il flusso è iterativo per disegno: approvare le proposte facili
riduce lo spazio dei candidati e fa emergere abbinamenti prima nascosti.

### Contraddizione fra soglie dichiarate ed etichette mostrate `[OSSERVATO]`
Con le soglie della guida, i punteggi osservati ricadono così:

| Punteggio | Fascia attesa (guida) | Etichetta mostrata |
|---|---|---|
| 77 | MEDIA | Media ✔ |
| 72 | MEDIA | **Bassa** ✗ |
| 67 | MEDIA | **Bassa** ✗ |
| 66 | MEDIA | **Bassa** ✗ |

### Ipotesi chiusa dai parametri del lotto `[VERIFICATO]`

La risposta di `/api/assisted-reconciliation/batches` contiene i parametri con
cui l'analisi è stata lanciata:

```json
{"id":220,"dateFrom":"2026-04-30T22:00:00.000Z","dateTo":"2026-08-31T21:59:59.999Z",
 "status":"pending","proposalsCount":10,"approvedCount":1,"skippedCount":0,
 "supersededCount":0,
 "params":{"minScore":50,"rulesUsed":["R1","R2","R3","R4","R5","R6"]}}
```

Due cose vanno lette insieme.

**`minScore: 50`.** Il motore non emette proposte sotto i 50 punti. Ma la guida
in-app dichiara che la fascia **BASSA è 0-49**: quella fascia è quindi
**strutturalmente irraggiungibile**, non conterrà mai nulla per costruzione.
Le etichette «Bassa» osservate su punteggi 72, 67 e 66 non possono seguire la
scala documentata.

`[DEDOTTO]` L'interfaccia usa soglie proprie, diverse da quelle scritte nella
guida. Dai valori osservati — 77 etichettato «Media», 72 «Bassa» — il confine
fra le due fasce cade fra 72 e 77, plausibilmente a 75. La documentazione
descrive quindi una scala che il prodotto non applica.

**`rulesUsed: ["R1"…"R6"]`.** Tutte e sei le regole sono state usate,
confermando che la R4 esiste ed è attiva, e che è la **guida** a essere
incompleta quando ne elenca cinque.

`[OSSERVATO]` Il lotto ha anche un contatore **`supersededCount`**, distinto da
approvati e saltati.
`[DEDOTTO]` È il conteggio delle proposte annullate automaticamente
dall'approvazione di una concorrente, cioè il meccanismo di risoluzione dei
conflitti descritto nella guida. Che sia contato a parte significa che il
prodotto tiene traccia di quante decisioni ha preso da solo.

---

## 6. Gestione delle alternative `[OSSERVATO]`

Quando più candidati sono plausibili, la scheda non ne sceglie uno: mostra
l'etichetta «3 alternative» e un blocco «SELEZIONA ABBINAMENTO» con la lista dei
candidati, **ciascuno col proprio punteggio**, e i pulsanti diventano «Approva
selezionata» e «Salta tutte».

Caso osservato: un bonifico affitto da 2.500,00 € del 26/07/2026 contro tre rate
di «Affitto Ufficio» da 2.500,00 € datate 10/08, 09/09 e 09/10, con punteggi
rispettivamente 77, 67 e 67.

`[DEDOTTO]` Il candidato più prossimo nel tempo prende un punteggio più alto: è
l'unico elemento che distingue tre rate altrimenti identiche.

---

## 7. Lavoro in blocco e avanzamento `[OSSERVATO]`

Sopra l'elenco: cinque contatori — `10 Totali`, `1 In Attesa`, `0 Approvati`,
`0 Saltati`, `0% Completamento` — e quattro filtri per fascia di confidenza:
`Tutte (10)`, `Alta (0)`, `Media (0)`, `Bassa (1)`.

`[OSSERVATO]` Esiste il pulsante **«Approva Tutte le Sicure»**.

`[DEDOTTO]` L'utente può liquidare in un clic la coda ad alta confidenza e
dedicare attenzione solo ai casi dubbi. È la divisione del lavoro giusta fra
macchina e persona.

### Difetto: i contatori non tornano `[OSSERVATO]`

I numeri mostrati sono mutuamente incoerenti:

- il totale dichiara **10** proposte, ma i filtri per fascia sommano **1**
  (`Alta 0 + Media 0 + Bassa 1`);
- «In Attesa» vale **1** mentre le proposte non lavorate sono 10;
- fra le quattro proposte effettivamente esaminate una ha punteggio 77 ed è
  etichettata «Media», eppure il contatore `Media` resta a 0.

`[DEDOTTO]` Le etichette di fascia sulla singola proposta sono coerenti col
punteggio (77 → Media, 72/67/66 → Bassa), quindi la soglia esiste ed è
applicata al singolo elemento. Sono i **contatori aggregati** a essere
sbagliati, non la classificazione.

### Ipotesi chiusa: due unità di misura mescolate `[VERIFICATO]`

Contando le schede effettivamente rese: **una** scheda con proposta singola più
**tre** schede con tre alternative ciascuna. Cioè `1 + 3×3 = 10`.

Il numero «10 Totali» conta dunque le **proposte**, alternative comprese, mentre
i filtri per fascia contano solo le **schede senza alternative**. Le tre schede
con alternative non vengono classificate in nessuna fascia: non sono né Alta né
Media né Bassa, semplicemente non entrano nel conteggio.

La conferma è arrivata approvando l'unica proposta singola:

| Contatore | Prima | Dopo |
|---|---|---|
| Totali | 10 | 10 |
| In Attesa | 1 | **0** |
| Approvati | 0 | **1** |
| Completamento | 0% | **10%** |
| Alta / Media / Bassa | 0 / 0 / 1 | **0 / 0 / 0** |

`[OSSERVATO]` Dopo l'approvazione **tutte e tre le fasce sono a zero** e «In
Attesa» è a zero, benché restino nove proposte da lavorare, visibili sotto
l'intestazione «MOVIMENTI IN USCITA 9».

`[DEDOTTO]` La percentuale di completamento è invece coerente con l'altra unità:
una proposta approvata su dieci dà il 10%. I contatori non sono sbagliati nel
calcolo, sono **incoerenti fra loro** perché due di essi misurano schede e gli
altri misurano proposte.

Per l'utente l'effetto pratico è serio: chi filtra su «Media» non vede nulla
anche quando esiste una proposta da 77 punti, e chi guarda «In Attesa: 0»
conclude di avere finito mentre gli restano nove abbinamenti da decidere.

---

## 7b. Cosa succede davvero approvando `[VERIFICATO]`

Approvata la proposta «Addebito Telecom Italia − Canone mensile, 180,00 € del
31/07/2026 ↔ Rata #3 di Telefonia e Internet».

⚠️ Nota: è deliberatamente uno degli abbinamenti che il capitolo 8 giudica mal
proposti, perché associa un pagamento di luglio a una rata di agosto. È stato
scelto lo stesso perché era l'unica proposta senza alternative, quindi l'unica
che permettesse di osservare l'effetto sui contatori isolando una variabile sola.

Il movimento bancario, riletto da `/api/transactions`, è passato a:

```
isMatched:             true
isManuallyMatched:     false
hasRecurringCostLinks: true
reconciledAmount:      180
isPartiallyReconciled: false
isFullyReconciled:     true
```

`[OSSERVATO]` Il flag `isManuallyMatched` resta **false**. L'abbinamento nato da
una proposta assistita è distinto da quello fatto a mano dall'utente, pur
essendo stato approvato da una persona.

`[DEDOTTO]` Il sistema conserva la **provenienza** del collegamento. È
un'informazione preziosa: permette di misurare quanto lavoro fa davvero il
motore, e di rivedere selettivamente gli abbinamenti automatici se in futuro si
scopre che una regola sbagliava.

`[OSSERVATO]` Il modello del movimento espone una batteria di flag paralleli a
quelli della fattura: `hasInvoiceLinks`, `hasOtherCostLinks`,
`hasRecurringCostLinks`, `hasCreditCardStatementLinks` e
`hasPeerReconciliations`, più `reconciledAmount`, `isPartiallyReconciled` e
`isFullyReconciled`.

`[DEDOTTO]` `hasPeerReconciliations` indica l'abbinamento fra due movimenti
bancari, cioè il giroconto fra conti propri: nel dataset dimostrativo esiste
infatti un «Giroconto da conto principale». Riconoscerlo come coppia evita di
contarlo due volte nel flusso di cassa.

`[OSSERVATO]` Lo «Storico Analisi» ora elenca due esecuzioni, e su quella
precedente compare un pulsante **«Riprendi»**: i lotti non sono solo
consultabili ma riapribili.

### Un dettaglio di igiene del dato `[OSSERVATO]`
Le rate ricorrenti pendenti hanno scadenze del tipo
`2026-08-10T19:59:37.797Z`: una data con ore, minuti, secondi e millesimi,
identica per tutte le rate dello stesso lotto.

`[DEDOTTO]` La scadenza eredita l'istante di generazione della rata invece di
essere una data pura. Non produce errori visibili, ma è il genere di dettaglio
che prima o poi fa sbagliare un confronto «entro fine giornata» a cavallo di un
fuso orario.

---

## 8. Qualità delle proposte sul dataset dimostrativo `[OSSERVATO]`

I punteggi osservati sono tutti bassi: **72, 77, 67, 66** su 100, e nessuna
proposta rientra nella fascia «Alta». Eppure alcuni abbinamenti sono
oggettivamente evidenti: un addebito Telecom da 180,00 € contro una rata
«Telefonia e Internet» da 180,00 € con importo identico e nessun altro
candidato ottiene solo 72.

`[DEDOTTO]` Il motore è tarato in modo conservativo. La conseguenza pratica è
che il pulsante «Approva Tutte le Sicure» sul dataset dimostrativo **non ha
nulla da approvare**: la fascia Alta è vuota.

### Un abbinamento discutibile `[OSSERVATO]`

Il motore propone di abbinare pagamenti **passati** a rate **future**:

- bonifico affitto del 26/07/2026 → rata #3 datata 10/08/2026
- addebito AWS del 06/07/2026 → rata #3 datata 10/08/2026
- bonifico affitto del 26/06/2026 («mese prec.» nella descrizione) → sempre
  rata #3 del 10/08/2026

`[DEDOTTO]` Due movimenti distinti, di mesi diversi, vengono proposti per la
**stessa** rata #3. E la direzione temporale è invertita: un pagamento di
giugno non può saldare una rata di agosto.

`[IPOTESI]` Il motore non genera le rate ricorrenti passate, oppure le rate già
consumate non sono candidabili e restano solo quelle future. In entrambi i casi
il risultato per l'utente è una proposta da rifiutare.
Test necessario: approvare l'abbinamento del bonifico di luglio e verificare se
la rata #3 sparisce dai candidati del bonifico di giugno.

---

## 9. Cosa ne ricaviamo per il nostro gestionale

Traduzioni concrete sul nostro stack — Next.js App Router, Tailwind, shadcn/ui.
Il prodotto usa lo stesso design system (variabili `text-muted-foreground`,
icone lucide), quindi i pattern si trasferiscono quasi senza adattamento.

| Accorgimento | Perché funziona | Come lo faremmo |
|---|---|---|
| Motivazioni accanto al punteggio | Rende contestabile una decisione automatica, quindi credibile | Il matcher restituisce `{score, reasons: string[]}` invece del solo numero; in UI una fila di `<Badge variant="secondary">` sotto il punteggio |
| Regole nominate R1…R6 mostrate prima di eseguire | L'utente sa cosa sta per succedere e può attribuire un errore a una regola precisa | Tabella statica sopra il pulsante di avvio, con le sigle riportate poi su ogni proposta |
| Alternative esplicite con punteggio ciascuna | Non forza una scelta quando i dati non la determinano | `RadioGroup` di shadcn dentro la scheda della proposta, con il punteggio a destra di ogni opzione |
| «Approva Tutte le Sicure» | Separa il lavoro meccanico da quello che richiede giudizio | Azione in blocco filtrata sulla soglia di confidenza alta |
| Stato di attesa che spiega il motore | Occupa con una spiegazione lo spazio in cui l'utente ha una domanda | Componente di stato vuoto che riceve la lista delle regole come prop |
| Storico delle esecuzioni | Il lavoro di riconciliazione è lungo e si interrompe; poterlo riprendere conta | Tabella dei lotti con periodo, contatori e percentuale di completamento |
| **Il sinonimo si impara approvando** | Ogni correzione manuale migliora le analisi successive, senza chiedere all'utente lavoro in più | All'approvazione con nome controparte diverso, proporre il salvataggio del sinonimo; il fattore controparte lo userà al giro dopo |
| **Scarto permanente contro scarto singolo** | Senza il permanente ogni riesecuzione ripropone gli stessi falsi positivi e il motore diventa più costoso a ogni giro | Tabella delle coppie escluse in modo definitivo, consultata prima di generare |
| **Segnalazione dei conflitti** | Ammette che le proposte possano essere incompatibili invece di fingere certezza | Dopo la generazione, marcare le proposte che si contendono lo stesso oggetto e propagare la risoluzione all'approvazione |
| **Barra segmentata per fattore** | Mostra la composizione del punteggio senza costringere a leggere numeri | Barra con un segmento per fattore (importo, controparte, data, testo, segno, unicità), larghezza proporzionale al contributo |
| **Riesecuzione iterativa** | Approvare le proposte facili restringe lo spazio dei candidati e fa emergere abbinamenti prima nascosti | Escludere dalla generazione ciò che è già riconciliato, e invitare esplicitamente a rilanciare |

**Da non copiare:** la taratura conservativa che lascia vuota la fascia alta e
rende inutile l'azione in blocco; i contatori aggregati incoerenti; e la
divergenza fra le soglie documentate e le etichette effettivamente mostrate.

---

## 10. Verifiche ancora da fare

- Approvare una proposta e osservare l'effetto su `reconciliationAmounts` della
  fattura e sui contatori di avanzamento.
- Capire se la soglia fra Alta, Media e Bassa è configurabile.
- Costruire un caso di pagamento parziale (fattura da 1.000 € saldata con 800 €
  di bonifico) e vedere se il motore lo propone e con quale punteggio.
- Verificare se le regole R1, R3, R5 e R6 producono proposte: sul dataset
  dimostrativo sono comparse solo proposte R4 (Banca ↔ Rata Ricorrente).
