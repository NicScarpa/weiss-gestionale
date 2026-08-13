# Area funzionale — Modulo Retail

Rotte `/retail/*` · endpoint `/api/retail/*` · etichetta di menu «Modulo Retail»
Stato: **bloccato da addon a pagamento**, funzionalità mai usate.
Ricostruito integralmente dalla **guida in-app** e dal dizionario delle
etichette, entrambi contenuti nel bundle JavaScript servito pubblicamente.
Rilevazione: 11 agosto 2026.

---

## 1. Come è stato documentato senza attivarlo

`[OSSERVATO]` Aprendo `/retail/dashboard` compare un blocco a tutta schermata:
«Attiva retail — Questa sezione richiede l'addon retail. Attivalo dalla pagina
abbonamento per accedere a queste funzionalità».

`[OSSERVATO]` L'addon **non compare nel listino pubblico**: sia
`/api/public/billing/addons` sia il catalogo in `/api/billing/me/active-addons`
restituiscono soltanto `f24_facile` e `reminders`. Non esiste quindi un prezzo
pubblicato né un modo di acquistarlo da solo.

`[OSSERVATO]` Il testo generico del blocco addon, estratto dal dizionario del
bundle, chiarisce il punto: «Questa funzionalità richiede l'attivazione di un
componente aggiuntivo nel tuo abbonamento. Puoi attivarlo dalla pagina
abbonamento **oppure contattare il tuo riferimento commerciale** per maggiori
informazioni.»

`[DEDOTTO]` Il modulo Retail è venduto su trattativa commerciale, non in
autonomia dall'applicazione. Questo scioglie l'ipotesi lasciata aperta in
precedenza.

### La fonte usata
Il prodotto include una **«Guida Completa»** in-app (`/help`) che documenta 88
schermate, una per una, con descrizione, funzionamento, elenco dei campi, delle
colonne, delle azioni e dei suggerimenti. Il contenuto è incorporato nel bundle
JavaScript, che viene servito integralmente a ogni visitatore.

`[OSSERVATO]` Le sette schermate del modulo Retail sono documentate lì per
esteso, con tutte le etichette italiane. Copia integrale della guida estratta in
`assets/cashking/export/guida-in-app-estratta-dal-bundle.txt`.

**Nota di condotta.** Il modulo non è stato usato: nessuna funzionalità
eseguita, nessun dato letto dalle sue API. Una sonda si è limitata a rilevare il
codice di stato HTTP degli endpoint per capire dove sia applicato il controllo
di autorizzazione — vedi capitolo 10 — senza leggerne le risposte.

---

## 2. Le sette schermate `[OSSERVATO]`

Etichette esatte dal dizionario del bundle:

| Chiave | Etichetta di menu | Rotta |
|---|---|---|
| `retailDashboard` | Dashboard Retail | `/retail/dashboard` |
| `retailDailySales` | Incassi Giornalieri | `/retail/daily-sales` |
| `retailDeposits` | Versamenti Contanti | `/retail/deposits` |
| `retailOperators` | Operatori POS | `/retail/operators` |
| `retailSettlements` | Accrediti Attesi | `/retail/settlements` |
| `retailReconciliation` | Riconciliazione | `/retail/reconciliation` |
| `retailForecast` | Previsioni | `/retail/forecast` |
| `retailCashRegister` | Registro di Cassa | `/retail/cash-register` |

---

## 3. Il ciclo che il modulo modella `[DEDOTTO]`

Le schermate compongono un ciclo chiuso che parte dalla cassa e arriva
all'estratto conto:

```
Incassi Giornalieri  →  contanti  →  Versamenti Contanti  →  movimento bancario
        (chiusura Z)                    (distinta)                    ↑
              ↓                                                       │
        elettronico  →  Accrediti Attesi  →  accredito netto  ────────┘
                        (lordo − commissioni)         ↑
                                                Operatori POS
                                            (commissioni, tempi)
```

con **Riconciliazione Retail** a chiudere il cerchio e **Previsioni di Vendita**
ad alimentare il previsionale di cassa.

---

## 4. Incassi Giornalieri — il libro cassa digitale `[OSSERVATO]`

Descrizione dichiarata: «Registrazione chiusure di cassa (Z-report) e incassi
giornalieri».

Dalla guida: è «il tuo libro cassa digitale. Ogni sera, quando chiudi la cassa,
registri qui i totali del giorno». Il funzionamento descritto: si inseriscono gli
importi **lordi** suddivisi per metodo di pagamento, si può specificare il
dettaglio degli operatori POS (chiamato *tender split*), e una volta verificati i
dati si **finalizza la giornata** per bloccarla da modifiche accidentali. Una
giornata finalizzata può essere **riaperta**.

### Campi
| Chiave | Etichetta | Descrizione dichiarata |
|---|---|---|
| `businessDate` | Data Lavorativa | Il giorno lavorativo a cui si riferisce la chiusura |
| `cashGross` | Incasso Contanti Lordo | Totale in contanti, IVA inclusa |
| `cardGross` | Incasso Carte Lordo | Totale incassato con carte |
| `otherGross` | Altri Incassi Lordo | |
| `notes` | Note | |

### Colonne della tabella
Data · Contanti · **Elettronico** · Altro · Totale · Stato

`[DEDOTTO]` Nella tabella la colonna si chiama «Elettronico» mentre il campo di
inserimento si chiama «Incasso Carte Lordo»: la lettura usa il termine più
ampio, l'inserimento quello più concreto.

### Azioni
Aggiungi Giornata · Modifica Giornata · **Finalizza Giornata** · **Riapri
Giornata** · Elimina Giornata · **Gestisci Dettaglio POS**

`[DEDOTTO]` Il ciclo finalizza/riapri è un blocco morbido: protegge dal
sovrascrivere per sbaglio una giornata verificata, senza renderla immutabile.
È la scelta giusta per un dato che ogni tanto va corretto davvero.

### Suggerimenti mostrati nella guida
- «Registra gli incassi ogni sera alla chiusura: più sei puntuale, più le
  riconciliazioni saranno facili.»
- «Usa il dettaglio POS (tender split) per sapere esattamente quanto aspettarti
  da ogni operatore POS.»
- «Finalizza le giornate dopo averle verificate per evitare modifiche
  accidentali ai dati confermati.»

---

## 5. Operatori POS `[OSSERVATO]`

Descrizione: «Configurazione operatori e acquirer POS». La guida li chiama «i
servizi che gestiscono i pagamenti con carta nel tuo negozio (Nexi, SumUp,
Axerve, ecc.)» e li paragona a «un elenco dei tuoi esattori digitali».

| Chiave | Etichetta | Nota |
|---|---|---|
| `name` | Nome Operatore | esempi citati: Nexi, SumUp, Axerve |
| `settlementPolicy` | Politica di Accredito | giornaliero, settimanale, mensile |
| `feePercentBps` | Commissione Percentuale | espressa in **punti base** |
| `feeFixedCents` | Commissione Fissa per Transazione | espressa in **centesimi** |
| `feeMonthly` | Canone Mensile | |
| `bankAccountId` | Conto di Accredito | |
| `active` | Attivo | |

`[OSSERVATO]` La struttura delle commissioni ha tre componenti simultanee:
percentuale, fissa per transazione e canone mensile. È esattamente come sono
fatti i contratti degli acquirer reali.

`[DEDOTTO]` Memorizzare la percentuale in punti base e la quota fissa in
centesimi evita gli errori di arrotondamento tipici dei decimali in virgola
mobile su migliaia di micro-transazioni. È una scelta di modellazione corretta.

Suggerimento nella guida: «Se cambi operatore POS, disattiva il vecchio e crea
il nuovo: così mantieni lo storico degli accrediti passati.» `[DEDOTTO]` Il
flag `active` serve proprio a non rompere lo storico.

---

## 6. Accrediti Attesi — il pezzo più interessante `[OSSERVATO]`

Descrizione: «Tracciamento degli accrediti POS attesi sul conto corrente».
La guida: «la lista dei soldi che i tuoi operatori POS devono accreditarti in
banca. Come un elenco di assegni in attesa di essere incassati.»

**Funzionamento dichiarato:** il sistema **genera automaticamente** gli accrediti
attesi a partire dagli incassi giornalieri e dalla configurazione degli operatori
(commissioni e politica di accredito). Ogni accredito mostra l'importo lordo, le
commissioni stimate e il netto atteso.

### Colonne
Data Prevista · Operatore · **Periodo Coperto** · Lordo · Commissioni · **Netto
Atteso** · Stato

### Azioni e stati
Genera Accrediti · **Segna come Contabilizzato** · **Segna Eccezione** ·
Visualizza Dettaglio · Filtra per Stato

`[OSSERVATO]` I motivi di eccezione previsti sono sei, enumerati nella guida:
**Mancante · Importo diverso · Data diversa · Duplicato · Commissione cambiata ·
Parziale**.

`[DEDOTTO]` È il cuore del modulo. Il problema che risolve è concreto e
fastidioso: l'acquirer accredita in ritardo, o al netto di commissioni diverse
da quelle pattuite, o accorpa più giornate. Senza un atteso calcolato non te ne
accorgi. Con un atteso calcolato, la differenza salta fuori da sola.

Suggerimento nella guida: «Usa le eccezioni per segnalare accrediti con importo
diverso dal previsto: ti aiuterà a **negoziare le commissioni** con
l'operatore.» `[DEDOTTO]` La funzione non è solo contabile: produce le prove per
rinegoziare il contratto.

---

## 7. Versamenti Contanti `[OSSERVATO]`

Descrizione: «Gestione lotti di versamento contanti in banca». La guida: «il
registro dei tuoi viaggi in banca con i contanti della cassa».

| Chiave | Etichetta | Nota |
|---|---|---|
| `depositDate` | Data Versamento | |
| `totalCash` | Importo Totale | |
| `bankAccountId` | Conto Bancario | conto di destinazione |
| `reference` | Riferimento | «il numero della distinta di versamento bancaria» |
| `notes` | Note | |

Flusso: si crea il versamento, e quando compare sull'estratto conto lo si segna
come **«Depositato»**.

`[DEDOTTO]` Il campo Riferimento agganciato al numero di distinta è ciò che
rende verificabile l'abbinamento col movimento bancario.

---

## 8. Riconciliazione Retail e Previsioni di Vendita `[OSSERVATO]`

### Riconciliazione Retail
«Abbinamento movimenti bancari con incassi e versamenti retail», descritta come
«il momento della verità». Si sceglie il mese, il sistema mostra i movimenti
bancari ancora da abbinare accanto agli accrediti POS e ai versamenti contanti
del periodo, e si abbina manualmente.

`[OSSERVATO]` Qui l'abbinamento è dichiaratamente **manuale**, mentre esiste
l'endpoint `/api/retail/reconciliation/suggestions`.
`[IPOTESI]` Le proposte automatiche esistono nel servizio ma la guida descrive
solo il flusso manuale, oppure la guida è indietro rispetto al codice.

### Previsioni di Vendita
«Modelli di previsione vendite per il retail», descritte come «la tua sfera di
cristallo per il punto vendita».

| Chiave | Etichetta | Descrizione dichiarata |
|---|---|---|
| `name` | Nome Modello | esempi: «Previsione Standard», «Modello Stagionale» |
| `method` | Metodo di Calcolo | media mobile, media ponderata, regressione |
| `weekdayWeights` | **Pesi Giorni Settimana** | |

Più **aggiustamenti manuali** per eventi speciali: saldi, festività, chiusure.

`[OSSERVATO]` La guida motiva i pesi con un esempio esplicito: «tenendo conto
dei diversi pesi dei giorni della settimana (il sabato vendi di più del
martedì?)».

`[DEDOTTO]` È il modello minimo sensato per la ristorazione e il commercio al
dettaglio: la stagionalità settimanale domina, e senza pesi per giorno una media
mobile produce previsioni sistematicamente sbagliate su weekend e giorni di
chiusura.

---

## 9. Registratore di Cassa: non esiste ancora `[OSSERVATO]`

La guida è esplicita:

> Il Registratore di Cassa è una funzionalità **in fase di sviluppo** che ti
> permetterà di integrare direttamente il registratore di cassa del tuo punto
> vendita con CashKing. Questa funzionalità sarà disponibile in un prossimo
> aggiornamento. Nel frattempo, puoi utilizzare le Vendite Giornaliere per
> registrare manualmente gli incassi del punto vendita.

`[DEDOTTO]` L'integrazione automatica col registratore di cassa **non c'è**: la
rotta `/retail/cash-register` esiste ma la funzione è annunciata, non
consegnata. Gli incassi vanno inseriti a mano ogni sera.

Questo ridimensiona molto il modulo: non è un collegamento al registratore
fiscale, è un **libro cassa digitale con calcolo degli accrediti POS attesi**.
Il che resta utile, ma è un'altra cosa.

`[OSSERVATO]` Nella guida la schermata è chiamata «Vendite Giornaliere» mentre
nel menu è «Incassi Giornalieri»: due nomi per la stessa cosa.

---

## 10. Il blocco non è applicato lato server `[OSSERVATO]`

Sonda limitata al solo codice di stato HTTP, con la sessione dell'account trial:

| Endpoint | Stato |
|---|---|
| `/api/fiscal/f24` | **403** |
| `/api/fiscal/installments/pending-for-cashflow` | **403** |
| `/api/retail/dashboard/kpis` | **200** |
| `/api/retail/z-reports` | **200** |
| `/api/retail/operators` | **200** |
| `/api/reminders/settings` | **200** |

`[DEDOTTO]` Il controllo di autorizzazione non è uniforme. Il modulo fiscale è
protetto anche dal servizio; Retail e Promemoria sono bloccati **solo
nell'interfaccia**, e le loro API rispondono a un account che non ha l'addon.

Per un prodotto che vende quei moduli separatamente è un problema di ricavi,
non solo di sicurezza.

---

## 11. Cosa ne ricaviamo

Questo è il modulo più vicino al nostro caso d'uso, ed è utile soprattutto come
**modello concettuale già validato** da chi vende a PMI italiane.

| Idea | Perché conta | Come la realizzeremmo |
|---|---|---|
| Accredito POS atteso calcolato da incasso e contratto | Rende visibile la differenza fra quanto l'acquirer doveva accreditare e quanto ha accreditato | Entità `PosOperator` con `settlementPolicy`, `feePercentBps`, `feeFixedCents`, `feeMonthly`; job che genera gli attesi dagli incassi giornalieri |
| Sei motivi di eccezione codificati | Trasforma «non torna» in un dato analizzabile e in argomenti per rinegoziare | Enum Prisma: mancante, importo diverso, data diversa, duplicato, commissione cambiata, parziale |
| Commissioni in punti base e centesimi | Evita errori di arrotondamento su molte micro-transazioni | Campi interi, mai float |
| Finalizza / Riapri la giornata | Protegge il dato verificato senza renderlo immutabile | Campo `finalizedAt` più azione di riapertura tracciata |
| Versamento con numero di distinta | Il riferimento è ciò che rende verificabile l'abbinamento col movimento bancario | Campo `reference` obbligatorio sul versamento |
| Pesi per giorno della settimana nella previsione | Nella ristorazione la stagionalità settimanale domina tutto il resto | Sette pesi sul modello di previsione, più aggiustamenti per evento |
| Disattivare l'operatore invece di cancellarlo | Mantiene leggibile lo storico quando si cambia acquirer | Flag `active`, mai eliminazione fisica |

**Da non imitare:** annunciare in interfaccia una schermata «Registratore di
Cassa» che non fa nulla e rimanda all'inserimento manuale. Una rotta che esiste
e non funziona costa più fiducia di una funzione assente.
