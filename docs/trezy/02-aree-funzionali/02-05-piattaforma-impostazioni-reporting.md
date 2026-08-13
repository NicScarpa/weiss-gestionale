# Trezy — Piattaforma: impostazioni, organizzazioni, integrazioni, reporting, AI, academy

**Prodotto:** Trezy · **Ambiente:** produzione (`appv2.trezy.io`) · **Account:** reale, azienda della ristorazione
**Piano:** Premium in prova (39 €/mese, prova 5→12 agosto 2026) · **Osservazione:** 11 agosto 2026
**Perimetro:** `Impostazioni` (8 tab), navigazione desktop e mobile, `/reporting`, assistente «Chiedi a Trezy», `/academy`, piani ed *entitlement*

> **Metodo.** Sola lettura, con **una sola eccezione dichiarata**: una domanda posta all'assistente
> «Chiedi a Trezy» (§ 10.2), l'unico modo di valutarne le risposte. Per il resto: nessun
> interruttore attivato, nessun utente invitato, nessuna soglia salvata, nessun widget creato,
> nessuna integrazione connessa, nessun report condiviso. Dove un'area risulta vuota è perché
> **non è stata popolata da noi**, non perché il prodotto non la offra: la distinzione è segnata
> con i tag di seguito.
>
> **Legenda dei tag** — `[OSSERVATO]` visto in interfaccia o in una risposta API · `[DEDOTTO]`
> inferenza da evidenza osservata · `[IPOTESI]` congettura non verificata · `[NON POPOLATO]`
> funzione presente ma senza dati su questo account · `[NON ACCESSIBILE]` funzione dichiarata dal
> backend ma priva di interfaccia raggiungibile · `[NON OSSERVATO]` non guardato in questa sessione
> · `[NON VERIFICABILE]` non valutabile senza interventi che avrebbero prodotto effetti reali ·
> `[DA DOCUMENTAZIONE]` da fonti pubbliche o dal bundle JavaScript, non dall'interfaccia ·
> `[ASSENTE]` verificato negativamente (nessuna UI **e** nessuna traccia in documentazione).

---

## 1. La mappa di `Impostazioni`

`[OSSERVATO]` Otto tab su un'unica rotta (`/settings`, senza sotto-URL: il tab non è indirizzabile
né condivisibile, e il tasto «indietro» del browser non lo percorre).

| # | Tab | Contenuto | Stato su questo account |
|---|---|---|---|
| 1 | Il mio profilo | identità, indirizzo di caricamento fatture, lingua, password, cancellazione | popolato |
| 2 | Analitico | Centri di costo · Nature · Codici analitici | tutti a 0 — `[NON POPOLATO]` |
| 3 | Gestisci organizzazioni | nome, valuta preferita, utenti e ruoli, invito, eliminazione | 1 utente, 1 organizzazione |
| 4 | Fatturazione e abbonamenti | piano corrente, listino, cronologia | Premium in prova |
| 5 | Integrazioni | Pennylane · Falco · QuickBooks | nessuna connessa |
| 6 | 🎁 Referral `NEW` | — | `[NON OSSERVATO]` |
| 7 | Notifications | avvisi di saldo per conto bancario | tutti disattivati |
| 8 | Funzionalità | piano dei conti, settore, modalità di previsione, moduli e beta | il tab più rivelatore |

`[OSSERVATO]` La barra dei tab **eccede la larghezza della finestra** a 1512 px: l'ultimo tab
(«Funzionalità») resta tagliato e il primo scorre fuori campo quando lo si seleziona. Difetto
grafico minore, ma è il tab più importante a essere quello meno visibile.

`[OSSERVATO]` Tre lingue convivono nei titoli: «Integrazioni» nel menu ma **«Intégrations»** come
intestazione del pannello; «Notifications» non tradotto; **«Produits»** come intestazione di un
blocco dentro un tab per il resto italiano, con il testo introduttivo interamente in francese.

### 1.1 Su mobile questa intera area sparisce — e compare una voce che non esiste

`[OSSERVATO]` A **390 px** di larghezza il menu laterale lascia il posto a una **barra di
navigazione inferiore a cinque voci**, che non è un sottoinsieme del menu desktop:

| Barra inferiore (390 px) | Destinazione | Presente nel menu desktop? |
|---|---|---|
| Flusso di cassa | `/cashflow` | sì |
| Prestazioni | `/performance` | sì |
| **Contabilità** | **`/accounting`** | **no** |
| Transazioni | `/transaction` | sì |
| Documenti | `/document` | sì |

`[OSSERVATO]` **Quattro delle otto voci desktop non compaiono nella barra**: Reporting, Categorie,
**Impostazioni** e Academy. Non è stato individuato alcun menu secondario che le raggiunga.
`[NON VERIFICABILE]` — non si esclude che esistano un menu «altro» o una gestualità non trovata,
ma dalla barra non sono raggiungibili.

`[DEDOTTO]` La conseguenza riguarda direttamente questo documento: **da telefono, l'intera area
trattata qui è fuori portata.** Non si cambia il piano dei conti, non si invita un utente, non si
attiva un avviso di saldo, non si costruisce un report, non si consulta l'Academy. Il mobile di
Trezy è una **vista di consultazione**, non uno strumento di configurazione. È una scelta
difendibile in sé — nessuno cambia il piano dei conti in metropolitana — ma diventa un limite
concreto sull'unico blocco che avrebbe senso da telefono: gli **avvisi di saldo** (§ 7), cioè la
funzione che serve proprio a chi è fuori ufficio, e che da fuori ufficio non si può né attivare né
correggere.

`[OSSERVATO]` La voce **«Contabilità» punta a `/accounting`, e la rotta reindirizza a `/cashflow`**:
il collegamento è esposto in produzione, la pagina dietro non c'è. `[NON ACCESSIBILE]` La lettura
di questo indizio insieme agli entitlement è in § 8.3.

---

## 2. Il mio profilo

`[OSSERVATO]` Quattro blocchi più una «Zona pericolosa».

- **Informazioni profilo** — nome ed e-mail, con «Aggiorna profilo».
- **Email caricamento fattura** — un indirizzo univoco per account, nella forma
  `factures-<id>@reply.trezy.io`, dove `<id>` **coincide con l'identificativo dell'account** usato
  in tutte le chiamate `auth.trezy.io/api/v2/accounts/{id}/…`. Il testo dichiara: «Eventuali
  allegati PDF o immagini inviati a questo indirizzo verranno elaborati automaticamente».
  `[DEDOTTO]` L'indirizzo è **derivato**, non casuale: chiunque conosca l'identificativo
  dell'account conosce anche l'indirizzo di caricamento. È un canale di ingresso documentale privo
  di autenticazione del mittente, e alimenta l'OCR. `[IPOTESI]` Un terzo che indovinasse
  l'identificativo potrebbe iniettare documenti nell'archivio del cliente; non è stato verificato
  se esista un filtro sui mittenti ammessi. Il prefisso è in francese (`factures-`) su un account
  italiano.
- **Preferenze lingua** — otto lingue: inglese, francese, tedesco, spagnolo, italiano, olandese,
  polacco, croato. `[OSSERVATO]` L'etichetta francese nel menu è essa stessa non tradotta
  («🇫🇷 French» in mezzo a nomi italiani).
- **Cambia password** — «min. 6 caratteri». `[OSSERVATO]` Nessuna autenticazione a due fattori in
  questo tab né altrove nell'applicazione; nessun accesso sociale né SSO sulla schermata di login.
  `[DEDOTTO]` Per un prodotto che espone saldi, IBAN e l'intero storico bancario dell'azienda,
  una politica di password a sei caratteri senza secondo fattore è **il punto più debole
  dell'impianto**.
- **Zona pericolosa** — «Elimina il mio account», bloccato con il messaggio: «Devi trasferire la
  proprietà o eliminare tutte le organizzazioni di cui sei proprietario prima di eliminare il tuo
  account». `[DEDOTTO]` Esiste dunque un **trasferimento di proprietà** dell'organizzazione, che
  però non compare come azione nel tab «Gestisci organizzazioni»: `[IPOTESI]` è forse esposto nel
  menu a tendina del ruolo di un secondo utente, non verificabile con un solo utente censito.

---

## 3. `Funzionalità` — il tab che rivela il modello

È il tab in cui si legge, più che altrove, che cosa Trezy pensi di essere e verso quali mercati
stia guardando.

### 3.1 Piano dei conti: quindici standard nazionali

`[OSSERVATO]` Un selettore con quindici voci:

| Area | Voci |
|---|---|
| Europa continentale | Francia — Plan Comptable Général (PCG) · Belgio — PCMN · Lussemburgo — PCN · Spagna — PGC · Germania — SKR03 · Germania — SKR04 · Paesi Bassi — Personalizzato |
| Nordici | Svezia — BAS · Norvegia — NS 4102 · Danimarca — Standard · Finlandia — Yleinen tilikartta |
| Anglosassoni | UK — Personalizzato · Irlanda — Personalizzato |
| Italia | **Italia — Personalizzato** |
| Africa | OHADA — SYSCOHADA |

`[OSSERVATO]` L'account è su «Italia — Personalizzato» (`accountingStandardCode: "IT_CUSTOM"` in
`GET /api/v2/account-settings`).

`[DEDOTTO]` La parola «Personalizzato» è la dichiarazione onesta di un'assenza: dove esiste uno
schema nazionale codificato Trezy lo nomina (PCG, PCMN, PGC, SKR03/04, BAS, NS 4102), dove non
l'ha implementato lo chiama «Personalizzato». Italia, UK, Irlanda e Paesi Bassi stanno in questo
secondo gruppo. **Non esiste quindi uno schema civilistico italiano** (artt. 2424/2425 c.c.,
bilancio abbreviato, micro-impresa): esiste un contenitore vuoto da mappare a mano.

`[OSSERVATO]` Il pulsante **«Configura mappatura conti»** apre la configurazione della
corrispondenza fra i conti e le categorie. La chiamata che la alimenta,
`GET /api/accounting-mappings`, restituisce **codici interni neutri**, non numeri di conto
nazionali:

- **14 codici di stato patrimoniale**, con prefissi `EQT` (patrimonio netto), `BNK` (banca),
  `INV` (rimanenze, 5 voci), `TAX`, `TRF` (giroconti, 6 voci);
- **185 codici di conto economico**, con venti prefissi, i più numerosi `EMP` 34 (personale),
  `FIN` 22 (finanziari), `EXP` 21, `OPS` 19, `EXC` 17 (straordinari), `TAX` 14, `LEG` 12,
  `REV` 10 (ricavi), `MKT` 9;
- ogni codice porta tre attributi: `category`, `defaultVatRate`, `paymentDelayDays`.

`[OSSERVATO]` I dodici valori di `category` sono: `external_charges` (60 codici),
`personnel_costs` (35), `financial` (29), `exceptional` (17), `revenue` (15), `taxes_duties` (12),
`production_consumed` (7), `depreciation_provisions` (5), `income_tax` (2), `operating_subsidies`
(1), `other_operating_income` (1), `other_operating_charges` (1).

`[DEDOTTO]` **Questa è la struttura del conto economico del PCG francese tradotta in inglese**:
*charges externes*, *charges de personnel*, *consommations de l'exercice* (`production_consumed`),
*dotations aux amortissements et provisions*, *subventions d'exploitation*, *résultat
exceptionnel*. Il livello astratto non è neutro: è francese con etichette inglesi. La scelta del
«piano dei conti» nazionale è quindi una **mappatura di superficie** su un modello contabile che
resta quello d'origine — il che spiega perché, altrove nell'applicazione, le scritture di
`Prestazioni › Registrazioni` mostrino conti del PCG francese (512100 «Banque») su un account
dichiarato italiano.

`[OSSERVATO]` Le aliquote IVA predefinite sui 185 codici sono tre: **0 %** su 90 codici,
**20 %** su 89, **10 %** su 6. `[DEDOTTO]` Nessuna delle aliquote ordinarie italiane è
rappresentata: manca il **22 %** (ordinaria), mancano **4 %** e **5 %** (ridotte, quelle che
contano per la ristorazione e l'alimentare). Il 20 % è l'aliquota ordinaria francese. Chi apre un
account italiano parte quindi con un'IVA sbagliata su ogni categoria e deve correggerla a mano,
voce per voce.

`[OSSERVATO]` I `paymentDelayDays` predefiniti: 0 giorni su 122 codici, 30 su 41, 45 su 15,
**−30 su 7**. `[DEDOTTO]` Il valore negativo modella un incasso o pagamento **anticipato** rispetto
alla registrazione contabile: il modello prevede quindi lo sfasamento in entrambe le direzioni.

### 3.2 Settore di attività

`[OSSERVATO]` Nove valori: Non specificato, **Ristorazione**, **Commercio alimentare**, Commercio
al dettaglio, Edilizia, Industria / produzione, Servizi, Tech / digitale, Altro. L'account è su
Ristorazione (`sector: "food"`).

`[DEDOTTO]` Che due dei nove settori siano food (ristorazione e commercio alimentare) e che le tre
funzionalità beta siano tutte di food cost non è un caso: **la ristorazione è un verticale
dichiarato**, non un'applicazione generica adattata.

### 3.3 Modalità di previsione, con le formule scritte in chiaro

`[OSSERVATO]` Due modalità, entrambe descritte nell'interfaccia con la formula esplicita:

| Modalità | Formula dichiarata | Quando conviene, secondo Trezy |
|---|---|---|
| **Dettagliato** | residuo per sottocategoria in modo indipendente: `(previsione − reale)` su ciascuna | «Consigliato per la maggior parte degli utenti» — quando previsioni e transazioni stanno allo stesso livello |
| **Globale** | residuo a livello di categoria madre: `(previsione totale − reale totale)` | quando le previsioni sono sulle categorie principali ma le transazioni si distribuiscono nelle sottocategorie |

`[OSSERVATO]` `GET /api/v2/account-forecast-config` restituisce `forecastMode: "default"`, cioè
Dettagliato.

`[DEDOTTO]` **Scrivere la formula dentro l'interfaccia, e non in una nota a piè di pagina, è la
scelta di prodotto più matura vista in questa area.** Un'impostazione che cambia il saldo proiettato
viene spiegata nel punto in cui la si cambia, con l'algebra visibile. È coerente con l'impianto
dell'Academy (§ 9) e vale la pena registrarla come pratica, indipendentemente dal giudizio sul
resto.

### 3.4 Blocco «Produits» — analisi prodotti e fornitori

`[OSSERVATO]` Intestazione **in francese**, testo introduttivo in francese («Activez ces
fonctionnalités pour accéder aux analyses produits et fournisseurs dans la section Documents»),
descrizioni delle singole voci in italiano. Tre interruttori:

| Voce | Descrizione dichiarata |
|---|---|
| **Prodotti** | tutti i prodotti estratti dalle fatture in una scheda dedicata; traccia prezzi, quantità e informazioni sui fornitori |
| **Analisi fornitori** | prestazioni dei fornitori, modelli di spesa, cronologia dei pagamenti |
| **Analisi prezzi prodotti** | variazioni di prezzo nel tempo, confronto fra fornitori, «opportunità di ottimizzazione dei costi» |

`[NON POPOLATO]` Gli interruttori non sono stati attivati su questo account e le schede
corrispondenti non sono state osservate in `Documenti`.

`[DEDOTTO]` Il presupposto è che le **righe di dettaglio** delle fatture passive vengano estratte
dall'OCR: senza voci di riga con prezzo unitario e quantità, un'analisi delle variazioni di prezzo
non è costruibile. È la stessa base dati che alimenta le beta di § 3.5.

### 3.5 Funzionalità beta: food cost e magazzino

`[OSSERVATO]` Tre interruttori sotto l'intestazione «Funzionalità Beta `BETA`», con l'avvertenza
«sono sperimentali e potrebbero cambiare o essere rimosse», e la nota di chiusura «Queste
funzionalità appariranno come schede nella sezione Documenti quando abilitate».

| Voce | Descrizione dichiarata (testuale) |
|---|---|
| **Analisi costi ricette** | «Calcola e traccia il costo delle tue ricette in base ai prezzi degli ingredienti delle tue fatture» |
| **Ricette** | «Crea e gestisci ricette, collega ingredienti ai prodotti e calcola automaticamente i costi alimentari» |
| **Inventario** | «Traccia i livelli di stock in tutte le posizioni di stoccaggio, gestisci le sessioni di inventario e monitora i movimenti di magazzino in tempo reale» |

`[NON POPOLATO]` — interruttori non attivati su questo account; nessuna schermata di ricette,
inventario o sessioni è stata vista.

`[DA DOCUMENTAZIONE]` Il bundle JavaScript dell'applicazione contiene le rotte corrispondenti:
`/recipes`, `/recipes/new`, `/inventory`, `/inventory/locations`, `/inventory/sessions`, oltre a
`/products`, `/product-merges`, `/product-price-overview`, `/supplier-analysis`.

`[DEDOTTO]` È il tratto **più rilevante per un'azienda della ristorazione** in tutta l'area
piattaforma, e insieme il più fragile: food cost calcolato dai prezzi d'acquisto reali, distinte
base collegate ai prodotti delle fatture, giacenze per luogo di stoccaggio e sessioni di
inventario sono esattamente ciò che manca a un software di sola tesoreria. Sono però marcate
`BETA` con riserva esplicita di rimozione, non compaiono in nessun piano del listino, non sono
nominate sul sito pubblico e non hanno documentazione. `[IPOTESI]` La catena
*fattura → OCR delle righe → prodotto normalizzato → ingrediente → ricetta → food cost* dipende
interamente dalla qualità dell'estrazione delle voci di riga e dalla riconciliazione dei nomi
prodotto fra fornitori diversi: è il punto in cui prodotti di questo tipo normalmente falliscono, e
qui non è verificabile senza attivare gli interruttori.

---

## 4. `Analitico` — contabilità analitica a tre dimensioni

`[OSSERVATO]` Tre sotto-schede, tutte con contatore a zero: **Centri di costo (0)**, **Nature (0)**,
**Codici analitici (0)**. Ciascuna mostra la stessa tabella vuota — colonne `CODICE`, `NOME`,
`DESCRIZIONE`, `AZIONI` — con il messaggio «Nessun elemento. Clicca su "Aggiungi" per crearne uno»
e un pulsante «+ Aggiungi». `[NON POPOLATO]`

`[DEDOTTO]` Il modello sotteso è una **contabilità analitica a tre dimensioni indipendenti**:
*dove* si consuma la risorsa (centro di costo), *che cosa* è per natura (natura), e una terza
dimensione libera (codice analitico) per assi non riconducibili ai primi due — commessa,
progetto, canale. La struttura è la stessa (codice + nome + descrizione) su tutte e tre, il che
suggerisce dimensioni **piatte, non gerarchiche**.

`[DA DOCUMENTAZIONE]` Il bundle espone `/settings/analytical-dimensions` e — separatamente —
`/settings/locations`. `[IPOTESI]` La seconda rotta potrebbe essere una gestione di **luoghi**
(punti vendita o depositi) distinta dai centri di costo, ma non ha alcuna interfaccia raggiungibile
in questo account e la sua natura resta congetturale.

`[NON VERIFICABILE]` Non è osservabile **dove** le tre dimensioni vengano poi imputate: se su
transazione, su categoria, su previsione, su riga di fattura, o su più d'uno. Senza almeno un
centro di costo creato, nessun campo di imputazione compare altrove nell'applicazione. Questa è la
domanda decisiva per chi voglia leggere i conti per sede o per reparto, e resta aperta.

`[OSSERVATO]` Nessuna gestione **multi-sede** e nessun concetto di **centro di ricavo per punto
vendita** sono stati osservati nell'interfaccia. Non li si può però dichiarare assenti: i centri di
costo vuoti potrebbero servire proprio a quello, e `/settings/locations` esiste nel codice. Stato
corretto: `[NON POPOLATO]` per i centri di costo, `[NON ACCESSIBILE]` per i luoghi.

---

## 5. Multi-organizzazione, utenti e permessi

### 5.1 Il selettore in testata

`[OSSERVATO]` In alto a sinistra, su ogni schermata, il nome dell'organizzazione con un badge
**`BETA`** e una freccia a discesa. `[DA DOCUMENTAZIONE]` Il bundle contiene
`/auth/switch-account`, cioè più aziende sotto lo stesso utente.

`[DEDOTTO]` Un badge `BETA` sul **selettore di organizzazione** — non su una funzione periferica,
ma sul meccanismo che decide quali dati si stanno guardando — è un segnale da prendere sul serio.
Per un'azienda con più sedi o più società il commutatore è il pezzo su cui si appoggia tutto il
resto: se è acerbo, ogni numero letto è a rischio di provenire dal perimetro sbagliato.
`[NON VERIFICABILE]` Con una sola organizzazione censita non è stato possibile provare il cambio
di contesto, né verificare se esistano viste consolidate su più organizzazioni (che, dalla
struttura osservata, `[IPOTESI]` non sembrano esistere: ogni chiamata porta un solo `accountId`).

### 5.2 Utenti e ruoli

`[OSSERVATO]` Il tab «Gestisci organizzazioni» contiene: nome dell'organizzazione modificabile,
pulsante **«Invita utente»**, pulsante rosso **«Elimina account»**, selettore di **valuta
preferita**, e un elenco «Utenti e Permessi».

`[OSSERVATO]` `GET /api/v2/accounts/{id}/users` restituisce un solo utente, con `role: "owner"`;
`GET /api/v2/invitations/account/{id}` restituisce `null` (nessun invito pendente).

`[OSSERVATO]` Il menu a tendina del ruolo espone **tre valori**: **Proprietario**, **Utente**,
**Assistente**. Accanto, un'icona di cestino per rimuovere l'utente.

`[IPOTESI]` «Assistente» è il ruolo pensato per il **commercialista**: è il terzo attore naturale
in un prodotto che si posiziona pubblicamente contro l'attesa del commercialista, e il nome
richiama il francese *assistant comptable*. Non è però verificabile che cosa il ruolo consenta.

`[NON VERIFICABILE]` **Che cosa distingua i tre ruoli non è osservabile.** Non esiste, in nessun
punto dell'interfaccia, una matrice dei permessi, una descrizione accanto al ruolo, o un aiuto
contestuale. Invitare un secondo utente avrebbe inviato un'e-mail reale e non è stato fatto.
`[DEDOTTO]` L'assenza di una descrizione dei permessi nel punto in cui si assegna il ruolo è un
difetto in sé: chi invita il proprio commercialista non ha modo di sapere che cosa gli sta dando.

`[NON OSSERVATO]` Non risultano: gruppi, permessi per singola area, restrizioni per conto bancario
o per organizzazione, log degli accessi. Non li si dichiara assenti — semplicemente non compaiono
nell'unica schermata di gestione utenti esistente.

### 5.3 Valuta preferita

`[OSSERVATO]` **Cinquantanove valute**, dall'euro al riel cambogiano. `[DEDOTTO]` La composizione
dell'elenco è a sua volta un indizio di strategia: quindici valute africane (franco CFA BCEAO e
BEAC, dirham marocchino, dinaro tunisino e algerino, sterlina egiziana, naira, scellini keniota,
tanzaniano e ugandese, franco ruandese, birr, ariary, rupia mauriziana, cedi) accompagnano
coerentemente la presenza del piano dei conti **OHADA** fra i quindici standard. Trezy guarda
all'Africa francofona come al proprio secondo mercato naturale — molto prima che all'Italia, per la
quale non esiste uno schema contabile dedicato.

`[NON VERIFICABILE]` Se la valuta preferita comporti conversione dei movimenti in valuta estera, e
con quale cambio, non è osservabile: tutti i conti di questo account sono in euro.

---

## 6. Integrazioni

`[OSSERVATO]` Il pannello, intitolato **«Intégrations»**, contiene **tre sole schede**, ciascuna
con un indicatore di stato grigio (non connesso) e una freccia di espansione:

| Integrazione | Natura | Diffusione in Italia |
|---|---|---|
| **Pennylane** | piattaforma contabile francese | marginale |
| **Falco** | non identificato dall'interfaccia | ignota |
| **QuickBooks** | contabilità Intuit | marginale |

`[OSSERVATO]` **Nessuna integrazione con gestionali o software di contabilità italiani**
(TeamSystem, Zucchetti, Danea, Fatture in Cloud, Aruba) e **nessuna voce di fatturazione
elettronica** compare in questo pannello.

`[DA DOCUMENTAZIONE]` Le stringhe dell'applicazione contengono però un connettore
**Invopop → SDI** completo, il cui percorso dichiarato è proprio
`Impostazioni → Integrazioni → Fatturazione elettronica`: registrazione dell'azienda tramite
**partita IVA**, import delle fatture elettroniche **ricevute (SDI) ed emesse**, registrazione di
un **Codice Destinatario** presso l'**Agenzia delle Entrate** perché le fatture dei fornitori
vengano recapitate a Trezy, poi «Completa la registrazione SDI»; sincronizzazione esposta come
azione manuale; endpoint `/integrations/invopop/connect|register|status|sync|disconnect`
(fonte: `docs/trezy/00a-sito-e-pricing.md` § 5.4 e
`assets/trezy/materiali-pubblici/kb-07-sdi-invopop-fatturazione-elettronica.md`).

**Il divario fra le due righe precedenti è il ritrovamento più importante di questa sezione.**
`[OSSERVATO]` La funzione esiste nel codice del client, ma **non è renderizzata** nel pannello
Integrazioni di questo account italiano, su piano Premium, con `country: "IT"` negli entitlement.
`[IPOTESI]` Le spiegazioni plausibili sono tre e non sono distinguibili dall'esterno: un
interruttore di funzionalità per singolo account non attivo; una condizione lato server non
soddisfatta (per esempio una partita IVA non ancora registrata sull'anagrafica); o codice
rilasciato ma non ancora abilitato per nessuno. `[NON ACCESSIBILE]` è la classificazione corretta.

`[DEDOTTO]` Per un'azienda italiana la conseguenza è netta: **l'unica capacità che renderebbe
Trezy davvero utilizzabile sul ciclo passivo italiano — ricevere le fatture dal canale certificato
invece che dall'OCR di un PDF — è, in questo momento e su questo account, irraggiungibile.** Chi
valutasse il prodotto dall'interfaccia concluderebbe che non esiste.

`[OSSERVATO]` Nessuna API pubblica, nessun webhook, nessuna documentazione per sviluppatori,
nessun marketplace di integrazioni. `[ASSENTE]` — verificato negativamente: `api.trezy.io`,
`docs.trezy.io` e `developers.trezy.io` rispondono 404 su ogni percorso, e il sito non li nomina.

---

## 7. Notifiche

`[OSSERVATO]` Il tab si chiama **«Notifications»** (non tradotto) e contiene **un solo blocco**,
«Balance alerts», anch'esso interamente in inglese:

> «Get an email when a bank account drops below the threshold you set. The threshold is in the bank
> account's own currency.»

`[OSSERVATO]` Una scheda per **ciascun conto bancario** (tre su questo account), ognuna con:

- interruttore **«Alert enabled»** — **disattivato** su tutti e tre;
- campo numerico **«Notify me when balance drops below»**, con il codice valuta del conto accanto —
  **vuoto** su tutti e tre (segnaposto `0.00`);
- campo **«Also notify these emails (CC)»** con pulsante «Add» — nessun destinatario impostato;
- link **«✎ Customise email subject & body»** — personalizzazione di oggetto e corpo del messaggio;
- pulsante **«Save»**, in stato disabilitato finché non si modifica qualcosa.

`[DA DOCUMENTAZIONE]` L'endpoint corrispondente nel bundle è `/balance-thresholds`.

`[NON VERIFICABILE]` **Nessun avviso è stato configurato durante l'analisi**: salvare una soglia in
un ambiente di produzione avrebbe potuto generare l'invio di e-mail reali a indirizzi reali.
Restano quindi non valutabili la latenza fra lo sconfinamento e l'avviso, la frequenza di ripetizione,
il comportamento a cavallo della sincronizzazione bancaria mattutina e il contenuto effettivo del
messaggio.

### 7.1 Che cosa non è stato osservato, e perché non basta a dichiararlo assente

`[NON OSSERVATO]` Non compaiono in nessun punto dell'applicazione: notifiche **in-app** (nessuna
campanella, nessun centro notifiche), **digest periodici**, **report schedulati** via e-mail,
avvisi su **scadenze in avvicinamento** (fatture prossime alla scadenza, insoluti), avvisi su
scostamenti fra previsione e consuntivo. Non li si dichiara assenti: il criterio richiede una
verifica positiva, e non è stata fatta.

`[OSSERVATO]` Due indizi contraddicono l'idea che gli avvisi di saldo siano l'unico meccanismo
esistente:

1. `GET /api/v2/account-settings` contiene **`validationNotificationFrequency: "none"`**.
   `[DEDOTTO]` Un campo che ammette il valore «nessuna» **frequenza** implica l'esistenza di altre
   frequenze, e quindi di una **notifica periodica sulla validazione delle categorie** — coerente
   con il campo gemello `requireCategoryValidation`. Nessun controllo per impostarla è però esposto
   nel tab Notifications, che ignora del tutto questa preferenza. `[NON ACCESSIBILE]`
2. `[DA DOCUMENTAZIONE]` Il bundle contiene `/notifications/register`,
   `/notifications/preferences` e `/notifications/cleanup`, con stringhe che parlano esplicitamente
   di **notifiche push su dispositivo** («Le notifiche push sono disponibili solo su dispositivo»,
   «Le impostazioni si applicano solo a questo dispositivo»). Nessuna interfaccia di preferenze di
   notifica è raggiungibile dal browser. `[NON ACCESSIBILE]`

`[DEDOTTO]` Il quadro complessivo è quello di un impianto di notifica **più ampio nel backend di
quanto l'interfaccia web lasci vedere**, con un unico canale realmente configurabile (l'e-mail sul
saldo) e almeno due meccanismi dichiarati dal server ma senza comandi. Per una tesoreria, l'avviso
di saldo sotto soglia è comunque **il più utile dei possibili**: è quello che intercetta lo
scoperto prima che accada. Che sia il solo raggiungibile resta però un limite serio quando il
rischio non è il saldo ma la scadenza.

---

## 8. Piani, entitlement e gating

### 8.1 Il listino esposto nell'interfaccia

`[OSSERVATO]` Tre piani, con selettore Mensile/Annuale:

| Piano | Prezzo | Contenuto dichiarato |
|---|---|---|
| **Gratuito** | 0 € | Flusso di cassa · Cronologia transazioni · Conti bancari «unici» |
| **Starter** | 9 €/mese | + Proiezione del flusso di cassa · Analisi delle prestazioni (P&L, Bilancio, Break-even) |
| **Premium** | 39 €/mese | + Fatture · Tracciamento pagamenti fatture · Integrazioni · Analisi dei prezzi · Report di spesa · **Conti bancari illimitati** |

`[OSSERVATO]` `GET /subscriptions/plans?currency=EUR` restituisce quattro piani reali: Starter
mensile 9 € e annuale 90 €, Premium mensile 39 € e annuale 390 €, tutti con `trial_days: 7`.
`[DEDOTTO]` L'annuale costa dieci mensilità: due mesi in omaggio, sconto del 16,7 %.

`[OSSERVATO]` La sottoscrizione è gestita da **Stripe** (`stripe_subscription_id`,
`stripe_customer_id`, `stripe_price_id` nella risposta), con `status: "trialing"` e un blocco
`recommendations` lato server che restituisce l'azione `add_payment_method`. `[DEDOTTO]` La logica
di conversione della prova è nel backend, non nel client.

`[OSSERVATO]` «Cronologia abbonamenti» è vuota, con un messaggio esplicito. `[NON POPOLATO]`

`[DEDOTTO]` **Il gate strutturale è uno solo: il secondo conto corrente.** Gratuito e Starter danno
conti «unici» (uno); il multi-banca sta solo nel Premium, che costa 4,3 volte lo Starter. Per
un'azienda con un conto operativo, uno di appoggio e una carta, il Premium non è un miglioramento
opzionale: è il piano d'ingresso. Su questo account i conti sono infatti tre.

### 8.2 I quattro entitlement, e i due che non hanno interfaccia

`[OSSERVATO]` `GET /api/v2/accounts/{id}/entitlements`:

```
{ "planType": "premium", "country": "IT",
  "entitlements": { "cashBooster": {"available": true},
                    "invoicing":  {"available": true},
                    "accounting": {"available": true},
                    "factoringMarketplace": {"available": true} } }
```

| Entitlement | Corrispettivo nell'interfaccia |
|---|---|
| `accounting` | `Prestazioni` (C/E, stato patrimoniale, pareggio, KPI, registrazioni) — `[OSSERVATO]` |
| `invoicing` | `Documenti` per le fatture ricevute — `[OSSERVATO]`; il **modulo di emissione** (`/api/invoicing/invoices`, numerazione automatica, calcolo imposte) non ha voce di menu — `[NON ACCESSIBILE]` |
| **`cashBooster`** | **nessuna interfaccia raggiungibile** — `[NON ACCESSIBILE]` |
| **`factoringMarketplace`** | **nessuna interfaccia raggiungibile** — `[NON ACCESSIBILE]` |

`[OSSERVATO]` Un dettaglio decisivo emerge confrontando i piani: sui **piani Starter** le stesse due
funzioni portano una restrizione geografica esplicita —
`"cashBooster": {"enabled": true, "countries": ["FR"]}` e
`"factoringMarketplace": {"enabled": true, "countries": ["FR"]}` — mentre sui **piani Premium** la
restrizione non compare.

`[DEDOTTO]` Le due funzioni sono **costruite per la Francia** e concesse altrove solo sul piano
massimo, o più probabilmente non ancora rilasciate fuori dalla Francia in nessun piano: la
restrizione per paese esiste nel modello dati e su un account `country: "IT"` risulta comunque
`available: true` senza che nulla sia raggiungibile. È un'incoerenza fra il livello degli
entitlement e quello dell'interfaccia.

`[DA DOCUMENTAZIONE]` Il bundle chiarisce di che cosa si tratti: rotte `/cashbooster`, `/boost`,
`/boost-requests`, `/boost/financing`, `/boost/sell`, `/boost/mandate/:service`,
`/api/credit-allocations`, e stringhe che descrivono un **marketplace di prodotti finanziari** con
quattro categorie — **factoring**, **linea di credito**, **finanziamento del magazzino**,
**prestito di tesoreria** — con criteri di ammissibilità per partner (soglia di ricavi, patrimonio
netto positivo, FEC importato).

`[DEDOTTO]` **È l'indizio più forte sulla direzione del prodotto.** Un'applicazione che conosce
saldi, scadenze e fatturato del cliente e che gli propone anticipo fatture, factoring e linee di
credito passa dal vendere un abbonamento da 39 € al prendere una commissione su ogni pratica
intermediata. Il modello di ricavo cambia natura. Che gli interruttori siano già attivi su un
account italiano, senza alcuna interfaccia, dice che il rilascio è vicino e che il gating è
gestito lato client. `[IPOTESI]` Il vincolo «FEC importato» fra i criteri di ammissibilità
suggerisce che il servizio richieda la contabilità vera, non quella stimata dai movimenti bancari —
e in Italia il FEC (tracciato francese) non esiste.

`[NON OSSERVATO]` Il tab «🎁 Referral `NEW`» non è stato aperto. `[DA DOCUMENTAZIONE]` Il bundle
contiene `/referrals`, `/referrals/generate`, `/referrals/invite`, `/referrals/invite/link`,
`/referrals/invites` e `/referrals/linkedin-recommendation`.

### 8.3 Tre funzionalità annunciate dall'infrastruttura prima che dal prodotto

Il terzo indizio arriva dalla navigazione mobile (§ 1.1) e chiude un disegno che i due precedenti
lasciavano incompleto.

| Indizio | Livello a cui è visibile | Interfaccia dietro |
|---|---|---|
| `cashBooster` `available: true` | API entitlement | nessuna — `[NON ACCESSIBILE]` |
| `factoringMarketplace` `available: true` | API entitlement | nessuna — `[NON ACCESSIBILE]` |
| **Voce «Contabilità» → `/accounting`** | **menu mobile** | **rotta che reindirizza a `/cashflow`** — `[NON ACCESSIBILE]` |

`[OSSERVATO]` A questi si aggiunge il quarto già citato: il modulo di **emissione** fatture
(`/api/invoicing/*`, numerazione automatica, calcolo imposte) coperto dall'entitlement `invoicing`
e privo di voce di menu.

`[IPOTESI]` **Il quadro è quello di funzionalità che l'infrastruttura annuncia prima che il
prodotto le consegni**, e i tre casi sono coerenti fra loro per un motivo preciso: ciascuno è
esposto a un livello diverso — un interruttore d'API, un secondo interruttore d'API, un
collegamento di menu — e in tutti e tre il livello successivo manca. Chi rilascia per gradi lascia
esattamente questa traccia: il permesso arriva prima della pagina, e la voce di menu prima della
rotta.

Il caso `/accounting` è il più eloquente dei tre, per due ragioni. Primo, **la voce esiste solo
nella barra mobile**: `[IPOTESI]` è verosimile che il menu mobile sia una lista più recente,
scritta con la mappa del prodotto *futuro*, mentre quello desktop riflette il prodotto attuale —
altrimenti sarebbe difficile spiegare perché una voce comparirebbe solo dove lo spazio è minore.
Secondo, la contabilità **è già per tre quarti costruita**: l'entitlement `accounting` è attivo,
`Prestazioni › Registrazioni` genera già scritture in partita doppia, e il modello dati espone sia
`/api/v2/accounting/*` (contabilità vera, da FEC) sia `/api/v2/estimated-accounting/*` (stimata dai
movimenti bancari). `[DEDOTTO]` La rotta vuota è il posto dove la prima delle due andrebbe a
vivere.

`[DEDOTTO]` Messo accanto a `cashBooster` e `factoringMarketplace`, il disegno che se ne ricava è
un prodotto che si sta muovendo **dalla tesoreria verso la contabilità da un lato e verso
l'intermediazione finanziaria dall'altro** — cioè verso i due mestieri, quello del commercialista e
quello della banca, contro cui oggi si posiziona. Va detto con la cautela che merita: sono tracce
di codice e di configurazione, non annunci. Nessuna delle tre funzioni è stata vista funzionare, e
il rilascio potrebbe non avvenire mai o non riguardare l'Italia — dove, per la contabilità, il
tracciato di import supportato resta il FEC francese.

---

## 9. `Reporting` `BETA` — costruttore di report a widget

`[OSSERVATO]` La rotta `/reporting` apre una tela vuota («Ancora nessun widget») con un selettore
di pagina in testata («REPORT ⌄»), i comandi **annulla / ripeti**, un'icona di **condivisione** e
il pulsante «Aggiungi widget». `[NON POPOLATO]` Nessun widget creato.

### 9.1 Il catalogo: nove tipi

| Widget | Descrizione dichiarata |
|---|---|
| Evoluzione della categoria | monitora una categoria nel tempo |
| Confronto di categorie | confronta 2 categorie fianco a fianco |
| Rapporto categoria | rapporto fra 2 categorie (A/B) |
| **Formula di categoria** | **formula personalizzata: `(A + B) / C`** |
| Torta (effettiva) | reddito/risultato effettivo per categoria |
| Torta (Previsione) | reddito/risultato previsto per categoria |
| **Testo** | testo formattato con titoli e note |
| Conti bancari | panoramica dei conti bancari |
| Flusso di cassa | grafico del flusso di cassa con previsioni |

`[DEDOTTO]` Due voci fanno la differenza fra un cruscotto e un documento.

**«Formula di categoria»** con `(A + B) / C` è un piccolo motore di indicatori derivati: consente
di costruire a mano l'incidenza del costo del personale sui ricavi, il food cost percentuale, il
peso degli affitti — cioè esattamente gli indici che un piano dei conti «Personalizzato» non
calcola da solo. `[IPOTESI]` La forma `(A + B) / C` sembra fissa, con tre operandi e una struttura
data, non un editor di espressioni libere: non è stato possibile aprire il configuratore per
verificarlo.

**«Testo»** — testo formattato con titoli e note **dentro** il report — trasforma la pagina da
cruscotto a **relazione narrativa**: il commento sta accanto al numero che commenta, e viene
esportato o condiviso insieme a esso. È la differenza fra mandare al socio un grafico e mandargli
una lettura del mese.

### 9.2 La tela, e ciò che l'API rivela

`[OSSERVATO]` `GET /api/v2/reporting-pages` restituisce una pagina con:

```
{ "name": "REPORT", "widgets": [], "decorators": [],
  "settings": {"theme": "system", "gridCols": 12, "compactMode": false},
  "shareToken": null }
```

`[OSSERVATO]` Sul bordo inferiore della tela compare una barra di strumenti di **annotazione**: testo,
freccia dritta, freccia curva, rettangolo, cerchio, linea. `[DEDOTTO]` Corrispondono al campo
`decorators`, distinto da `widgets`: la pagina non è una griglia rigida di riquadri ma **una tela su
cui si può disegnare sopra**, cerchiare un numero, tirare una freccia fra due grafici. È
un'impostazione da lavagna, insolita in un prodotto di tesoreria e coerente con l'idea del report
come documento da presentare.

`[OSSERVATO]` La griglia è a **12 colonne**, il tema segue il sistema, esiste una modalità compatta.

`[OSSERVATO]` `shareToken: null` e `[DA DOCUMENTAZIONE]` la rotta `/share/report/:token` nel bundle.
`[DEDOTTO]` Esiste una **condivisione del report tramite link pubblico con token**, coerente con
l'icona di condivisione in testata. `[NON VERIFICABILE]` Non è stato generato alcun token:
avrebbe creato un URL pubblico verso dati aziendali reali. Restano ignoti la scadenza del link, la
possibilità di revocarlo e se il link mostri dati aggiornati o congelati.

`[DEDOTTO]` Nel complesso è l'area **più promettente e meno finita** del prodotto: catalogo
sensato, formula personalizzata, narrativa e condivisione — ma marcata `BETA`, senza modelli
precostituiti («Ancora nessun widget» su un account con lo storico bancario già caricato e le
categorie già validate) e senza alcuna schedulazione. `[NON OSSERVATO]` Nessun invio periodico del report,
nessuna esportazione in PDF osservata.

---

## 10. Assistente «Chiedi a Trezy»

### 10.1 Il pannello

`[OSSERVATO]` Un pulsante «Chiedi a Trezy» in testata a `/cashflow` apre un pannello laterale
destro con:

- il titolo «Chiedimi qualsiasi cosa sul tuo flusso di cassa»;
- la dichiarazione di capacità: «Posso cercare transazioni, analizzare le spese, confrontare
  periodi e verificare le previsioni»;
- un'area di testo con segnaposto «Chiedi informazioni sul tuo flusso di cassa…»;
- **tre suggerimenti precaricati, in inglese**: «3-month evolution», «My biggest expenses this
  month», «Next month forecasts».

`[OSSERVATO]` Endpoint: `GET /api/v2/ai-chat/conversations` (risposta vuota — nessuna
conversazione salvata) e `GET /api/v2/ai-chat/prefetch?currency=EUR&language=it&scenarioId=…`, che
restituisce esattamente i tre suggerimenti.

`[DEDOTTO]` Due cose seguono dalla firma della chiamata. Primo: **i suggerimenti arrivano dal
server**, non sono cablati nel client. Secondo, e più grave: la richiesta porta **`language=it`** e
il server risponde comunque **in inglese**. Non è quindi un difetto di traduzione del client ma
una **mancata localizzazione del servizio AI**, cioè del componente in cui la lingua conta di più.
`[IPOTESI]` Se i suggerimenti non sono localizzati, è ragionevole attendersi che neppure i prompt
di sistema lo siano; ma è una congettura.

`[OSSERVATO]` Il parametro `scenarioId` viaggia nella chiamata. `[DEDOTTO]` L'assistente è
**consapevole dello scenario** attivo: le risposte sono ancorate al ramo di previsione che si sta
guardando, non a un aggregato generico.

### 10.2 Il test svolto

`[OSSERVATO]` Una domanda è stata posta:
**«Quali sono le mie tre categorie di spesa più alte negli ultimi tre mesi?»**
Risposta in circa **30 secondi**, **in italiano**, strutturata in cinque parti:

1. un **titolo** — «Le 3 categorie di spesa più alte negli ultimi 3 mesi»;
2. una **tabella ordinata per importo decrescente**, con barre proporzionali, di **quindici**
   categorie;
3. una **sintesi in prosa** che nomina le prime tre e ne dichiara il peso complessivo;
4. **due domande di approfondimento** generate automaticamente, entrambe in italiano;
5. i pulsanti di **feedback 👍/👎**.

`[OSSERVATO]` I quindici importi mostrati, in euro:

| # | Categoria | Importo | | # | Categoria | Importo |
|---|---|---:|---|---|---|---:|
| 1 | Stipendi e salari | 76.119 | | 9 | Estratto conto carta di credito | 16.761 |
| 2 | Acquisti materie prime | 68.398 | | 10 | Acquisti imballaggi | 12.625 |
| 3 | Oneri operativi vari | 26.672 | | 11 | Prestiti | 11.407 |
| 4 | Noleggi | 26.052 | | 12 | Forniture non immagazzinabili | 6.405 |
| 5 | Acquisti studi e servizi | 25.275 | | 13 | Acquisti servizi esterni | 6.132 |
| 6 | Trasferimento interbancario | 25.208 | | 14 | Subappalto generale | 3.833 |
| 7 | Acquisti merci | 21.515 | | 15 | Servizi bancari e correlati | 3.013 |
| 8 | Altre imposte e pagamenti simili | 19.110 | | | **Totale** | **348.525** |

`[OSSERVATO]` **L'assistente legge davvero i dati dell'account e li aggrega correttamente.** Le
categorie sono quelle reali del piano in uso, gli importi sono coerenti con l'ordine di grandezza
dei movimenti del periodo, l'ordinamento è corretto e le barre sono proporzionali agli importi.
Non è un generatore di frasi plausibili scollegato dai dati: la parte tabellare della risposta è
**il pezzo migliore della funzione**.

Cade quindi il motivo per cui questa sezione era stata classificata `[NON VERIFICABILE]` nella
prima stesura. Resta vero che la prova ha un costo: la domanda ha inviato a un servizio di terze
parti dati bancari reali. `[OSSERVATO]` `GET /api/v2/ai-chat/conversations` aveva risposto `[]`
prima della domanda — nessuna conversazione risultava persistita — ma l'esistenza stessa
dell'endpoint, del pulsante «+» (nuova conversazione) e del comando di cronologia nella testata del
pannello indica che la persistenza è prevista dal disegno.

### 10.3 L'errore aritmetico nella sintesi

`[OSSERVATO]` La frase conclusiva recita:

> «Le tue spese maggiori sono concentrate in stipendi e salari (€76.119), acquisti di materie prime
> (€68.398) e oneri operativi vari (€26.672). **Insieme rappresentano il 70% della tua spesa totale
> nel periodo.**»

`[OSSERVATO]` Sui numeri che l'assistente mostra **nella stessa risposta**, la quota è un'altra:

```
prime tre categorie   76.119 + 68.398 + 26.672 = 171.189 €
totale delle quindici                            348.525 €
quota reale           171.189 / 348.525        =    49,1 %
```

**Dichiara 70 %, il dato è 49,1 %: uno scarto di 21 punti percentuali, su un'affermazione
presentata senza incertezza e ricavabile dai numeri stampati due centimetri sopra.**

`[DEDOTTO]` **È il difetto più grave osservato in tutta l'area piattaforma, e va pesato più di
qualunque funzione mancante.** Una funzione che manca è un limite noto: l'utente sa di doverla
cercare altrove. Un numero sbagliato in una frase assertiva è peggio, perché **si sostituisce al
ragionamento dell'utente invece di aiutarlo**: chi legge «rappresentano il 70 %» non ricalcola, e
in un prodotto di tesoreria una concentrazione di spesa sovrastimata di venti punti può orientare
male una decisione su fornitori, personale o rinegoziazione di contratti. Il paradosso è che il
prodotto **ha i numeri giusti** e li mostra: l'errore nasce nello strato che dovrebbe renderli
comprensibili.

`[IPOTESI]` Nessun denominatore plausibile fra quelli presenti sullo schermo restituisce 70 %.
Escludendo le due voci che non sono costi operativi — il giroconto (25.208 €) e i prestiti
(11.407 €) — il totale scende a 311.910 € e la quota **sale** a 54,9 %, non a 70 %. Il valore più
vicino si otterrebbe rapportando le prime tre alle prime **sei** categorie
(171.189 / 247.724 = 69,1 %), il che suggerirebbe una percentuale calcolata su un insieme troncato
anziché sul totale. Resta una congettura: non è possibile ispezionare il calcolo.

`[DEDOTTO]` Un rilievo collaterale, indipendente dall'errore: fra le «spese» l'assistente elenca
**«Trasferimento interbancario» (25.208 €)**, che è un giroconto fra conti della stessa azienda e
non un costo, e **«Prestiti» (11.407 €)**, che è un rimborso finanziario. Insieme valgono il 10,5 %
del totale dichiarato. La domanda dell'utente diceva «spesa»: l'assistente ha risposto con le
**uscite di cassa**, che è cosa diversa. `[IPOTESI]` La confusione nasce verosimilmente dal fatto
che l'assistente legge la tabella del flusso di cassa, dove il giroconto è legittimamente
un'uscita, senza applicare il filtro di natura che una domanda sulle «spese» richiederebbe.

### 10.4 Difetti minori nella stessa risposta

`[OSSERVATO]`

- **Titolo e contenuto non concordano**: il titolo annuncia «Le **3** categorie di spesa più alte»,
  la tabella ne elenca **15**. `[DEDOTTO]` Il testo generato e la visualizzazione allegata sembrano
  prodotti da due passaggi che non si parlano — coerentemente con l'errore di § 10.3, che è dello
  stesso tipo: la prosa non guarda la tabella.
- **Refuso grammaticale nel testo generato**: «l'andamento dei stipendi» (per «degli stipendi»),
  in una delle due domande di approfondimento suggerite.
- **Incoerenza di lingua interna alla stessa funzione**: i tre suggerimenti del pannello vuoto
  arrivano dal server **in inglese** (§ 10.1, nonostante `language=it`), mentre risposta e
  follow-up generati sono **in italiano**. `[DEDOTTO]` Le due cose seguono strade diverse: i
  suggerimenti iniziali sono statici e non localizzati, la generazione vera rispetta la lingua
  richiesta. All'utente italiano il risultato appare comunque come un prodotto che cambia lingua
  a metà.

### 10.5 Che cosa resta non valutabile

`[NON VERIFICABILE]` Una domanda sola basta a trovare un errore, non a misurare l'affidabilità.
Restano ignoti: la **frequenza** dell'errore aritmetico (se sia sistematico o un caso), il
comportamento su domande che richiedono un confronto fra periodi o una previsione, la capacità di
**citare le transazioni** su cui si fonda una risposta, il comportamento sulle domande fuori
ambito, e se le risposte riproducano le formule dichiarate nell'Academy o ne usino altre. Una
misura seria richiederebbe una batteria di domande con verifica indipendente di ciascun risultato —
e ogni domanda invia dati bancari reali a un servizio di terze parti.

Schermata: `assets/trezy/screenshots/82-chiedi-a-trezy-conversazione.png`

---

## 11. `Academy` — la documentazione dentro il prodotto

`[OSSERVATO]` Ottava voce del menu, con badge **`NUOVO`**. La pagina contiene:

- un **avviso in evidenza**: «Per qualsiasi domanda posta tramite la chat, non utilizziamo risposte
  automatiche — **una persona reale ti risponderà con una risposta dedicata**»;
- un campo di ricerca «Cerca video…» e un filtro **«Filtra per etichetta»** con otto etichette:
  `FLUSSO DI CASSA`, `PREVISIONE`, `FORMULA`, `CATEGORIA`, `TRANSAZIONI`, `ONBOARDING`,
  `CONTABILITÀ`, `PRESTAZIONI`;
- **quattro video dimostrativi**: «Come creare una previsione», «Come creare una formula», «Come
  gestire le categorie nel cashflow», «La casella di posta delle previsioni»;
- **tredici FAQ espandibili**, ciascuna etichettata, chiuse dalla riga «Altri video e informazioni
  in arrivo!».

`[OSSERVATO]` Un bollo di chat è presente in basso a destra **su ogni schermata**
dell'applicazione, coerentemente con la promessa di assistenza umana.

`[OSSERVATO]` Le FAQ non sono materiale promozionale: **contengono le regole di calcolo**. Fra le
tredici, quelle che dichiarano formule o comportamenti verificabili sono, in sintesi:

| Domanda | Che cosa dichiara |
|---|---|
| Come viene calcolato il saldo futuro? | `saldo finale = saldo bancario attuale + Σ previsioni di entrata residue − Σ previsioni di uscita residue`, invariante rispetto alla risoluzione scelta |
| Come funziona la riconciliazione previsione↔transazione? | corrispondenza per stessa categoria e stesso periodo, collegamento manuale, residuo aggiornato, **per scenario** |
| Come funzionano le regole di classificazione? | parole chiave sulla descrizione, ambito entrata/uscita/entrambe, limitabili a conti, **ordinate per priorità**, **non retroattive** per default |
| Come vengono raggruppate le transazioni simili? | per **descrizione anonimizzata**; le regole possono spezzare un gruppo |
| A cosa servono i termini di pagamento? | ritardo medio fra registrazione e movimento; usati **solo** in contabilità e performance, **non** nel cashflow |
| A cosa servono le categorie contabili? | categoria contabile, tempi di pagamento e aliquota IVA per categoria alimentano pre-contabilità, performance e il calcolo IVA nel cashflow |
| Cosa sono gli scenari? | versioni alternative della previsione; lo «Scenario Principale» esiste di default ed è quello usato per i calcoli |
| Cos'è la casella di posta delle previsioni? | tre code in ordine: verifica transazioni → riconciliazione previsioni → monitoraggio fatture |

`[DEDOTTO]` **La scelta di mettere la documentazione dentro il prodotto invece che su un dominio
separato ha una faccia buona e una cattiva, e vanno tenute distinte.**

La faccia buona: la spiegazione sta dove serve, in italiano, aggiornata insieme al software, con
le formule esplicite. È la stessa filosofia del tab `Funzionalità` (§ 3.3), e su un prodotto
finanziario — dove l'utente deve potersi fidare di un numero proiettato — è la scelta giusta. Non
esiste il divario tipico fra un help center fermo a due versioni fa e un'applicazione che è andata
avanti.

La faccia cattiva è duplice. Primo: **la documentazione operativa è invisibile prima
dell'acquisto**. Chi valuta Trezy dall'esterno trova undici articoli **solo in francese** e un
changelog fermo da 28 mesi; le regole di calcolo — l'unica cosa che permetta di giudicare se il
prodotto faccia i conti giusti — stanno dietro il login. Secondo: **nessuno di questi contenuti è
indicizzabile**, il che è singolare per un'azienda che sul dominio pubblico ha costruito 4.124 URL
di blog e glossario. `[DEDOTTO]` Il contenuto che varrebbe la pena far trovare è chiuso, quello
che vale poco è aperto.

`[OSSERVATO]` Le quattro anteprime video mostrano un'interfaccia **in inglese** con numeri diversi
da quelli dell'account: sono girate su un ambiente dimostrativo, non localizzate.

---

## 12. Onboarding

`[OSSERVATO]` `GET auth.trezy.io/api/v2/users/{id}/onboarding` restituisce tre flag:

```
{ "onboarding_cashflow": true,
  "onboarding_transactions": false,
  "onboarding_categories": false }
```

`[DEDOTTO]` L'onboarding è **per area**, non un percorso unico: il completamento è registrato
separatamente per flusso di cassa, transazioni e categorie, ed è **tracciato lato server** —
quindi segue l'utente fra dispositivi e sessioni, non è uno stato locale del browser. Sono
esattamente le tre aree in cui l'Academy concentra le etichette `ONBOARDING`, e coincidono con la
sequenza della casella di posta delle previsioni (verifica transazioni → categorie → cassa).

`[OSSERVATO]` Sull'account in esame due percorsi su tre risultano non completati, pur essendo
l'account pienamente operativo, con i movimenti già importati e categorizzati. `[IPOTESI]` O i flag si chiudono
solo percorrendo un tutorial esplicito che l'utente ha saltato, oppure i percorsi di transazioni e
categorie non sono mai stati proposti. Non è distinguibile dall'esterno.

---

## 13. Debolezze e limiti osservati

Ordinati per gravità, dal punto di vista di un'azienda italiana della ristorazione.

1. **L'assistente AI afferma con sicurezza un numero sbagliato.** Dichiara che le prime tre
   categorie «rappresentano il 70 % della tua spesa totale nel periodo»; sui quindici importi che
   mostra nella stessa risposta la quota è **49,1 %** (171.189 € su 348.525 €). Ventuno punti di
   scarto, in una frase assertiva, in un prodotto che si compra per decidere. Sta in cima alla
   lista perché **è peggio di una funzione mancante**: una funzione assente l'utente la cerca
   altrove, un numero sbagliato si sostituisce al suo ragionamento. Aggravante: i dati corretti ci
   sono e sono stampati due centimetri sopra la frase. § 10.3

2. **L'unica funzione veramente italiana non è raggiungibile.** Il connettore SDI via Invopop
   esiste nel codice, con un percorso dichiarato dentro Integrazioni, e **non compare** nel
   pannello di questo account italiano su piano massimo. Senza di esso il ciclo passivo entra solo
   via OCR o via e-mail, cioè con una qualità e una completezza non garantite. `[NON ACCESSIBILE]`

3. **Il piano dei conti italiano è un contenitore vuoto su un modello francese.** «Italia —
   Personalizzato» significa nessuno schema civilistico; sotto, i 185 codici di conto economico
   hanno la struttura del PCG (*charges externes*, *charges de personnel*, *consommations*,
   *dotations*, *résultat exceptionnel*). Le aliquote IVA predefinite sono 0 %, 20 % e 10 %:
   **manca il 22 %**, mancano il 4 % e il 5 % della ristorazione. Ogni categoria va corretta a mano.

4. **Sicurezza dell'accesso sottodimensionata rispetto al dato trattato.** Password di sei
   caratteri, nessun secondo fattore, nessun SSO, nessun log degli accessi osservato — su un
   prodotto che espone IBAN, saldi e l'intero storico bancario. L'indirizzo di caricamento fatture
   è per giunta **derivabile dall'identificativo dell'account**.

5. **Il multi-azienda è in `BETA`, e il badge sta sul commutatore.** Per un'impresa con più sedi o
   più società, il pezzo dichiarato acerbo è proprio quello che determina il perimetro dei numeri
   che si stanno leggendo. Non risultano viste consolidate su più organizzazioni.

6. **I permessi non sono documentati nel punto in cui si assegnano.** Tre ruoli (Proprietario,
   Utente, Assistente) senza una riga che dica che cosa possano fare. Chi invita il proprio
   commercialista non sa che cosa gli sta concedendo.

7. **Le notifiche coprono un rischio solo.** L'unico avviso configurabile è il saldo sotto soglia.
   Non esiste — o comunque non è raggiungibile — alcun avviso su scadenze in avvicinamento,
   scostamenti dalla previsione o report periodici, benché il backend dichiari sia una frequenza
   di notifica sulla validazione (`validationNotificationFrequency`) sia notifiche push
   (`/notifications/preferences`).

8. **Da telefono l'intera area di configurazione è irraggiungibile.** A 390 px la barra inferiore
   ha cinque voci e ne lascia fuori quattro, fra cui **Impostazioni**, Reporting e Academy. Il
   caso che pesa di più è il blocco **avvisi di saldo**: la funzione più utile a chi è fuori
   ufficio è anche l'unica che da fuori ufficio non si può attivare né correggere. § 1.1

9. **Nessuna integrazione con l'ecosistema italiano.** Tre connettori, di cui due verso software
   marginali in Italia (Pennylane è francese, QuickBooks poco diffuso) e uno non identificabile
   dall'interfaccia (Falco). Nessuna API pubblica, nessun webhook, nessuna documentazione tecnica.

10. **Localizzazione incompleta e incoerente, proprio nei punti di configurazione.**
    «Intégrations» e «Produits» come intestazioni francesi, «Notifications» e l'intero blocco
    «Balance alerts» in inglese, «🇫🇷 French» nel menu delle lingue italiane, il prefisso
    `factures-` sull'indirizzo di caricamento. L'assistente AI cambia lingua **dentro sé stesso**:
    suggerimenti iniziali in inglese nonostante la richiesta porti `language=it`, risposta e
    follow-up in italiano — con un refuso nel testo generato («l'andamento dei stipendi»). Sono i
    punti in cui si prendono le decisioni che cambiano i numeri.

11. **Le funzioni più interessanti per la ristorazione sono in beta con riserva di rimozione.**
    Ricette, analisi costi ricette e inventario sono dichiarate «sperimentali e potrebbero cambiare
    o essere rimosse», non compaiono in alcun piano del listino e non hanno documentazione.
    Costruirci sopra un processo aziendale è un rischio.

12. **Tre funzionalità annunciate dall'infrastruttura prima che dal prodotto.**
    `cashBooster` e `factoringMarketplace` risultano `available: true` su un account
    `country: "IT"` ma non hanno alcuna interfaccia (sui piani Starter gli stessi due portano
    `countries: ["FR"]`); la voce **«Contabilità» della barra mobile punta a `/accounting`, che
    reindirizza a `/cashflow`**. È insieme un'incoerenza fra livelli e un annuncio involontario
    delle prossime mosse. § 8.3

13. **Reporting privo di modelli e di schedulazione.** Su un account già popolato di dati la
    pagina è vuota e nessun report precostituito è offerto; non risulta alcun invio periodico né
    esportazione.

14. **Difetti minori.** La barra dei tab di Impostazioni eccede la finestra e taglia l'ultimo tab;
    il tab selezionato non è indirizzabile via URL né percorribile con il tasto «indietro»; la
    cronologia abbonamenti è vuota anche in presenza di un abbonamento attivo; nella risposta
    dell'assistente il titolo annuncia «Le 3 categorie più alte» e la tabella ne elenca 15.

---

## 14. Cosa non è stato valutabile

Distinto per motivo, perché la ragione dell'ignoranza conta quanto l'ignoranza.

**Perché avrebbe prodotto effetti reali su un ambiente di produzione** — `[NON VERIFICABILE]`

- **Avvisi di saldo**: nessuna soglia salvata, nessun alert attivato. Salvare avrebbe potuto
  generare e-mail reali. Restano ignoti latenza, ripetizione, contenuto del messaggio e
  interazione con la sincronizzazione bancaria.
- **Invito di un secondo utente**: avrebbe inviato un'e-mail reale. Restano quindi ignoti il
  contenuto effettivo dei tre ruoli, l'esistenza del trasferimento di proprietà e il comportamento
  del selettore multi-organizzazione con più di un'organizzazione.
- **Condivisione del report**: nessun token generato, perché avrebbe creato un URL pubblico verso
  dati aziendali reali. Restano ignote scadenza, revocabilità e freschezza dei dati condivisi.

**Perché la verifica è stata parziale** — verificato su un solo caso

- **Assistente «Chiedi a Trezy»**: **una** domanda posta (§ 10.2), sufficiente a stabilire che
  l'assistente legge davvero i dati e ad accertare un **errore aritmetico nella sintesi**; non
  sufficiente a misurarne l'affidabilità. Restano ignoti se l'errore sia sistematico o isolato, il
  comportamento su confronti fra periodi e previsioni, la capacità di citare le transazioni di
  origine, la gestione delle domande fuori ambito e la coerenza con le formule dell'Academy. Ogni
  domanda aggiuntiva invia dati bancari reali a un servizio di terze parti: il costo della prova
  cresce con la sua estensione.

**Perché la funzione esiste ma non è stata popolata** — `[NON POPOLATO]`

- **Analitico**: zero centri di costo, zero nature, zero codici analitici. Non è quindi osservabile
  dove le tre dimensioni si imputino (transazione? categoria? previsione? riga di fattura?), se
  siano gerarchiche, né se e come alimentino Prestazioni e Reporting. È la domanda decisiva per
  leggere i conti per sede o per reparto.
- **Moduli Prodotti / Analisi fornitori / Analisi prezzi** e le tre **beta** (Ricette, Analisi
  costi ricette, Inventario): interruttori mai attivati. Non è osservabile la qualità
  dell'estrazione delle righe di fattura, né la normalizzazione dei nomi prodotto fra fornitori —
  cioè il punto su cui l'intera catena del food cost sta o cade.
- **Reporting**: nessun widget creato. Non è osservabile il configuratore della «Formula di
  categoria», e quindi se l'espressione `(A + B) / C` sia una struttura fissa a tre operandi o un
  editor libero.

**Perché il backend la dichiara ma il client non la espone** — `[NON ACCESSIBILE]`

- **Fatturazione elettronica / SDI via Invopop** — percorso dichiarato nelle stringhe, assente dal
  pannello Integrazioni.
- **`cashBooster` e `factoringMarketplace`** — entitlement attivi, nessuna rotta raggiungibile.
- **Rotta `/accounting`** — voce «Contabilità» presente nella barra mobile, la rotta reindirizza a
  `/cashflow`.
- **Modulo di emissione fatture** (`/api/invoicing/*`) — nessuna voce di menu.
- **Notifiche push e preferenze di notifica** (`/notifications/preferences`) — nessun comando web.
- **Frequenza di notifica sulla validazione delle categorie** — il campo esiste in
  `account-settings`, il controllo per impostarlo no.
- **`/settings/locations`** — rotta presente nel bundle, natura non determinabile.

**Perché non è stato guardato in questa sessione** — `[NON OSSERVATO]`

- Il tab **🎁 Referral `NEW`** e l'intero programma di segnalazione.
- L'esistenza di notifiche in-app, digest periodici, report schedulati e avvisi su scadenze in
  avvicinamento: **non compaiono**, ma non sono state cercate con verifica positiva e quindi non
  si dichiarano assenti.
- Un eventuale **menu secondario su mobile** che raggiunga Reporting, Categorie, Impostazioni e
  Academy: non individuato, non escluso. `[NON VERIFICABILE]`
- Il comportamento dell'applicazione **dopo la scadenza della prova** (12 agosto 2026), cioè quali
  funzioni si chiudano effettivamente al declassamento — che è l'unico modo per verificare se il
  gating dichiarato dal listino corrisponda a quello applicato.

---

## Fonti

Osservazione dell'11 agosto 2026 su `appv2.trezy.io`, account reale su piano Premium in prova.

- Schermate: `assets/trezy/screenshots/11..17-settings-*.png`, `09-academy.png`,
  `10-academy-faq-espanse.png`, `20-academy-faq-tutte-aperte.png`,
  `90-reporting-catalogo-widget.png`, `80-chiedi-a-trezy.png`,
  **`82-chiedi-a-trezy-conversazione.png`**, `04-reporting.png`
- Dump strutturati: `03-settings-*.json` (uno per tab), `03-academy.json`, `04-faq.json`,
  `07-ai.json`, `07-widget.json`, `rotta-reporting.json`, `rotta-academy.json`; log `03.log`, `07.log`
- Tracce API con corpi di risposta: `assets/trezy/api-traces/*.json` — `account-settings`,
  `account-forecast-config`, `accounts/{id}/entitlements`, `accounts/{id}/users`,
  `invitations/account/{id}`, `subscriptions/plans`, `subscriptions/accounts/{id}/status|history|summary`,
  `users/{id}/onboarding`, `ai-chat/conversations`, `ai-chat/prefetch`, `reporting-pages`,
  `accounting-mappings`
- Fase 0 (fonti pubbliche): `docs/trezy/00a-sito-e-pricing.md`, `docs/trezy/00b-knowledge-base-e-api.md`
- Analisi delle stringhe e del bundle:
  `assets/trezy/materiali-pubblici/kb-07-sdi-invopop-fatturazione-elettronica.md`,
  `assets/trezy/materiali-pubblici/kb-09-inventario-endpoint-e-modello-dati.md`
