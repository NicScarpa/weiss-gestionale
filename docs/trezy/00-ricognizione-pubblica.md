# Trezy — Ricognizione pubblica (Fase 0)

**Chiusura: 11 agosto 2026.** Perimetro: esclusivamente Trezy, da fonti pubbliche — sito, listino, knowledge base interna al prodotto, changelog, bundle JavaScript dell'applicazione, demo, casi studio, stampa, directory di recensioni. Nessun accesso autenticato.

Questo è il documento di sintesi. I tre approfondimenti stanno in:

| Documento | Copre |
|---|---|
| [`00a-sito-e-pricing.md`](00a-sito-e-pricing.md) | Posizionamento, azienda, sei moduli come dichiarati, listino completo, matrice feature→piano, integrazioni, lessico |
| [`00b-knowledge-base-e-api.md`](00b-knowledge-base-e-api.md) | Knowledge base interna, regole di calcolo, riconciliazione e scadenzario, metodi di previsione, SDI/Invopop, changelog, inventario endpoint e modello dati |
| [`00c-demo-casi-studio-mercato.md`](00c-demo-casi-studio-mercato.md) | Interfaccia ricostruita da 47 screenshot, tre casi studio, percezione di mercato, ecosistema |

**Convenzione:** `[OSSERVATO]` letto direttamente con fonte · `[DEDOTTO]` inferito da fatti osservati · `[IPOTESI]` congettura non verificata.

---

## Il ritrovamento che governa tutti gli altri

**Trezy comunica un prodotto molto più semplice di quello che ha costruito.**

Il sito vende sei moduli, l'intelligenza artificiale e la previsione a dodici mesi, con un lessico da imprenditore che non sa di contabilità. Il prodotto reale — ricostruito dalle stringhe di localizzazione, dalla knowledge base interna e dai 225 percorsi estratti dal bundle JavaScript — è un sistema di tesoreria strutturato che contiene, senza mai nominarli pubblicamente:

- uno **scadenzario** completo con stati (`Pagato`, `Parzialmente pagato`, **`Scaduto`**, `In arrivo`, `Riconciliato`, `In attesa`, `Pagato in eccesso`) e **aging a quattro fasce fisse** 0-30 / 31-60 / 61-90 / >90 giorni;
- un **motore di matching a sei livelli di affidabilità**, dalla «corrispondenza perfetta (importo + data)» al «possibile abbinamento», con gestione di pagamenti parziali, eccedenze, frazionamenti e una transazione che copre più rate;
- **DSO, DPO, DIO e CCC** calcolati, con la formula del ciclo di conversione esposta all'utente;
- un **ponte P&L → tesoreria** che moltiplica l'imponibile per (1+IVA) e lo distribuisce su bucket di incasso a 0/15/30/45/60/90 giorni, con rilevamento automatico dei termini dallo storico e avvisi espliciti sulla scarsa numerosità del campione;
- una **contabilità stimata** (`/api/v2/estimated-accounting/*`): prima nota, bilancio di verifica, conto economico e stato patrimoniale *dedotti* dai movimenti bancari categorizzati;
- un **monitoraggio IVA** con aliquota per categoria, override per transazione, gestione delle intracomunitarie e iniezione del saldo IVA nel cash flow;
- un **marketplace di finanziamento** («CashBooster»/«Boost») con factoring, linee di credito, finanziamento del magazzino e prestiti di tesoreria;
- **inventario, sessioni di inventario e ricette** (`/recipes`) — cioè distinte base per la ristorazione.

`[DEDOTTO]` Il divario non è casuale. Il sito è costruito per la conversione self-service di un pubblico che non conosce quel vocabolario, mentre la sostanza del prodotto è quella di uno strumento da controller. `[DEDOTTO]` La conseguenza pratica per chi valuta Trezy è che **il sito sottostima il prodotto**: giudicarlo dalle pagine di marketing porta a conclusioni sbagliate in difetto.

`[DEDOTTO]` Il rovescio: funzioni sostanziali restano invendute e probabilmente poco usate, perché nessuno le cerca dove non sono annunciate.

---

## I sette fatti che cambiano il giudizio

### 1. Il «95% di precisione delle previsioni» è un numero preso in prestito

`[OSSERVATO]` Il changelog del **2 gennaio 2024** riporta: «we have improved the classification accuracy **from 60.99% to 95.69%**». È l'accuratezza della **categorizzazione automatica delle transazioni**, misurata una volta, a gennaio 2024.

`[DEDOTTO]` Il marketing attuale usa «95%» per **due grandezze diverse**: la categorizzazione (dove il dato ha un'origine tracciabile) e la **precisione delle previsioni di cassa** (dove non esiste alcuna misurazione pubblicata). Il claim su cui è costruita l'intera comunicazione — «95% forecast accuracy» — non ha una fonte propria: coincide numericamente con la metrica di un'altra funzione.

### 2. I termini di pagamento non spostano la cassa

`[OSSERVATO]` La knowledge base interna è esplicita: i termini di pagamento definiscono il ritardo medio fra registrazione e movimento di denaro, ma «questa informazione è utilizzata **esclusivamente nelle sezioni contabilità e performance dell'app — non influisce sulla vista cashflow**».

`[DEDOTTO]` Il previsionale di cassa vero e proprio resta guidato da metodi statistici (media delle ultime **tre** osservazioni, crescita composta o lineare, duplicazione dell'anno precedente, ricorrenze) e dalle previsioni immesse a mano, **non** dallo slittamento delle scadenze. Lo scadenzario esiste e riconcilia, ma il ponte fra competenza e cassa vive nel modulo performance, non nella tesoreria. È una separazione architetturale che va verificata sul campo.

### 3. La previsione IA sul conto economico richiede un file fiscale francese

`[OSSERVATO]` L'applicazione dichiara: «L'AI analizzerà le tue categorie di profitti e perdite degli ultimi 24 mesi per generare previsioni per i prossimi 36 mesi. **Richiede dati contabili (caricamento FEC)**.» Il FEC è il *Fichier des Écritures Comptables*, tracciato obbligatorio francese.

`[DEDOTTO]` Per un'azienda italiana quel file non esiste. Resta il ripiego di un libro giornale generico `.xlsx`/`.csv`. `[DEDOTTO]` L'impianto contabile del prodotto è francese fin nelle fondamenta: 19 dei 225 percorsi sono sotto `/fec/*`, il conto economico ha struttura **SIG**, gli import nativi sono FEC, Cegid e Pennylane.

### 4. Tre aggregatori bancari coesistono, e nessuno è dichiarato

`[OSSERVATO]` Il bundle dell'applicazione contiene percorsi per **Enable Banking** (con widget caricato da `tilisy.enablebanking.com`) e **Plaid**, più la gestione errori per **Powens**; lo screenshot del flusso di collegamento mostra l'interfaccia Powens con la sua licenza ACPR. Il changelog documenta la traiettoria: **Bridge** e **Salt Edge** nel gennaio 2024, poi **Plaid** («oltre 12.000 istituzioni»), oggi i tre attuali.

`[DEDOTTO]` Le «2.000+ banche» sono copertura acquistata, non un asset proprietario, e la cifra è **incoerente con la stessa knowledge base interna**, che parla di «centinaia di banche in tutta Europa». `[DEDOTTO]` Convivere con tre aggregatori significa che la qualità della connessione italiana dipende da quale provider serve quella banca — variabile che il cliente non controlla e che il sito non espone.

### 5. Il changelog è fermo da 28 mesi

`[OSSERVATO]` L'ultima voce è dell'**8 aprile 2024** (beta pubblica di «Trezy 3.0»), mentre il link «Aggiornamenti del prodotto» resta nel piè di pagina di tutte le versioni linguistiche.

`[OSSERVATO]` Nel frattempo un intero prodotto è stato dismesso: `data.trezy.io` — benchmarking settoriale su 700 settori francesi e 2 milioni di aziende europee, protagonista di cinque voci di changelog fra agosto e dicembre 2023 — oggi risponde **404**.

`[DEDOTTO]` Il benchmarking di settore continua però a essere promesso sulla pagina prodotto KPI («Trezy confronta i tuoi KPI con le medie di settore»). O la funzione è stata reinternalizzata senza annuncio, o la promessa è sopravvissuta al prodotto che la manteneva. `[IPOTESI]` La seconda è più probabile, vista l'assenza di qualunque riferimento alla fonte dei benchmark.

### 6. Non esiste un sistema di allerta: esiste una coda di lavoro

`[OSSERVATO]` Il marketing promette di essere avvisati «con settimane di anticipo» delle carenze di cassa. Nel prodotto l'unico endpoint di allerta è `/balance-thresholds`, e il meccanismo descritto dalla knowledge base è la **Forecast Inbox**: una casella che «si apre automaticamente quando accedi al cashflow» e raggruppa transazioni da verificare, previsioni da riconciliare e fatture scadute o in arrivo.

`[DEDOTTO]` È un modello *pull*, non *push*: bisogna entrare nell'applicazione per sapere che qualcosa non va. Esistono notifiche push su dispositivo mobile (`/notifications/register`, con preferenze), ma il changelog cita il lavoro sugli alert una sola volta, nell'agosto 2023, e solo come modifiche «backend» abilitanti.

### 7. Quattro recensioni pubbliche a fronte di 2.500 clienti dichiarati

`[OSSERVATO]` Capterra: 0 recensioni. GetApp: 0. G2: profilo senza recensioni leggibili. Trustpilot FR: 1. Appvizer FR: 3. Delle tre di Appvizer, **una è firmata dall'Head of Growth di Trezy stessa** e un'altra dal testimonial del caso studio La Manufacture.

`[OSSERVATO]` Il claim «4,8 stelle su **127 recensioni**», presente nello schema JSON-LD del sito e nelle pagine comparative, non trova riscontro su nessuna piattaforma pubblica.

`[DEDOTTO]` Non è possibile formarsi un'opinione indipendente sull'affidabilità operativa del prodotto: le uniche voci critiche disponibili sono editoriali francesi, non di utenti.

---

## Che cosa Trezy è, in una frase

`[DEDOTTO]` Uno strato di lettura e proiezione che si installa **sopra** il conto corrente e, opzionalmente, sopra il gestionale contabile — mai al posto loro. Non scrive in contabilità (entrambe le integrazioni sono in sola lettura, e il sito lo dichiara come garanzia), non emette fatture verso lo SDI, non presenta dichiarazioni. Ricostruisce per **stima** ciò che la contabilità produrrebbe per competenza, con settimane di anticipo e un decimo della fatica.

Il destinatario è l'imprenditore di una PMI sotto i cinquanta dipendenti che oggi aspetta il commercialista, non il direttore finanziario che ha già i dati.

---

## Lo stato dell'offerta italiana

`[OSSERVATO]` L'Italia è dichiarata mercato aperto **nel 2026**. Sono presenti: localizzazione del sito, cinque banche italiane citate nominalmente, e — non annunciato da nessuna parte — un **connettore SDI via Invopop** che registra l'azienda per partita IVA, fa dirottare il Codice Destinatario presso l'Agenzia delle Entrate e importa le fatture ricevute ed emesse.

`[OSSERVATO]` Mancano: qualunque caso studio italiano, qualunque copertura stampa italiana, qualunque partnership con banche o con ordini professionali, qualunque integrazione con i gestionali italiani (TeamSystem e Fatture in Cloud compaiono solo come pagine comparative, cioè come concorrenti), lo schema di bilancio civilistico, la trasmissione allo SDI, la conservazione a norma e la liquidazione IVA telematica.

`[OSSERVATO]` La qualità della localizzazione è bassa e verificabile: il glossario «italiano» ha 231 lemmi **in francese**; la demo interattiva è integralmente in francese anche aprendola da `/it/`, con refusi mai corretti; la pagina italiana della partnership Pennylane serve testo francese; l'URL dell'offerta per commercialisti resta `offre-daf`.

`[DEDOTTO]` **La presenza italiana di Trezy è oggi un sito tradotto più una funzione fiscale non comunicata.** Il connettore SDI è la cosa più seria che abbiano fatto per l'Italia, ed è invisibile a chiunque li valuti dall'esterno.

---

## Contraddizioni interne registrate

Utili come misura dell'attendibilità di ciò che Trezy dichiara. Tutte `[OSSERVATO]`.

| Oggetto | Versione A | Versione B |
|---|---|---|
| KPI | «20+» (homepage, pagina KPI) | «27+» (offerta CFO, QuickBooks, lancio italiano) |
| Ore risparmiate | «10+ a settimana» (hero) | «otto ore» (testo lungo della stessa pagina) |
| Prova gratuita | 14 giorni (tutte le pagine) | 7 giorni (schema JSON-LD della homepage inglese) |
| Assistenza | «24/7 Supporto Disponibile» (pagine prodotto) | «during business hours» (homepage inglese) |
| Banche | «2.000+» (marketing) | «centinaia in tutta Europa» (knowledge base interna) |
| Anno di fondazione | 2021 (schema del sito) | 2020 (stampa francese) |
| Prezzo | 7,50 €–39 € (sito 2026) | 39 €/mese piano unico (Capterra, GetApp, Appvizer) |
| Applicazione mobile | «Android, iPhone/iPad» (Capterra) | nessuna app nativa, solo web responsive (recensione editoriale, changelog) |
| Recensioni | «4,8 su 127» | 4 recensioni pubbliche totali |

`[OSSERVATO]` Difetti visibili nel materiale promozionale ufficiale: nella schermata Documenti della demo, diverse fatture hanno importo **€0,00** (estrazione fallita) e un fornitore appare come «M\ndeliveroo», con un carattere di escape non gestito fino all'interfaccia.

---

## Domande aperte per la fase successiva

Le cose che la ricognizione pubblica non può stabilire e che vanno osservate sul prodotto:

1. **Le soglie del matching.** «Importo simile» e «data di scadenza vicina» implicano tolleranze mai dichiarate, né in giorni né in percentuale.
2. **Se le fatture importate da SDI alimentino il previsionale di cassa** come scadenze, o restino confinate al modulo documenti e alla performance.
3. **Quanto pesi davvero la previsione statistica** rispetto all'immissione manuale: la media delle ultime tre osservazioni è un modello elementare, e va misurato l'errore su un orizzonte reale.
4. **Che cosa faccia l'integrazione `falco`**, quarto connettore accanto a Pennylane, QuickBooks e Invopop, il cui dominio applicativo non è ricavabile dalle stringhe.
5. **Dove siano ospitati i dati**: una fonte editoriale sostiene «negli Stati Uniti», nessun'altra conferma o smentisce, e la privacy policy non elenca né sub-processor né ubicazione.
6. **Se il benchmarking di settore esista ancora**, dopo la dismissione di `data.trezy.io`.
7. **La qualità reale della connessione alle banche italiane**, che dipende da quale dei tre aggregatori le serve.

---

## Indice dei materiali raccolti

In `/Users/nicolascarpa/Desktop/accounting/assets/trezy/materiali-pubblici/`:

| Gruppo | File | Contenuto |
|---|---|---|
| Sito | `sito-01` … `sito-10` | Homepage, listino, sei pagine prodotto, offerta CFO, integrazioni, lancio italiano |
| Knowledge base | `kb-01` … `kb-09` | Connessione bancaria, import ed export, categorie, metodi di previsione, Academy e regole di calcolo, riconciliazione e scadenzario, SDI/Invopop, changelog, inventario endpoint e modello dati |
| Demo | `demo-01` … `demo-04` | Tour Supademo di 75 passi, collegamento bancario, video di homepage, testimonianze e recensioni |
| Immagini | `screenshot-demo-interattiva/` (47), `screenshot-demo-connessione-banca/` (4), `screenshot-homepage/` (2) | Schermate dell'applicazione reale a 3016×1448 px, scaricate senza autenticazione |

In `/Users/nicolascarpa/Desktop/accounting/assets/trezy/`: `screenshots/` (40 immagini dell'applicazione), `har/` e `api-traces/` (7 sessioni ciascuna) — materiale della fase autenticata, fuori dal perimetro di questo documento.
