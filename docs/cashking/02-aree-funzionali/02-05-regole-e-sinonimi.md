# Area funzionale — Regole automatiche e sinonimi

Rotte `/settings/rules` e `/synonyms` · endpoint `/api/rules`,
`/api/client-synonyms`, `/api/supplier-synonyms`, `/api/trashed-synonyms`.

La schermata delle regole **è stata aperta e provata** l'11 agosto: il capitolo
1b documenta l'enumerazione dei dieci tipi, dei tredici operatori e delle undici
azioni, più l'esperimento di creazione che fallisce sempre. La sezione sui
sinonimi resta invece ricostruita dalla guida in-app estratta dal bundle
(`assets/cashking/export/guida-in-app-estratta-dal-bundle.txt`) e dai nomi degli
endpoint, integrata poi dalla schermata `/synonyms` in
`02-07-conti-team-movimenti.md`. Documentata comunque perché è il presupposto tecnico di due cose che
contano molto altrove: la categorizzazione automatica e la qualità degli
abbinamenti in riconciliazione.

---

## 1. Regole automatiche `[OSSERVATO]`

Descrizione dichiarata: «Le Regole Automatiche categorizzano automaticamente i
movimenti bancari in base a condizioni sulla descrizione. Riducono il lavoro
manuale di categorizzazione.»

Funzionamento: «Crea regole con condizioni (es. *descrizione contiene AMAZON*) e
azioni (es. *assegna categoria Acquisti*). Le regole vengono applicate
automaticamente ai nuovi movimenti importati.»

### Capacità dichiarate

| Aspetto | Dato dichiarato |
|---|---|
| Tipi di regola | **10**, «dalla categorizzazione fino al rilevamento dei duplicati» |
| Operatori sulle condizioni | **13**, fra cui *contiene*, *inizia con*, *maggiore di*, **regex** |
| Combinazione delle condizioni | AND (tutte vere) oppure OR (basta una) |
| Ambito | solo fatture · solo transazioni bancarie · solo movimenti carta · tutti i documenti |
| Ordinamento | conta: «la prima regola che corrisponde viene applicata» |
| Attivazione | si possono disattivare senza eliminarle |
| Esecuzione retroattiva | «Puoi eseguire una regola manualmente per applicarla retroattivamente ai documenti già esistenti» |
| Statistiche per regola | data dell'ultima esecuzione, numero di esecuzioni, numero di documenti trovati |

Suggerimento presente nella guida: «Testa sempre le regole prima di applicarle
massivamente.»

### Lettura

`[DEDOTTO]` Non è un semplice motore di categorizzazione. Che i tipi di regola
arrivino fino al **rilevamento dei duplicati** significa che la stessa
infrastruttura serve per la pulizia del dato, non solo per l'etichettatura.

`[DEDOTTO]` Tre dettagli fanno la differenza fra un motore di regole usabile e
uno abbandonato dopo due settimane, e ci sono tutti e tre:

1. **L'esecuzione retroattiva.** Una regola creata oggi vale poco se non si può
   applicare ai mille movimenti già importati. Senza, l'utente rinuncia.
2. **Le statistiche per regola.** Sapere quante volte una regola ha agito e
   quando è l'unico modo per accorgersi che una regola non serve più o non ha
   mai funzionato. È la manutenzione che rende il sistema sostenibile nel tempo.
3. **L'ambito per tipo di documento.** Senza, una regola pensata per l'estratto
   conto finisce per toccare anche le fatture.

### I dieci tipi, enumerati `[OSSERVATO]`

Aperta la pagina, i tipi sono esattamente dieci e compaiono sia come tab di
filtro sia nel menu di creazione:

| # | Etichetta | Chiave interna |
|---|---|---|
| 1 | Categorizzazione Fatture | `invoice_categorization` |
| 2 | Categorizzazione Movimenti | `movement_categorization` |
| 3 | Riconciliazione Fatture-Banca | `invoice_bank_reconciliation` |
| 4 | Riconciliazione Fatture-Carta | `invoice_cc_reconciliation` |
| 5 | Riconciliazione Estratto Conto Carta | `cc_statement_reconciliation` |
| 6 | Assegnazione Automatica Cliente | `auto_assign_client` |
| 7 | Assegnazione Automatica Fornitore | `auto_assign_supplier` |
| 8 | Rilevamento Duplicati | `duplicate_detection` |
| 9 | Termini Pagamento Automatici | `auto_payment_terms` |
| 10 | Avvisi Scadenze | `due_date_alert` |

`[DEDOTTO]` Tre dei dieci tipi (3, 4, 5) sono di **riconciliazione**, e
corrispondono uno a uno alle regole R2, R5 e R6 del motore assistito. Il motore
non è quindi un blocco chiuso: l'utente può aggiungere le proprie regole di
abbinamento accanto a quelle di fabbrica. Questo scioglie la domanda lasciata
aperta in fondo a questo documento.

`[OSSERVATO]` Il tipo 10, **Avvisi Scadenze**, esiste come regola ordinaria e
non è marcato come funzione a pagamento nell'elenco.

---

## 1b. Il salvataggio delle regole non funziona `[VERIFICATO]`

Il test previsto era stabilire se l'azione «Invia Avviso» fosse bloccata
dall'addon dei promemoria. La risposta è **no**, ma per un motivo che rende la
domanda irrilevante: **nessuna regola, di nessun tipo, può essere creata.**

### L'esperimento
Compilato il modulo con nome, tipo «Avvisi Scadenze», una condizione
(«Descrizione contiene TEST_CK») e azione «Invia Avviso», il salvataggio
fallisce. Ripetuto con la configurazione più banale possibile —
tipo «Categorizzazione Movimenti», azione «Imposta Categoria» con valore
«Utenze» — fallisce allo stesso modo.

### La causa
La chiamata risponde **400 Bad Request**, non 403. Non è quindi un blocco di
licenza. Il corpo della risposta dice:

```json
{"error":"Invalid request body","details":[{"code":"invalid_type",
 "expected":"number","received":"undefined","path":["companyId"],
 "message":"Required"}]}
```

E il corpo effettivamente inviato dal client è:

```json
{"name":"TEST_CK_avviso_scadenze","description":null,
 "ruleType":"movement_categorization","scope":"invoices",
 "triggerEvent":"on_import",
 "conditions":{"logic":"and","items":[{"field":"description",
   "operator":"contains","value":"TEST_CK"}]},
 "actions":[{"type":"set_category","value":"735"}],
 "priority":50,"isActive":true}
```

`[OSSERVATO]` Il payload è ben formato e completo di tutto, **tranne
`companyId`**, che il server richiede come campo obbligatorio.

`[DEDOTTO]` L'interfaccia non allega l'identificativo dell'azienda alla
richiesta. Il difetto è nel client, non nella validazione: qualunque
combinazione di tipo, ambito, condizioni e azioni produce lo stesso rifiuto.
L'intera funzionalità «Regole Automatiche» — dieci tipi, tredici operatori,
undici azioni — **è inutilizzabile**.

`[IPOTESI]` È plausibile una regressione recente introdotta con il multi-azienda
della versione 0.26.5: prima l'azienda era implicita nella sessione, ora va
passata, e questo punto di chiamata non è stato aggiornato. Congettura
verosimile ma non dimostrabile dall'esterno.

### Due dettagli utili emersi dal payload `[OSSERVATO]`
- Esiste un campo **`triggerEvent`** con valore `on_import`, che l'interfaccia
  non espone. Conferma che le regole scattano all'importazione, e suggerisce
  che siano previsti altri momenti di innesco non ancora esposti.
- La **priorità** ha valore predefinito `50`, quindi è una scala numerica con
  spazio sopra e sotto, non un semplice ordinamento per trascinamento.
- Selezionando tipo «Categorizzazione Movimenti» l'ambito è rimasto `invoices`:
  i due campi sono indipendenti e l'interfaccia permette combinazioni
  incoerenti, come una regola sui movimenti applicata alle fatture.

### Come si presenta il fallimento all'utente
Non in silenzio, ma quasi. Dopo qualche secondo compare una finestra:

> **Si è verificato un errore** — Si è verificato un errore durante
> l'operazione. Se il problema persiste, ti consigliamo di aprire un ticket di
> supporto. **Dettagli:** Invalid request body.
> *Screenshot e log della console verranno allegati automaticamente al ticket.*
> [Chiudi] [Apri Ticket]

Vedi `assets/cashking/screenshots/16-errore-con-apertura-ticket.png`.

`[DEDOTTO]` La finestra di errore è ben fatta — riporta il dettaglio tecnico e
offre di aprire un ticket allegando automaticamente screenshot e log — ma il
messaggio «Invalid request body» non dice all'utente nulla di azionabile, e
soprattutto **nessuna correzione del modulo potrebbe risolvere**: manca un
campo che l'utente non controlla. L'utente proverà a cambiare i propri dati
all'infinito.

### Il costruttore di regole `[OSSERVATO]`

Vedi `assets/cashking/screenshots/11-costruttore-regole.png`.

Campi della regola: **Nome** (obbligatorio), Tipo, **Ambito**, Descrizione,
interruttore **Attiva**, **Priorità** numerica.

Ambito, quattro valori: Fatture · Movimenti Banca · Movimenti Carta · Tutti.

Logica delle condizioni: **Tutte le condizioni (AND)** oppure **Almeno una
condizione (OR)**, con condizioni aggiungibili e rimuovibili una a una.

**Undici campi condizionabili:** Descrizione · Importo · Data · Nome Cliente ·
Nome Fornitore · Numero Fattura · Categoria · Tipo · Stato · **Esercente** ·
Valuta.

**Tredici operatori**, esattamente come dichiarato dalla guida: Uguale a ·
Diverso da · Contiene · Non contiene · Inizia con · Finisce con · Maggiore di ·
Minore di · Maggiore o uguale · Minore o uguale · È vuoto · Non è vuoto ·
**Espressione regolare**.

**Undici azioni:** Imposta Categoria · Imposta Cliente · Imposta Fornitore ·
Crea Riconciliazione Banca · Crea Riconciliazione Carta · Collega Estratto Conto
Carta · **Compensa con Fattura Fornitore** · Imposta Termini Pagamento · Segna
come Duplicato · **Invia Avviso**.

`[DEDOTTO]` Il campo **Esercente** ha senso solo sui movimenti di carta, dove il
nome del merchant è l'unico appiglio per la categorizzazione. È il tipo di campo
che si aggiunge solo dopo aver visto dati veri.

`[DEDOTTO]` L'azione **Compensa con Fattura Fornitore** è notevole: automatizza
la partita di giro fra un credito e un debito verso lo stesso soggetto, che di
norma si fa a mano.

### Il piano dei conti dimostrativo `[OSSERVATO]`
Il menu «Valore Azione» dell'azione «Imposta Categoria» espone le venti
categorie del dataset: Stipendi · Contributi INPS · TFR · Vendite Prodotti ·
Servizi Consulenza · Abbonamenti · Commissioni · Interessi Attivi · Materie
Prime · Spese Spedizione · Marketing e Pubblicità · Software e Licenze · Affitto
Ufficio · Utenze · Assicurazioni · Commissioni Bancarie · Interessi Passivi ·
IVA · IRES/IRAP · F24.

`[DEDOTTO]` È un piano dei conti piatto e orientato alla cassa, non alla
contabilità generale: mescola voci di costo (Utenze, Affitto) con voci fiscali
(IVA, IRES/IRAP, F24) e con voci finanziarie (Interessi Attivi e Passivi,
Commissioni Bancarie). Coerente con un prodotto che classifica movimenti
bancari, non scritture.

---

## 2. Sinonimi delle controparti `[OSSERVATO]`

Descrizione: «I Sinonimi sono nomi alternativi per clienti e fornitori. Vengono
usati durante l'importazione per riconoscere automaticamente la controparte
anche se il nome nel file è diverso.»

| Aspetto | Dato dichiarato |
|---|---|
| Uso principale | riconoscimento della controparte in importazione |
| Corrispondenza | «funzionano anche con **corrispondenza parziale**» |
| Creazione automatica | «vengono creati automaticamente anche durante la **riconciliazione** e l'**unione** di clienti/fornitori» |
| Cestino | i sinonimi cestinati stanno in un tab dedicato e sono ripristinabili |
| Gestione | ricerca, filtro e ordinamento, «anche tra centinaia di voci» |

### Perché è il pezzo che tiene insieme il resto

`[DEDOTTO]` Il problema che risolve è la ragione per cui la riconciliazione
bancaria è difficile: la banca scrive «GREEN ENERGY COOP SOC COOP A RL», il
gestionale ha «Green Energy Coop», e nessun confronto letterale li unisce. Il
dizionario dei sinonimi è ciò che trasforma il fattore «controparte» del
punteggio di riconciliazione da inutile a decisivo.

`[DEDOTTO]` Il dettaglio che conta è che i sinonimi **si accumulano da soli**,
in tre modi: approvando un abbinamento in riconciliazione, unendo due
anagrafiche duplicate, oppure a mano. L'utente non deve sedersi a compilare un
dizionario: lo costruisce come effetto collaterale del lavoro che stava già
facendo. È lo stesso principio dell'apprendimento descritto in
`02-01-riconciliazione-assistita.md`, cap. 5b.

`[DEDOTTO]` Il cestino con ripristino esiste perché un sinonimo sbagliato è
peggio di un sinonimo assente: attribuisce silenziosamente movimenti alla
controparte sbagliata. Poterlo togliere e rimettere senza perderlo è prudenza
ben riposta.

---

## 3. Cosa ne ricaviamo

| Accorgimento | Perché funziona | Come lo faremmo |
|---|---|---|
| Dizionario di sinonimi per le controparti | È il pezzo che rende possibile riconoscere la stessa azienda scritta in dieci modi diversi | Tabella `CounterpartySynonym` con `clienteId`/`fornitoreId`, testo normalizzato e origine; confronto anche parziale |
| Sinonimi creati come effetto collaterale | L'utente non compila un dizionario, lo accumula lavorando | Alla conferma di un abbinamento o all'unione di due anagrafiche, proporre il salvataggio |
| Esecuzione retroattiva delle regole | Una regola che vale solo per il futuro non viene adottata | Azione «applica ai documenti esistenti» con anteprima del numero di documenti toccati |
| Statistiche di esecuzione per regola | Rende manutenibile un insieme di regole che cresce | Contatori `ultimaEsecuzione`, `numeroEsecuzioni`, `documentiTrovati` sulla regola |
| Ambito della regola per tipo di documento | Evita che una regola pensata per i movimenti tocchi le fatture | Campo `ambito` enumerato, applicato nella query di selezione |
| Ordine esplicito, prima corrispondenza vince | Regola semplice da spiegare e da prevedere | Campo `ordine` intero, riordinabile per trascinamento |
| Cestino dei sinonimi con ripristino | Un sinonimo sbagliato attribuisce movimenti alla controparte sbagliata in silenzio | Cancellazione morbida con `trashedAt`, tab dedicato |

---

## 4. Verifiche rimaste aperte

Delle tre domande poste nella prima stesura, due sono state chiuse nel capitolo
1b: i dieci tipi e i tredici operatori sono enumerati, e tre dei dieci tipi sono
di riconciliazione, quindi le regole agiscono anche lì. **Resta aperta una sola
domanda:** se esista un'anteprima del risultato prima di applicare una regola
massivamente, come il suggerimento «testa sempre le regole» lascia intendere.
Non è verificabile finché la creazione delle regole resta rotta.
