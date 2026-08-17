# Trezy — Analisi competitiva

Analisi condotta l'**11 agosto 2026** su account di **produzione** con dati reali
WEISS, piano **Premium in prova** (39 €/mese). Metodo: `docs/analisi-competitiva/METODO.md`.

> **Isolamento.** Questi documenti descrivono Trezy e basta. Non contengono
> confronti con altri concorrenti né con il nostro gestionale: il confronto è
> materia della sessione di sintesi comparata, che legge questi file.

---

## Come leggere

| Documento | Contenuto | Quando serve |
|---|---|---|
| [`00-ricognizione-pubblica.md`](00-ricognizione-pubblica.md) | Sintesi delle fonti pubbliche | Inquadramento rapido |
| [`00a-sito-e-pricing.md`](00a-sito-e-pricing.md) | Sito, feature dichiarate, piani, matrice del gating | Cosa vendono e a quanto |
| [`00b-knowledge-base-e-api.md`](00b-knowledge-base-e-api.md) | Documentazione utente, changelog, API pubbliche | Come dicono che funziona |
| [`00c-demo-casi-studio-mercato.md`](00c-demo-casi-studio-mercato.md) | Demo, casi studio, recensioni | Percezione di mercato |
| [`01-inventario-rotte.md`](01-inventario-rotte.md) | Mappa dell'app, rotte accessibili e non, architettura, stato del dataset | **Da leggere per primo** |
| [`02-aree-funzionali/`](02-aree-funzionali/) | Cinque approfondimenti d'area | Il corpo dell'analisi |
| [`03-modello-dati.md`](03-modello-dati.md) | Entità, campi, relazioni, diagramma ER | Per ragionare sul nostro modello |
| [`04-logiche-di-calcolo.md`](04-logiche-di-calcolo.md) | Formule dichiarate e **tredici test svolti** con esito | Il documento più denso |
| [`04b-comportamenti-nel-tempo.md`](04b-comportamenti-nel-tempo.md) | Alert, notifiche, ricalcoli, e i limiti della finestra disponibile | Leggere le avvertenze |
| [`05-analisi-ux.md`](05-analisi-ux.md) | Pattern di interfaccia, con traduzione nel nostro stack | Il più azionabile nel breve |

### Aree funzionali

| File | Copre |
|---|---|
| [`02-01-cashflow-previsioni-scenari.md`](02-aree-funzionali/02-01-cashflow-previsioni-scenari.md) | Tabella pivot, previsioni, scenari, casella di posta, IVA |
| [`02-02-documenti-scadenzario-riconciliazione.md`](02-aree-funzionali/02-02-documenti-scadenzario-riconciliazione.md) | Fatture, aging, anagrafiche, riconciliazione, acquisizione via email |
| [`02-03-transazioni-categorizzazione.md`](02-aree-funzionali/02-03-transazioni-categorizzazione.md) | Movimenti, categorie, regole di classificazione, connessioni bancarie |
| [`02-04-performance-precontabilita.md`](02-aree-funzionali/02-04-performance-precontabilita.md) | Bilancio stimato, partita doppia automatica, break-even, valutazione, KPI |
| [`02-05-piattaforma-impostazioni-reporting.md`](02-aree-funzionali/02-05-piattaforma-impostazioni-reporting.md) | Impostazioni, permessi, integrazioni, notifiche, reporting, assistente AI |

---

## Tre avvertenze per chi userà questi documenti

**1. Lo storico è corto.** Dieci mesi di movimenti, un solo esercizio, zero
previsioni inserite, zero regole di classificazione. Tutto ciò che riguarda
previsioni, confronti anno su anno e indicatori di ciclo descrive il comportamento
del prodotto **in condizioni di dati insufficienti**. Nei documenti la distinzione
è marcata con `[NON POPOLATO]`: rispettarla è essenziale, perché scambiare un'area
non alimentata per una funzione mancante falserebbe l'intera sintesi.

**2. L'osservazione nel tempo non c'è stata.** La prova scadeva il 12 agosto alle
13:33: circa venticinque ore dopo l'inizio dell'analisi, contro i sette giorni che
il metodo richiede. Alert, digest e stabilità delle previsioni vanno trattati come
**non valutati**, non come carenti. Dettagli e conseguenze in `04b`.

**3. I materiali grezzi non sono nel repository.** Screenshot, HAR e tracce API
stanno in `assets/trezy/`, escluso dal versionamento: contengono dati aziendali
reali e il repository è pubblico. I documenti qui sono stati scritti senza nomi di
controparti, IBAN, numeri di fattura o indirizzi email.

---

## Convenzioni

`[OSSERVATO]` visto in interfaccia o in risposta API · `[DEDOTTO]` ricostruito per
ragionamento · `[IPOTESI]` congettura da validare.

Per le lacune: `[ASSENTE]` (con verifica positiva) · `[NON POPOLATO]` · `[NON
ACCESSIBILE]` · `[NON VERIFICABILE]` · `[DA DOCUMENTAZIONE]` · `[FUORI SCALA]`.

---

## Lavoro rimasto aperto

- **Riconfronto delle previsioni**, da eseguire il 12 agosto prima delle 13:33 con
  `scratchpad/tz/09-riconfronto.mjs`, che confronta lo stato con
  `assets/trezy/api-traces/SNAPSHOT-2026-08-11.json`.
- **Avviso di saldo**, proposto in `04b` §6: richiede conferma perché fa partire
  un'email reale.
Nessuna ipotesi sostanziale è rimasta aperta: quella sul «punto morto» è stata
risolta in corso d'analisi (ricavi annualizzati con fattore 365/101, `04` §5.3).
