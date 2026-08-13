# Trezy — Area «Prestazioni»: pre-contabilità, bilancio stimato, KPI

**Prodotto:** Trezy · **Ambiente:** produzione (`appv2.trezy.io`) · **Account:** reale, azienda della ristorazione
**Piano:** Premium in prova (39 €/mese) · **Osservazione:** 11 agosto 2026
**Rotta:** `/performance` · **Sette schede:** Dashboard ✨ · C/E · Stato Patrimoniale · Pareggio · Valutazione · KPI · Registrazioni

> Nota di metodo: raccolta in **sola lettura**. Nessuna scrittura creata, nessuna
> classificazione modificata, nessun parametro di valutazione toccato. Le
> verifiche numeriche riportate sono state rifatte a mano sui corpi di risposta
> delle API, non sui soli valori a schermo. Le descrizioni delle scritture sono
> state anonimizzate: nel dump originale contengono nomi di controparti reali.

---

## 1. Il claim fondativo: «Stima da transazioni bancarie, non contabilità ufficiale»

Un banner azzurro con icona informativa occupa la prima riga di **ogni** schermata
dell'area, sopra la barra delle schede. Nella scheda Registrazioni la stessa frase
compare **due volte**: nel banner e in un badge giallo accanto al conteggio
«3368 registrazioni». `[OSSERVATO]`

Non è una postilla legale nascosta a piè di pagina: è la prima cosa che si legge, e
non si può chiudere. La stessa dichiarazione è ripetuta dalle API. L'esercizio
fiscale restituito da `GET /api/v2/estimated-accounting/fiscal-years` è:

```json
{ "id": "est-2026-01-01-2026-12-31",
  "filename": "Estimated from bank transactions",
  "sourceType": "estimated",
  "totalEntries": 3368, "totalAccounts": 35,
  "siren": null, "fileHash": null, "status": "completed" }
```

`[OSSERVATO]` L'intera famiglia di endpoint si chiama `estimated-accounting/*`.
Nella scheda KPI l'etichetta «BASATO SU» è seguita da «données estimées
(transactions bancaires)» — in francese, non tradotta.

**Commento.** È la scelta di prodotto più significativa dell'area, e va riconosciuta
per quello che è: costruire un bilancio d'esercizio completo — conto economico a
saldi intermedi, stato patrimoniale, break-even, valutazione d'impresa — partendo
dai soli estratti conto bancari, e **dirlo apertamente su ogni schermata**. La
tentazione opposta (presentare gli stessi numeri come «il tuo bilancio» e lasciare
che l'utente ci creda) sarebbe stata commercialmente più facile.

Il pregio è che l'onestà è coerente fino al livello dei nomi delle rotte e dei campi
JSON, non solo nella cartellonistica. Il limite è che la dichiarazione è **generica
e costante**: dice «è una stima» ma non dice *quanto* la stima si discosti, né
quali voci siano derivate e quali arbitrarie. Come si vedrà ai §6 e §11, il sistema
dispone internamente della misura del proprio errore — l'API restituisce
`"isReconciled": false` e uno scarto di quadratura di 48 431,57 € — e non la
traduce mai in un avviso. Il banner dice all'utente di diffidare in generale; i
numeri che permetterebbero di diffidare in modo mirato restano nel JSON.

Una seconda conseguenza, più sottile: la formula «non contabilità ufficiale» serve a
distinguersi dal commercialista, non a definire cosa il dato *sia*. Un utente
italiano che legge «stima» pensa a un'approssimazione del proprio bilancio civilistico.
Ciò che ha davanti è invece la riclassificazione di 3 368 movimenti bancari secondo
il **Plan Comptable Général francese** (§4), senza saldi di apertura (§6). Sono due
cose diverse, e il banner non aiuta a distinguerle.

---

## 2. Impianto tecnico dell'area

| Endpoint (`p3001-…prm.sh/api/v2/…`) | Alimenta |
|---|---|
| `estimated-accounting/fiscal-years` | selettore esercizio, conteggi |
| `estimated-accounting/pl` | Dashboard (indicatori chiave, cascata P&L) |
| `estimated-accounting/pl-periodic` | serie mensile del C/E |
| `estimated-accounting/pl-hierarchical` | griglia del C/E (albero + formule + previsioni) |
| `estimated-accounting/balance-sheet` | Stato Patrimoniale › Bilancio generale |
| `estimated-accounting/balance-sheet-batch` (POST) | Stato Patrimoniale › Storico |
| `estimated-accounting/cash-flow-statement` | rendiconto finanziario (non esposto in UI) |
| `estimated-accounting/breakeven` | Pareggio |
| `estimated-accounting/kpis` | KPI |
| `estimated-accounting/entries` | Registrazioni (`?limit=100&offset=0`) |
| `fec/valuation/calculate` (POST) | Valutazione |
| `fec/pl-forecasts/scenario/{id}` | confronto con la previsione (ha risposto `[]`) |

`[OSSERVATO]`

Due dettagli di questo elenco pesano più di quanto sembri. Il primo: la valutazione
d'impresa vive sotto `/api/v2/**fec**/`. **FEC** è il *Fichier des Écritures
Comptables*, il tracciato che l'amministrazione finanziaria francese impone dal 2014
per la consegna delle scritture in caso di verifica. Il secondo: l'esercizio fiscale
porta i campi `siren` (l'identificativo d'impresa francese) e `fileHash`, entrambi
`null`. `[OSSERVATO]`

`[DEDOTTO]` L'area Prestazioni nasce come **lettore di file FEC**: si carica il FEC
prodotto dal commercialista, il prodotto ne ricava bilancio e indici. La modalità
«stimata» è stata innestata sopra quel motore, sintetizzando un FEC a partire dalle
transazioni bancarie — `sourceType: "estimated"`, `filename: "Estimated from bank
transactions"`, `fileHash: null` perché nessun file è stato caricato. Questo spiega
in un colpo solo il piano dei conti francese, i codici giornale francesi, il campo
`siren` e la persistenza di etichette francesi nell'interfaccia italiana.

---

## 3. Registrazioni — la partita doppia generata

**3 368 scritture** per l'esercizio 2026, su **35 conti**. `[OSSERVATO]` Otto colonne:

| Colonna | Contenuto | Esempio |
|---|---|---|
| DATA | data del movimento | 10/08/2026 |
| GIORNALE | codice giornale | `BQ`, `VE`, `AC`, `OD` |
| N° REGISTRAZIONE | tipo di evento | `E1`, `E2` |
| CONTO | numero + denominazione | `512100 Banque` |
| DESCRIZIONE | causale bancaria integrale | *(anonimizzata)* |
| DARE / AVERE | importo su un solo lato | 619,90 € / – |
| CARATTERI | identificativo esadecimale a 8 cifre | `1507b90e` |

Sopra la tabella: campo di ricerca «Cerca per descrizione, documento, giornale…» e
un pulsante «Filtri». `[OSSERVATO]`

### 3.1 Che cosa correla davvero il campo CARATTERI

Non correla le due righe di una scrittura: correla **tutte le righe generate dalla
stessa transazione bancaria**, che nel caso generale sono più di due e appartengono
a giornali diversi. Gli 8 caratteri sono il prefisso dell'UUID della transazione
d'origine. `[OSSERVATO]` — nel JSON: `"transactionId": "1507b90e-c87e-4ab5-…"`,
`"entryGroupId": "EVT1-1507b90e-…"`.

Il vero raggruppamento contabile è `entryGroupId`, che non è esposto in UI e vale
`EVT1-<transactionId>` oppure `EVT2-<transactionId>`. Ogni movimento bancario
produce **due scritture distinte**:

- **Evento 1** (`E1`, giornale `BQ` = *banque*): registra il fatto monetario.
  Banca in contropartita a un conto ponte — `468870 Produits à recevoir` per gli
  incassi, `468860 Charges à payer` per i pagamenti.
- **Evento 2** (`E2`, giornale `VE` = *ventes*, `AC` = *achats*, `OD` = *opérations
  diverses*): registra il fatto economico. Chiude il conto ponte contro il ricavo o
  il costo, scorporando l'IVA.

Esempio reale, descrizione rimossa (incasso di 619,90 € da un gestore di pagamenti
elettronici):

| Evento | Giornale | Conto | Dare | Avere |
|---|---|---|---|---|
| E1 | BQ | 512100 Banque | 619,90 | — |
| E1 | BQ | 468870 Produits à recevoir | — | 619,90 |
| E2 | VE | 468870 Produits à recevoir | 619,90 | — |
| E2 | VE | 706000 Prestations de services | — | 516,58 |
| E2 | VE | 445780 TVA collectée à régulariser | — | 103,32 |

`[OSSERVATO]` Il conto `468870` compare due volte con segno opposto e si azzera: è
il perno che tiene separati il momento di cassa e il momento di competenza. `[DEDOTTO]`
È il meccanismo su cui poggiano i «termini di pagamento» per categoria dichiarati
dalle FAQ del produttore: spostando la data dell'evento 2 rispetto all'evento 1 si
ottiene la sfasatura cassa/competenza senza toccare il saldo bancario. Nel dataset
osservato il campo `paymentDelayDays` vale `0` o `null` su tutte le 100 righe
esaminate, quindi i due eventi cadono sempre nello stesso giorno: **la separazione
esiste come impianto ma non è alimentata**. `[OSSERVATO]`

### 3.2 Test di quadratura dare/avere

**Metodo.** Presa la risposta di `GET /api/v2/estimated-accounting/entries?startDate=1900-01-01&endDate=2100-12-31&limit=100&offset=0`,
le righe sono state raggruppate per `entryGroupId` e per ciascun gruppo si sono
sommati i campi `debit` e `credit` in aritmetica decimale esatta. L'ultimo gruppo
della finestra è stato escluso perché il limite di 100 righe può troncarlo a metà.

**Esito.**

| Grandezza | Valore |
|---|---|
| Righe esaminate | 100 su 3 368 (2,97 %) |
| Gruppi completi testati | 45 |
| Gruppi quadrati (Σ dare = Σ avere) | **45 / 45** |
| Gruppi sbilanciati | 0 |
| Gruppi da 2 righe | 36 |
| Gruppi da 3 righe (con scorporo IVA) | 9 |

✔ **Test superato.** La partita doppia regge riga per riga, e regge anche nei casi a
tre righe. Non è un dettaglio scontato: molti strumenti di tesoreria si fermano alla
riclassificazione a sezioni contrapposte e chiamano «partita doppia» ciò che non lo è.

**Limite dichiarato del test:** copre il 2,97 % della popolazione, perché l'endpoint
è paginato a 100 e nella sessione è stata catturata solo la prima pagina. La
quadratura *aggregata* dell'intero corpo scritture non è verificabile con i dati in
mio possesso — anzi, al §6 si vedrà che a livello di bilancio **non** quadra, per
motivi che non riguardano le singole scritture.

### 3.3 Finding centrale — piano dei conti francese su un account configurato «Italia»

L'account è configurato con `accountingStandardCode: "IT_CUSTOM"` («Italia —
Personalizzato»). `[OSSERVATO]` — da `GET /api/v2/account-settings`.

I conti effettivamente movimentati sono del **Plan Comptable Général francese**.
Tutti e 11 i conti comparsi nella finestra esaminata, con la denominazione così come
la mostra l'interfaccia italiana:

| Conto | Denominazione a video | Classe PCG | Occorrenze |
|---|---|---|---|
| `512100` | Banque | 5 — comptes financiers | 31 |
| `468860` | Charges à payer - Divers | 4 — comptes de tiers | 27 |
| `468870` | Produits à recevoir - Divers | 4 | 18 |
| `706000` | Prestations de services | 7 — produits | 7 |
| `445780` | TVA collectée à régulariser | 4 | 7 |
| `627000` | Autres frais et commissions sur prestations | 6 — charges | 4 |
| `445680` | TVA déductible à régulariser | 4 | 2 |
| `580000` | Virements internes | 5 | 1 |
| `616000` | Primes d'assurances | 6 | 1 |
| `601000` | Achats de matières premières | 6 | 1 |
| `613000` | Locations | 6 | 1 |

`[OSSERVATO]` I codici giornale sono anch'essi francesi, e il JSON ne restituisce
l'etichetta estesa: `BQ` → «Journal de banque», `VE` → «Journal de ventes», `AC` →
«Journal d'achats», `OD` → «Journal d'opérations diverses». Il campo `accountClass`
riporta il numero di classe PCG (4, 5, 6, 7). `[OSSERVATO]`

**Distinzione fra osservazione e inferenza.** È *osservato* che: il piano dichiarato
è italiano, i conti usati sono francesi, i giornali sono francesi, gli endpoint
stanno sotto `/fec/`, il modello dati ha un campo `siren`. È *dedotto* che il
prodotto sia nato in Francia sul tracciato FEC e che la scelta del piano dei conti
nelle impostazioni **non venga letta** dal generatore delle scritture, che emette
sempre PCG. `[DEDOTTO]` Non ho potuto verificare se esista una variante `IT` non
personalizzata che produca conti italiani: cambiare l'impostazione avrebbe
significato scrivere sull'account.

**Conseguenze pratiche per un utente italiano.** Non sono estetiche.

1. **Nessuna corrispondenza con il bilancio depositato.** Un titolare che voglia
   confrontare la scheda con quella del commercialista non trova un solo codice in
   comune. Il piano italiano non ha «512100» né «706000»; la corrispondenza va
   ricostruita a mano, e per farlo serve conoscere il PCG.
2. **Le denominazioni non sono traducibili a occhio.** «Produits à recevoir» e
   «Charges à payer» sono conti di *regolarizzazione* francesi; l'utente italiano
   che li legge come «ratei/risconti» sbaglia il senso, perché qui fanno da conto
   transitorio di collegamento fra i due eventi, non da rettifica di competenza.
3. **L'esportazione non è riutilizzabile.** Qualunque tracciato uscente da qui va
   rimappato prima di poter entrare in un gestionale italiano.
4. **L'IVA è al 20 %.** Nel campione, `vatRate` vale `0.2000` su tutte le 18 righe
   valorizzate (le altre 82 hanno `null` o `0`). `[OSSERVATO]` Il 20 % è l'aliquota
   ordinaria **francese**; l'ordinaria italiana è il 22 %, e per la somministrazione
   di alimenti e bevande l'aliquota rilevante è il 10 %. Lo scorporo osservato è
   corretto nel meccanismo (516,58 × 20 % = 103,32) e sbagliato nel parametro.
   Questo non resta confinato: i conti `445780` e `445680` sono **l'unica voce**
   dell'attivo circolante (34 494,49 €) e i due terzi dei debiti (43 646,81 € su
   66 603,11) dello stato patrimoniale del §6. Le poste patrimoniali più grandi del
   bilancio stimato sono IVA calcolata con l'aliquota di un altro Paese.

### 3.4 Altre osservazioni sulle scritture

- `letteringCode` è `null` su **tutte** le 100 righe. `[OSSERVATO]` Il *lettrage* è la
  riconciliazione partita-per-partita francese (fattura ↔ pagamento). La sua assenza
  è la causa diretta dei DSO/DPO a zero del §8.
- `auxiliaryNumber` e `auxiliaryLabel` sono `null` ovunque: **nessun sottoconto
  cliente/fornitore**. `[OSSERVATO]` Non esistono partite aperte per controparte.
- `categoryCode` è valorizzato solo sulle righe dell'evento 2 (31 su 100), con codici
  del tipo `REV-0800`: è il ponte fra la categorizzazione del flusso di cassa e il
  conto contabile. `[OSSERVATO]`
- Ordinamento predefinito: data decrescente, poi evento 1 prima di evento 2.
  `[OSSERVATO]` Le due metà della stessa operazione si trovano quindi a decine di
  righe di distanza, il che rende la lettura sequenziale poco praticabile senza
  filtrare per CARATTERI.

---

## 4. Conto economico (C/E)

### 4.1 Struttura a margini progressivi

Il tracciato è quello dei *soldes intermédiaires de gestion* francesi, tradotto solo
in parte:

```
Fatturato  (Vendita di prodotti e servizi · Variazione delle rimanenze ·
            Produzione capitalizzata · Partial Production Revenue)
Contributi in conto esercizio
Acquisti   (Materie prime · Materiali di consumo · Acquisti di merci ·
            Stock Variation · Studies & Services · Equipment & Materials ·
            Purchase Accessories · Purchase Discounts (RRR))
= Margine lordo                     % di CA
= Value Added                       % di CA
Servizi e costi esterni  (16 sottovoci)
Imposte e tasse
Costi del personale  (Retribuzioni · Oneri sociali · Altri costi del personale ·
                      Owner Compensation · Bonuses & Gratifications ·
                      Benefits in Kind)
Altri ricavi/costi operativi        % di CA
= EBITDA                            % di CA
Ammortamenti e accantonamenti · Riprese di valore · Trasferimento di costi
= Risultato operativo               % di CA
Risultato finanziario · Risultato straordinario · Imposte sul reddito
= Risultato netto                   % di CA
```

`[OSSERVATO]` A sinistra è un albero espandibile con frecce di tendenza verdi/rosse
per riga; a destra la griglia dei periodi; in alto un grafico a barre Fatturato/Costi.

Le formule delle righe calcolate sono **esposte dall'API**, non solo applicate:

| Riga | `calculationSources` |
|---|---|
| Margine lordo | `revenue + subsidies − purchases` |
| Value Added | `gross_margin − external_services` |
| EBITDA | `valeur_ajoutee − taxes − personnel_costs + other_operating` |
| Risultato netto | `operating_result + financial_result + exceptional_result − income_tax` |

`[OSSERVATO]` Il selettore in alto a sinistra dice «Standard profitti e perdite
(Trezy)» con un pulsante «+» accanto: `[DEDOTTO]` sono ammessi tracciati di C/E
personalizzati, ma non ne ho creato nessuno.

### 4.2 Opzioni di lettura

| Controllo | Valori | Note |
|---|---|---|
| Granularità | Mese · Trimestre · Semestre · Anno | `periodType` nell'URL |
| Intervallo | «gen 2026 - dic 2027» | 24 mesi, oltre l'esercizio |
| Scenario | «Scenario Principale» + pulsante di scambio | condiviso con il flusso di cassa |
| Aggregazione | **Periodo** · **Cumulativo** | valore del mese o progressivo |
| Confronto | Nessun confronto · **% dei ricavi** · **Variazione A-1** · **Confronta con la previsione** | |
| ULTIMO PERIODO EFFETTIVO | **Auto (mese corrente)** · Jun 2026 (M-2) · May 2026 (M-3) · Apr 2026 (M-4) | |

`[OSSERVATO]`

Il selettore **«ULTIMO PERIODO EFFETTIVO»** merita più attenzione di quanta ne
riceva graficamente (è un menu a tendina grigio in fondo alla colonna sinistra).
Governa **dove cade il confine fra consuntivo e stima**. Nella griglia il confine è
materializzato da una linea verticale nera sotto l'intestazione del mese, con le
diciture minuscole «Cons.» a sinistra e «Prev.» a destra; le colonne successive
assumono una tinta lilla. `[OSSERVATO]` Nell'API ogni periodo porta
`"periodType": "past" | "current" | "future"`. `[OSSERVATO]`

Perché conta: i movimenti bancari del mese in corso sono per definizione incompleti
(le fatture del mese arrivano dopo, gli addebiti a fine mese non ci sono ancora).
Un mese corrente trattato come consuntivo produce un crollo apparente di fatturato e
un margine gonfiato. Le opzioni M-2/M-3/M-4 permettono di dire «considera effettivo
solo fino a due mesi fa», che è esattamente la regola prudenziale che un
controller applicherebbe a mano. È il controllo più maturo dell'intera area, ed è
anche il più nascosto: nessun testo spiega cosa faccia, e il valore predefinito
(«Auto») è quello che produce l'artefatto. Nel dato osservato, agosto 2026 è marcato
`current` con 24 795,75 € contro i 73 341,80 € di luglio — un −66 % che è
interamente un artefatto di finestra temporale.

«Confronta con la previsione» è presente nel menu, ma
`GET /api/v2/fec/pl-forecasts/scenario/{id}` ha risposto `[]` e il campo `forecasts`
di ogni categoria è `{}`: nessuna previsione di C/E è stata immessa, quindi la
funzione è `[NON POPOLATO]`, non assente.

### 4.3 Test di additività dei periodi

**Metodo.** Sommate le 12 risposte mensili di `pl-periodic` e confrontate con la
risposta annuale di `pl` sullo stesso esercizio.

| Voce | Σ mesi | Anno | Δ |
|---|---|---|---|
| Vendite (classe 70) | 213 619,09 | 213 619,09 | 0,00 |
| Acquisti (classe 60) | 117 458,67 | 117 458,67 | 0,00 |
| Valore aggiunto | 17 977,60 | 17 977,60 | 0,00 |
| EBE | −90 735,02 | −90 735,02 | 0,00 |
| Risultato netto | −71 986,00 | −71 986,00 | 0,00 |

✔ **Test superato**, allo scarto zero. La serie mensile e il totale d'esercizio
provengono dalla stessa aggregazione. (Il fatto che il *valore aggiunto* di questo
endpoint differisca da quello mostrato nel C/E è un problema diverso, e serio: §9.3.)

Dati di periodo osservati, in euro:

| Mese 2026 | Vendite | Acquisti | Margine lordo | EBITDA (C/E) |
|---|---|---|---|---|
| maggio | 39 340,07 | 7 626,63 | 31 713,44 | 9 740,24 |
| giugno | 76 141,47 | 75 367,35 | 774,12 | −62 459,94 |
| luglio | 73 341,80 | 30 964,80 | 42 377,00 | −11 061,83 |
| agosto (parziale) | 24 795,75 | 3 499,89 | 21 295,86 | −7 010,97 |

`[OSSERVATO]` I mesi da gennaio ad aprile sono a zero: i dati bancari partono dal
**1° maggio 2026**. `[DEDOTTO]` — dal fattore di annualizzazione, §7.3.

Il profilo di giugno (acquisti 75 367 € contro un fatturato di 76 141 €, margine
lordo 774 €) è l'illustrazione del limite del metodo: un pagamento di magazzino
concentrato in un mese schiaccia il margine di quel mese, perché non esiste
competenza economica ma solo cassa. Il prodotto non lo segnala.

### 4.4 Voci non tradotte nel C/E italiano

L'albero conta **79 voci**: 60 di conto economico e 19 patrimoniali. **Trentasei
sono in inglese.** `[OSSERVATO]`

Nel blocco di conto economico ne restano non tradotte **17 su 60**:
`Partial Production Revenue`, `Stock Variation`, `Studies & Services`,
`Equipment & Materials`, `Purchase Accessories`, `Purchase Discounts (RRR)`,
`Value Added`, `Research & Studies`, `External Services Discounts (RRR)`,
`External Staff`, `Transport of Goods`, `Other External Discounts (RRR)`,
`Owner Compensation`, `Bonuses & Gratifications`, `Benefits in Kind`,
`Other Operating Income`, `Other Operating Expenses`.

Il blocco patrimoniale in coda è **integralmente non tradotto, 19 voci su 19**:
`Equity`, `Provisions`, `Loans & Financial Debt`, `Fixed Assets`,
`Intangible Assets`, `Tangible Assets`, `Assets in Progress`, `Financial Assets`,
`Asset Depreciation & Impairment`, `Inventory`, `Inventory Depreciation`,
`Suppliers`, `Customers`, `Social & Tax Liabilities`, `Employees`,
`Social Security`, `State & Local Taxes`, `Other Third Parties`, `Cash & Banks`.

Due osservazioni. La prima: `RRR` è l'acronimo francese *Rabais, Remises,
Ristournes* (sconti, abbuoni, ribassi) lasciato tale e quale — per un lettore
italiano è illeggibile. La seconda: `Value Added` è una **riga di totale**, non una
sottovoce di dettaglio, e sta in mezzo a due totali tradotti («Margine lordo»,
«EBITDA»); il difetto è quindi in piena vista. In coda all'elenco delle categorie
compaiono anche voci **patrimoniali** (`Equity`, `Fixed Assets`, `Inventory`,
`Suppliers`, `Customers`, `Cash & Banks`…) dentro l'albero del *conto economico*:
`[DEDOTTO]` servono come voci di immissione delle previsioni patrimoniali e non
dovrebbero comparire in questa lista.

---

## 5. Stato patrimoniale

Tre viste: **Storico** (serie temporale), **Bilancio generale**, **Composizione**
(grafico). Granularità Mese/Trimestre/Semestre/Anno, confronto «Nessun confronto» o
«Variazione A-1». `[OSSERVATO]`

Struttura: ATTIVO (Immobilizzazioni · Attivo circolante · Disponibilità liquide ·
TOTALE ATTIVO) e PASSIVO (Patrimonio netto · Fondi rischi · Debiti · TOTALE
PASSIVO), più una riga finale **«Controllo del saldo»**. `[OSSERVATO]`

### 5.1 Test di quadratura — **fallito**

**Metodo.** Presi i totali della vista Storico trimestrale a video e confrontati con
il campo `balanceCheck` di `estimated-accounting/balance-sheet-batch`. La quadratura
di uno stato patrimoniale richiede TOTALE ATTIVO = TOTALE PASSIVO, cioè uno scarto
di zero.

| Trimestre 2026 | TOTALE ATTIVO | TOTALE PASSIVO | «Controllo del saldo» |
|---|---:|---:|---:|
| T1 | — | — | — |
| T2 | 28 955,06 | −6 017,16 | **34 972,22** |
| T3 | 43 048,68 | −5 382,89 | **48 431,57** |
| T4 | 43 048,68 | −5 382,89 | **48 431,57** |

✘ **Test fallito.** «Controllo del saldo» è la *differenza* attivo − passivo, e vale
48 431,57 € su un totale attivo di 43 048,68 €: **lo sbilancio è pari al 112 % del
totale dell'attivo**. Il passivo è per giunta negativo. Lo scarto non è un
arrotondamento e non si riassorbe: cresce da T2 a T3 e poi resta.

A video la riga è mostrata **in rosso**, con accanto una freccia di tendenza verde,
senza alcun testo che dica che quel numero dovrebbe essere zero. `[OSSERVATO]`
Un utente non contabile legge «Controllo del saldo: 48 432» come un dato, non come
un errore. Il prodotto espone la propria quadratura — scelta rara e corretta — e
poi non le assegna un significato.

### 5.2 Perché non quadra

La causa è strutturale, non un difetto di calcolo, ed è visibile nel rendiconto
finanziario (`cash-flow-statement`, endpoint che **non ha una UI raggiungibile**):

```json
"netChangeInCash": -51284.47,
"openingCash": 0,
"closingCash": -2852.90,
"reconciliation": { "calculatedChange": -51284.47,
                    "actualChange": -2852.90,
                    "difference": -48431.57,
                    "isReconciled": false }
```

`[OSSERVATO]` `openingCash: 0` e `isReconciled: false`. Lo scarto −48 431,57 € è
**identico** al `balanceCheck` dello stato patrimoniale.

`[DEDOTTO]` La contabilità stimata parte da zero al primo movimento importato.
Non esistono saldi di apertura: nessun conto di classe 1 (capitale sociale, riserve,
utili a nuovo) è valorizzato, `Share Capital`, `Reserves`, `Retained Earnings` e
`Net Income (B/S)` sono tutti a 0 e l'unico componente del patrimonio netto è la
riga calcolata `P&L Result` = −71 986,00 €. Di conseguenza:

- ciò che è etichettato «Disponibilità liquide» non è un **saldo** ma un **saldo di
  movimenti**: −2 852,90 €, mentre il saldo bancario reale dei tre conti alla stessa
  data è +31 140,40 € (verificato altrove);
- ciò che è etichettato «Stato patrimoniale» è, nella sostanza, un prospetto delle
  *variazioni* patrimoniali del periodo osservato;
- lo sbilancio è la contropartita mancante dei saldi iniziali, e non può che
  esistere finché non si immette un'apertura.

Non è un difetto riparabile senza cambiare le fonti: da un estratto conto non si
ricava il capitale sociale. Il problema non è che il numero non quadri — è
inevitabile — ma che la voce si chiami «Stato patrimoniale» e il numero che denuncia
il problema si chiami «Controllo del saldo» invece di «Sbilancio da saldi di
apertura mancanti».

---

## 6. Pareggio (break-even)

Quattro riquadri in testa, un grafico ricavi/costi con il punto di intersezione, un
riquadro «Insight aziendale» e un pulsante **«Modifica classificazioni»** in alto a
destra per assegnare le categorie a fisso o variabile. `[OSSERVATO]`

| Riquadro | Valore | Colore a video |
|---|---|---|
| PUNTO DI PAREGGIO | 371 870,72 € | rosso |
| MARGINE DI SICUREZZA | −158 251,63 € (−74,1 %) | rosso |
| RISULTATO OPERATIVO | −70 792,50 € | rosso |
| PUNTO MORTO | **176 giorni** | **verde** |

### 6.1 Test del punto di pareggio — superato

**Metodo esplicito.** Dai valori restituiti da `estimated-accounting/breakeven`:

```
ricavi              R = 213 619,09
costi variabili     V = 118 058,436
costi fissi         F = 166 353,154
costi totali            284 411,59      (= F + V, ✔)

quota costi variabili   V / R           = 0,552658641…
margine di contribuzione 1 − V/R        = 0,447341359…  (44,734 %)
BEP = F / (1 − V/R) = 166 353,154 / 0,447341359 = 371 870,7217733134
```

**Valore mostrato dall'app: 371 870,72177331336.** ✔ **Test superato**, con
coincidenza fino alla dodicesima cifra decimale (lo scarto residuo è
rappresentazione in virgola mobile, non arrotondamento contabile).

Coerenti anche le grandezze derivate:

| Grandezza | Formula | Calcolo | Mostrato |
|---|---|---|---|
| Margine di sicurezza | R − BEP | −158 251,63 | −158 251,63 |
| Margine di sicurezza % | (R − BEP) / R | −74,08 % | −74,1 % |
| «al di sotto del pareggio» | (BEP − R) / BEP | 42,56 % | 42,6 % |
| Risultato operativo | R − costi totali | −70 792,50 | −70 792,50 |

La ripartizione fisso/variabile è restituita per classe PCG e mostra che la
classificazione **non** è per conto ma più fine:

| Classe | Fissi | Variabili | Totale |
|---|---:|---:|---:|
| 60 Acquisti | 7 276,87 | 110 181,80 | 117 458,67 |
| 61 Servizi esterni | 48 182,54 | 3 066,19 | 51 248,73 |
| 62 Altri servizi | 5 392,25 | 3 612,45 | 9 004,70 |
| 63 Imposte e tasse | 19 109,59 | 0 | 19 109,59 |
| 64 Personale | 89 603,03 | 0 | 89 603,03 |
| 65 Altri oneri | 1 403,89 | 1 198,00 | 2 601,89 |

`[OSSERVATO]` Lo stesso conto può contribuire a entrambe le colonne: la
classificazione avviene a livello di **categoria** dell'utente, non di conto, ed è
modificabile dal pulsante «Modifica classificazioni». Le classi 61, 63 e 64 valgono
da sole il 91,8 % dei costi fissi. Il personale è integralmente fisso — scelta
discutibile per la ristorazione, dove una quota consistente è variabile con la
stagionalità, ma è una scelta che l'utente può correggere.

Un'avvertenza sulla lettura della tabella: le sue colonne **non** sommano ai
riquadri. Σ fissi per classe = 170 968,17 € contro `fixedCosts` 166 353,15 €, e
Σ totali per classe = 289 026,61 € contro «Costi totali effettivi» 284 411,59 €.
Lo scarto è in entrambi i casi **4 615,02 €**, cioè ancora gli altri ricavi
operativi (§9.2, caso A): il break-even li porta in detrazione dei costi fissi anziché in
aumento dei ricavi. La scelta è difendibile, ma rende la ripartizione per classe
non riconciliabile a occhio con i totali mostrati. `[OSSERVATO]`

### 6.2 Il punto morto «176 giorni» — `[OSSERVATO]`, due basi di ricavo in una schermata

Il briefing lasciava «176 giorni» come `[IPOTESI]` non risolta, avendo provato la
formula canonica *365 × BEP / ricavi* che sui ricavi della stessa schermata dà
**635 giorni**. La questione è ora chiusa: **la formula è quella canonica; è la base
a essere un'altra**, e quella base non appartiene alla schermata Pareggio.

Il valore si trova, al centesimo, nel payload della **Valutazione**:

```
POST /api/v2/fec/valuation/calculate
  result.methods[0].parameters.revenue = 771 989,78
```

`[OSSERVATO]` Verifica: `365 × 371 870,72 / 771 989,78 = 175,82` → **176 giorni**. ✔

#### Che cosa è quella grandezza

L'identità è esatta, non approssimata. La risposta dei KPI porta un campo assente da
quella del break-even:

```
annualizationFactor = 3,613861386138614      (in estimated-accounting/kpis)
365 / 3,613861386138614 = 101,0 giorni esatti
```

`[OSSERVATO]` Da cui:

```
213 619,09 × 365 / 101 = 771 989,780693069306930693…
payload  parameters.revenue = 771 989,7806930693
```

La coincidenza corre per tutte le sedici cifre che un numero in doppia precisione
può portare, e la sequenza periodica `069306930693` è la firma aritmetica di una
divisione per 101. `[OSSERVATO]` La grandezza è dunque il **fatturato del C/E
annualizzato**: `revenue.sales.amount` rapportato da 101 a 365 giorni. Non è un
aggregato diverso di cassa: un totale di entrate comprensivo di giroconti e apporti
soci non riprodurrebbe per caso sedici cifre di una divisione per 101.

`[DEDOTTO]` I 101 giorni sono l'ampiezza della finestra di dati: 101 giorni prima del
10 agosto 2026 cade il 1° maggio 2026, che è precisamente il primo mese con movimenti
nel C/E (§4.3).

Il punto morto è quindi la definizione francese classica di *point mort* — «quanti
giorni di attività, al ritmo di ricavo osservato, servono per cumulare il fatturato
di pareggio» — applicata correttamente, ma su una base che non compare in nessun
punto della schermata in cui il risultato viene stampato. Il campo `date` che
dovrebbe tradurre i 176 giorni in una data di calendario vale `null`, e a video
compare un trattino sotto il numero. `[OSSERVATO]`

#### Il rilievo: due basi di ricavo nella stessa schermata

Dentro la sola scheda Pareggio convivono **due basi di ricavo diverse**, presentate
come parti della stessa analisi:

- il **punto di pareggio** e tutte le grandezze che ne discendono sono calcolati su
  **213 619,09 €**;
- il **punto morto** stampato nel quarto riquadro, a dieci centimetri di distanza, è
  calcolato su **771 989,78 €** — **3,6 volte tanto**.

Il quadro completo delle basi di ricavo in circolazione nell'area:

| Endpoint | Campo | Valore | Chi lo usa |
|---|---|---|---|
| `estimated-accounting/pl` | `revenue.sales.amount` | 213 619,09 € | conto economico (Fatturato) |
| `estimated-accounting/pl` | `revenue.totalRevenue.amount` | 218 234,11 € | Dashboard, KPI |
| `estimated-accounting/breakeven` | `revenue` | 213 619,09 € | punto di pareggio |
| `fec/valuation/calculate` | `parameters.revenue` | **771 989,78 €** | valutazione **e punto morto** |

`[OSSERVATO]`

Il confine passa fra **due famiglie di endpoint**: tutta l'area Prestazioni sta sotto
`estimated-accounting/`, mentre la valutazione sta sotto `fec/` — il prefisso del
*Fichier des Écritures Comptables*, il formato francese di export contabile (§2).
Gli unici due endpoint `fec/` osservati sono `fec/valuation/calculate` e
`fec/pl-forecasts/scenario/{id}`. `[OSSERVATO]` `[DEDOTTO]` Fra le due famiglie il
valore dei ricavi **non viene riconciliato**: sono due motori con due convenzioni,
e la scheda Pareggio è il punto in cui l'uno pesca dall'altro senza conversione.

#### La contraddizione che ne risulta a schermo

I 176 giorni dicono che, al ritmo attuale, il pareggio si raggiunge **prima di metà
anno** — e coerentemente 771 990 € di ricavi annualizzati superano ampiamente il BEP
di 371 871 €. I tre riquadri accanto dicono l'opposto: margine di sicurezza −74,1 %,
«Sei 42,6 % al di sotto del pareggio». Nessuna delle due letture è sbagliata sulla
propria base; affiancate sono incompatibili. L'effetto visivo peggiora il problema:
«176 giorni» è **verde**, i tre riquadri accanto sono **rossi**. `[OSSERVATO]`
L'utente vede una rassicurazione e tre allarmi, sulla stessa riga, sugli stessi dati.

### 6.3 L'insight testuale

> 📉 **Sei 42,6 % al di sotto del pareggio**
> *Insight aziendale* — Hai bisogno di 158 251,63 € in più di ricavi (aumento del
> 74,1 %) per raggiungere il punto di pareggio. Concentrati sull'aumento delle
> vendite o sulla riduzione dei costi.

`[OSSERVATO]` Va riconosciuto per quello che fa bene: traduce tre numeri in una
frase, quantifica lo sforzo in euro *e* in percentuale, e mette il consiglio sopra
la tabella anziché sotto. È generato da modello di frase, non da IA — i numeri sono
esattamente quelli calcolati, la struttura è fissa. `[DEDOTTO]`

Il limite è che la seconda metà («Concentrati sull'aumento delle vendite o sulla
riduzione dei costi») non contiene informazione: è vera per definizione in ogni
situazione sotto il pareggio. I dati per dire qualcosa di specifico ci sono già —
il `costBreakdown` per classe mostra che l'89 % dei costi fissi sta in tre classi, e
il personale da solo vale 89 603 € — ma non vengono usati.

---

## 7. Valutazione

Valore d'impresa stimato con metodo dei multipli, quattro riquadri in testa,
riepilogo con intervallo, analisi di sensibilità, matrice 2D, metodologie e ipotesi.
Un pulsante «Impostazioni» apre i parametri del modello (non toccati).

| Riquadro | Valore |
|---|---|
| VALORE D'IMPRESA (2026) | 772 K€ |
| INDEBITAMENTO NETTO | 51 284 € |
| VALORE DEL PATRIMONIO | 720,7 K€ |
| EV/EBITDA | — |

`[OSSERVATO]` Il riepilogo mostra tre cartelle — INTERVALLO BASSO (rosso), MEDIA
PONDERATA (blu), GAMMA ALTA (verde) — con lo **stesso identico valore, 772 K€**:
la forma grafica promette un intervallo che non c'è.

### 7.1 Come è costruito il numero

La configurazione restituita da `POST /api/v2/fec/valuation/calculate`:

```json
"config": { "name": "Default", "industryPreset": "custom",
  "netAssetsWeight": 20, "revenueMultipleWeight": 30,
  "ebitdaMultipleWeight": 50, "dcfWeight": 0,
  "evSalesMultiple": 1, "evEbitdaMultiple": 6,
  "dcfDiscountRate": 0.1, "dcfTerminalGrowthRate": 0.02,
  "dcfProjectionYears": 5, "dcfRevenueGrowthRate": 0.05,
  "sensitivityRange": 0.2 }
```

Il modello prevede quattro metodi (attivo netto 20 %, multiplo dei ricavi 30 %,
multiplo dell'EBITDA 50 %, DCF 0 %). Quello che **effettivamente** restituisce è uno
solo:

```json
"methods": [ { "method": "Revenue Multiple (1.0x)", "weight": 100,
               "value": 771989.78, "parameters": { "revenue": 771989.78 } } ]
```

`[OSSERVATO]` I tre metodi non calcolabili sono stati **scartati in silenzio** e il
peso è stato rinormalizzato a 100 % sull'unico superstite. `[DEDOTTO]` Il metodo
EBITDA cade perché l'EBITDA è negativo, quello dell'attivo netto perché il
patrimonio netto è negativo (−71 986 €), il DCF perché ha peso 0 per configurazione.
Nessun messaggio informa l'utente che il modello che sta leggendo non è quello
configurato: la scheda «Metodologie» mostra un solo blocco al 100 % senza dire
perché gli altri tre siano spariti.

**Il valore dei ricavi usato non è quello osservato.** `revenue: 771 989,78` è il
fatturato **annualizzato** (213 619,09 × 365/101 = 771 989,78 — §6.2), e altrettanto
lo è l'EBITDA del pannello Ipotesi (−70 792,50 × 3,613861 = −255 834 ≈ «−255,8 K€»).
`[OSSERVATO]` È **lo stesso campo** che alimenta il «punto morto» della scheda
Pareggio: `parameters.revenue` esce da qui e viene stampato là, dove tutto il resto
poggia su 213 619,09 € (§6.2). Quindi:

```
Enterprise Value = ricavi annualizzati × EV/Sales 1,0x = 771 989,78 €
Equity Value     = 771 989,78 − indebitamento netto 51 284,47 = 720 705,31 €
```

✔ L'aritmetica torna. Ma poggia su due basi fragili: **101 giorni di dati moltiplicati
per 3,61** (in un settore stagionale: maggio-agosto è alta stagione per la
ristorazione, e annualizzare l'alta stagione sovrastima), e un **indebitamento netto
di 51 284,47 € che è esattamente la cifra che l'app stessa dichiara non riconciliata**
(§5.2, `calculatedChange: -51284.47`, `isReconciled: false`). La cassa reale è
positiva per 31 140,40 €: qui l'impresa viene valutata come se avesse 51 284 € di
debito netto quando ha 31 140 € di liquidità. Il valore del patrimonio è
sottostimato di circa 82 000 €, cioè dell'11 %.

### 7.2 Analisi di sensibilità e matrice 2D

Il pannello mostra un tornado con quattro variabili e un ranking d'impatto:

| # | Variabile | Impatto ±20 % |
|---|---|---:|
| 1 | EV/Sales Multiple | 308 795,91 € |
| 2 | EV/EBITDA Multiple | 0 € |
| 3 | Discount Rate | 0 € |
| 4 | Revenue Growth | 0 € |

`[OSSERVATO]` La matrice 2D (EV/EBITDA × EV/Sales, 5 × 5) è **costante lungo le
righe**: tutte e cinque le righe riportano la stessa sequenza
617,6 / 694,8 / 772 / 849,2 / 926,4 K€.

**Distinzione fra limite di dato e limite di prodotto.** Il briefing attribuiva
l'impatto nullo al fatto che sia disponibile un solo esercizio. I dati dicono
qualcosa di più preciso, e la distinzione conta:

- **Limite di dato**: l'EV/EBITDA non morde perché l'EBITDA è negativo e il metodo
  è stato scartato. Con un EBITDA positivo tornerebbe a pesare per il 50 %. Questo
  si risolve da sé quando l'azienda migliora.
- **Limite di configurazione**: Discount Rate e Revenue Growth non mordono perché
  `dcfWeight: 0` — il DCF è disattivato nel modello predefinito, quindi i suoi due
  parametri sono inerti *per qualunque azienda*, non solo per questa. Restano però
  in cima al tornado e nel ranking, con impatto 0 €.
- **Limite di prodotto**: mostrare una matrice 2D il cui asse verticale è per
  costruzione inerte, e un ranking in cui tre voci su quattro valgono zero, senza
  una riga di spiegazione. Il modello **gira correttamente**; è il livello di
  presentazione che non sa dire «questa variabile non influisce, ecco perché».

Va detto per correttezza: il tornado a video riporta anche le etichette −84 838 € e
+169,8 K€ come estremi degli scenari, e il ranking è ordinato per impatto
decrescente — quindi la struttura analitica è corretta e ben costruita. Il difetto
non è la matematica.

### 7.3 `[FUORI SCALA]` — argomentazione

Marco la scheda Valutazione **`[FUORI SCALA]`** per il caso d'uso di una PMI della
ristorazione, con tre argomenti e una riserva.

1. **La domanda non si pone quasi mai.** Il valore d'impresa serve in cessione,
   ingresso di soci, ricapitalizzazione, perizie. Sono eventi che un ristorante
   affronta una volta ogni molti anni, non in un cruscotto consultato ogni settimana.
2. **La qualità del dato non regge la domanda.** Una valutazione seria richiede
   almeno tre esercizi normalizzati, rettifiche sul compenso dell'imprenditore, il
   trattamento dell'immobile e dell'avviamento/licenza. Qui ci sono 101 giorni di
   estratto conto annualizzati, un patrimonio netto negativo per costruzione (§5.2)
   e un indebitamento netto non riconciliato. Il rischio non è che il numero sia
   impreciso: è che sia **preciso a sette cifre e privo di fondamento** — «772 K€»
   ha l'aspetto di un risultato, non di una stima.
3. **Il multiplo predefinito non è calibrato sul settore.** `industryPreset:
   "custom"` con EV/Sales 1,0x, mentre l'account dichiara `sector: "food"`. Per la
   ristorazione indipendente 1,0× i ricavi è generalmente alto. Il prodotto conosce
   il settore e non lo usa. `[OSSERVATO]` per la configurazione, `[IPOTESI]` per il
   giudizio sul multiplo.

**Riserva.** «Fuori scala» non significa «mal fatto». Questa è la scheda tecnicamente
più curata dell'area: metodi multipli pesati, scarto automatico dei metodi non
calcolabili, tornado ordinato, matrice bidimensionale, disclaimer esplicito
(«Queste valutazioni sono stime basate sui parametri configurati e non devono essere
considerate come valori definitivi»). È lavoro da strumento di corporate finance,
messo davanti a un pubblico che ha bisogno di sapere se questo mese paga i
fornitori. `[DEDOTTO]` È plausibile che serva a un segmento diverso da quello a cui
Trezy si rivolge in Italia — o che sia un residuo del prodotto FEC d'origine.

---

## 8. KPI

Venti indicatori in cinque famiglie, con tre colonne: CORRENTE · PRECEDENTE ·
VS PRECEDENTE. In testa: «BASATO SU données estimées (transactions bancaires)» e
«1 esercizi disponibili • 20/20 KPIs». Confronto selezionabile fra «Periodo
precedente», «Storia» e «Seleziona date di confronto». `[OSSERVATO]`

| Famiglia | Indicatori | Valori osservati |
|---|---|---|
| **R** Redditività | Margine Lordo · Margine Lordo % · EBITDA · Margine EBITDA % · Margine Operativo · Margine Netto · Margine Netto % | 96 160 € · 45,0 % · −70 793 € · −32,4 % · −70 793 € · −71 986 € · −33,0 % |
| **L** Liquidità | Corrente · Immediata · Secca | −0,38 · −0,38 · −1,17 |
| **B** Capitale circolante | Capitale Circolante · Fabbisogno di CC · Liquidità Netta | −60 437 € · — · −51 284 € |
| **A** Attività | DSO · DPO · DIO · Ciclo di conversione | 0 · 0 · 0 · 0 giorni |
| **S** Solvibilità | Debito/Patrimonio · Indebitamento · Capitalizzazione | 0,00 · 0,0 % · 13,4 % |

### 8.1 Confronti vuoti — `[NON POPOLATO]`

**Tutte e venti** le righe hanno «—» nelle colonne PRECEDENTE e VS PRECEDENTE.
`[OSSERVATO]` La causa è dichiarata dall'app stessa: «1 esercizi disponibili». Con un
solo esercizio non esiste un periodo precedente da confrontare. È `[NON POPOLATO]`,
non un difetto: il meccanismo esiste (c'è il selettore «Seleziona date di
confronto»), manca la storia. Va però notato che la tabella dedica **due colonne su
tre** a un confronto che non può esistere, e che il conteggio «20/20 KPIs» suggerisce
completezza mentre due terzi della griglia sono vuoti.

### 8.2 DSO, DPO e DIO a zero giorni

Non è un caso limite, è una conseguenza necessaria dell'architettura. Dai valori
grezzi restituiti dall'API: `receivables: 0`, `payables: 0`, `inventory: 0`.

Perché sono zero:

1. **Nessun credito e nessun debito commerciale.** Nello stato patrimoniale
   `Trade Receivables` (41x) e `Trade Payables` (40x) valgono 0 e non hanno alcun
   conto associato: `"accountNumbers": []`. `[OSSERVATO]` I movimenti bancari
   transitano dai conti ponte 468860/468870 (§3.1), che si azzerano nello stesso
   giorno perché `paymentDelayDays` è 0. Non nasce mai una partita aperta.
2. **Nessuna riconciliazione fattura-pagamento.** `letteringCode` è `null` su tutte
   le scritture (§3.4). Senza collegare la fattura al pagamento non si può misurare
   quanti giorni siano passati fra i due. `[OSSERVATO]`
3. **Nessun magazzino.** Un estratto conto non contiene rimanenze: `Inventory` = 0
   e la classe 3 non ha conti. Il DIO non è calcolabile per costruzione.

Il ciclo di conversione del contante (DSO + DIO − DPO) eredita gli zeri e vale 0.
Il problema di presentazione è che «0 giorni» **si legge come una misura eccellente**
— incasso immediato, magazzino a rotazione infinita — mentre significa «non
misurabile». Il campo «Fabbisogno di Capitale Circolante» sulla stessa schermata usa
invece «—» per dire la stessa cosa: due convenzioni opposte per lo stesso stato di
dato mancante, nella stessa tabella.

### 8.3 I KPI usano il valore di cassa non riconciliato

Verifica sui `rawValues`:

```
currentAssets = -16 789,98   currentLiabilities = 43 646,81
cash          = -51 284,47   → cashRatio = -51 284,47 / 43 646,81 = -1,17499 ✔
```

Ma lo stato patrimoniale, sugli stessi dati e sulla stessa data, dichiara
disponibilità liquide **−2 852,90 €**. La differenza fra i due (−48 431,57 €) è
esattamente lo sbilancio del §5.2. `[OSSERVATO]`

`[DEDOTTO]` I KPI adottano il `calculatedChange` del rendiconto — cioè il valore che
l'API marca `isReconciled: false` — anziché il saldo effettivo dei conti. Lo stesso
valore alimenta l'indebitamento netto della Valutazione (§7.1). Un errore noto al
sistema si propaga così a tre schede su sette senza mai essere segnalato.
Conseguenza pratica: gli indici di liquidità sono tutti negativi e tutti sbagliati.
Un ristorante con 31 140 € sul conto vede «Indice di Liquidità Secca −1,17».

---

## 9. Incoerenze verificate

Ogni riga è stata ricontrollata sui corpi di risposta prima di essere riportata.
Gravità: **alta** = induce a una decisione sbagliata · **media** = confonde ma è
ricostruibile · **bassa** = difetto di forma.

### 9.1 Quadro d'assieme

| # | Incoerenza | Dove appare | Valori | Gravità |
|---|---|---|---|---|
| 1 | Stato patrimoniale non quadra | Stato Patrimoniale › Storico, riga «Controllo del saldo»; API `balanceCheck` | sbilancio 48 431,57 € su 43 048,68 € di attivo | **alta** |
| 2 | Cassa con due valori | Stato Patrimoniale (−2 852,90 €) vs KPI «Liquidità Netta» e Valutazione «Indebitamento netto» (−51 284,47 €) | Δ 48 431,57 € | **alta** |
| 3 | EBITDA con due valori | Dashboard › Indicatori chiave (−90 735 €) vs KPI e C/E (−70 793 €) | Δ 19 942,52 € | **alta** |
| 4 | Punto morto vs margine di sicurezza | Pareggio, stessa riga di riquadri | 176 giorni (verde) vs −74,1 % (rosso) | **alta** |
| 5 | Margine lordo che non arriva a schermo | Dashboard › Indicatori chiave, «Gross Profit» | 0 € mostrato, 96 160,42 € disponibile nei KPI | **alta** |
| 6 | «Ricavi» designa due grandezze diverse — *ambiguità di etichetta, non errore* | Dashboard e Cascata P&L (218 234,11 €) vs C/E «Fatturato», Pareggio e KPI (213 619,09 €) | Δ 4 615,02 €, entrambi corretti | bassa |
| 7 | Cascata P&L che non somma | Dashboard › Cascata P&L | le barre danno −68 190,6, la barra EBE mostra −90 735,0 | media |
| 8 | Aliquota IVA 20 % | scritture, `vatRate: 0.2000` | ordinaria IT 22 %, ristorazione 10 % | media |
| 9 | Piano dei conti francese su account «Italia» | Registrazioni | `IT_CUSTOM` dichiarato, PCG usato | media |
| 10 | Intervallo di valutazione non è un intervallo | Valutazione › Riepilogo | basso = medio = alto = 772 K€ | bassa |
| 11 | «0 giorni» e «—» per lo stesso significato | KPI › Attività e Capitale circolante | DSO/DPO/DIO = 0; Fabbisogno di CC = — | bassa |
| 12 | Localizzazione incompleta | tutte le schede | 36 voci su 79 dell'albero C/E in inglese, cascata P&L in francese | bassa |

### 9.2 Distinguere le grandezze diverse dai difetti veri

Non tutto ciò che a schermo appare come «due numeri per la stessa cosa» è un errore.
Tre casi vanno separati, perché richiedono risposte diverse.

**Caso A — grandezze diverse, entrambe corrette, etichette identiche.** È il caso dei
ricavi. `estimated-accounting/pl` restituisce **due campi distinti**:
`revenue.sales.amount` = 213 619,09 € (le vendite, classe 70) e
`revenue.totalRevenue.amount` = 218 234,11 € (i ricavi totali). La differenza,
4 615,02 €, sono gli altri ricavi operativi. `[OSSERVATO]` Conto economico e
break-even usano le vendite; Dashboard e KPI usano i ricavi totali. **Entrambe le
scelte sono difendibili** — il pareggio va calcolato sul fatturato caratteristico, un
cruscotto di sintesi può ragionevolmente mostrare il totale dei proventi operativi.
Il difetto residuo è solo di **denominazione**: all'utente arrivano entrambi come
«Ricavi»/«Revenue», senza un qualificatore che li distingua e senza una nota. È
un'ambiguità di etichetta, non un errore di calcolo, e si corregge cambiando due
stringhe. Gravità bassa.

**Caso B — grandezze diverse con scarto tollerabile.** Il margine lordo dei KPI
(`kpis.profitability.grossMargin` = 96 160,42 €) e quello del break-even
(`breakeven.grossProfit` = 95 560,65 €) differiscono di **599,77 €**, cioè lo 0,6 %.
Lo scarto è interamente spiegato: il primo è *ricavi − acquisti di classe 60*, il
secondo *ricavi − costi variabili*, e i costi variabili eccedono la classe 60 di
esattamente 599,766 € perché attingono anche alle classi 61, 62 e 65 (§6.1). Sono due
definizioni legittime e vicine; tollerabile.

**Caso C — un valore che semplicemente non arriva a schermo.** La Dashboard mostra
**«Gross Profit 0 €»**. Qui non esiste alcuna terza definizione che giustifichi lo
zero: il valore è calcolato e disponibile in due endpoint su tre, e il riquadro di
sintesi — il primo che un utente guarda — ne mostra uno inesistente. È un difetto
vero, e per gravità è il peggiore dei tre perché *zero* non si legge come «dato
mancante» ma come «non guadagni nulla sul venduto».

### 9.3 Le tre incoerenze economiche vere hanno una radice sola

I punti 3 e 7 della tabella non sono difetti indipendenti: discendono da **due
definizioni incompatibili di Valore Aggiunto** che convivono in due endpoint diversi.

**Definizione A** — nella griglia del C/E (`pl-hierarchical`, formula esposta):

```
Valore Aggiunto = Margine lordo − Servizi esterni
                = (213 619,09 − 117 458,67) − 60 253,43 = 35 906,99 €
EBITDA          = VA − imposte − personale + altri operativi
                = 35 906,99 − 19 109,59 − 89 603,03 + 2 013,13 = -70 792,50 €
```

**Definizione B** — nel blocco `imb` (*soldes intermédiaires*) di `pl`, che alimenta
la Dashboard:

```
valeurAjoutee = 17 977,60 €
EBE           = 17 977,60 − 19 109,59 − 89 603,03 = -90 735,02 €
```

Lo scarto fra i due valori aggiunti è **17 929,39 €**, che è esattamente il valore
assoluto del campo `imb.margeCommerciale` = −17 929,39 €. `[OSSERVATO]`
`[DEDOTTO]` La definizione B calcola il valore aggiunto sommando *marge commerciale*
e *production de l'exercice* e sottraendo i consumi, ma la marge commerciale qui è
negativa e viene di fatto conteggiata due volte; la definizione A non la usa affatto.
Ne discende lo scarto di 19 942,52 € fra i due EBITDA, entrambi etichettati
«EBITDA» in italiano, a due schede di distanza.

Sulla stessa radice il **punto 7**: nella cascata P&L della Dashboard le barre
mostrate sono CA 218 234,1 · Achats −117 458,7 · Personnel −89 603,0 ·
Charges ext. −60 253,4 · Impôts & taxes −19 109,6, la cui somma è **−68 190,6**;
la barra EBE che le chiude mostra **−90 735,0**. `[OSSERVATO]` Un grafico a cascata
che non si chiude sui propri addendi: il totale di apertura viene dalla definizione
dei ricavi totali, il totale di chiusura dalla definizione B del valore aggiunto, e
le barre intermedie da nessuna delle due.

Le etichette della cascata, per inciso, sono **in francese** su una schermata
italiana — CA, Achats, Personnel, Charges ext., Impôts & taxes, EBE, Amort., Rés.
Expl., Financier, Exceptionnel, **IS** (*impôt sur les sociétés*), Résultat Net — e
così pure il riquadro «Struttura patrimoniale» («Créances fiscal…»,
«Immobilisations…»). Il titolo della scheda è invece in inglese: «Synthesis
Dashboard». Tre lingue in una schermata. `[OSSERVATO]`

---

## 10. Debolezze e limiti osservati

1. **Lo stato patrimoniale non quadra e il prodotto lo sa.** Sbilancio di
   48 431,57 € su 43 048,68 € di attivo, esposto come «Controllo del saldo» in rosso
   senza dire che dovrebbe essere zero, e `isReconciled: false` nel rendiconto.
   Un utente non contabile non ha modo di capire che sta guardando un prospetto che
   non chiude.

2. **L'errore noto si propaga invece di essere fermato.** Il valore di cassa che
   l'app dichiara non riconciliato (−51 284,47 €) alimenta gli indici di liquidità
   dei KPI e l'indebitamento netto della Valutazione. Tre schede su sette mostrano
   numeri derivati da una grandezza che il sistema ha già marcato inattendibile. Un
   controllo che non blocca nulla a valle vale poco.

3. **Il margine lordo non arriva al riquadro di sintesi.** La Dashboard mostra
   «Gross Profit 0 €» mentre il valore, 96 160,42 €, è calcolato e disponibile. È
   l'unico dei presunti «doppi valori» che non abbia dietro una grandezza diversa a
   giustificarlo, ed è il più dannoso, perché uno zero non si legge come dato
   mancante ma come margine nullo.

4. **Lo stesso nome per grandezze diverse, senza qualificatore.** «EBITDA» vale
   −90 735 € o −70 793 € a seconda della scheda — e qui le due definizioni sono
   davvero incompatibili (§9.3). «Ricavi» vale 218 234 € o 213 619 €, ma in questo
   caso si tratta di due grandezze entrambe corrette (vendite contro ricavi totali):
   il difetto è di etichetta, si corregge con due stringhe, e va tenuto distinto dal
   precedente.

5. **Il punto morto è calcolato su una base che non appartiene alla sua schermata.**
   Nella scheda Pareggio il pareggio poggia su 213 619,09 € e il punto morto stampato
   accanto su 771 989,78 €, il fatturato annualizzato che arriva dal motore di
   valutazione sotto `fec/`. Le due famiglie di endpoint — `estimated-accounting/` e
   `fec/` — non riconciliano il valore dei ricavi, e il risultato sono quattro
   riquadri affiancati in cui uno verde rassicura e tre rossi allarmano sugli stessi
   dati.

6. **Il piano dei conti francese sotto una configurazione italiana.** L'utente
   sceglie «Italia — Personalizzato» e ottiene 512100/706000/445780 con giornali BQ,
   VE, AC, OD e denominazioni in francese. Nessun raccordo con il bilancio del
   commercialista, nessun tracciato riutilizzabile.

7. **L'IVA al 20 % contamina le poste patrimoniali più grandi.** Non è solo un
   parametro sbagliato: i conti IVA sono il 100 % dell'attivo circolante e il 66 %
   dei debiti del bilancio stimato. Per la ristorazione l'aliquota rilevante è il
   10 %, quindi l'errore è di oltre il doppio.

8. **Annualizzazione implicita e non dichiarata.** Il fattore 3,61 (101 giorni →
   365) non compare in nessun punto dell'interfaccia. La Valutazione mostra «RICAVI
   (ESERCIZIO) 772 K€» quando i ricavi osservati sono 213 619 €. Nessun testo avvisa
   che si tratta di un'estrapolazione, né che il periodo estrapolato (maggio-agosto)
   è l'alta stagione di un'attività stagionale.

9. **Il mese corrente è trattato come consuntivo per impostazione predefinita.**
   Agosto mostra 24 796 € contro i 73 342 € di luglio: un −66 % che è solo il mese
   incompleto. Lo strumento per correggerlo esiste ed è ottimo («ULTIMO PERIODO
   EFFETTIVO», M-2/M-3/M-4), ma è un menu grigio senza etichetta esplicativa e il
   valore predefinito è quello che produce l'artefatto.

10. **Localizzazione a tre lingue.** 36 voci su 79 dell'albero del C/E in inglese —
   17 righe di conto economico (fra cui una riga di *totale*, «Value Added», e
   l'acronimo francese RRR non sciolto) e tutte e 19 le voci patrimoniali — la
   cascata P&L interamente in francese, il titolo della Dashboard in inglese
   («Synthesis Dashboard»), l'etichetta della fonte dei KPI in francese.

11. **Zero e «non misurabile» sono resi allo stesso modo.** DSO/DPO/DIO a «0
    giorni» si leggono come prestazioni eccellenti; significano che il dato non
    esiste. Nella stessa tabella «Fabbisogno di Capitale Circolante» usa «—» per lo
    stesso stato.

12. **Metodi di valutazione scartati in silenzio.** Tre metodi su quattro spariscono
    e il peso viene rinormalizzato al 100 % sul superstite, senza avviso. Il tornado
    resta popolato di variabili con impatto 0 € e la matrice 2D resta costante lungo
    una dimensione: l'utente vede un'analisi che sembra ricca ed è degenere.

13. **Il rendiconto finanziario esiste e non è raggiungibile.**
    `estimated-accounting/cash-flow-statement` restituisce un prospetto completo per
    aree (operativa, investimenti, finanziamento) con la riconciliazione. Nessuna
    delle sette schede lo mostra. È l'unico punto in cui il prodotto direbbe
    all'utente che i conti non tornano, ed è l'unico che non ha interfaccia.

14. **Registrazioni poco navigabili.** Le due metà della stessa operazione (evento 1
    e evento 2) sono ordinate separatamente e finiscono a decine di righe di
    distanza; il campo che le lega si chiama «CARATTERI» e mostra otto cifre
    esadecimali senza spiegazione. Non esistono sottoconti per controparte, quindi
    non si può interrogare il partitario di un fornitore.

---

## 11. Cosa non è stato valutabile

| Elemento | Stato | Motivo |
|---|---|---|
| Confronti «vs periodo precedente» dei 20 KPI | `[NON POPOLATO]` | un solo esercizio disponibile; il meccanismo esiste |
| «Confronta con la previsione» nel C/E | `[NON POPOLATO]` | `fec/pl-forecasts/scenario/{id}` ha risposto `[]`; nessuna previsione di C/E immessa |
| «Variazione A-1» in C/E e Stato Patrimoniale | `[NON POPOLATO]` | nessun esercizio 2025 |
| Comportamento con un FEC reale caricato | `[NON VERIFICABILE]` | avrebbe richiesto di caricare un file e scrivere sull'account |
| Esistenza di un piano dei conti italiano funzionante | `[NON VERIFICABILE]` | cambiare `accountingStandardCode` è una scrittura sull'account |
| Effetto dei «termini di pagamento» sulla sfasatura E1/E2 | `[NON VERIFICABILE]` | `paymentDelayDays` = 0 su tutto il campione; nessun termine configurato |
| Pannello «Modifica classificazioni» del Pareggio | `[NON ACCESSIBILE]` | non aperto per non alterare la ripartizione fisso/variabile |
| Pannello «Impostazioni» della Valutazione | `[NON ACCESSIBILE]` | non aperto per non alterare i multipli |
| Pannello «Filtri» delle Registrazioni | `[NON ACCESSIBILE]` | non aperto |
| Quadratura dare/avere sull'intera popolazione | parziale | l'endpoint è paginato a 100; testate 100 righe su 3 368 (2,97 %) |
| Esportazione (pulsante «Esporta» sulla Dashboard) | `[NON VERIFICABILE]` | non attivata; formati non noti |
| «Aggiungi blocco» sulla Dashboard | `[NON VERIFICABILE]` | non attivato; catalogo dei blocchi non noto |
| Rendiconto finanziario | `[NON ACCESSIBILE]` da UI | l'endpoint risponde, nessuna scheda lo espone |
| Formula esatta dell'aliquota IVA per categoria | `[IPOTESI]` | osservato `vatRate: 0.2000`; non verificato se sia configurabile per categoria e se il settore la sovrascriva |
| Formula e base del `pointMort` | **risolto**, non più `[IPOTESI]` | formula canonica `365 × BEP / ricavi`; base = `fec/valuation/calculate` → `parameters.revenue` = 771 989,78 €, identica a `sales × 365/101` per sedici cifre (§6.2) |
| *Perché* le due famiglie di endpoint non riconcilino i ricavi | `[DEDOTTO]` | l'assenza di conversione fra `estimated-accounting/` e `fec/` è inferita dai valori, non da documentazione o codice |
| Comportamento del punto morto con più di un esercizio | `[NON VERIFICABILE]` | con due esercizi il fattore di annualizzazione varrebbe 1 e la discrepanza sparirebbe; non testabile su questo account |

---

*Documento redatto l'11 agosto 2026 sui dump di sessione e sulle tracce API della
stessa data. Ogni cifra riportata è ricontrollabile nei corpi di risposta di
`estimated-accounting/*` e `fec/valuation/calculate`.*
