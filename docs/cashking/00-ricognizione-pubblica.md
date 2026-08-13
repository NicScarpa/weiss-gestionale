# Cash King — Ricognizione delle fonti pubbliche

Rilevazione: 11 agosto 2026. Convenzione dei tag come in `01-inventario-rotte.md`.
Testo integrale delle pagine raccolte in
`assets/cashking/export/pagine-pubbliche-testo.txt`.

---

## 0. Nota di metodo: il sito si legge solo fingendosi un crawler

`[OSSERVATO]` `cashking.biz` serve **due versioni diverse della stessa pagina a
seconda dello user agent**. Richiedendo `/prezzi` con uno user agent di browser
ordinario si riceve il guscio dell'applicazione, con il titolo generico
«CashKing - Gestione Tesoreria per PMI» e nessun contenuto di pagina; la stessa
richiesta con lo user agent di Googlebot restituisce il titolo proprio «Prezzi
CashKing - Piani e Abbonamenti» e l'intero testo pre-renderizzato.

`[DEDOTTO]` È pre-rendering selettivo per i motori di ricerca. La conseguenza
pratica per chi analizza il sito è che qualunque strumento che si presenti come
browser — e la maggior parte lo fa — legge **dodici volte la stessa pagina** e
conclude, sbagliando, che il sito non ha contenuti.

`[OSSERVATO]` Un `robots.txt` insolitamente accogliente conferma l'intenzione:
oltre ai motori tradizionali, autorizza esplicitamente `GPTBot` e `ChatGPT-User`.

Tutti i contenuti riportati sotto provengono dalla lettura con user agent di
crawler, con gli script rimossi dal documento.

---

## 1. Piani e prezzi come sono comunicati `[OSSERVATO]`

La pagina `/prezzi` presenta tre piani con doppio prezzo, «Offerta Lancio» e
listino, e un interruttore Mensile / Annuale dichiarato **−15%**.

| Piano | Posizionamento dichiarato | Lancio | Listino |
|---|---|---|---|
| Micro | «Perfetto per chi inizia a gestire la tesoreria in modo strutturato» | 49 € | 59 € |
| PMI *(«Il più scelto»)* | «Il controllo completo sulla tua liquidità, ogni giorno» | **59 €** | **79 €** |
| PMI Plus | «Per chi vuole partire con il piede giusto e senza limiti» | 99 € | 129 € |

### Limiti dichiarati
| | Micro | PMI | PMI Plus |
|---|---|---|---|
| Movimenti al mese | 150 | 500 | illimitati |
| Conti | fino a 3 | fino a 10 | illimitati |
| Utenti | 1 | fino a 3 | illimitati |

`[OSSERVATO]` Definizione data in nota: «Un movimento corrisponde a una fattura,
un incasso, un pagamento o un'operazione bancaria».

`[DEDOTTO]` Il limite non conta solo le righe bancarie ma anche le fatture. Con
150 movimenti al mese, il piano Micro copre un'azienda che emette e riceve
poche decine di documenti: è una soglia che si tocca prima di quanto sembri.

### Contenuto dei piani `[OSSERVATO]`
Tutti e tre includono: scadenziario clienti e fornitori, saldo attuale sempre
aggiornato, previsione cassa futura, inserimento manuale dati, import da Excel e
CSV, dashboard intuitiva.

Micro aggiunge in elenco: «Alert automatici», «Add-on avanzati», «Accesso
commercialista».
PMI aggiunge: export per la contabilità, lavoro in team fino a 3 persone,
attivazione add-on opzionali.
PMI Plus aggiunge: team illimitato, **onboarding personalizzato (3 call
incluse)**, **supporto prioritario**, **accesso commercialista incluso**,
nessun limite operativo.

### Add-on comunicati `[OSSERVATO]`
Sezione «Potenzia CashKing con gli Add-on — Funzionalità aggiuntive per chi
vuole fare di più. **Disponibili dal piano PMI**».

| Add-on | Prezzo pubblicato |
|---|---|
| Gestione F24 | 9,99 €/mese |
| Promemoria automatici | 7,99 €/mese |
| Accesso Commercialista | 3,99 €/mese — «Incluso nel piano PMI Plus» |

### Offerta di lancio `[OSSERVATO]`
«Prezzo Speciale di Lancio — Un'occasione riservata ai primi che scelgono
CashKing»: si blocca il prezzo per sempre finché si resta sullo stesso piano,
si risparmia sul listino, e «**Solo 100 posti disponibili**».

`[DEDOTTO]` Leva di scarsità classica, con il vantaggio non banale del prezzo
bloccato a vita che aumenta il costo psicologico di cambiare piano.

---

## 2. Le discrepanze fra la vetrina e il sistema di fatturazione

Questo è il risultato più rilevante della ricognizione. Confrontando la pagina
pubblica con i dati letti da `/api/public/billing/plans` e
`/api/public/billing/addons` (copia in
`assets/cashking/api-traces/02-billing-piani-addon.json`), **quasi nessun numero
coincide**.

### Prezzi dei piani
| Piano | Pagina: lancio / listino | API: early bird / listino | Coincide |
|---|---|---|---|
| Micro | 49 / 59 € | 49 / 59 € | ✔ |
| **PMI** | **59 / 79 €** | **69 / 89 €** | ✗ scarto di 10 € su entrambi |
| PMI Plus | 99 / 129 € | 99 / 129 € | ✔ |

### Prezzi degli add-on
| Add-on | Pagina | API | Coincide |
|---|---|---|---|
| Gestione F24 / «F24 Facile» | 9,99 € | **19,99 €** | ✗ il doppio nell'API |
| Promemoria automatici | 7,99 € | **2,99 €** | ✗ meno della metà nell'API |
| Accesso Commercialista | 3,99 € | **non esiste nel catalogo** | ✗ |
| *(Modulo Retail)* | **non menzionato** | esiste come gate nell'applicazione | ✗ |

### Promesse di servizio del piano PMI Plus
| Promessa pubblica | Campo corrispondente nell'API | Valore |
|---|---|---|
| «Onboarding personalizzato (3 call incluse)» | `onboardingCalls` | **0** |
| «Supporto prioritario» | `prioritySupport` | **false** |
| «Accesso commercialista incluso» | `includesConsultantAccess` | **false** |

`[OSSERVATO]` I tre campi valgono zero e falso su **tutti e tre** i piani, PMI
Plus compreso.

`[IPOTESI]` Le due fonti sono disallineate perché il listino pubblico è stato
aggiornato senza toccare i record di fatturazione, o viceversa. Non è
determinabile dall'esterno quale delle due prevalga al momento dell'acquisto: il
pagamento passa da Stripe, e nell'API ogni piano porta il proprio
`stripePriceId`, quindi **è plausibile che faccia fede il prezzo dell'API**,
cioè quello più alto per il piano PMI e per l'F24.

`[DEDOTTO]` Per un potenziale cliente il rischio concreto è iscriversi vedendo
59 € e trovarsi addebitati 69 €. Per noi è un'informazione sul grado di
manutenzione del prodotto: la vetrina e il motore di fatturazione non sono tenuti
in sincronia.

---

## 3. Posizionamento: competono sul contratto, non sulle funzioni

`[OSSERVATO]` La pagina `/confronto` è intitolata «CashKing vs altri software» e
**non nomina mai un concorrente**. La tabella confronta CashKing con
«Software tradizionali» su questi assi:

| Asse | CashKing | «Software tradizionali» |
|---|---|---|
| Prova gratuita | 30 giorni | spesso non disponibile |
| Onboarding | gratuito per tutti | 500-1.500 € extra |
| Pagamento | mensile, senza vincoli | annuale anticipato |
| Costo di ingresso | 0 € | 2.000-3.000 € |
| Disdetta | in qualsiasi momento | penali o vincoli |
| Gestione F24 | add-on opzionale | spesso non incluso |
| Alert automatici | add-on opzionale | a pagamento extra |
| Accesso commercialista | disponibile | raramente disponibile |
| Supporto | incluso nel piano | premium a pagamento |
| Destinatario | adatto a PMI | progettato per grandi aziende |

`[DEDOTTO]` Sette assi su dieci riguardano **condizioni commerciali**, non
capacità del software. La tesi di vendita non è «facciamo cose che gli altri non
fanno» ma «non ti chiediamo migliaia di euro prima che tu capisca se serve».
La stessa pagina `/prezzi` apre con la stessa struttura argomentativa:
«La maggior parte dei software di tesoreria funziona così: contratto annuale,
2.000-3.000 € da pagare subito, onboarding a pagamento, poi scopri se ti serve
davvero. Per una piccola impresa questa non è una scelta. È una scommessa
forzata.»

`[OSSERVATO]` Il posizionamento sintetico ricorre identico nel piè di pagina di
ogni pagina: «La gestione della tesoreria per PMI **che oggi usano Excel**.
Semplice, operativa, senza complicazioni.»

`[DEDOTTO]` Il concorrente dichiarato non è un altro software: è il foglio di
calcolo. Coerente con l'esistenza di un articolo di blog intitolato «usare Excel
per la tesoreria senza caos» e con la pagina `/strumenti-tesoreria` che
«confronta Excel, ERP e software dedicato».

---

## 4. Accesso commercialista `[OSSERVATO]`

Pagina `/accesso-commercialista`, presentata come add-on a 3,99 €/mese e
inclusa nel piano PMI Plus.

**Cosa vede il commercialista:** le fatture attive aperte («cosa devi
incassare»), le fatture passive in scadenza («cosa devi pagare»), l'andamento
della liquidità giorno per giorno, «la situazione reale, non quella di due mesi
fa».

**Permessi.** Dichiarati in modo esplicito e netto: «Non può modificare nulla ·
Vede solo i dati · Può aiutarti meglio», con la formula «Non è un controllo. È
una collaborazione.»

`[DEDOTTO]` È un ruolo di sola lettura, non un secondo utente operativo. La
scelta è anche commerciale: a 3,99 € non consuma un posto utente dei piani, che
sono limitati a 1 e 3.

**Argomento di vendita.** Il costo non è giustificato con una funzione ma con un
risparmio: «Quei 3,99 € al mese non servono a *far entrare* il commercialista.
Servono a evitare telefonate dell'ultimo minuto, decisioni prese al buio,
scoperte di cassa quando ormai è tardi.»

`[DEDOTTO]` Il problema che dichiarano di risolvere — il commercialista che vede
l'azienda con 30, 60 o 90 giorni di ritardo, e le ricostruzioni contabili
tardive — è lo stesso filone dei loro articoli di blog, che sono in buona parte
dedicati al rapporto fra imprenditore e studio. È il canale di acquisizione su
cui stanno puntando, come conferma la novità principale della versione 0.26.5,
il multi-azienda «perfetto per commercialisti».

---

## 5. Condizioni commerciali e FAQ `[OSSERVATO]`

Ripetute con insistenza su ogni pagina: **30 giorni di prova gratuita, nessuna
carta di credito richiesta, onboarding incluso, pagamento mese per mese, nessun
vincolo, disdetta in qualsiasi momento.**

Dalle FAQ della pagina prezzi:
- **Carta di credito:** non richiesta per la prova.
- **Dopo i 30 giorni:** «Ti contatteremo per capire se CashKing fa per te. Se
  decidi di continuare, scegli il piano più adatto e inizi a pagare solo da quel
  momento.» `[DEDOTTO]` La conversione è assistita da una persona, non
  automatica: nessun addebito a sorpresa alla scadenza.
- **Cambio piano:** upgrade e downgrade in qualsiasi momento, il nuovo prezzo
  vale dal mese successivo.
- **Annuale:** sconto del 15% dichiarato.
- **Disdetta:** senza penali.

`[OSSERVATO]` Compare anche la formula «primo mese gratis» accanto ai «30 giorni
di prova». `[IPOTESI]` Due formulazioni della stessa promozione, oppure due
promozioni sovrapposte; il testo non lo chiarisce.

---

## 6. Struttura del sito e temi editoriali `[OSSERVATO]`

Il menu pubblico è organizzato in tre famiglie:

- **Gestione Tesoreria**: Panoramica PMI · Tesoreria e IVA · Incassi e Clienti ·
  Commercialista e Tesoreria · Crisi di Cassa · Strumenti di Tesoreria ·
  Scadenziario e Strategie · Onboarding
- **Funzionalità**: Panoramica · Riconciliazione Bancaria · Gestione F24 e Cassa
  Fiscale · Tesoreria Previsionale · **Scadenziario Intelligente**
- **Per Chi È · Prezzi · FAQ · Blog**

`[OSSERVATO]` Le funzionalità pubblicizzate sono **quattro**: riconciliazione
bancaria, F24 e cassa fiscale, tesoreria previsionale, scadenziario.

`[DEDOTTO]` Due delle quattro vetrine funzionali — F24 e, in parte, gli alert —
rimandano ad add-on a pagamento. Il modulo Retail, che nell'applicazione esiste
come sezione completa, **non è pubblicizzato da nessuna parte**: né nel menu, né
fra le funzionalità, né nella pagina prezzi.

`[OSSERVATO]` Il blog conta 40 articoli, con titoli concentrati su: rapporto con
il commercialista, IVA e scadenze fiscali, comportamento dei clienti nei
pagamenti, crisi di liquidità, e il debito fiscale come forma di finanziamento.

---

## 7. Integrazioni: la vetrina tace `[OSSERVATO]`

Le pagine pubbliche lette nominano come modalità di ingresso dei dati soltanto
l'**inserimento manuale** e l'**import da Excel e CSV**, ripetuti in tutti e tre
i piani.

`[OSSERVATO]` Non compare alcuna menzione pubblica di: collegamento bancario
PSD2, aggregatore, fattura elettronica, SDI, FatturaPA, cassetto fiscale, o
nomi di banche.

Eppure dentro l'applicazione esistono `/api/enable-banking/*` (l'aggregatore
PSD2 **Enable Banking**), l'import XML delle fatture elettroniche con anteprima,
i campi `sdiId` e `xmlFilePath` sulla fattura, l'«Import Fatture PDF (Cassetto
Fiscale)» documentato nella guida in-app, e il pagamento tramite Stripe.

### Correzione: sul PSD2 la vetrina ha ragione `[VERIFICATO]`

Questo capitolo, nella prima stesura, concludeva che «una vetrina che promette
solo import da Excel vende il prodotto molto al di sotto di quello che è».
**Era sbagliato**, almeno per la parte più importante.

La verifica dell'11 agosto (dettaglio in `01-inventario-rotte.md`, cap. 4.11)
mostra che il collegamento bancario PSD2 è configurato lato piattaforma e
dispone di un catalogo di 337 istituti, ma **non è accessibile ai clienti**:
l'unica schermata che lo riguarda risponde «Accesso riservato — Questa sezione è
disponibile solo per gli amministratori di sistema», e la pagina dei conti
bancari non offre alcun comando per avviare un collegamento.

`[DEDOTTO]` La comunicazione pubblica che parla soltanto di inserimento manuale
e import da Excel e CSV è quindi **accurata**, non reticente. Non promettono la
connessione bancaria perché per il cliente non c'è.

Resta invece vero lo scarto sull'altro fronte: l'import di **fattura elettronica
in XML, P7M e PDF da Cassetto Fiscale** esiste, funziona ed è visibile
nell'applicazione, ma non è menzionato in nessuna pagina pubblica. Su questo
sì, si vendono al di sotto di quello che sono.

`[DEDOTTO]` Il quadro complessivo cambia di segno: non è un prodotto che
sottovaluta le proprie integrazioni, è un prodotto che **di integrazioni
bancarie non ne ha ancora** e lo dice onestamente.

---

## 8. Lessico di dominio raccolto dalle pagine pubbliche `[OSSERVATO]`

Scadenziario · Scadenziario Intelligente · Tesoreria Previsionale ·
Riconciliazione Bancaria · Gestione F24 e Cassa Fiscale · Crisi di Cassa ·
Strumenti di Tesoreria · Incassi e Clienti · Movimento (definito come «una
fattura, un incasso, un pagamento o un'operazione bancaria») · Accesso
Commercialista · Promemoria automatici · Alert automatici · Export per la
contabilità · Previsione cassa futura · Saldo attuale sempre aggiornato.

---

## 9. Limiti di questa ricognizione

- Le pagine sono state lette presentandosi come crawler. È il modo in cui il
  sito espone il proprio contenuto ai motori di ricerca, ma non si può escludere
  che la versione servita al browser differisca nel dettaglio.
- ~~Non sono state lette per esteso `/termini`, `/privacy`, `/dpa`, `/nda`,
  `/onboarding`, `/prenota-onboarding`.~~ **Superato dal capitolo 10**, che le
  legge tutte e sei. In particolare la domanda sull'API è chiusa in senso
  negativo: «API» e «token» hanno **zero occorrenze** in tutti i documenti
  legali, quindi l'endpoint `/api/auth/api-token` non ha copertura contrattuale
  ed è un token interno, non un'API di prodotto. Restano non letti i 40 articoli
  del blog, di cui tre sono stati letti singolarmente.
- Il testo è stato estratto rimuovendo gli script dal documento; frammenti di
  codice residui potrebbero essere sfuggiti, ma le citazioni riportate sono
  state controllate a mano.

---

## 10. Termini, DPA e pagine non lette nella prima passata

Rilevazione dell'11 agosto 2026, con lo stesso metodo del capitolo 0 (user agent
di Googlebot, script rimossi). Nove pagine richieste, **nove risposte HTTP 200**:
nessuna delle pagine attese risulta mancante o vuota. Testo integrale in
`assets/cashking/export/pagine-legali-testo.txt`. Questo capitolo chiude il
secondo punto aperto al capitolo 9.

### 10.1 Chi è il fornitore `[OSSERVATO]`

I tre documenti legali riportano la stessa anagrafica, che sulle pagine
commerciali non compare mai:

**ANYT1ME SRL** — Via delle Industrie 25/10, 30175 Venezia (Marghera) —
P. IVA **02763630213** — `support@cashking.biz`, `privacy@cashking.biz` per
l'esercizio dei diritti privacy.

`[DEDOTTO]` «CashKing» è un marchio commerciale, non la ragione sociale. Legge
italiana, foro e arbitrato a Venezia in tutti e tre i documenti.

### 10.2 Termini e Condizioni: cosa si impegnano a fare, e cosa no

*(«Ultimo aggiornamento: Gennaio 2026», `https://cashking.biz/termini`)*

`[OSSERVATO]` **Nessun SLA e nessun impegno di disponibilità.** La parola non
compare in nessuna forma: non ci sono percentuali di uptime, finestre di
manutenzione, tempi di risposta del supporto né penali. L'unica occorrenza di
«disponibilità» in tutti e quattro i documenti è nella formula generica sulle
misure di sicurezza dell'informativa privacy. In compenso è previsto il
contrario: CashKing può sospendere o interrompere il servizio per mancato
pagamento, violazione dei termini, uso improprio o rischi per la stabilità del
sistema, e la sospensione non dà diritto ad alcun rimborso.

`[OSSERVATO]` **Conservazione dei dati alla disdetta: 60 giorni.** L'abbonamento
si rinnova tacitamente; la disdetta ha effetto alla scadenza del periodo già
pagato e non dà diritto a rimborsi, nemmeno parziali. Dopo la cessazione i dati
restano disponibili per 60 giorni, entro i quali si può riattivare il servizio;
trascorsi i 60 giorni sono eliminati definitivamente. Lo stesso termine è
ripetuto identico nell'NDA. L'esportazione dei dati è consentita sia durante
l'abbonamento sia durante i 60 giorni.

`[DEDOTTO]` Il diritto di esportare c'è, ma il testo non dice **in quale
formato**, né con quale completezza, né prevede assistenza alla migrazione. Sono
i 60 giorni l'unica garanzia concreta contro il lock-in.

`[OSSERVATO]` **Cap di responsabilità:** l'importo pagato dal cliente nei 12
mesi precedenti l'evento dannoso. `[DEDOTTO]` Su un piano PMI significa un
massimale intorno ai 700-830 € l'anno. Per un software su cui si decide se
pagare un fornitore o rinviare un F24, è un tetto molto basso; e i termini
escludono comunque i danni indiretti, la perdita di profitti e le decisioni
aziendali prese sulla base dei dati del servizio, perché CashKing si dichiara
«strumento di supporto decisionale» che «non fornisce consulenza fiscale,
contabile o finanziaria».

`[OSSERVATO]` **Solo B2B, con esclusione esplicita del Codice del Consumo.** Il
servizio è riservato a titolari di partita IVA e il testo dichiara che non è
destinato ai consumatori ai sensi del D.Lgs. 206/2005. `[DEDOTTO]` Con
l'esclusione decadono diritto di recesso di quattordici giorni, foro del
consumatore e nullità delle clausole vessatorie: è la premessa che rende
opponibili sia il cap di responsabilità sia la clausola arbitrale.

`[OSSERVATO]` **Arbitrato prima del giudice.** Le controversie non risolte in
via bonaria vanno deferite ad arbitrato rituale in lingua italiana con sede a
Venezia; solo in via residuale è competente il Foro di Venezia in esclusiva.

`[OSSERVATO]` **Il «prezzo bloccato per sempre» ha una clausola sotto.** Le
variazioni di listino non sono retroattive e non toccano chi ha un abbonamento
attivo, «fino a eventuale cambio piano o cessazione e riattivazione del
servizio». Le condizioni Early Bird, gli sconti e i mesi bonus sono concessi «a
insindacabile discrezione», non costituiscono precedente e **non sono
automaticamente rinnovabili**.

`[DEDOTTO]` La promessa di scarsità del capitolo 1 («blocchi il prezzo per
sempre, solo 100 posti») regge finché il cliente non tocca nulla: un upgrade da
Micro a PMI, o una sospensione con successiva riattivazione, fanno perdere il
prezzo storico. È la stessa leva che rende costoso cambiare piano, letta dal
lato del contratto.

`[OSSERVATO]` **I limiti quantitativi dei piani non sono nei termini.** Movimenti
al mese, numero di conti e di utenti — i numeri del capitolo 1 — non compaiono:
il contratto dice solo che «le funzionalità disponibili dipendono dal piano di
abbonamento attivo». Anche la durata della prova gratuita non è fissata: i
termini rimandano a quanto «indicato al momento della registrazione», mentre
ogni pagina commerciale promette 30 giorni.

`[DEDOTTO]` I limiti restano quindi modificabili unilateralmente senza toccare
il contratto. Per un potenziale cliente è il punto più fragile dell'insieme:
ciò che è scritto nei termini è meno di ciò che è promesso in vetrina.

`[OSSERVATO]` La descrizione contrattuale del servizio elenca importazione e
gestione di movimenti bancari e fatture, riconciliazione di pagamenti e incassi,
flussi di cassa e previsioni, gestione di scadenze fiscali **e deleghe**.

### 10.3 L'API non è contrattualmente prevista

`[OSSERVATO]` Le parole «API» e «token» hanno **zero occorrenze** in tutti e
quattro i documenti legali (termini, DPA, privacy, NDA) e in tutte e nove le
pagine lette. Nessun accesso programmatico è promesso, tariffato, limitato o
vietato.

`[OSSERVATO]` Non esiste una pagina pubblica dedicata: richiedendo
`/api`, `/sla`, `/cookie-policy`, `/cookie`, `/subprocessors` e
`/sub-responsabili` il sito risponde **200 restituendo la home** — titolo
generico «CashKing - Gestione Tesoreria per PMI» e contenuto della pagina
principale.

`[DEDOTTO]` Due conseguenze. La prima, di metodo, vale per tutta questa
ricognizione e per chiunque la ripeta: su questo sito **un 200 non prova che la
pagina esista**, perché le rotte sconosciute cadono sulla home invece di dare
404. Bisogna sempre controllare il titolo. La seconda: l'endpoint
`/api/auth/api-token` visto nell'inventario delle rotte non ha copertura
contrattuale né commerciale. Non è un'API di prodotto, e nulla impegna CashKing
a mantenerla, documentarla o non rimuoverla.

`[IPOTESI]` È più probabilmente un residuo interno — un token per uso proprio,
per un'integrazione su misura o per un lavoro non finito — che l'anticipazione
di una funzione in arrivo. Se fosse in programma venderla, un fornitore che
tariffa a 3,99 € perfino l'accesso in sola lettura del commercialista l'avrebbe
già messa a listino.

### 10.4 DPA: nessun subresponsabile è nominato

*(`https://cashking.biz/dpa`, art. 28 GDPR)*

È il risultato più netto di questa lettura, e risponde in negativo alla domanda
posta.

`[OSSERVATO]` Il DPA **non nomina un solo fornitore terzo**. L'articolo 8
concede al responsabile un'autorizzazione generale a nominare sub-responsabili,
descritti solo per genere — «es. fornitori cloud, servizi IT» — a condizione che
siano vincolati da obblighi equivalenti e garantiscano un livello di protezione
adeguato, e chiude con la formula: l'elenco dei sub-responsabili **«può essere
reso disponibile su richiesta»**. Nessun nome, nessun link, nessun allegato.
Identica reticenza nell'NDA, che all'articolo 6 parla di «fornitori tecnologici
(es. hosting, cloud, servizi di sicurezza)», e nell'informativa privacy, che
comunica i dati a «fornitori di servizi tecnologici e cloud».

`[OSSERVATO]` **Enable Banking, Stripe e Google App Engine — che sappiamo essere
in uso dall'analisi interna — non compaiono in nessuno dei tre documenti.**
Anche cercando i nomi delle alternative plausibili (AWS, Amazon, Azure, Aruba,
OVH, Hetzner) non si trova nulla. L'unica occorrenza di «Stripe» e «PayPal» in
tutte e nove le pagine è nella pagina onboarding, dove sono citati come fonti di
un report da scaricare e importare a mano, non come fornitori.

`[OSSERVATO]` **Dove siano ospitati i dati non è dichiarato da nessuna parte.**
Non compaiono paesi, regioni, datacenter né infrastrutture. Sui trasferimenti
extra-UE ci sono soltanto due formule di rinvio: il responsabile si impegna a
«non trasferire dati fuori dallo SEE senza adeguate garanzie» (DPA, art. 6) e
«eventuali trasferimenti extra-UE avvengono nel rispetto degli artt. 44-49
GDPR» (privacy, § 9). Nessuna clausola contrattuale tipo allegata, nessuna
decisione di adeguatezza citata.

`[DEDOTTO]` Con un'autorizzazione generale, l'art. 28.2 GDPR chiede al
responsabile di **informare il titolare delle modifiche** — aggiunta o
sostituzione di sub-responsabili — lasciandogli la possibilità di opporsi. Il
DPA di CashKing non prevede né la notifica né l'opposizione: si limita a
concedere l'autorizzazione. Un cliente che voglia sapere chi tocca i propri dati
deve chiederlo, e nulla lo avverte se domani cambia l'aggregatore bancario.

`[DEDOTTO]` Va misurata bene la portata di questa lacuna, alla luce della
correzione al capitolo 7. **Oggi** il problema più grave non si pone: il
collegamento PSD2 non è accessibile ai clienti, quindi nessun dato bancario di
un cliente transita per l'aggregatore. Restano però due fornitori che trattano
dati **già adesso** e che nessun documento nomina: chi incassa i pagamenti
(Stripe, con i dati di fatturazione) e chi ospita l'applicazione, cioè
l'intero contenuto del database. `[DEDOTTO]` E il giorno in cui apriranno il
PSD2 ai clienti, il DPA nella sua forma attuale **non li obbliga ad avvisare
nessuno**: l'autorizzazione ai sub-responsabili è già concessa in bianco, e non
esiste la notifica preventiva che permetterebbe al cliente di sapere che le
proprie credenziali bancarie passeranno da un terzo, né di opporsi.

`[OSSERVATO]` **L'ambito del DPA è ristretto in modo notevole.** Sono
espressamente esclusi i dati economico-finanziari, contabili e previsionali
dell'azienda e ogni informazione non riconducibile a una persona fisica: il DPA
copre solo i dati personali di terzi inseriti dal cliente (nomi, email,
riferimenti contrattuali di clienti, fornitori, collaboratori e dipendenti). Il
resto è rimandato ai termini e all'NDA.

`[DEDOTTO]` L'esclusione è corretta in diritto — i dati di bilancio non sono
dati personali — ma sposta il cuore di ciò che il cliente affida a CashKing
fuori dal solo documento che porta obblighi tipizzati dal GDPR, e lo consegna a
un NDA di diritto comune. Da qui, con ogni probabilità, la necessità stessa di
avere un NDA (vedi 10.6).

`[OSSERVATO]` Misure di sicurezza dichiarate: controllo degli accessi,
«cifratura dei dati ove appropriato», backup e disaster recovery, **separazione
logica dei dati**, monitoraggio e logging degli accessi. L'informativa privacy
è leggermente più precisa e cita la «cifratura dei dati **in transito**».

`[DEDOTTO]` Nessuno dei documenti promette cifratura a riposo: «ove appropriato»
lascia la scelta al fornitore. La «separazione logica» conferma un impianto
multi-tenant a livello applicativo, non isolamento fisico per cliente. Non è
citata alcuna certificazione (ISO 27001, SOC 2), non è indicato un DPO, e il
diritto di audit del cliente è temperato da «ragionevolezza, proporzionalità e
tutela della riservatezza degli altri clienti».

### 10.5 Informativa privacy: nulla di anomalo, e una pagina che manca

*(«Ultimo aggiornamento: Gennaio 2026», `https://cashking.biz/privacy`)*

`[OSSERVATO]` **Basi giuridiche:** esecuzione del contratto (art. 6.1.b),
obbligo legale (6.1.c), consenso ove applicabile (6.1.a), legittimo interesse
(6.1.f). **Dati trattati:** tecnici e di navigazione (IP, browser, dispositivo,
sistema operativo, data e ora, pagine visitate); di registrazione (nome,
cognome, email, ruolo professionale, contatti); di utilizzo (log di accesso,
operazioni effettuate, eventi tecnici); dati di terzi inseriti dall'utente.
**Doppio ruolo** dichiarato con chiarezza: titolare per i dati dell'utente
registrato, responsabile ex art. 28 per i dati di terzi.

`[OSSERVATO]` **Conservazione:** nessun termine numerico proprio. Durata del
rapporto contrattuale, tempo necessario agli obblighi di legge, revoca del
consenso ove applicabile; per la cessazione rimanda ai termini, quindi ai 60
giorni. Le credenziali sono dichiarate conservate «in forma cifrata e non
leggibili da CashKing».

`[OSSERVATO]` Il § 10 rimanda a «una Cookie Policy dedicata» per la gestione dei
cookie analitici e di marketing. `[OSSERVATO]` **Quella pagina non esiste:**
`/cookie-policy` e `/cookie` restituiscono la home (vedi 10.3), e nel piè di
pagina compare solo un pulsante «Preferenze Cookie» che apre il banner. Il
banner stesso dichiara cookie «per analisi e funzionalità».

`[DEDOTTO]` È un rinvio a vuoto: l'unico documento sui cookie promesso
dall'informativa non è pubblicato.

### 10.6 NDA: copre proprio ciò che il DPA esclude

*(«Ultimo aggiornamento: 18 gennaio 2026», `https://cashking.biz/nda`)*

`[OSSERVATO]` È un accordo di riservatezza unilaterale, offerto dal fornitore e
accettato con la registrazione, che dichiara Informazioni Riservate tutto ciò
che il DPA lascia fuori: dati economico-finanziari e contabili, vendite e
fatturazione, flussi di cassa e previsioni, informazioni strategiche e
operative. Gli obblighi durano **5 anni** oltre la cessazione. La gestione dei
dati alla fine del servizio ripete i **60 giorni** dei termini.

`[OSSERVATO]` L'articolo 5 esclude quattro usi impropri: analisi commerciali a
fini di rivendita, profilazione economica o finanziaria, condivisione con terzi
per marketing e **«addestramento di modelli o sistemi esterni al servizio»**.

`[DEDOTTO]` L'aggettivo finale è la parola che conta. L'impegno è a non
addestrare modelli **esterni**; a contrario, l'uso dei dati del cliente per
migliorare modelli o meccanismi **interni** al servizio non è escluso. Non è
necessariamente malizioso — è la formulazione che serve per poter usare un
classificatore che impara dalle categorizzazioni — ma è una porta lasciata
aperta con cura in un documento il cui scopo dichiarato è «rassicurare il
Cliente circa il mancato trasferimento a terzi dei dati».

`[DEDOTTO]` Nel complesso l'NDA è più un pezzo di marketing della fiducia che
una tutela ulteriore: promette «riservatezza assoluta» in un documento che, a
differenza del DPA, non porta con sé obblighi tipizzati né sanzioni
amministrative. Serve a rispondere all'obiezione «ma voi vedete i miei numeri?»,
che per una PMI che passa da Excel è probabilmente l'obiezione principale.

### 10.7 Onboarding: una call da 45 minuti, uguale per tutti

*(`https://cashking.biz/onboarding`, «Come Funziona CashKing - 4 Passaggi»)*

`[OSSERVATO]` Il percorso dichiarato è in quattro passaggi:

1. **Prepari i dati.** Fatture emesse e ricevute dell'ultimo mese, estratto
   conto bancario, estratto conto della carta aziendale, «report da PayPal/Stripe
   (se presente)». Con la nota «Basta l'ultimo mese. Non serve lo storico
   annuale» e l'avvertimento «Se non riesci a recuperare questi dati facilmente,
   il problema non è CashKing. È la gestione attuale».
2. **Onboarding guidato.** «Una call di **45 minuti** per configurare CashKing
   insieme a te»: configurazione del sistema, impostazione delle importazioni,
   lettura della dashboard, risposte alle domande. «Alla fine della call: il
   sistema è configurato, i dati sono importati, sai già dove guardare ogni
   giorno.»
3. **Importazione automatica.** Import CSV/Excel «con un click», **modelli
   riutilizzabili per ogni tipo di file**, «CashKing capisce come sono fatti i
   tuoi file», tracciabilità di cosa è stato importato e quando.
4. **Controllo quotidiano.** Saldo attuale, incassi previsti, pagamenti futuri,
   andamento mensile, per rispondere alla domanda «Tra 30 giorni come sto?».

`[OSSERVATO]` I tre numeri messi in evidenza in fondo: **45 min** di onboarding
guidato, **30 gg** di prova, **0 €** di carta di credito. La promessa di tempo
complessiva è «in meno di una settimana passi da Excel a una visione chiara
della tesoreria».

**La questione delle call.** `[OSSERVATO]` Ci sono ora **tre versioni
incompatibili** dello stesso impegno:

| Fonte | Cosa dice |
|---|---|
| `/prezzi`, piano PMI Plus | «Onboarding personalizzato (**3 call incluse**)» |
| `/api/public/billing/plans` | `onboardingCalls` = **0** su tutti e tre i piani |
| `/onboarding`, `/prenota-onboarding`, home, piè di pagina di ogni pagina | **una** call da 45 minuti, **gratuita e uguale per tutti**, indipendente dal piano |

`[DEDOTTO]` La terza versione è quella coerente con il resto del sito: il piè di
pagina di tutte e nove le pagine ripete «30 giorni · onboarding incluso · nessuna
carta», la home dice «Onboarding guidato di 45 minuti incluso» e la pagina
`/confronto` (capitolo 3) vende l'onboarding come «gratuito per tutti» contro i
500-1.500 € dei «software tradizionali». La call unica da 45 minuti per chiunque
è dunque l'impegno reale; le «3 call incluse» del piano PMI Plus sono
probabilmente un differenziatore scritto sulla pagina prezzi e mai implementato
altrove — il che spiega perché nel motore di fatturazione il contatore valga
zero.

`[DEDOTTO]` Va aggiunta una lettura meno benevola: se l'onboarding gratuito è
identico per tutti, **il piano PMI Plus a 99-129 € perde uno dei suoi tre
differenziatori di servizio**, e insieme agli altri due già smentiti dall'API
(supporto prioritario e accesso commercialista, entrambi `false`) resta
distinto dal piano PMI quasi solo per l'assenza di limiti quantitativi.

`[OSSERVATO]` Anche qui **nessun collegamento bancario automatico**: al passo 1
si chiede al cliente di procurarsi l'estratto conto come file, e PayPal e Stripe
compaiono come origine di report da scaricare, non come integrazioni.

`[DEDOTTO]` È la conferma più forte della correzione al capitolo 7, e viene dal
punto del sito dove mentire costerebbe di più. Una pagina di marketing può
tacere una funzione; una checklist di preparazione all'onboarding no, perché il
cliente la usa davvero il giorno prima della call. Se il collegamento bancario
fosse disponibile, chiedere l'estratto conto in PDF sarebbe un autogol: non lo
chiedono perché serve.

### 10.8 Prenota onboarding: il calendario è fermo a gennaio

*(`https://cashking.biz/prenota-onboarding`)*

`[OSSERVATO]` La pagina è un wizard in tre passi che si apre su «Seleziona una
data», sotto il titolo «45 minuti di onboarding gratuito — Un nostro esperto ti
mostrerà come configurare CashKing per la tua azienda». È l'unica delle nove
pagine **senza un titolo HTML proprio**: il tag `<title>` dice soltanto
«CashKing».

`[OSSERVATO]` Le date offerte sono **lunedì 19 gennaio – giovedì 5 febbraio**:
esattamente quattordici giorni feriali consecutivi, senza sabati e domeniche.
La rilevazione è dell'11 agosto 2026.

`[DEDOTTO]` La finestra di quattordici giorni lavorativi che parte il lunedì 19
gennaio 2026 colloca la generazione della pagina al fine settimana precedente,
lo stesso in cui è datato l'NDA (18 gennaio 2026) e coerente con il «Gennaio
2026» dei termini e della privacy. **Il contenuto pre-renderizzato che il sito
serve ai crawler risale quindi a metà gennaio 2026 e non è più stato
rigenerato**: da circa sette mesi Google legge un sito congelato.

`[IPOTESI]` Non si può escludere che a un browser vero il calendario si popoli
lato client con date corrette — è esattamente il tipo di componente che si
calcola al volo. Ma se così fosse, il pre-rendering starebbe comunque servendo
ai motori di ricerca una pagina di prenotazione con date scadute da mesi.
`[IPOTESI]` L'ipotesi alternativa, peggiore, è che gli slot siano scritti a mano
nel codice e che la prenotazione non funzioni affatto; non è verificabile senza
usare il browser, e non lo abbiamo fatto.

`[OSSERVATO]` Nessuna indicazione di chi tenga la call — «un nostro esperto», al
singolare — né di fusi orari, durata degli slot o strumento di
videoconferenza.

### 10.9 Le tre pagine di funzionalità: molta retorica, un solo numero

`[OSSERVATO]` **Nessuna delle tre pagine contiene promesse quantitative sul
prodotto**, né screenshot descritti, né nomi di integrazioni, né banche, né
menzioni di PSD2, SDI o fattura elettronica. Sono pagine argomentative, costruite
tutte sullo stesso schema: il problema di gestione, l'errore tipico
dell'imprenditore, l'approccio CashKing, l'invito a scoprire i piani o a
prenotare l'onboarding.

**Tesoreria previsionale.** `[OSSERVATO]` La tesi è che «il saldo è una
fotografia, la gestione della liquidità è un film» e che le crisi di liquidità
non arrivano all'improvviso. Il passaggio tecnicamente più informativo è la
dichiarazione che «CashKing non fa previsioni astratte»: la previsione è
costruita a partire da incassi attesi, pagamenti programmati, scadenze fiscali e
movimenti reali già avvenuti, ed è «la naturale estensione dello scadenziario».

`[DEDOTTO]` È l'ammissione, in linguaggio di vendita, che **la previsione è una
proiezione deterministica dello scadenziario**: nessun modello statistico,
nessuna stagionalità, nessun apprendimento sullo storico dei ritardi di
pagamento. Ciò che non è già a scadenziario non entra nella previsione. Per noi è
un dato architetturale utile, ed è coerente con l'assenza di qualunque promessa
numerica su accuratezza o orizzonte.

**Scadenziario intelligente.** `[OSSERVATO]` La separazione fondamentale è fra
**«Da incassare»** (crediti in arrivo, scadenze attese, liquidità futura) e
**«Da pagare»** (debiti in scadenza, impegni certi, uscite pianificate), con
l'obiettivo dichiarato di rendere visibile «chi stai finanziando e chi ti sta
finanziando»: quali clienti pagano tardi, quali fornitori assorbono più cassa.
Qui compare **l'unica promessa quantitativa delle tre pagine**: gli orizzonti di
lettura sono **breve termine 1-3 mesi** e **medio termine 3-6 mesi**.

`[OSSERVATO]` Le quattro domande a cui lo scadenziario dovrebbe rispondere sono
formulate come misure nel tempo: se gli incassi si stiano davvero accorciando,
se i pagamenti siano più diluiti, se si stia usando meno o meglio il
castelletto, se le decisioni prese stiano funzionando. `[DEDOTTO]` Sono
indicatori di tendenza (DSO, DPO e utilizzo del fido, non chiamati per nome), il
che suggerisce un confronto fra periodi più che un singolo valore corrente.

**Gestione F24 e cassa fiscale.** `[OSSERVATO]` La pagina qualifica
esplicitamente il monitoraggio F24 come **add-on**, coerentemente con il listino.
Le quattro cose che promette: vedere tutte le scadenze tributarie dentro lo
scadenziario, capire l'impatto dei versamenti sulla liquidità futura, monitorare
il **cumulato fiscale** nel tempo, evitare accumuli non intenzionali.
L'argomento centrale è che il debito verso lo Stato «non passa dalla Centrale
Rischi», non blocca subito l'operatività e «non fa rumore finché non diventa
grande».

`[DEDOTTO]` È la pagina più esplicita di tutto il sito sul cliente che hanno in
mente: un'impresa che usa i versamenti fiscali come forma di finanziamento di
fatto. Il testo non lo condanna — «usare il debito fiscale come leva di cassa è
una realtà diffusa» — e propone di renderlo «visibile, misurabile,
governabile». Coerente con il filone editoriale del blog rilevato al capitolo 6.

### 10.10 Lessico nuovo, a integrazione del capitolo 8 `[OSSERVATO]`

Da incassare · Da pagare · Cumulato fiscale · Castelletto · Fido · Centrale
Rischi · Delega (F24) · Cassa fiscale · Onboarding guidato · Modelli
riutilizzabili (per l'import) · Breve termine (1-3 mesi) · Medio termine (3-6
mesi) · Informazioni Riservate · Grace period (usato sia per la prova iniziale
sia per i 60 giorni post-cessazione).

`[DEDOTTO]` Da notare la coppia «Da incassare / Da pagare» come intestazioni di
sezione: nel nostro dominio corrispondono a crediti e debiti, ma il registro
scelto è quello dell'imprenditore, non del contabile. Vale per tutto il sito, ed
è probabilmente la scelta lessicale più riuscita del prodotto.

### 10.11 Cosa resta fuori portata

- **Chi siano i subresponsabili non è ricavabile dalle fonti pubbliche.** L'unica
  via prevista è chiederne l'elenco al fornitore, cosa che non abbiamo fatto e
  che non è opportuno fare.
- **Il funzionamento reale della prenotazione onboarding** non è verificabile
  senza compilare il wizard con un browser.
- **Restano non lette** le pagine `/funzionalita` (panoramica) e
  `/funzionalita/riconciliazione-bancaria`, le pagine editoriali del menu
  «Gestione Tesoreria» e i 40 articoli del blog. La pagina sulla riconciliazione
  bancaria è la sola delle quattro vetrine funzionali ancora da leggere, e va
  letta con una domanda precisa in mano: dopo la correzione al capitolo 7
  sappiamo che il collegamento PSD2 ai clienti non è dato: resta da vedere se
  quella pagina lo prometta comunque. Sarebbe l'unico punto del sito in cui
  promettono più di quello che consegnano, e cambierebbe il giudizio sulla loro
  onestà comunicativa.
- **Il pre-rendering è datato** (vedi 10.8): tutto ciò che è riportato in questo
  capitolo potrebbe riflettere lo stato del sito a gennaio 2026 anziché a
  agosto. Le pagine legali portano date coerenti con quel periodo, quindi per
  esse la differenza è probabilmente nulla; per i prezzi e le promesse
  commerciali il dubbio resta, e va tenuto presente rileggendo i capitoli 1 e 2.
