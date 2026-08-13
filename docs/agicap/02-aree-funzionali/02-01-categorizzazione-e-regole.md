# Area funzionale — Categorizzazione e regole

Osservato nel prodotto l'**11 agosto 2026**, account WEISS, ambiente di
produzione, in sola lettura. Nessuna regola è stata creata o applicata.

> **Nota sugli screenshot.** Questa schermata mostra causali bancarie reali con
> IBAN e nomi di persone. I tentativi di offuscamento non hanno funzionato: il
> contenuto vive in un micro-frontend con shadow DOM, invisibile sia al CSS
> iniettato sia alla ricerca testuale nel DOM principale. Ho quindi scelto di
> **non catturare** questa schermata e di documentarla a parole. Le opzioni dei
> menu a tendina sono state estratte come testo, attraversando le shadow root.

---

## 1. Il punto di partenza: 0% categorizzato

`[OSSERVATO]` In cima alla lista dei movimenti bancari, una barra di progresso:

> **0%** — Transazioni bancarie categorizzate negli ultimi 15 giorni. Raggiungere
> fino al 95% con il creatore di regole di categorizzazione.

Accanto, un pulsante con pallino rosso di notifica: **«Rivedere le regole di
categorizzazione suggerite»**. Il badge sulla voce di menu *Banca* riporta **228**,
con tooltip «228 transazioni da categorizzare negli ultimi 60 giorni».

**Perché conta.** Il prodotto tratta il tasso di categorizzazione come un **KPI di
primo piano**, con un obiettivo dichiarato (95%) e un invito all'azione a fianco.
Trasforma la manutenzione dei dati — attività noiosa e rimandabile — in un
progresso misurabile con un traguardo. È un accorgimento a costo quasi nullo e
alto rendimento.

**Conseguenza per questa analisi:** con lo 0% categorizzato, tutto ciò che dipende
dalla categorizzazione (previsioni per area, scostamenti, report per categoria) è
`[NON POPOLATO]` — esiste ma non ha dati che lo attivino. Non confondere con
`[ASSENTE]`.

---

## 2. Il generatore di regole: si parte dai suggerimenti, non dal foglio bianco

`[OSSERVATO]` Rotta: `/it/app/paid/cold-categorization`, raggiungibile da
*Gestire regole → Generatore di regole di categorizzazione*. Il nome tecnico
della rotta — *cold categorization* — suggerisce che sia pensata proprio per il
caso di partenza a freddo, con nulla di categorizzato.

L'utente non trova un costruttore vuoto: trova **66 regole già proposte**,
navigabili una per una («Suggerimento 1 su 66», con frecce avanti/indietro).

Come Agicap dichiara di costruirle, da una modale di presentazione `[OSSERVATO]`:

1. analizza i **titoli** di tutte le transazioni pagate e in attesa da
   categorizzare, per individuare schemi comuni;
2. considera anche le **transazioni già categorizzate**, per identificare schemi
   simili;
3. suggerisce di raggruppare, assegnare una categoria e creare la regola.

Per ogni suggerimento mostra:

- **Titolo della regola**, precompilato e modificabile (icona matita)
- **«88 transazioni corrispondenti»** — l'impatto della regola, prima di applicarla
- L'**anteprima delle transazioni** che verrebbero colpite, con il **pattern
  evidenziato in giallo** dentro il testo della causale

**L'accorgimento da rubare:** il conteggio dell'impatto e l'evidenziazione del
match *prima* della conferma. L'utente vede esattamente cosa sta per succedere e
perché quella regola aggancia quelle righe. Rimuove la paura di applicare una
regola sbagliata su centinaia di movimenti.

---

## 3. La grammatica delle regole — la risposta che le fonti pubbliche non davano

`[OSSERVATO]` Struttura **«Quando → Quindi»** (se → allora), in due pannelli.

### Quando (condizioni)

| Elemento | Valori disponibili | Note |
|---|---|---|
| **Conto bancario** | `Tutti i conti` o un conto specifico | filtro di ambito, fuori dalle condizioni |
| **Tipo** | `Realizzato` · `Realizzato e in attesa` | decide se la regola tocca anche il previsto |
| **Direzione** | badge `Entrata` / `Uscita` | mostrato, non modificabile in questo punto |
| **Campo confrontato** | **`Titolo`** · **`Importo`** | **solo due campi** |
| **Operatore** (su Titolo) | `Contiene` · `Non contiene` · `Contiene uno dei seguenti` | **solo testuali** |
| **Valore** | testo libero, area di testo multiriga | |
| **Connettore** | `E` fra le condizioni | l'esistenza di un `O` non è confermata |

Si aggiungono condizioni con **«+ Aggiungere condizione»**; ogni riga ha
un'icona cestino per rimuoverla.

### Quindi (azione)

| Elemento | Comportamento |
|---|---|
| **Impostare categoria su** | scelta della categoria; il menu mostra **la categoria e sopra, in corsivo, l'area padre** (es. `Bonifici da Clienti Italia` / *AREA OPERATIVA*) |
| **Ignorare transazioni** | interruttore, con nota: «Non utilizzabile quando la categoria è invertita» |

### Cosa questo dice — ed è il risultato più importante dell'area

**La grammatica è povera: due campi e tre operatori testuali.**

Non si può costruire una condizione su: controparte, IBAN, data, giorno del mese,
ricorrenza, conto di destinazione, valuta, o qualunque campo strutturato diverso
da titolo e importo. Non ci sono espressioni regolari, né `inizia con`, né
`uguale a`.

`[DEDOTTO]` La scommessa di prodotto è chiara: **invece di dare all'utente un
linguaggio espressivo, gli danno 66 regole già scritte dall'analisi automatica
dei suoi dati.** La potenza sta nel suggeritore, non nel costruttore. È una
scelta difendibile — la maggior parte degli utenti non scriverebbe mai una regola
complessa — ma ha un prezzo: quando il pattern non sta nel titolo, l'utente non
ha strumenti.

Per un horeca il caso critico è concreto: gli incassi da POS arrivano come
accrediti dell'acquirer, e nel nostro account risultano **88 movimenti con lo
stesso titolo** — un pattern che questa grammatica cattura bene. Ma distinguere
*quale punto vendita* ha generato quell'incasso, se l'informazione non è nel
titolo, non è esprimibile con questi mezzi.

---

## 4. Domande ancora aperte su quest'area

- Il connettore fra condizioni può diventare `O`, o è sempre `E`?
- `Contiene uno dei seguenti` accetta una lista di valori: con quale separatore?
- Quali operatori offre il campo **Importo** (uguale, maggiore, intervallo)?
- Le regole sono **retroattive** sui movimenti già acquisiti, o valgono solo dal
  momento della creazione?
- Chi vince fra **regola dell'utente** e **classificazione automatica** di Agicap?
- Le regole sono per conto o comuni a tutti i conti dell'entità?
- Cosa significa esattamente «quando la categoria è invertita»?

Tutte verificabili **senza scrivere**, aprendo i menu e leggendo le opzioni: da
completare nella prossima sessione sul prodotto.
