# Trezy — Transazioni, categorizzazione, regole di classificazione, connessioni bancarie

**Ambiente osservato**: produzione, account reale su piano Premium in prova, settore `food`.
**Data dell'osservazione**: 11 agosto 2026. **Rotta**: `/transaction` e `/categories`.
**Volume del campione**: 749 transazioni bancarie, 3 conti collegati, 37 categorie attive.

Convenzioni di tag: `[OSSERVATO]` visto in interfaccia o in una risposta API · `[DEDOTTO]`
inferenza da evidenza · `[IPOTESI]` lettura plausibile non verificata ·
`[DA DOCUMENTAZIONE]` da fonti pubbliche del produttore · `[NON POPOLATO]`, `[NON ACCESSIBILE]`,
`[NON VERIFICABILE]`, `[ASSENTE]` per le lacune.

Le descrizioni dei movimenti bancari contengono nomi di controparti reali e sono state
**parafrasate**: dove il testo grezzo è rilevante per l'analisi se ne descrive la forma, non il
contenuto.

---

## 1. La lista delle transazioni

### 1.1 Impianto della pagina

`[OSSERVATO]` La pagina non è una tabella. È un **elenco raggruppato per giorno**, con
un'intestazione di gruppo in italiano esteso e maiuscole sul giorno e sul mese:
«Lunedì 10 Agosto 2026», «Venerdì 7 Agosto 2026». È l'unica area del prodotto in cui la
localizzazione italiana delle date è completa e corretta (altrove convivono formati inglesi come
«28 Dec 2026»). L'ordinamento è decrescente per data; non è stato osservato alcun controllo per
cambiarlo.

`[OSSERVATO]` Sopra l'elenco, tre fasce sovrapposte:

1. **testata di contesto** — «Saldo totale di 3 account · Saldo attuale 31 140,40 €», con selettore
   dei conti e pulsante di risincronizzazione; a destra il campo `Cerca transazioni…`, il pulsante
   `Filtri` e il pulsante nero `Importa transazioni`;
2. **barra di selezione** — `Seleziona tutto (749)`, `0 selezionato/i`, una X per annullare, e a
   destra `Esporta`, `Categorizza`, `Documenti da confermare (5)`;
3. **suggerimento didattico** in banda azzurra: «Suggerimento: Evidenzia il testo in una transazione
   per creare una regola di classificazione» (§4).

### 1.2 Anatomia di una riga

`[OSSERVATO]` Ogni riga porta, da sinistra a destra:

| Elemento | Contenuto |
|---|---|
| Casella di selezione | per le azioni di massa |
| Descrizione | il **testo grezzo della banca**, non ripulito, troncato con ellissi |
| Badge numerico | contatore dei movimenti simili, con icona a strati (§1.3) |
| Conto di appartenenza | riga secondaria in grigio: nome della banca + ultime quattro cifre |
| Categoria | **menu a tendina inline**, modificabile senza aprire la riga |
| Importo | con segno esplicito, allineato a destra |

Due dettagli meritano rilievo.

`[OSSERVATO]` **La descrizione non viene normalizzata per la lettura.** La riga mostra la causale
bancaria integrale — sigle dell'operazione, identificativi di 30 caratteri, date ripetute in formato
compatto, nome del beneficiario appiccicato al numero della fattura senza spazio. Non c'è estrazione
della controparte, né arricchimento con logo o nome commerciale, né una riga di sintesi leggibile.
La risposta API contiene un campo `counterparty_name`, ma nel campione osservato **è nullo su tutte
le transazioni ispezionate** (30 su 30): il campo esiste, l'aggregatore non lo popola per questa
banca. `[DEDOTTO]` L'arricchimento della controparte è previsto dal modello dati ma non disponibile
sul percorso italiano osservato.

`[OSSERVATO]` **Gli importi non sono colorati.** Contrariamente alla convenzione diffusa,
entrata e uscita sono entrambe in nero: l'unica distinzione è il segno (`+2 042,60 €` contro
`−864,74 €`). Su un elenco fitto di righe alte e testi lunghi, la scansione visiva del segno costa
più di quanto costerebbe leggere un colore.

### 1.3 Il badge numerico: che cos'è, e con quale certezza

`[OSSERVATO]` Accanto alla descrizione compare un badge grigio con un'icona a strati e un numero:
173, 149, 57, 5, 4, 3, 2. Non compare su tutte le righe.

**Lettura: è il contatore delle transazioni del gruppo dei simili.** Certezza **alta**, per tre
riscontri indipendenti:

1. `[OSSERVATO]` La risposta di `GET /api/v2/transactions` espone su ogni transazione il campo
   **`similarTransactionsCount`**, il cui valore coincide esattamente con il numero mostrato nel
   badge (173 sulle righe con badge 173, e così via).
2. `[OSSERVATO]` Ogni transazione porta anche un **`transaction_hash`** (SHA-256). Nelle prime 30
   transazioni, tutte e otto le righe con badge 173 condividono lo stesso hash, pur avendo
   descrizioni **testualmente diverse**: cambiano gli identificativi numerici dell'operazione e la
   data compatta in coda. `[DEDOTTO]` L'hash è calcolato sulla descrizione **normalizzata** —
   rimosse le cifre variabili — ed è la chiave del raggruppamento. Coerente con la documentazione
   del produttore, che definisce «simili» due transazioni con la **stessa descrizione anonimizzata**
   e uguaglianza esatta del testo normalizzato, non similarità sfumata. `[DA DOCUMENTAZIONE]`
3. `[OSSERVATO]` Il badge **è omesso quando il valore è 1**: le cinque righe delle prime trenta con
   `similarTransactionsCount: 1` sono esattamente le cinque righe senza badge.

Due precisazioni che l'osservazione consente e che l'interfaccia non dichiara:

- `[OSSERVATO]` **Il gruppo attraversa i conti.** Le 173 occorrenze del gruppo più numeroso
  compaiono su almeno due dei tre conti collegati: la similarità è calcolata sulla descrizione, non
  per conto.
- `[OSSERVATO]` **La normalizzazione conserva il testo alfabetico.** Due accrediti dello stesso
  processore di pagamenti finiscono in gruppi diversi (173 contro 3) perché la causale contiene
  sigle di prodotto differenti; due bonifici dello stesso tipo verso beneficiari diversi restano
  separati perché il nome del beneficiario sopravvive alla normalizzazione. `[DEDOTTO]` Il criterio
  è «stessa forma di causale e stessa controparte testuale», che sui tracciati italiani produce
  gruppi ragionevoli — ma li produce per accidente della causale, non per comprensione semantica.

Il badge, quindi, non è un dato informativo neutro: è **la leva dell'apprendimento**. Categorizzare
una riga con badge 173 significa dichiarare la categoria di 173 movimenti. È l'elemento di
interfaccia con il maggior rapporto tra spazio occupato e potere esercitato, ed è anche il più
silenzioso: nulla nella riga spiega che cosa accadrà.

### 1.4 Paginazione e ricerca

`[OSSERVATO]` La chiamata di lista è `GET /api/v2/transactions?offset=0&limit=30&…` e restituisce
`{transactions[], totalCount: 749, totalNeedsConfirmation: 5, limit, offset}`. Il contatore 5 di
`totalNeedsConfirmation` alimenta il pulsante «Documenti da confermare (5)».

`[NON VERIFICABILE]` Non è stata catturata alcuna chiamata con `offset > 0` né con parametro di
ricerca: il meccanismo di avanzamento (scorrimento infinito o pulsante «carica altri») e la natura
della ricerca (lato server o filtro locale sulla pagina caricata) restano non determinati. È una
differenza sostanziale: se la ricerca fosse locale, cercherebbe su 30 righe su 749.

---

## 2. Selezione e azioni di massa

`[OSSERVATO]` La barra di selezione offre:

- `Seleziona tutto (749)` — casella che agisce sull'**intero insieme filtrato**, non sulla pagina
  visibile;
- `0 selezionato/i` — contatore in tempo reale, con X per annullare la selezione;
- `Esporta` — disabilitato a selezione vuota;
- `Categorizza` — disabilitato a selezione vuota;
- `Documenti da confermare (5)` — sempre attivo, porta alla coda di conferma dei collegamenti
  documento↔transazione.

`[DEDOTTO]` Le due azioni di massa sono **esportazione** e **categorizzazione**: non esistono
cancellazione, riassegnazione di conto, aggiunta di nota o esclusione massiva fra i pulsanti
osservati. `[NON ACCESSIBILE]` Il formato dell'esportazione e le colonne prodotte non sono stati
verificati: il pulsante non è stato azionato in questa sessione.

`[IPOTESI]` L'accostamento fra «Seleziona tutto (749)» e «Categorizza» suggerisce che sia possibile
riassegnare in blocco 749 movimenti con due clic. Non è stata osservata alcuna conferma intermedia,
né un annullamento dell'operazione. Se l'ipotesi è corretta, è un'azione irreversibile a bassissimo
attrito su un dato che alimenta conto economico e previsioni.

---

## 3. Filtri

`[OSSERVATO]` Il pannello si apre a discesa sotto il pulsante `Filtri` e contiene sette blocchi:

| Blocco | Controllo | Valori |
|---|---|---|
| Categoria | menu a tendina | elenco delle categorie |
| Periodo | due campi data (`Da`, `A`) | segnaposto `gg/mm/aaaa`, con selettore giorno/mese/anno |
| Importo | due campi numerici | **`Minuro`** / `Massimo` |
| Tipo | coppia di pulsanti | Entrata / Uscita |
| Stato | coppia di pulsanti | Incluse / Escluse |
| Documento | coppia di pulsanti | Con documento / Senza documento |
| Nota | coppia di pulsanti | Con nota / Senza nota |

`[OSSERVATO]` **Il refuso «Minuro» per «Minimo»** è presente nell'etichetta del campo importo
minimo. È uno dei tanti segnali di localizzazione incompleta, ma qui è particolarmente visibile
perché sta in un pannello di uso quotidiano.

`[OSSERVATO]` Il pannello non ha pulsante «Applica» né «Azzera filtri»: `[DEDOTTO]` l'applicazione è
immediata alla selezione. Il selettore dell'anno nel calendario si ferma al **2025**, mentre i dati
osservati arrivano al 10 agosto 2026: `[OSSERVATO]` per filtrare sull'anno corrente occorre scorrere
oltre l'ultimo valore mostrato di primo acchito, o digitare la data.

### 3.1 Che cosa significa «Incluse / Escluse»

`[OSSERVATO]` Ogni transazione porta nella risposta API un campo booleano **`isIgnored`**, che nel
campione vale `false` su tutte le righe ispezionate. `[DEDOTTO]` Il filtro Stato agisce su questo
campo. `[IPOTESI]` «Escludere» una transazione significa toglierla dai calcoli — saldo, conto
economico, previsioni — lasciandola visibile nell'archivio: è il meccanismo usuale per neutralizzare
giroconti fra conti propri, storni e duplicati d'importazione senza cancellare il dato bancario.
**L'ipotesi non è stata verificata**: nell'account non esiste alcuna transazione esclusa
(`[NON POPOLATO]`), l'interfaccia non spiega da nessuna parte l'effetto dell'esclusione, e non è
stato individuato il comando che la applica a una singola riga.

Questa è una lacuna di trasparenza rilevante: un'opzione che modifica i totali di bilancio è offerta
come un filtro qualsiasi, con due parole e nessuna spiegazione.

### 3.2 Nessuna vista salvata, nessun filtro nell'URL

`[OSSERVATO]` **Tutte le rotte del prodotto restano su URL nudi.** La pagina delle transazioni è
`https://appv2.trezy.io/transaction` sia prima sia dopo l'apertura del pannello e la selezione dei
filtri; lo stesso vale per `/categories`, `/cashflow`, `/document`, `/performance`. Nessun parametro
di query, nessun frammento, nessuna rotta figlia.

Le conseguenze sono concrete:

- **non si può condividere una vista**: mandare a un collega «le uscite sopra 1.000 € di luglio senza
  documento» richiede di descrivere a parole i sette filtri da impostare;
- **non si può tornare indietro**: il tasto «indietro» del browser non ripristina lo stato dei
  filtri, e un aggiornamento della pagina lo azzera;
- **non esistono viste salvate** (`[ASSENTE]`: nessun comando in interfaccia, nessuna menzione nella
  base di conoscenza né nella pagina dei piani);
- **non si può mettere una vista nei preferiti**, che è il modo in cui la maggior parte delle
  persone si costruisce di fatto le proprie viste salvate quando il prodotto non le offre.

Per un'area il cui lavoro quotidiano consiste nel tornare sempre sugli stessi sottoinsiemi — «i
movimenti non categorizzati», «le spese senza fattura» — è la mancanza più costosa dell'area.

---

## 4. La regola che nasce dalla selezione del testo

`[OSSERVATO]` In cima all'elenco, sopra il primo gruppo di giorno, una banda azzurra con icona
informativa recita: **«Suggerimento: Evidenzia il testo in una transazione per creare una regola di
classificazione»**.

È l'accorgimento più intelligente osservato in tutta l'area, e vale la pena spiegare perché.

Il problema che risolve è vecchio quanto la categorizzazione automatica: **l'utente sa riconoscere
la parola che conta, ma non sa scriverla**. Davanti a una causale come «disposizione per emolumenti
… bonifico … identificativo di trenta cifre … nome del dipendente … mese di competenza», chi lavora
sa istantaneamente che la parola discriminante è quella che indica lo stipendio. Ma se il prodotto
gli chiede di aprire un modulo, scegliere un campo, digitare la parola chiave e sperare di averla
trascritta esattamente come compare nel tracciato bancario — con le sue abbreviazioni tronche e i
suoi asterischi — la maggior parte delle regole non verrà mai scritta, e una parte di quelle scritte
non corrisponderà a nulla per un errore di battitura.

Trezy elimina il passaggio: **si seleziona il testo con il mouse dentro la riga, e da quel gesto
nasce la regola**. La parola chiave non viene digitata, viene *presa* dal dato reale, il che la
rende esatta per costruzione. Il contesto non si perde: si sta guardando la transazione che ha fatto
venire l'idea, e la regola nasce lì, senza cambiare pagina.

`[NON ACCESSIBILE]` Il modulo che si apre dopo la selezione non è stato osservato: non è possibile
dire quali campi siano precompilati (categoria suggerita? ambito? conto?), se la selezione diventi
una corrispondenza esatta o parziale, né se venga mostrata un'anteprima dei movimenti che la regola
catturerebbe. Quest'ultima è la domanda che decide la qualità dell'accorgimento: senza anteprima,
il gesto è comodo ma cieco.

`[OSSERVATO]` Il suggerimento è mostrato come banda permanente, non come messaggio a comparsa: non è
stato osservato alcun comando per chiuderlo. Su una pagina che si visita ogni giorno, un
suggerimento che non si può congedare passa dall'essere didattico all'essere rumore.

---

## 5. Categorizzazione automatica

### 5.1 Configurazione osservata

`[OSSERVATO]` Da `GET /api/v2/account-settings`:

```
categorizationMode: "trezy_ai"
requireCategoryValidation: false
validationNotificationFrequency: "none"
```

`[DEDOTTO]` L'account usa il motore proprietario di categorizzazione automatica, **senza** obbligo
di validazione umana delle proposte e **senza** notifiche periodiche di sollecito. L'esistenza del
parametro `categorizationMode` implica che esistano altre modalità (per esempio solo regole, o
manuale), ma l'elenco dei valori ammessi non è osservabile dall'esterno. `[NON VERIFICABILE]`

### 5.2 I tre meccanismi, e come si compongono

Dalla documentazione del produttore, confermata dai campi osservati:

1. **Regole di classificazione** `[DA DOCUMENTAZIONE]` — parole chiave sulla descrizione, ordinate
   per priorità. Hanno la precedenza e possono **spezzare un gruppo di simili**.
2. **Raggruppamento per descrizione anonimizzata** `[OSSERVATO]` — il meccanismo del badge (§1.3).
   Validare la categoria di un gruppo la propaga a tutto il gruppo.
3. **Apprendimento dalle categorizzazioni passate** `[DA DOCUMENTAZIONE]` — categorizzando una
   transazione, le simili **future** ereditano la categoria.

`[DEDOTTO]` L'ordine di applicazione è: regola esplicita → categoria appresa per gruppo →
suggerimento del motore. È un impianto sensato e verificabile — ma nell'interfaccia **non è visibile
quale dei tre meccanismi abbia assegnato la categoria che si sta guardando**. Nessun'icona distingue
una categoria dedotta dall'IA da una imposta da una regola da una scelta a mano. Il campo
`categoryValidatedAt` esiste nel modello dati ed è nullo su tutte le transazioni ispezionate
(`[OSSERVATO]`, 30 su 30), ma l'interfaccia non ne mostra il valore.

### 5.3 La verifica post-collegamento

`[OSSERVATO]` `GET /api/v2/transactions/verification-stats` restituisce:

```json
{"total": 749, "verified": 749, "unverified": 0, "hasTransactionsToVerify": false}
```

e lo stesso indicatore compare, per conto, nella risposta di `GET /api/v2/bank-accounts`:
ciascuno dei tre conti riporta `verified: true`, `hasTransactionsToVerify: false`,
`unverifiedTransactionsCount: 0`.

`[DEDOTTO]` Al collegamento di un conto, Trezy importa lo storico, lo categorizza automaticamente e
apre una **coda di verifica** che l'utente smaltisce a gruppi di simili — è la prima delle tre code
della «casella di posta delle previsioni» descritta dal produttore. Nell'account osservato la coda è
**esaurita**: tutte le 749 transazioni risultano verificate. `[NON POPOLATO]` L'interfaccia della
coda, la sua ergonomia e il costo effettivo dello smaltimento **non sono quindi valutabili**: si
osserva soltanto lo stato finale.

È un limite metodologico serio per questa area. Il momento in cui un prodotto di categorizzazione si
gioca la sua reputazione è la prima ora dopo il collegamento della banca, con 749 movimenti da
qualificare; e quel momento, in questa osservazione, era già passato.

`[OSSERVATO]` Va notata un'asimmetria: mentre `verification-stats` dichiara 749 verificate su 749,
il campo `is_confirmed` sulle singole transazioni vale `false` su tutte le trenta righe ispezionate.
`[DEDOTTO]` I due campi misurano cose diverse — `is_confirmed` riguarda il **collegamento a un
documento**, non la categoria — coerentemente con il contatore separato «Documenti da confermare
(5)» e con `totalNeedsConfirmation: 5`. Restano due nozioni di «confermato» che il prodotto non
distingue lessicalmente.

---

## 6. Regole di classificazione

`[OSSERVATO]` Seconda scheda della pagina `/categories`, marcata con badge rosso **`NUOVO`**.
`GET /api/v2/categorization-rules` restituisce `[]`: **nessuna regola configurata**. La schermata
osservata è quindi lo stato vuoto.

### 6.1 Comportamento dichiarato

`[DA DOCUMENTAZIONE]`, coerente con l'intestazione osservata:

- una regola è una **parola chiave sulla descrizione**;
- ha un **ambito**: entrata, uscita, o entrambe;
- può essere **limitata a conti specifici**;
- le regole sono **ordinate per priorità**, e l'ordine si cambia **trascinando**;
- **non sono retroattive**: applicarle allo storico richiede il comando esplicito
  «Applica tutte le regole»;
- una regola può **spezzare un gruppo di simili**, sottraendo alcune transazioni alla categoria
  ereditata dal gruppo.

La non retroattività per default è una scelta difendibile — evita che una regola scritta male
riscriva anni di storico — ma va conosciuta, perché produce l'effetto controintuitivo di una regola
che «non funziona» sui movimenti già presenti.

### 6.2 Lo stato vuoto che insegna

`[OSSERVATO]` Sopra il riquadro vuoto, due righe di testo:

> Trascina le regole per cambiare la priorità. Le regole in alto vengono applicate per prime.
>
> *Esempio: Per transazioni "Stipendio Matthieu" e "Stipendio Jean", se la regola "Matthieu" è sopra
> la regola "Stipendio", "Stipendio Matthieu" corrisponderà prima a "Matthieu".*

Merita di essere segnalato come **buona pratica**, per una ragione precisa: la maggior parte degli
stati vuoti si limita a dire che cosa manca e a offrire il pulsante per crearlo. Questo insegna
**la regola semantica più difficile del sistema** — la risoluzione dei conflitti fra regole
sovrapposte — e lo fa con un caso concreto di due regole in conflitto, non con una definizione
astratta di «priorità». Chi legge quelle due righe prima di scrivere la prima regola ha già capito
perché l'ordine conta, e in che direzione ordinare: **dal particolare al generale**, con la regola
più specifica in alto.

Il momento scelto è quello giusto. La spiegazione appare quando l'elenco è vuoto — cioè quando la
persona non ha ancora nulla da perdere e sta per prendere la decisione che condizionerà tutte le
successive — e scompare dall'ingombro quando le regole esistono e l'ordinamento si vede da sé.

`[OSSERVATO]` **L'esempio usa nomi propri francesi non localizzati** («Matthieu», «Jean») e la
parola «Stipendio» tradotta in italiano: la frase è un innesto italiano su un esempio scritto per il
mercato d'origine. È un difetto minore rispetto al valore didattico, ma è il sintomo di un impianto
di localizzazione che traduce le stringhe e non riscrive gli esempi — e in un prodotto contabile gli
esempi *sono* il contenuto.

### 6.3 Limiti del modello di regola

`[DEDOTTO]` dalle sole capacità dichiarate:

- la condizione è **una parola chiave sulla descrizione**: non è dichiarata alcuna condizione su
  **importo** (soglie, intervalli, importo esatto), su **segno** oltre l'ambito entrata/uscita, su
  **controparte** (campo peraltro non popolato, §1.2) o su **ricorrenza**;
- non è dichiarata alcuna combinazione logica (E/O, negazione): una regola sembra essere una singola
  parola chiave, non un'espressione;
- l'azione è **una sola**: assegnare una categoria. Non è dichiarata la possibilità di aggiungere
  una nota, marcare come esclusa, collegare a un documento o notificare.

`[NON ACCESSIBILE]` Il modulo di creazione della regola non è stato aperto: la forma esatta dei
campi, la presenza di un'anteprima e l'eventuale supporto per corrispondenze multiple restano
non verificati. Le affermazioni qui sopra vanno lette come «non dichiarato», non come «assente».

---

## 7. Anagrafica delle categorie

### 7.1 Struttura della pagina

`[OSSERVATO]` `/categories`, scheda «Categorie», titolo «Gestione categorie», sottotitolo «Organizza
e configura le tue categorie di transazioni». Due tabelle separate e indipendenti:

- **Entrate** — 6 categorie
- **Uscite** — 31 categorie

Ciascuna con lo stesso schema di colonne:

| Colonna | Controllo |
|---|---|
| (maniglia) | icona di trascinamento per il riordino |
| (chevron) | espansione della gerarchia |
| **NOME CATEGORIA** | testo |
| **CATEGORIA CONTABILE** | menu a tendina con badge di classificazione |
| **ALIQUOTA IVA** | percentuale |
| **TERMINI DI PAGAMENTO** | giorni (`0d`, `30d`) |
| **CATEGORIA PADRE** | menu a tendina, `-` se radice |
| **AZIONI** | menu `⋯` |

`[OSSERVATO]` In alto a destra l'interruttore **«Mostra solo quelle utilizzate»**, attivo. Con
l'interruttore disattivato il catalogo completo conta **41 categorie di entrata e 161 di uscita**
(`GET /api/v2/categories?used=false`), contro le 37 mostrate. `[DEDOTTO]` Trezy precarica un piano
di 202 voci e mostra per default solo quelle che hanno movimenti: senza quell'interruttore la
pagina sarebbe illeggibile. È una buona soluzione a un problema che il prodotto si crea da solo.

`[OSSERVATO]` Il riordino avviene **per trascinamento** (maniglia su ogni riga, pulsante «Trascina
per riordinare»); l'ordine così definito è quello con cui le categorie compaiono nelle righe del
prospetto di flusso di cassa.

### 7.2 Il ponte verso la pre-contabilità

`[OSSERVATO]` La colonna CATEGORIA CONTABILE non contiene testo libero ma una **selezione da un
piano dei conti precaricato**, e ogni voce selezionata porta un badge che ne dichiara la natura:

- **`C/E`** (verde) — conto economico: la categoria concorre a ricavi e costi;
- **`STATO PATRIMONIALE`** (azzurro) — la categoria muove cassa senza toccare il risultato.

Nel campione: `Ricavi`, `Acquisti materie prime`, `Stipendi e salari`, `Noleggi` sono C/E;
`Trasferimento interbancario`, `Soci - Conti correnti`, `Versamento contanti`, `Estratto conto carta
di credito`, `Prestiti` sono Stato Patrimoniale.

È **il meccanismo centrale dell'area**, e va detto con chiarezza: la distinzione C/E ↔ Stato
Patrimoniale è ciò che permette a Trezy di produrre un conto economico da un estratto conto. Senza
di essa un giroconto fra conti propri gonfierebbe simultaneamente ricavi e costi; con essa, il
movimento resta nel flusso di cassa e sparisce dal risultato. La stessa etichetta serve due letture
diverse degli stessi 749 movimenti — la lettura per cassa e la lettura per competenza — e lo fa con
un solo attributo per categoria, comprensibile anche a chi non ha mai visto una partita doppia.

`[OSSERVATO]` I codici del piano precaricato hanno forma `REV-0800`, `EXP-0100`, `TRF-1100`,
`BNK-0200`: 37 codici disponibili per le entrate, 159 per le uscite. `[OSSERVATO]` I nomi dei codici
sono **interamente in inglese** e ricalcano l'articolazione del piano contabile francese. Va letto
insieme a un fatto già rilevato altrove nel prodotto: l'account è configurato su
`accountingStandardCode: "IT_CUSTOM"` (Italia — Personalizzato), ma le scritture generate usano
conti del *Plan Comptable Général* francese.

### 7.3 Due codici orfani

`[OSSERVATO]` Due delle sei categorie di entrata mostrano `Select code` al posto di una categoria
contabile, cioè risultano **non mappate**:

| Categoria (interfaccia) | Codice memorizzato | Presente nel catalogo? |
|---|---|---|
| Altro | `BNK-000` | no, né in entrata né in uscita |
| Rimborso cliente | `CUS-1200` | no, né in entrata né in uscita |

`[DEDOTTO]` Il valore è memorizzato sulla categoria ma non esiste fra i codici selezionabili: il
menu non riesce a risolverlo e ripiega sul segnaposto. Un terzo delle categorie di entrata è privo
di aggancio contabile, e l'interfaccia lo comunica con due parole in inglese che sembrano un invito
(`Select code`) anziché una segnalazione di incoerenza.

`[OSSERVATO]` La categoria che l'interfaccia chiama **«Altro»** si chiama, nel modello dati,
**`"Category not found"`** (codice `BNK-000`, l'unica con termini di pagamento a 30 giorni contro 0
di tutte le altre). `[DEDOTTO]` È la categoria di ripiego del sistema, mostrata all'utente con
un'etichetta neutra ma memorizzata con il proprio nome tecnico — lo stesso nome che affiora in
chiaro, non tradotto, nelle risposte del prospetto di flusso di cassa.

### 7.4 L'aliquota IVA di default al 20 %

`[OSSERVATO]` L'aliquota predefinita è **20,0 %**. Nel campione: 19 categorie di uscita su 31 e 3
di entrata su 6 sono al 20 %; le restanti a 0 %. **Nessuna categoria è al 22 %**, che è l'aliquota
ordinaria italiana dal 2013.

Il 20 % è l'aliquota ordinaria **francese**. `[DEDOTTO]` Il valore di default non è stato
localizzato per il mercato italiano: è il default del mercato d'origine applicato a un account
configurato su standard contabile italiano.

**L'impatto non è cosmetico.** Secondo la documentazione del produttore, l'aliquota della categoria
alimenta le righe **«IVA a debito», «IVA a credito» e «Saldo IVA»** del prospetto di flusso di cassa
`[DA DOCUMENTAZIONE]`, righe effettivamente presenti nel prospetto osservato `[OSSERVATO]`. Su ogni
categoria lasciata al valore di fabbrica, quelle tre righe sono quindi calcolate con un'aliquota
inferiore di due punti a quella reale: l'IVA scorporata da un imponibile lordo risulta sottostimata
di circa **1,6 % dell'importo lordo** (20/120 contro 22/122), e l'errore si accumula su ogni riga
di ogni mese. Su un'azienda con circa 214.000 € di ricavi annui, il solo scostamento sull'IVA a
debito dei ricavi ordinari è dell'ordine di alcune migliaia di euro all'anno.

Nulla nell'interfaccia segnala l'anomalia: la colonna mostra `20.0%` in grigio come qualsiasi altro
valore corretto. Chi non conosce il meccanismo non ha modo di sospettare che quella colonna vada
rivista voce per voce, su 37 righe, subito dopo il primo accesso.

### 7.5 «Royal»: non un residuo, un troncamento di traduzione

Fra le categorie di uscita compare una voce denominata **«Royal»**, che a prima vista sembra un
residuo di configurazione o un nome digitato per errore.

`[OSSERVATO]` **Non lo è.** Nel modello dati la categoria ha codice **`EXP-0900`**, e il catalogo
dei codici contabili definisce `EXP-0900` come **«Royalties»**. La voce è quindi una categoria di
sistema legittima — i canoni di licenza — la cui **traduzione italiana è troncata**.

`[DEDOTTO]` Il meccanismo è ricostruibile con precisione. Le categorie di sistema portano un nome
inglese nel modello dati (`Revenue`, `Purchases of raw materials`, `Rentals`) e vengono tradotte
nell'interfaccia a partire dal codice; le categorie **create dall'utente** hanno `category_code`
nullo e conservano il nome digitato — infatti sono le uniche che compaiono in italiano già nella
risposta API (`Commissioni per bonifici`, `Commissioni RID`, `Versamento contanti`). «Royal» è
dunque una **voce del dizionario di traduzione italiana scritta male**, non un dato sporco
dell'account: comparirà identica in ogni account italiano di Trezy.

Il fatto è più interessante dell'errore in sé. Una categoria contabile che si chiama «Royal» non
viene riconosciuta da chi la legge, quindi non viene usata; i canoni di licenza finiscono altrove,
verosimilmente in «Oneri operativi vari»; e il conto economico perde una riga senza che nessuno se
ne accorga. Un errore di dizionario da cinque caratteri produce un errore di classificazione
permanente.

### 7.6 Gerarchia padre-figlio

`[OSSERVATO]` La colonna CATEGORIA PADRE esiste su ogni riga, come menu a tendina, e il modello dati
prevede `parentCategoryId`, una collezione `children` e i campi derivati
`parent_category_name` / `grandparent_category_name` su ogni transazione: la gerarchia è quindi
prevista su **tre livelli**, coerentemente con la profondità massima raccomandata dal produttore
`[DA DOCUMENTAZIONE]`.

`[NON POPOLATO]` Nell'account osservato **nessuna categoria ha un padre**: tutte le 202 voci del
catalogo hanno `parentCategoryId: null` e `children` vuoto, e ogni transazione riporta
`parent_category_name: null`. L'ergonomia della gestione gerarchica — riordino di un ramo,
spostamento di una figlia, aggregazione dei totali sul padre — **non è quindi valutabile**.

La gerarchia non è ornamentale: da essa dipende la modalità di previsione «Dettagliato» (residuo
calcolato per sottocategoria) contro «Globale» (residuo sulla categoria madre). Un account piatto
rende le due modalità indistinguibili.

---

## 8. Import e connessioni bancarie

### 8.1 Che cosa è stato osservato

`[OSSERVATO]` I tre conti collegati appartengono alla **stessa banca** e sono esposti da
`GET /api/v2/bank-accounts?currency=EUR&grouped=true` come **una sola connessione** con tre conti
figli:

| Conto | Saldo | Stato | Da verificare |
|---|---|---|---|
| ••2322 | 14.080,66 € | attivo, verificato | 0 |
| ••1821 | 7.781,31 € | attivo, verificato | 0 |
| ••2285 | 9.278,43 € | attivo, verificato | 0 |
| **Totale** | **31.140,40 €** | | **0** |

`[OSSERVATO]` Ogni conto porta il campo **`source: "enablebanking"`**. Il raggruppamento avviene per
connessione: `[DEDOTTO]` una sola autorizzazione PSD2 copre i tre conti, e una sola riautenticazione
li scadrà insieme.

`[OSSERVATO]` La denominazione del conto è generata dall'aggregatore nella forma «nome banca +
ultime quattro cifre», e la stessa stringa viene usata come `bankName` della connessione: la
connessione eredita il nome del primo conto, il che nell'interfaccia produce l'effetto curioso di un
gruppo denominato come uno dei suoi membri.

`[OSSERVATO]` La risposta di lista delle transazioni include il campo **`counterparty_iban`
valorizzato** con l'IBAN completo della controparte. Il dato non è mostrato nell'interfaccia ma
viaggia nella risposta API di ogni pagina dell'elenco. È un dettaglio di superficie d'esposizione
che vale la pena registrare, senza trarne conclusioni sulla sicurezza dell'impianto, che non è stata
oggetto di verifica.

### 8.2 L'aggregatore: che cosa dicono le fonti pubbliche, e che cosa dicono i dati

`[DA DOCUMENTAZIONE]` La ricognizione delle fonti pubbliche aveva identificato **Powens** (ex Budget
Insight) come aggregatore PSD2 — non dal sito, che tace su tutta la catena dei fornitori, ma da uno
screenshot del tour dimostrativo incorporato nella pagina di documentazione, dove compare
l'interfaccia di Powens con la sua dicitura di autorizzazione ACPR. La stessa ricognizione aveva
rilevato che nell'applicazione **coesistono tre aggregatori**: Enable Banking (widget
`tilisy.enablebanking.com`, endpoint `/api/enablebanking/*`), Powens e Plaid.

`[OSSERVATO]` Sul percorso italiano effettivamente in esercizio, i tre conti riportano
`source: "enablebanking"`. `[DEDOTTO]` Powens è l'aggregatore mostrato nel materiale pubblico;
**Enable Banking è quello che serve i conti osservati**. La scelta del fornitore è presumibilmente
per istituto o per paese, non unica per prodotto.

Ne discende una conseguenza di posizionamento, non di funzione: `[DEDOTTO]` la copertura «2.000+
banche» rivendicata dal produttore è il catalogo dei suoi fornitori, non un asset proprietario. Con
un parco fornitori cambiato almeno due volte in tre anni `[DA DOCUMENTAZIONE]`, la connessione
bancaria è per Trezy una componente acquistata e sostituibile — come per chiunque altro.

### 8.3 Comportamento dichiarato della sincronizzazione

`[DA DOCUMENTAZIONE]`, non verificato in questa osservazione:

- autenticazione presso la banca per redirezione PSD2, credenziali non transitanti da Trezy;
- accesso in **sola lettura**, nessuna disposizione di pagamento;
- **sincronizzazione automatica ogni mattina**, più sincronizzazione manuale a richiesta (il
  pulsante di aggiornamento accanto al selettore dei conti è osservato in interfaccia);
- **riautenticazione obbligatoria «generalmente ogni 90 giorni»**, con notifica;
- import iniziale di **3 mesi** secondo la documentazione, 24 secondo il marketing — le due cifre
  non concordano;
- alcune banche richiedono di abilitare l'accesso API nelle proprie impostazioni di sicurezza.

`[OSSERVATO]` L'account contiene 749 transazioni che risalgono almeno al giugno precedente, con
serie storiche pluriennali nel prospetto di flusso di cassa: `[DEDOTTO]` la profondità effettiva
dello storico importato supera i 3 mesi dichiarati dalla documentazione.

### 8.4 Import manuale

`[OSSERVATO]` Il pulsante **`Importa transazioni`** è il solo elemento in nero pieno della testata
della pagina: è l'azione a cui il prodotto dà maggior peso visivo dopo la navigazione.

`[NON ACCESSIBILE]` Il flusso non è stato aperto in questa sessione. Dalla documentazione
`[DA DOCUMENTAZIONE]`: formati **CSV, XLSX, XLS**, con mappatura delle colonne, intervallo di date
dedotto dal file, anteprima prima della conferma e **impostazione del saldo iniziale alla data di
partenza** — quest'ultimo dettaglio è quello che rende l'import manuale utilizzabile come vero
ripiego, perché senza saldo di partenza una serie di movimenti non produce un saldo corrente. La
documentazione promette anche OFX e QIF, che secondo la ricognizione delle fonti non trovano
riscontro nel prodotto.

---

## 9. Debolezze e limiti osservati

**Sulla lista e i filtri**

1. **Nessuna persistenza dello stato nell'URL.** Tutte le rotte restano nude
   (`/transaction`, `/categories`, …): filtri e selezioni non sono condivisibili, non sopravvivono
   a un aggiornamento della pagina e non si possono mettere nei preferiti. `[OSSERVATO]`
2. **Nessuna vista salvata.** Verificata l'assenza sia in interfaccia sia nelle fonti del
   produttore. Su un'area il cui lavoro consiste nel tornare ogni giorno sugli stessi sottoinsiemi,
   è la mancanza più costosa. `[ASSENTE]`
3. **Il filtro «Incluse/Escluse» non è spiegato da nessuna parte**, pur agendo su un attributo che
   modifica i totali. `[OSSERVATO]`
4. **Refuso «Minuro»** nell'etichetta dell'importo minimo. `[OSSERVATO]`
5. **Il selettore dell'anno si ferma al 2025** mentre i dati arrivano al 2026. `[OSSERVATO]`
6. **Le descrizioni non sono ripulite**: causale bancaria grezza, controparte non estratta
   (`counterparty_name` nullo su tutto il campione ispezionato). `[OSSERVATO]`
7. **Gli importi non sono colorati**: entrata e uscita si distinguono solo per il segno.
   `[OSSERVATO]`
8. **Nessun ordinamento configurabile** e nessun totale dell'insieme filtrato: filtrando «uscite
   sopra 1.000 €» si ottiene un elenco, non quanto pesa. `[OSSERVATO]`

**Sulla categorizzazione**

9. **Non è visibile l'origine di una categoria.** Regola, apprendimento di gruppo, motore automatico
   o scelta manuale producono la stessa apparenza. Senza quell'informazione non si sa che cosa
   correggere quando una categoria è sbagliata. `[OSSERVATO]`
10. **Il badge dei simili non spiega il proprio potere.** Cambiare la categoria su una riga con badge
    173 ha effetti su 173 movimenti; la riga non lo dice. `[OSSERVATO]` / `[IPOTESI]` sull'estensione
    esatta della propagazione.
11. **Azione di massa senza rete di sicurezza apparente**: «Seleziona tutto (749)» e «Categorizza»
    sono adiacenti, senza conferma né annullamento osservati. `[IPOTESI]`
12. **Due nozioni di «confermato»** che il lessico non distingue: verifica della categoria
    (`verification-stats`) e conferma del collegamento a documento (`is_confirmed`,
    `totalNeedsConfirmation`). `[OSSERVATO]`

**Sulle regole**

13. **Modello di regola povero**: una parola chiave sulla descrizione, un ambito, un elenco di conti;
    nessuna condizione su importo, ricorrenza o controparte, nessuna combinazione logica, una sola
    azione possibile. `[DEDOTTO]` da quanto dichiarato.
14. **Esempio didattico non localizzato**: nomi propri francesi in una frase italiana. `[OSSERVATO]`
15. **La non retroattività è corretta ma controintuitiva**, e il comando che la aggira («Applica
    tutte le regole») è l'unico rimedio: nessuna anteprima dell'effetto è stata osservata.
    `[DA DOCUMENTAZIONE]` / `[NON ACCESSIBILE]`

**Sulle categorie**

16. **Aliquota IVA di default al 20 %** contro l'ordinaria italiana del 22 %, su un account
    configurato come italiano: alimenta le tre righe IVA del prospetto di flusso di cassa con uno
    scostamento sistematico di circa 1,6 % del lordo su ogni riga lasciata al valore di fabbrica.
    `[OSSERVATO]` il valore, `[DEDOTTO]` l'impatto.
17. **«Royal» per «Royalties»**: voce del dizionario italiano troncata, presente per costruzione in
    ogni account italiano; una categoria irriconoscibile è una categoria inutilizzata.
    `[OSSERVATO]` + `[DEDOTTO]`.
18. **Due codici contabili orfani** (`BNK-000`, `CUS-1200`) lasciano un terzo delle categorie di
    entrata senza aggancio al piano dei conti, segnalato con un `Select code` che sembra un invito
    anziché un errore. `[OSSERVATO]`
19. **Piano dei conti in inglese di impianto francese** su un account dichiarato italiano.
    `[OSSERVATO]`
20. **Nessun avviso sulle categorie non configurate**: nulla distingue visivamente una categoria
    pronta da una da rivedere. `[OSSERVATO]`

**Sulle connessioni**

21. **Un solo istituto nel campione**: il comportamento con banche diverse, e con aggregatori
    diversi, non è osservabile. `[FUORI SCALA]`
22. **La riautenticazione a 90 giorni** è una manutenzione ricorrente a carico dell'utente, comune a
    tutti i prodotti PSD2 ma qui non mitigata da nulla di osservabile. `[DA DOCUMENTAZIONE]`
23. **Profondità dell'import iniziale dichiarata in modo contraddittorio** (3 mesi nella
    documentazione, 24 nel marketing) e smentita dai dati, che ne mostrano di più.
    `[DA DOCUMENTAZIONE]` / `[OSSERVATO]`

---

## 10. Cosa non è stato valutabile

| Oggetto | Stato | Perché |
|---|---|---|
| Coda di verifica post-collegamento | `[NON POPOLATO]` | 749 su 749 già verificate: si osserva solo lo stato finale, non l'esperienza dello smaltimento |
| Modulo di creazione di una regola | `[NON ACCESSIBILE]` | il flusso da selezione del testo non è stato aperto; campi, precompilazione e anteprima ignoti |
| Elenco delle regole, trascinamento, «Applica tutte le regole» | `[NON POPOLATO]` | `categorization-rules` restituisce elenco vuoto: osservato solo lo stato vuoto |
| Esclusione di una transazione e suo effetto sui calcoli | `[IPOTESI]` + `[NON POPOLATO]` | `isIgnored` vale `false` su tutto il campione; il comando che lo imposta non è stato individuato |
| Suddivisione di una transazione | `[DEDOTTO]` dallo schema | il campo `isSplitParent` esiste ed è `false` ovunque; nessuna interfaccia osservata |
| Gerarchia padre-figlio delle categorie | `[NON POPOLATO]` | nessuna categoria ha padre nell'account: le due modalità di previsione risultano indistinguibili |
| Flusso di import da file | `[NON ACCESSIBILE]` | pulsante non azionato; mappatura colonne, anteprima e saldo iniziale noti solo da documentazione |
| Formato e colonne dell'esportazione | `[NON ACCESSIBILE]` | pulsante non azionato |
| Ricerca testuale: server o client, campi coperti | `[NON VERIFICABILE]` | nessuna chiamata con parametro di ricerca catturata |
| Paginazione oltre la prima pagina | `[NON VERIFICABILE]` | osservata una sola chiamata, `offset=0&limit=30` su 749 |
| Qualità delle proposte del motore `trezy_ai` | `[NON VERIFICABILE]` | non misurabile su un archivio già interamente categorizzato e verificato |
| Collegamento di una nuova banca | `[NON ACCESSIBILE]` | non tentato: avrebbe richiesto credenziali PSD2 su un conto reale |
| Comportamento con più istituti o valute | `[FUORI SCALA]` | un solo istituto, una sola valuta nel campione |

---

## Fonti

- Dump strutturati della sessione dell'11 agosto 2026: `rotta-transaction.json`, `06-tx-filtri.json`,
  `rotta-categories.json`, `06-regole.json`, log `02-rotte.log` e `06.log`
- Tracce API con corpi di risposta: `assets/trezy/api-traces/01-login.json`, `02-rotte.json`,
  `07-finale.json` — endpoint `transactions`, `transactions/verification-stats`, `bank-accounts`,
  `categories`, `categories/accounting-codes/{inflow,outflow}`, `categorization-rules`
- Schermate: `assets/trezy/screenshots/50-transazioni.png`, `51-transazioni-filtri.png`,
  `60-regole-classificazione.png`, `07-categories.png`
- Fase 0 (fonti pubbliche del produttore): `docs/trezy/00a-sito-e-pricing.md`,
  `docs/trezy/00b-knowledge-base-e-api.md`
