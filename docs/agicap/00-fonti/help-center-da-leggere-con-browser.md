# Centro assistenza Agicap — cosa leggere col browser in Fase 1

Piano di recupero della fonte bloccata. Preparato l'11 agosto 2026 dal subagente `fase0-help`.
Documento gemello: `docs/agicap/00-fonti/help-center.md` (cosa si è potuto ricostruire senza browser).

---

## Premessa operativa

`help.agicap.com` è un centro assistenza **Intercom** su dominio custom, pubblico, senza login, che però risponde 404/403 a qualunque client non-browser. Con un browser reale, a ritmo umano, è leggibile normalmente.

**Tre cose da sapere prima di partire.**

1. **Schema degli URL**: `https://help.agicap.com/{locale}/collections/{id}-{slug}` e `https://help.agicap.com/{locale}/articles/{id}-{slug}`. Locale attestati: `it`, `en`, `de`. `fr` ed `es` sono probabili ma non verificati.
2. **Gli ID sono globali e stabili fra le lingue**: lo stesso articolo ha lo stesso ID in italiano, inglese e tedesco, cambia solo lo slug. Su Intercom l'URL con il solo ID di solito redirige allo slug corretto — quindi `https://help.agicap.com/it/articles/10038431` dovrebbe portare alla versione italiana di un articolo di cui conosco solo lo slug inglese. **Da verificare al primo tentativo**: se il redirect non funziona, la versione italiana si raggiunge dal selettore di lingua dentro la pagina inglese.
3. **La cosa più preziosa da fare per prima non è leggere un articolo, è catturare l'indice**: aprire la radice italiana e fotografare l'elenco completo delle collezioni con il numero di articoli di ciascuna. È il pezzo che manca a tutta l'analisi. Cinque minuti lì valgono più di un'ora di articoli presi a caso.

**Marcatura**: tutto ciò che segue con l'etichetta `[NON VERIFICATO]` è noto solo come titolo e URL dai risultati dei motori di ricerca. Non ho letto quei contenuti e la colonna «perché lo voglio» è **la mia motivazione**, non una descrizione di ciò che l'articolo dice.

**Dove mettere il bottino**: un file per articolo in `assets/agicap/materiali-pubblici/help-<tema>.md`, URL e data in testa, testo grezzo sotto; poi aggiornare `assets/agicap/materiali-pubblici/help-centro-assistenza-indice.md` con le URL nuove.

---

## A. Punti di ingresso — da fare per primi

| # | URL | Titolo | Collezione | Perché lo voglio | Priorità |
|---|---|---|---|---|---|
| A1 | `https://help.agicap.com/it/` | radice italiana | — | L'indice completo delle collezioni italiane con il conteggio articoli: è il buco centrale di tutta la fase 0 | **Alta** |
| A2 | `https://help.agicap.com/it/collections` | elenco collezioni | — | Fallback se la radice mostra solo le collezioni «in evidenza» | **Alta** |
| A3 | `https://help.agicap.com/en/` | radice inglese | — | L'inglese è quasi sempre il superinsieme: articoli non ancora tradotti in italiano compaiono solo qui | **Alta** |
| A4 | `https://help.agicap.com/fr/` | radice francese `[NON VERIFICATO]` | — | Agicap è francese: la documentazione più vecchia e più completa è probabilmente qui | **Alta** |
| A5 | `https://help.agicap.com/de/` | radice tedesca | — | Attestata; utile per confronto quando un articolo esiste solo in DE | Media |
| A6 | `https://help.agicap.com/es/` | radice spagnola `[NON VERIFICATO]` | — | Completezza della mappa; ultimo in ordine di utilità | Bassa |

---

## B. Articoli e collezioni con URL già accertata

Tutte le righe di questa tabella sono `[NON VERIFICATO — solo titolo e URL dai motori di ricerca]`: esistono, ma non ne ho letto il contenuto.

| # | URL | Titolo (come compare nei risultati) | Collezione | Perché lo voglio | Priorità |
|---|---|---|---|---|---|
| B1 | `https://help.agicap.com/en/articles/10038431-what-is-the-uncategorized-category-and-how-can-it-help-you` | What is the 'Uncategorized' Category and How Can It Help You? | non nota | Come tratta i movimenti che l'IA non sa classificare: è la coda di lavoro che dovremo avere anche noi | **Alta** |
| B2 | `https://help.agicap.com/it/articles/10038431` | versione italiana della stessa `[da verificare il redirect]` | — | Etichetta italiana ufficiale di «Uncategorized», che ora non conosciamo | **Alta** |
| B3 | `https://help.agicap.com/de/articles/10037980-wie-man-einen-vorgang-in-agicap-aufteilt` | Wie man einen Vorgang in Agicap aufteilt | non nota | Split di un'operazione su più categorie: tocca esattamente la nostra allocazione pro-quota | **Alta** |
| B4 | `https://help.agicap.com/it/articles/10037980` | versione italiana dello split `[da verificare il redirect]` | — | Lessico italiano dello split e dei vincoli sull'importo residuo | **Alta** |
| B5 | `https://help.agicap.com/it/articles/10038456-cos-e-l-ocr-e-come-puo-aiutarti` | Cos'è l'OCR e Come Può Aiutarti? | non nota | Unico articolo italiano accertato; quali campi estrae l'OCR e cosa fa quando sbaglia | **Alta** |
| B6 | `https://help.agicap.com/en/collections/10349191-cashflow-table` | Cashflow Table (collezione) | radice | Collezione intera dedicata alla tabella dei flussi: è la vista centrale del prodotto | **Alta** |
| B7 | `https://help.agicap.com/en/articles/10038284-how-to-synchronize-payments-and-cash-positioning-for-cash-pooling-in-agicap` | How to Synchronize Payments and Cash Positioning for Cash Pooling in Agicap? 💡 | non nota | Dai frammenti emergono «Banks & Integration», «Settings > Bank Accounts (ebics)» e il permesso «Prepare payments»: è la finestra migliore sul modello utenti/conti | Media |
| B8 | `https://help.agicap.com/de/collections/1856195-mit-agicap-anfangen` | Mit Agicap anfangen | radice | La collezione di onboarding storica: che cosa fanno fare a un cliente nuovo, nell'ordine | Media |
| B9 | `https://help.agicap.com/it/collections/1856195` | versione italiana dell'onboarding `[da verificare]` | — | Stesso contenuto in italiano, per il lessico dell'onboarding | Media |
| B10 | `https://help.agicap.com/de/articles/10216798-so-erstellen-sie-ihr-agicap-zahlungskonto` | So erstellen Sie Ihr Agicap-Zahlungskonto | non nota | Conto di pagamento interno: capire se è un vero IBAN e chi lo emette | Bassa |
| B11 | `https://help.agicap.com/de/articles/8074146-datev-belegtransfer-fur-erfolgreiche-datenubermittlung-vorbereiten` | ➡️ DATEV Belegtransfer für erfolgreiche Datenübermittlung vorbereiten | non nota | `[FUORI SCALA]` — contabilità tedesca; utile solo come modello di export verso un consulente | Bassa |
| B12 | `https://help.agicap.com/it/articles/10038284` | versione italiana del cash pooling `[da verificare]` | — | `[FUORI SCALA]` sul cash pooling, ma le etichette italiane dei permessi servono | Bassa |

---

## C. Ricerche interne al centro assistenza

La ricerca interna di Intercom è raggiungibile dalla lente in alto nella pagina; l'URL diretta dovrebbe essere `https://help.agicap.com/it/?q=TERMINE` — **formato da verificare al primo uso**. Se la ricerca italiana restituisce poco, ripetere lo stesso termine su `/en/` e `/fr/`: il corpus tradotto è quasi sempre un sottoinsieme.

Per ogni termine, l'obiettivo è **raccogliere i titoli e le URL degli articoli restituiti** e poi aprire quelli pertinenti.

### C1. Come calcolano — massima priorità

| # | Ricerca | Perché lo voglio | Priorità |
|---|---|---|---|
| C1.1 | `previsione` / `forecast` / `prévision` | Il cuore: come costruiscono la curva previsionale e da quali fonti | **Alta** |
| C1.2 | `saldo previsionale` / `projected balance` | Se il saldo previsto sia saldo banca + impegni o abbia una logica sua | **Alta** |
| C1.3 | `scostamento` / `variance` / `écart` | Formula dello scostamento: assoluto, percentuale, cumulato, e rispetto a quale versione del piano | **Alta** |
| C1.4 | `riconciliazione` / `reconciliation` / `rapprochement` | Regole di matching: quali campi, quali tolleranze, cosa succede ai parziali | **Alta** |
| C1.5 | `suggerimento` / `suggestion` / `matching` | I «suggerimenti automatici tra operazioni pagate e impegnate»: da dove escono e con quale ordinamento | **Alta** |
| C1.6 | `confidenza` / `confidence` / `score` | Se esista un punteggio di confidenza esposto all'utente e da quale soglia in su applicano in automatico | **Alta** |
| C1.7 | `DSO` | Quale delle due formule usano davvero nel prodotto e su quale finestra temporale | **Alta** |
| C1.8 | `DPO` / `Cash Conversion Cycle` | Stesse domande sul lato passivo | Media |
| C1.9 | `13 settimane` / `13 weeks` | Come costruiscono l'orizzonte a 13 settimane e cosa ci mettono dentro | **Alta** |
| C1.10 | `categorizzazione automatica` / `automatic categorization` | Come apprende il modello, se impara dalle correzioni e con quale ritardo | **Alta** |
| C1.11 | `ricorrenza` / `recurring` / `récurrent` | Come riconoscono un movimento ricorrente e come lo proiettano in avanti | **Alta** |
| C1.12 | `data attesa` / `expected date` / `date prévue` | Se stimino la data di incasso reale o si fermino alla scadenza di fattura: per noi è la decisione più delicata | **Alta** |
| C1.13 | `arrotondamento` / `rounding` / `tolerance` | La tolleranza sugli importi nel matching, se è documentata | Media |
| C1.14 | `runway` / `burn` | Definizione esatta del runway che pubblicano nei report | Media |

### C2. Configurazione — rivela campi ed entità del modello dati

| # | Ricerca | Perché lo voglio | Priorità |
|---|---|---|---|
| C2.1 | `regola` / `rule` / `règle` | La grammatica delle regole: campi confrontabili, operatori, priorità, retroattività | **Alta** |
| C2.2 | `categoria` / `category` | Struttura del piano delle categorie: gerarchia, entrate/uscite, categorie di sistema | **Alta** |
| C2.3 | `scenario` | Come si crea uno scenario: duplicazione del piano, versioning, confronto | **Alta** |
| C2.4 | `budget` | Se il budget sia per categoria e periodo, e come si carica | **Alta** |
| C2.5 | `piano` / `plan` / `cashflow plan` | Che oggetto è un «piano»: quante versioni, chi le blocca | **Alta** |
| C2.6 | `alert` / `avviso` / `notifica` | Tipi di alert, soglie configurabili, canali | **Alta** |
| C2.7 | `permessi` / `permissions` / `ruoli` / `roles` | Il modello dei ruoli: sappiamo solo che esiste «Prepare payments» | **Alta** |
| C2.8 | `richiesta di accesso` / `access request` | La voce «Demandes d'accès» vista nello screenshot: come funziona il flusso di richiesta | Media |
| C2.9 | `entità` / `entity` | Che cosa è un'entità, come si separano i dati fra entità, cosa è condiviso | Media |
| C2.10 | `tag` / `etichetta` | Se esista una dimensione di classificazione trasversale alle categorie | Media |
| C2.11 | `centro di costo` / `cost center` | Come modellano i centri di costo e se sono una dimensione o una categoria | **Alta** |
| C2.12 | `IVA` / `VAT` / `TVA` | Se e come gestiscono l'IVA nel previsionale, che per noi è una voce di cassa vera | **Alta** |
| C2.13 | `import` / `importazione` / `Excel` | Formato dei file di import, colonne attese, gestione degli errori | **Alta** |
| C2.14 | `contatto` / `cliente` / `fornitore` | Anagrafiche: che campi hanno e come si legano ai movimenti | Media |

### C3. Connessioni bancarie e import dei dati

| # | Ricerca | Perché lo voglio | Priorità |
|---|---|---|---|
| C3.1 | `collegare banca` / `connect a bank` | La procedura reale di collegamento, passo per passo, con i suoi limiti | **Alta** |
| C3.2 | `PSD2` / `riautenticazione` / `re-authentication` | Ogni quanto scade il consenso e cosa vede l'utente quando scade: è il costo nascosto di ogni aggregatore | **Alta** |
| C3.3 | `sincronizzazione` / `frequenza` / `aggiornamento` | Quante volte al giorno aggiornano davvero e cosa fa un aggiornamento manuale | **Alta** |
| C3.4 | `EBICS` | Cosa cambia fra canale EBICS e aggregazione: dati, ritardi, costi | Media |
| C3.5 | `CBI` | Il canale italiano: quali banche, quale attivazione | Media |
| C3.6 | `camt` / `MT940` / `estratto conto` | Formati di estratto conto importabili e campi che ne estraggono | **Alta** |
| C3.7 | `duplicato` / `duplicate` | Come evitano il doppio conteggio quando un movimento arriva da due canali | **Alta** |
| C3.8 | `conto esterno` / `external account` | Come modellano un conto che non si può collegare: per noi è il caso della cassa contanti | **Alta** |
| C3.9 | `saldo iniziale` / `opening balance` | Da dove parte il saldo quando si collega un conto e come si corregge | **Alta** |
| C3.10 | `storico` / `history` / `quanti mesi` | Quanta storia recuperano al primo collegamento: determina quanto in fretta il previsionale diventa utile | Media |

### C4. Il resto della mappa

| # | Ricerca | Perché lo voglio | Priorità |
|---|---|---|---|
| C4.1 | `fattura` / `invoice` | Ciclo di vita di una fattura dentro Agicap e stati che le assegnano | **Alta** |
| C4.2 | `scadenzario` / `échéancier` / `ageing` | Come costruiscono lo scadenzario e con quali fasce di scaduto | **Alta** |
| C4.3 | `sollecito` / `dunning` / `relance` | Configurazione dei piani di sollecito: quanti livelli, quali attese, quali condizioni di uscita | Media |
| C4.4 | `pagamento` / `distinta` / `payment batch` | Preparazione delle distinte e regole di firma singola o doppia | Media |
| C4.5 | `mobile` / `app` / `notifiche push` | Cosa si può fare davvero da telefono: per il nostro personale di sala conta | Media |
| C4.6 | `esporta` / `export` / `Excel` | Formati e granularità degli export | Media |
| C4.7 | `onboarding` / `iniziare` / `primi passi` | La sequenza guidata del primo accesso | Media |
| C4.8 | `API` | Se il centro assistenza documenti API oltre a quelle del portale sviluppatori | Media |
| C4.9 | `MCP` / `AI` / `assistente` | Come descrivono all'utente finale le funzioni AI e i loro limiti | Media |
| C4.10 | `errore` / `problema` / `non vedo` | Gli articoli di troubleshooting: raccontano i punti dove il prodotto rompe davvero | **Alta** |
| C4.11 | `prezzo` / `fatturazione` / `abbonamento` | Solo se compare: incrocia il lavoro dell'agente pricing | Bassa |
| C4.12 | `cash pooling` | `[FUORI SCALA]` — leggere solo se avanza tempo | Bassa |
| C4.13 | `consolidamento` / `valuta` | `[FUORI SCALA]` — idem | Bassa |
| C4.14 | `debito` / `finanziamento` / `EURIBOR` | `[FUORI SCALA]` — idem | Bassa |

---

## Se il tempo è poco: le dieci righe che conservo

A1, A3, B1, B3, B5, B6, C1.1, C1.4, C2.1, C3.2.

Con queste dieci si porta a casa l'indice, la vista centrale del prodotto, il trattamento dei movimenti non classificati, lo split, l'OCR, il motore previsionale, il matching, la grammatica delle regole e il costo di manutenzione delle connessioni bancarie. Tutto il resto è completamento della mappa.
