# Lacune di conoscenza

Cosa **non** è stato verificabile, su quale prodotto, per quale causa, e quale
accesso o dato servirebbe per chiuderlo. Serve a due cose: a leggere la matrice
senza confondere una lacuna nostra con un'assenza loro, e a decidere se vale la
pena rinnovare un accesso.

Regola che governa tutto il documento: **una schermata vuota o irraggiungibile
non è una funzionalità mancante.** Le 41 celle marcate `[NA]` `[NP]` `[NV]` nella
matrice non sono stati contati come zeri.

---

## 0. Riepilogo per prodotto

| Prodotto | Causa dominante della lacuna | Aree cieche | Costo per l'analisi |
|---|---|---|---|
| **Agicap** | Gating commerciale: moduli non acquistati | riconciliazione bancaria, previsionale a 12+ mesi, scenari, scostamenti | **ALTO** — manca il modulo su cui il leader di mercato costruisce metà del suo valore |
| **Trezy** | Account reale ma **non alimentato** sul previsionale, e sola lettura | struttura della previsione, arbitraggio fra fonti, coda di verifica, ciclo attivo | **MEDIO-ALTO** — l'area cieca è proprio quella che il prodotto vende |
| **Cash King** | Addon a pagamento + un difetto del prodotto | modulo Retail (che è il nostro caso d'uso), promemoria, motore di regole | **ALTO su Retail**, basso sul resto |
| **Sibill** | Il reverse engineering è **precedente** | tutto ciò che è cambiato dopo | **MEDIO** — rischio di attribuire a Sibill assenze che non ha più |

---

## 1. Agicap — `[NON ACCESSIBILE]` per gating

L'accesso era **parziale**: l'account WEISS ha il prodotto Cashflow ma non i
moduli venduti separatamente. La scadenza era il **18 agosto 2026**, quindi la
finestra è chiusa o quasi.

### 1.1 · Le lacune costose

| Cosa | Perché è costoso | Cosa la chiuderebbe |
|---|---|---|
| **Riconciliazione bancaria** (`treasury_bank_journal`) | È l'area in cui la matrice ha più righe 🔴, e il prodotto con più peso di mercato è quello su cui non sappiamo nulla. Le fonti pubbliche danno solo «score % + soglia di auto-match configurabile per regola», senza formule né fattori | Attivazione del modulo, anche temporanea: Agicap ha un apparato di **accesso temporaneo per singolo modulo** (`has_temporary_module_*_access`) letto nel bundle, quindi la prova è tecnicamente prevista dal prodotto |
| **Previsionale a 12+ mesi con AI, conversione budget→cassa, stress test** | È il modulo che Agicap vende come differenziante, e la nostra `PRV-10` (previsione da storico) è proprio il terreno del confronto | Stesso modulo temporaneo |
| **Analisi degli scostamenti** | `SCS-01` e `SCS-02` sono due dei 🔴 a impatto più alto, e Agicap è l'unico dei quattro che li risolve davvero | Il congelamento settimanale è stato **attivato l'11 agosto**; il primo snapshot era atteso **lunedì 17 alle 13:00** e l'accesso scadeva il **18**. Una sola sessione il 17 o 18 agosto avrebbe chiuso il buco: se non è stata fatta, va rifatta con un rinnovo |
| **Scenari** | Divergenza D6 decisa senza vedere l'implementazione di riferimento | Modulo |

### 1.2 · Le lacune a basso costo

| Cosa | Stato | Nota |
|---|---|---|
| DSO / DPO | `[NON POPOLATO]` — servono fatture e anagrafiche, assenti sull'account | Per WEISS conta solo il DPO; la formula è banale e non serve osservarla |
| Prezzi | `[NON DETERMINABILE]` — non pubblicati da nessuna fonte ufficiale | Irrilevante per il backlog |
| Catalogo bancario italiano | `[NON DETERMINABILE]` — vetrina di 14 loghi | Irrilevante |
| Formule dei KPI `type=2` | Non nella risposta della lista | Servirebbe aprire il dettaglio di un indicatore, e solo se esiste una vista di sola lettura |

### 1.3 · Le lacune **di strumento**, non di accesso

Queste sono le più facili da chiudere e valgono la pena, perché la Fase 0 di
Agicap è la più ricca delle quattro:

- **Centro assistenza** (`help.agicap.com`): risponde 404/403 ai client
  non-browser, coerentemente con un `robots.txt` che vieta i crawler di AI. Non
  è stato aggirato — nessuno user-agent falsificato, nessun proxy. **La lista
  prioritizzata degli articoli è già pronta** in
  `docs/agicap/00-fonti/help-center-da-leggere-con-browser.md`.
- **Video e webinar**: YouTube e i player incorporati non espongono testo ai
  client non-browser. **Lista prioritizzata pronta** in
  `docs/agicap/00-fonti/video-da-recuperare-con-browser.md`.

> **Costo per chiuderle: qualche ora con un browser reale, zero accessi da
> rinnovare.** Sono le due lacune col miglior rapporto fra costo e resa
> dell'intero documento.

### 1.4 · Le cinque contraddizioni rimaste aperte

Registrate nella Fase 0 e mai risolte nel prodotto. Sono domande precise e
verificabili, e due riguardano direttamente il nostro caso d'uso:

1. **Granularità reale del previsionale** — le pagine prodotto dichiarano
   giornaliero, tre recensori indipendenti (due Food & Beverages) dicono che il
   minimo reale è mensile.
2. **I corrispettivi** — utenti italiani del retail riferiscono che Agicap
   importa le fatture dal cassetto fiscale ma **non i corrispettivi**. Per un
   horeca è la differenza fra uno strumento utile e uno cieco sulla maggior parte
   del fatturato. **È la contraddizione più rilevante per noi.**
3. **Lo SDI** — dichiarato dal sito, assente dall'API pubblica.
4. **La riconciliazione sui casi sporchi** — pagamento cumulativo, sconto cassa,
   nota di credito.
5. **La grammatica delle regole** — connettore `O`, operatori sul campo Importo,
   retroattività, chi vince fra regola utente e classificazione automatica.

---

## 2. Trezy — `[NON POPOLATO]` per stato dell'account

L'accesso era **completo** e i dati **reali**, ma l'account non aveva mai usato
il previsionale. La prova era Premium 5→12 agosto 2026, quindi anch'essa chiusa.

### 2.1 · Il buco che conta

**L'intero previsionale è cieco**, e non per debolezza del prodotto:

- `GET /forecasts/scenario/{id}/period` → `[]`: nessuna previsione esiste,
  quindi la struttura di una previsione (ricorrenza, formula, stato) non è
  osservabile;
- `pickedSource` vale `"none"` su **tutte le 138 occorrenze rilevate**: la regola
  di arbitraggio fra le tre fonti concorrenti — che è l'idea più interessante
  dell'area e alimenta la nostra `PRV-03` — resta ignota;
- la variante osservata del campo `calculation` è una sola
  (`"future remaining (aggregated) = 0"`);
- la modalità di previsione «Globale» non è distinguibile da «Dettagliato» su un
  account con **tutte le categorie senza padre**.

> **Cosa lo chiuderebbe**: un account con almeno una previsione inserita e una
> gerarchia di categorie a due livelli. Bastano 30 minuti di scrittura su un
> ambiente non di produzione — che con questo account non c'era.

### 2.2 · Il buco metodologico

`[NON POPOLATO]` sulla **coda di verifica post-collegamento**: 749 transazioni su
749 già verificate. L'analisi lo dichiara con onestà, e la frase merita di essere
riportata perché vale anche per noi:

> *«Il momento in cui un prodotto di categorizzazione si gioca la sua reputazione
> è la prima ora dopo il collegamento della banca, con 749 movimenti da
> qualificare; e quel momento, in questa osservazione, era già passato.»*

Non sappiamo quindi quanto costi davvero smaltire quella coda, che è
esattamente la domanda dietro `MOV-06` (raggruppamento dei simili) e `CLS-16`
(tasso di categorizzazione come KPI).

> **Cosa lo chiuderebbe**: un account nuovo con una connessione bancaria appena
> collegata. Non replicabile senza credenziali PSD2 su un conto reale.

### 2.3 · I `[NON ACCESSIBILE]` di navigazione

Piccoli fallimenti tecnici dell'osservazione, tutti recuperabili con una sessione
in più:

| Cosa | Perché non si è aperto |
|---|---|
| Pannello **«Candidati»** delle riconciliazioni | Errore di posizionamento nel viewport. È la risposta a `RIC-14`: come presentano le proposte non ancora accettate, se mostrano livello e affidabilità, se c'è conferma in blocco |
| Menu **«Analisi»** nella barra filtri documenti | Timeout sul selettore |
| **Scheda di dettaglio di un singolo documento** | Nessuna fattura aperta: ignoti visualizzatore PDF, campi editabili e **verifica guidata campo per campo** — che è la funzione che rimedierebbe al `TRUST/REVIEW` nascosto |
| **Modulo di creazione della regola dalla selezione del testo** | Il flusso non è stato aperto. È il cuore di `CLS-07`: non sappiamo se ci sia un'anteprima dei movimenti catturati, **e senza anteprima il gesto è comodo ma cieco** |
| Flusso di **import da file** ed **export** | Pulsanti non azionati |
| Seconda pagina delle anagrafiche e documenti oltre i primi 100 | Le statistiche su 100 documenti sono un **campione**, non un censimento — quello dei più recenti |

### 2.4 · I `[NON VERIFICABILE]` di merito

| Cosa | Perché irrisolvibile con quei dati |
|---|---|
| **Scala e metodo della valutazione cliente** | Sei righe su sei mostrano «B — Normale». Non è determinabile se sia il valore neutro in assenza di storico o un punteggio calcolato che converge. Nessuna documentazione del produttore la menziona |
| **Tolleranze del motore di matching** | Si osserva solo il livello più forte (importo esatto, 14/14). I livelli intermedi — «importo simile», «scadenza vicina» — non si sono manifestati |
| **Ciclo di vita completo della riconciliazione** | Pagamento parziale, pagamento in eccesso, piani di rateazione, una transazione su più scadenze: documentati nelle stringhe interne, mai osservati |
| **Se attivare i moduli prodotti/beta accenda l'estrazione delle righe** | Non determinabile senza attivarli su produzione |

### 2.5 · L'area totalmente cieca

**Tutto il ciclo attivo.** Il tab «Vendita» segna 0: l'intero archivio è di
acquisto. Con esso sono ciechi crediti verso clienti, solleciti, incasso, e il
senso pieno della valutazione cliente e del ritardo medio.

Per noi il costo è **basso**, perché il ciclo attivo è marcato `⚪` in matrice
(`DOC-02`): WEISS incassa alla consumazione. Va però detto che questa lacuna
rende **non falsificabile** la nostra decisione di escluderlo.

---

## 3. Cash King — `[NON ACCESSIBILE]` per addon, e un difetto del prodotto

L'accesso era **completo** su una sandbox con dati demo ricchi: è il prodotto
meglio documentato dei quattro. Le lacune sono poche e molto concentrate.

### 3.1 · La lacuna più costosa dell'intera analisi

**Il modulo Retail è bloccato da un addon** che non compare nel listino pubblico
e si vende su trattativa commerciale. È stato ricostruito **integralmente dalla
guida in-app** estratta dal bundle JavaScript — 88 schermate documentate una per
una, con campi, colonne, azioni e suggerimenti — e **mai eseguito**: nessuna
funzionalità usata, nessun dato letto dalle sue API.

Perché è la lacuna più costosa: **è il nostro caso d'uso.** Le quattro righe
🔴 a impatto 4-5 dell'area `RET` (`RET-04` operatori POS, `RET-05` accrediti
attesi, `RET-06` eccezioni, `RET-08` riconciliazione retail) poggiano tutte su
una fonte documentale, non su osservazione diretta.

Cosa **sappiamo** dalla guida: il modello dati (`settlementPolicy`,
`feePercentBps`, `feeFixedCents`, `feeMonthly`), i sei motivi di eccezione, il
ciclo finalizza/riapri, i pesi per giorno della settimana.

Cosa **non sappiamo**, ed è quello che serve per implementare bene:

- come si comporta la generazione degli accrediti attesi quando l'acquirer
  **accorpa più giornate** in un accredito solo — il caso più frequente nella
  realtà;
- se l'atteso si ricalcola quando l'incasso giornaliero viene corretto dopo la
  generazione;
- come si presenta lo scarto: differenza in euro, in percentuale, entrambi;
- se `/api/retail/reconciliation/suggestions` produce proposte automatiche
  (l'endpoint esiste, la guida descrive solo il flusso manuale).

> **Cosa lo chiuderebbe**: l'attivazione dell'addon Retail, che richiede una
> trattativa commerciale. Nota: **le API Retail rispondono 200** a un account
> senza addon — il blocco è solo nell'interfaccia — ma leggerle sarebbe uscire
> dal perimetro dell'account, e non è stato fatto né va fatto.

### 3.2 · Le altre lacune

| Cosa | Causa | Costo |
|---|---|---|
| **Promemoria automatici** (solleciti, modelli, coda, registro, scheduler) | Addon 2,99 €/mese non attivo. **L'intero capitolo alert ed email del metodo è quindi non osservabile** | Medio: `ALR-03` è un 🔴 a impatto 5 e non abbiamo un riferimento osservato |
| **Il motore di regole** — 10 tipi, 13 operatori, 11 azioni | **Difetto del prodotto**: nessuna regola, di nessun tipo, si può creare. Il client non allega `companyId` e la chiamata risponde 400 | Basso: la *grammatica* è enumerata dall'interfaccia, manca solo il comportamento |
| **Anteprima di una regola prima dell'applicazione massiva** | Non verificabile finché la creazione è rotta | Medio: alimenta `CLS-09` |
| **Multi-azienda** | Il selettore compare solo con due o più aziende | Basso: `PLT-03` è ⚪ per noi |
| **Ruolo commercialista** | Venduto sulla pagina pubblica a 3,99 €/mese e **assente dal modulo di invito**. Due letture ugualmente plausibili: gating dell'addon, oppure funzione venduta e non costruita | Basso |
| Se le soglie Alta/Media/Bassa siano configurabili | Non esplorato | Basso |
| Comportamento del motore su **pagamento parziale** | Non costruito il caso | Medio: alimenta `RIC-11` |
| Le regole **R1, R3, R5, R6** | Sul dataset dimostrativo sono comparse **solo proposte R4** | Medio |
| **10 stampe su 11** | Non aperte, per scelta di ampiezza | Basso |

### 3.3 · L'osservazione longitudinale è incompleta

Il piano prevedeva riletture dal **12 al 29 agosto**; il registro
(`docs/cashking/04b-comportamenti-nel-tempo.md` §9) è **vuoto**, con la nota «da
compilare a partire dal 12 agosto 2026».

Restano quindi aperte le domande che una singola sessione non può chiudere:

- la finestra dei 90 giorni scorre giorno per giorno o è ancorata a inizio mese?
- `previousPeriod` del ciclo di cassa si popola col tempo? È la prova che
  confrontano periodo su periodo;
- il campanello inerte si accende mai, o le notifiche in-app **non esistono**?
- la sonda A (`TEST_CK_SCAD_3GG`, scadenza 14 agosto) ha prodotto un avviso, con
  quanto anticipo e su quale canale?

L'ultima è quella che serve a `ALR-03`, il 🔴 a impatto 5 del nostro backlog.

> **Cosa lo chiuderebbe**: rientrare sull'account, se l'accesso è ancora valido
> (scadenza dichiarata 30 agosto 2026). **Costo: una sessione. È l'unica lacuna
> che si chiude senza spendere niente e che potrebbe già essere scaduta.**

---

## 4. Sibill — `[DA RIVERIFICARE]` per obsolescenza

Il reverse engineering è **precedente** alle tre analisi attuali e vive fuori da
questo repo (`/Users/nicolascarpa/Desktop/Progetti/sibill-re`). Il prodotto può
essere evoluto.

**Il rischio specifico**: attribuire a Sibill un'assenza che non ha più, e
concludere che una funzione «non la fa nessuno» quando invece la fanno tutti.

Le voci in cui il rischio è concreto — presenti in due o tre prodotti osservati
ora, assenti dalla nostra ricostruzione di Sibill:

| ID | Funzione | Presente in | Perché il dubbio è ragionevole |
|---|---|---|---|
| `RIC-03` | Motivazioni accanto al punteggio | Cash King | Sibill ha uno score %; aggiungere le frasi è un incremento naturale |
| `CLS-12` | Dizionario di sinonimi | Cash King | È il complemento del fattore «controparte» che Sibill già pesa |
| `MOV-06` | Raggruppamento dei simili | Trezy, Agicap | — |
| `SCS-01` | Storico delle previsioni | Agicap | Sibill ricalcola le proposte, quindi probabilmente non le congela — ma non è verificato |
| `RET-*` | Modulo punto vendita | Cash King | Sibill è italiana e il retail è un segmento naturale |

> **Cosa lo chiuderebbe**: una sessione di riverifica su Sibill con il metodo di
> `METODO.md`, se l'accesso esiste ancora. **Costo: alto (è un'analisi intera),
> resa: media** — Sibill è il modello su cui il gestionale è costruito, quindi
> le sue evoluzioni sono la strada di aggiornamento più diretta, ma le tre
> analisi recenti coprono già lo stesso terreno.

---

## 5. Le tre lacune da chiudere per prime

Ordinate per rapporto fra costo e ciò che sbloccano nel backlog.

### 5.1 — **Il modulo Retail di Cash King** · costo: trattativa commerciale

Sblocca le quattro righe `RET-04/05/06/08`, che valgono complessivamente
impatto 5+5+4+4 e sono il cuore del nostro caso d'uso. Oggi poggiano su una
guida in-app, non su osservazione. Senza, gli accrediti POS attesi si
implementano ricostruendo il comportamento sugli edge case (accorpamento di più
giornate, ricalcolo dopo correzione) invece di copiarlo.

**Se la trattativa non è praticabile**, l'alternativa è più economica e forse
migliore: **parlare con l'acquirer di WEISS**. I contratti Nexi/SumUp/Axerve
dicono la politica di accredito e la struttura commissionale meglio di qualunque
software, e il modello dati da costruire è quello.

### 5.2 — **La sessione longitudinale su Cash King** · costo: una sessione, forse già scaduta

Chiude `ALR-03` (avviso su scadenza in avvicinamento, impatto 5 nel nostro
backlog), risponde alla domanda se le notifiche in-app esistano, e verifica se il
previsionale ricalcola o è congelato. Il fotogramma di riferimento è già preso e
le sonde sono già piazzate: **è lavoro già pagato che si perde se non si torna**.
L'accesso era dichiarato fino al 30 agosto 2026.

### 5.3 — **Help center e video di Agicap con un browser reale** · costo: qualche ora, zero accessi

Le due liste prioritizzate sono già scritte. Chiude parte delle cinque
contraddizioni del §1.4 — in particolare **i corrispettivi**, che è la domanda
più rilevante per un horeca — e alimenta `SCS-01`, `SCS-02` e `PRV-03`, tre righe
del backlog su cui Agicap è l'unico riferimento.

---

## 6. Cosa questa analisi **non** potrà mai dire

Onestà finale, perché nessuno dei tre punti si chiude con più accesso.

1. **Quanto sono buone davvero le proposte automatiche.** Su Cash King il motore
   è tarato in modo conservativo e la fascia alta è vuota; su Trezy l'archivio
   era già categorizzato; su Agicap il modulo non c'era. **Nessuno dei tre ci
   dice quale soglia sia giusta**, e la nostra (`SUGGESTED = 0.75`) resta una
   scelta da validare sui nostri dati, non copiabile.
2. **Quanto costa l'onboarding.** È la debolezza più citata nelle recensioni di
   Agicap (14 menzioni su cinque anni), e nessuna delle tre osservazioni ha visto
   un onboarding: due account erano già popolati, uno era una sandbox.
3. **Se il prodotto regge nel tempo.** Solo Cash King aveva sonde longitudinali,
   e il registro è vuoto. Tutto ciò che diciamo sui comportamenti nel tempo —
   ricalcoli, finestre mobili, avvisi — è ricostruito da una fotografia singola.
