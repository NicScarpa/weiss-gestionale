# Agicap — ricognizione pubblica (Fase 0)

Analisi competitiva WEISS · prodotto: **Agicap** · redatto l'**11 agosto 2026**
Ambiente di analisi: produzione, accesso parziale, scadenza **18 agosto 2026**.

Questo documento è la sintesi della Fase 0. Il dettaglio, con URL e date per ogni
affermazione, sta nei file di `00-fonti/` elencati in fondo.

**Nessuna affermazione qui viene dal prodotto**: la Fase 0 precede l'accesso.
Tutto ciò che segue è `[DA DOCUMENTAZIONE]` salvo dove diversamente marcato, e
va confermato o smentito nelle fasi successive.

---

## 1. Che cosa è Agicap, secondo Agicap

Piattaforma di cash management e tesoreria di origine francese, oggi presente su
più mercati europei fra cui l'Italia. Si rivolge a un mid-market strutturato: la
figura di riferimento nelle loro comunicazioni è il CFO o il controller, non
l'imprenditore.

L'offerta è organizzata in **linee di prodotto**, non in un unico applicativo:

| Linea | Contenuto |
|---|---|
| Gestione della tesoreria | consuntivo, previsionale, scenari, reporting |
| Pianificazione della liquidità | previsioni a medio-lungo termine, budget, stress test |
| Connettività bancaria & ERP | collegamenti a banche e gestionali |
| Gestione del ciclo passivo | fatture fornitori, approvazioni, pagamenti |
| Gestione del ciclo attivo | crediti, solleciti, DSO |
| Gestione delle spese | carte aziendali, note spese |
| Pagamenti | disposizioni, bonifici |

A giugno 2026, al Treasury Day di Milano, hanno annunciato tre novità: **Agicap
MCP** (connettore che espone la tesoreria dentro un assistente AI), **Smart
Report** e **Assistente AI**. La direzione di prodotto dell'ultimo anno è
dichiaratamente l'AI applicata alla tesoreria.

---

## 2. Come si compra — e perché è la sezione più istruttiva

**Agicap non pubblica prezzi da nessuna parte.** Nessun listino, nessun tier con
importo, nessuna stima. Il prezzo si ottiene solo per preventivo.

Le tre fonti ufficiali si contraddicono sull'impegno contrattuale `[OSSERVATO]`:

| Fonte | Cosa dice |
|---|---|
| FAQ italiana, pagina tariffe | «offerta senza impegno, cancelli quando vuoi» |
| FAQ inglese, pagina pricing | «annuale, minimo 12 mesi» |
| Condizioni Generali, art. 12.1 | periodo iniziale + **rinnovo tacito** + disdetta scritta con **30-90 giorni** di preavviso |

Il contratto prevede inoltre: pagamento anticipato dell'intero periodo,
**indicizzazione automatica del 5% a ogni rinnovo**, riduzione del perimetro
efficace **solo alla scadenza** (si sale subito, si scende a fine anno), supporto
solo via chat in orario d'ufficio, e penale di 125 €/ora per appuntamenti di
formazione disdetti con meno di 48 ore.

### Cosa vendono separatamente, e cosa dice di dove sta il valore

Il gating per tier non è pubblico, ma **cosa è modulo a sé** lo è, e il segnale è
altrettanto forte:

1. **La connettività bancaria e ERP è inclusa ovunque.** Il pezzo più costoso da
   costruire è dato per scontato: è il fossato competitivo, non il prodotto.
2. **La riconciliazione contabile è a pagamento.** Vedere il flusso bancario non
   dà il diritto di trasformarlo in scritture.
3. **Il previsionale è spaccato in due.** Le 13 settimane a maglia giornaliera
   stanno nel base; i 12+ mesi con AI, la conversione del budget di conto
   economico in cassa e gli stress test sono un modulo separato. **Il breve
   termine è commodity, il medio-lungo si paga.**
4. **Il controllo delle spese è gratuito sopra i 5.000 €/mese di transato**: si
   pagano sull'interchange. Il valore percepito del controllo è basso, quello del
   flusso di pagamento è alto.
5. **La struttura delle categorie e i KPI sono servizi professionali a preventivo
   separato.** Il piano dei conti gestionale — la parte che rende lo strumento
   davvero tuo — non è nel prezzo del software.

### Il gating vero, letto nel codice

`[DEDOTTO dal bundle JavaScript]` Il front-end valuta **362 «relazioni»** per
decidere cosa mostrare. Ne emerge che il gating è **a tre livelli**, non a due:

**prodotto → modulo → permesso utente**

Un cliente può avere il prodotto Cashflow ma non il modulo
`treasury_bank_journal`; un utente dentro quel cliente può avere il modulo ma non
il permesso di scriverci. I moduli attivabili sono **24**, con nome tecnico
esplicito (`treasury_pnltocash`, `ar_reconciliation`, `ap_preaccounting`,
`cash_collect`, `einvoicing_*`, `ai_assistant`, …), ed esiste un intero apparato
di **accesso temporaneo per singolo modulo** (`has_temporary_module_*_access`):
la vendita è incrementale, modulo per modulo. Perfino un singolo modulo può avere
due livelli (`treasury_bank_fees` e `treasury_bank_fees_advanced`).

Nessun listino a tre tier potrebbe descrivere questa struttura — il che spiega
anche perché non ne pubblichino uno.

**Convergenza di tre fonti indipendenti** sulla stessa architettura di
autorizzazione: le 362 relazioni nel bundle, i **283 scope** dichiarati nella
discovery OpenID, e un modello **ReBAC su OpenFGA** ricostruito dagli abstract
dei talk della loro Head of Engineering. Tre strade diverse, stesso risultato.

---

## 3. Integrazioni e copertura italiana

**Connettività bancaria** — dichiarano EBICS, SWIFT, host-to-host, PSD2 e oltre
300 banche europee. Il catalogo italiano pubblico è però **una vetrina, non un
catalogo**: 14 loghi e la dicitura «e molto altro», nessun elenco consultabile.
Le loro stesse comunicazioni si contraddicono sul totale delle banche connesse:
3.000+ negli articoli di maggio-giugno 2025, 14.000+ in quello aggiornato a
giugno 2024. Nessuna fonte risolve la discrepanza.

**API pubblica** — `[OSSERVATO]` esiste, è documentata e **le specifiche OpenAPI
di 18 prodotti API sono pubblicate in chiaro, senza autenticazione**. È la fonte
più concreta di tutta la Fase 0 e alimenta `03-modello-dati.md`. Autenticazione
OAuth2 client credentials; fra i moduli, un «Treasury Bank Journal» per esportare
le scritture contabili di banca, con macchina a stati «Ready to export» →
«Exported» e due contatori opzionali per **continuare la numerazione di giornali
e scritture create fuori da Agicap**. È una risposta pulita a un problema che
abbiamo identico.

**Cosa l'API non espone, verificato e non assunto** — ricerca sistematica su
tutte le specifiche: **categorie e regole di categorizzazione, previsioni, budget,
scenari, saldi di conto e movimento bancario grezzo sono assenti.** Non esiste un
`Transaction { data, importo, descrizione, controparte }` nell'API pubblica, né
un campo `balance` su un conto corrente. `[DEDOTTO]` Il cuore del prodotto non è
esposto: l'API copre gli anelli esterni — ingresso dei dati (file bancari,
documenti, anagrafiche) e uscita (scritture contabili verso l'ERP). Chi integra
Agicap può alimentare il previsionale e leggerne il risultato contabile, **non
ricostruirlo**. È una scelta di prodotto, non una dimenticanza.

**Fatturazione elettronica italiana** — qui c'è una contraddizione da tenere
presente: il sito italiano dichiara l'integrazione con lo SDI, ma **l'API
pubblica non ne ha traccia** e l'unica infrastruttura di e-invoicing documentata
tecnicamente è francese e belga. `[DEDOTTO]` La lettura più plausibile è che le
fatture italiane arrivino di rimbalzo dai gestionali che già dialogano con lo SDI
(Fatture in Cloud, TeamSystem, Sistemi, Passepartout), e che «si integra con lo
SDI» sia una semplificazione di contenuto SEO. Nessuna fonte pubblica dimostra
che Agicap sia un intermediario SDI accreditato.

---

## 4. Cosa dicono gli utenti

Fonte: recensioni di terze parti, corpus non omogeneo, prevalenza di recensioni
italiane del febbraio 2024 e tedesche/francesi più distribuite nel tempo. Sono
opinioni, non fatti osservati: tutte marcate `[FONTE TERZA]` nel file di dettaglio.

Sotto-voti Capterra: servizio clienti **4,5/5**, facilità d'uso 4,3, funzionalità
4,2, **rapporto qualità-prezzo 3,7** — la voce più bassa di quasi un punto.

**Le debolezze ricorrenti**, per frequenza e attualità:

| Tema | Menzioni | Arco |
|---|---|---|
| Connessioni bancarie che si rompono, sincronizzazione non immediata | ~37 | 2021→2025, mai risolto |
| Prezzo e rapporto qualità-prezzo | ~19 | 2021→2025 |
| Integrazioni assenti o solo dichiarate | ~16 | 2021→2025 |
| Onboarding più pesante del previsto | ~14 | 2021→2025 |
| Categorizzazione automatica imprecisa, manutenzione manuale | ~13 | 2021→2024 |
| Riconciliazione fragile su sconti cassa, note di credito, pagamenti cumulativi | ~6 | 2021→2025 |

**L'elogio più ricorrente non è funzionale.** In tre lingue, gli utenti citano un
effetto psicologico: «posso programmare la liquidità e non farmi prendere
dall'ansia» (un ristoratore), «così si dorme decisamente meglio», «una grande
serenità». Il job-to-be-done reale di questa categoria di prodotto è ridurre
l'ansia di chi ha soldi in ballo — vale la pena ricordarlo quando progettiamo le
nostre schermate.

---

## 5. Lettura per la scala WEISS

WEISS è un'azienda horeca con tre punti vendita in una sola società, che incassa
prevalentemente al banco. Incrociando gli use case dichiarati nei 36 casi studio
per fascia di fatturato, emerge una separazione netta.

**Le quattro funzioni che ricorrono nelle aziende sotto i 10M:**

1. **Sapere quanto c'è**, senza ricostruirlo a mano dagli estratti conto. È la
   precondizione di tutto, non una funzione sofisticata.
2. **Un orizzonte breve, guardato spesso.** Nei casi piccoli la previsione utile
   è a 30 giorni, controllata ogni mattina. Le 13 settimane e il rolling annuale
   — su cui Agicap costruisce quasi tutto il marketing — appartengono a chi ha
   covenant bancari.
3. **Scenari per decidere una cosa concreta**: apro un locale, assumo, compro un
   macchinario, reggo un aumento dei costi. Non strutture di debito.
4. **Il controllo delle uscite.** Nella ristorazione l'incasso è contestuale al
   consumo, quindi tutto il valore di uno strumento di tesoreria si sposta sul
   lato dei pagamenti.

**Cosa è `[FUORI SCALA]` per noi**, e non per poco — nessuno di questi compare
nei casi sotto i 10M:

- Cash pooling e finanziamento infragruppo
- Consolidamento multi-entità — le nostre tre sedi sono una società sola: ci
  servirebbe l'opposto, **disaggregare per sede dentro un'unica entità**
- Gestione del debito, covenant, DSCR, strumenti di copertura
- Multi-valuta e gestione del rischio di cambio
- Ottimizzazione della liquidità in eccesso
- **L'intero modulo di gestione dei crediti** — DSO, scadenzario, solleciti,
  portale cliente, finanziamento fatture. È il modulo su cui Agicap ha i
  risultati quantificati più netti, ed è strutturalmente inapplicabile a chi
  incassa alla consumazione

---

## 6. Le contraddizioni aperte, da risolvere nel prodotto

Sono il lascito più utile della Fase 0: domande precise, verificabili, che le
fonti pubbliche non chiudono.

1. **La granularità del previsionale.** Le pagine prodotto dichiarano
   «giornaliero, settimanale, 13 settimane, annuale»; tre recensori indipendenti,
   due dei quali Food & Beverages, dicono che il minimo reale è mensile. È il
   primo test della Fase 2.
2. **I corrispettivi.** Utenti italiani del retail riferiscono che Agicap importa
   le fatture dal cassetto fiscale ma non i corrispettivi. Per un horeca è la
   differenza fra uno strumento utile e uno cieco sulla maggior parte del
   fatturato.
3. **Lo SDI**: dichiarato dal sito, assente dall'API. Da capire cosa succede
   davvero con una fattura italiana.
4. **La riconciliazione sui casi sporchi**: pagamento cumulativo, sconto cassa,
   nota di credito. Le fonti pubbliche non pubblicano soglie, punteggi di
   confidenza o finestre temporali.
5. **La grammatica delle regole di categorizzazione**: quali campi, quali
   operatori, chi vince fra regola utente e classificazione automatica,
   retroattività.

---

## 7. Limiti di verificabilità della Fase 0

Quanto segue **non** è stato accertato, e va detto prima di ogni conclusione:

- **Centro assistenza `[NON ACCESSIBILE dagli strumenti usati]`** —
  `help.agicap.com` risponde 404/403 ai client non-browser, coerentemente con un
  `robots.txt` che vieta i crawler di AI. Non è stato aggirato: nessuno
  user-agent falsificato, nessun proxy. Recuperabile con un browser reale, la
  lista prioritizzata degli articoli è pronta.
- **Video e webinar `[NON ACCESSIBILE dagli strumenti usati]`** — YouTube e i
  player incorporati non espongono testo ai client non-browser. Nessuna
  descrizione di schermata è stata ricostruita per congettura. Lista prioritizzata
  pronta.
- **Materiale dietro form di registrazione `[NON ACCESSIBILE per scelta]`** — non
  compiliamo form con dati falsi per sbloccare contenuti gated.
- **Prezzi `[NON DETERMINABILE]`** — non pubblicati da nessuna fonte ufficiale.
- **Catalogo bancario italiano `[NON DETERMINABILE]`** — vetrina di 14 loghi,
  nessun elenco completo pubblico.
- **Logiche di calcolo `[NON DETERMINABILE dalle fonti pubbliche]`** — la
  documentazione pubblica contiene solo DSO come rapporto semplice e cash flow
  previsionale come «entrate meno uscite». Nessuna formula di scostamento,
  nessuna soglia di matching, nessun punteggio di confidenza. **Le logiche vere
  si ottengono solo dal prodotto.**

---

## 8. Confini che questa analisi si è data

Registrati qui perché valgono anche per le fasi successive:

- **Le API si documentano, non si chiamano.** Le specifiche OpenAPI pubbliche
  sono state lette come documentazione; nessun endpoint è stato interrogato.
- **Nessuna API key.** Crearla sarebbe una scrittura su un ambiente di
  produzione; usarla sarebbe un canale fuori dalla UI.
- **Nessuna forzatura di blocchi tecnici** — né user-agent falsificati, né proxy,
  né aggiramento del gating per piano.
- **Sola lettura** in tutte le fasi che toccano il prodotto.

---

## 9. Indice dei file di dettaglio

| File in `00-fonti/` | Contenuto |
|---|---|
| `pricing.md` | Piani, condizioni contrattuali, cosa è venduto separatamente |
| `pagine-prodotto.md` | I moduli uno per uno, dalle pagine ufficiali |
| `help-center.md` | Knowledge base, logiche di calcolo documentate, lessico italiano, API |
| `integrazioni-e-api.md` | Banche, SDI, gestionali, le 18 specifiche OpenAPI |
| `api-mcp-modello-dati.md` | Connettore MCP, connettori terzi, modello dei permessi |
| `recensioni-terze.md` | Debolezze ed elogi ricorrenti, con frequenza e datazione |
| `casi-studio-scala-weiss.md` | I 36 casi studio letti per fascia dimensionale |
| `changelog-roadmap.md` | Cronologia delle release e direzione di prodotto |
| `video-demo-comparazioni.md` | Catalogo video e comparazioni pubblicate da Agicap |
| `rotte-da-bundle-js.md` | Mappa delle rotte dell'applicazione dal codice client |
| `help-center-da-leggere-con-browser.md` | Coda di lavoro per la Fase 1 |
| `video-da-recuperare-con-browser.md` | Coda di lavoro per la Fase 1 |
