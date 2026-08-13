# Cash King — Revisione di completezza del corpus

Revisione svolta l'11 agosto 2026, su una fotografia dei documenti presa alle
**11:48**. Materiale esaminato: i sette deliverable previsti dal metodo, i sei
file di area funzionale, `PIANO-RESIDUO.md`, e tutti i materiali grezzi in
`assets/cashking/` (venti screenshot, due tracce API, quattro file di export).
Nessuna nuova osservazione sul prodotto: la revisione lavora solo su ciò che è
già scritto e su ciò che è già archiviato su disco.

⚠️ **Avvertenza sulla fotografia.** Durante la revisione tre file sono stati
riscritti da altre sessioni: `00-ricognizione-pubblica.md` alle 11:43 (da 305 a
760 righe, con il nuovo capitolo 10 sulle pagine legali e la correzione al
capitolo 7), `01-inventario-rotte.md` alle 11:37 (nuovo capitolo 4.11 sul PSD2)
e `02-06-stampe-import-pianificazione.md` alle 11:43 (nuovo capitolo 5 sugli
export). Le parti nuove sono state rilette e sono incluse. I numeri di riga
citati per questi tre file valgono alla fotografia delle 11:48 e possono essere
già scivolati.

---

## Giudizio sintetico

Il corpus è solido dove conta di più, cioè nelle logiche di calcolo. Le formule
non sono raccontate ma misurate: due sonde con importi tondi, due orizzonti
temporali indipendenti, un regime IVA commutato e riportato indietro, una
fattura da 732.000 € inserita e rimossa per mettere sotto tensione l'Acid Test.
Ho ricontrollato venti verifiche aritmetiche prese da cinque file diversi e
diciannove tornano al centesimo — comprese le due più laboriose, cioè le sette
righe di ciascuna colonna dello scadenzario, che sommano esattamente ai totali
dichiarati. In un caso ho potuto fare di più che ricontrollare: il CSV del
report DSO/DPO, archiviato alle 11:42, contiene esattamente i nove valori di DSO
usati in `02-03` per la verifica del «puro», e la ponderazione sui fatturati
reali dà 28,03, coerente con il «circa 28» scritto nel documento. Una verifica
fatta a mano ore prima regge alla prova dei dati grezzi arrivati dopo. Anche gli
accorgimenti UX hanno tutti una traduzione concreta sul nostro stack, con il
componente shadcn nominato e, dove serve, la migrazione Prisma: è la parte del
lavoro che il metodo chiedeva con più insistenza ed è quella meglio riuscita.

Il difetto del corpus è uno solo, e si presenta ventisette volte: **i documenti
scritti presto non sono stati riaperti quando le loro domande hanno trovato
risposta**. Non ci sono conclusioni sbagliate, ci sono conclusioni giuste
affiancate alle domande che avrebbero dovuto cancellare. Il capitolo 10 di
`03-modello-dati.md` elenca sei test «da fare» che erano già stati fatti e sono
documentati altrove come `[VERIFICATO]`; `02-05` si apre dichiarando di non aver
mai aperto la schermata delle regole e poche righe dopo ne trascrive il payload
di creazione; `05` chiude chiedendo una misura su mobile che ha già fatto e
messo a verbale in un proprio capitolo. Un caso è più che pedante: in
`04b` la sonda B porta scritta una previsione — «lo Scaduto deve diventare
−3.755,72 €» — che l'esperimento ha smentito nel verso opposto, e chi la
rileggerà il 12 agosto userà un valore di riferimento sbagliato. Il secondo
problema, più serio ma circoscritto, è di tracciabilità: il capitolo più
citabile della ricognizione pubblica — le discrepanze fra vetrina e sistema di
fatturazione — poggia per metà sulla pagina `/prezzi`, che **non è fra le sei
pagine archiviate**, mentre l'altra metà è pienamente verificabile sulla traccia
API. Il rimedio a entrambi i problemi è meccanico e costa poche ore.

---

## Controllo 1 — Contraddizioni fra documenti

È la categoria con più risultati. Le ordino per gravità.

### 1.1 Una previsione smentita, lasciata come valore di riferimento `[GRAVE]`

`04b-comportamenti-nel-tempo.md:192-193` scrive, a proposito della sonda B:

> «Il valore di partenza dello Scaduto è −3.145,72 €: se la sonda B viene
> conteggiata, deve diventare **−3.755,72 €**.»

`04-logiche-di-calcolo.md:216-218` misura il contrario:

> «Il valore di partenza era −3.145,72 €. Dopo aver aggiunto una fattura attiva
> scaduta da 610 €, è diventato **−2.535,72 €**: è *migliorato* di esattamente
> 610.»

La previsione assumeva che «Scaduto» fosse un totale; l'esperimento ha
dimostrato che è una posizione netta, quindi un credito scaduto in più la
**riduce**. Lo stesso `04b:310` registra correttamente «Scaduto +610,00» nella
tabella degli interventi, quindi la contraddizione è interna anche al singolo
file.

**Correzione suggerita:** sostituire in `04b:192-193` il valore atteso con
−2.535,72 € e annotare che la previsione originaria era sbagliata perché
assumeva un totale anziché una posizione netta. Va fatto prima della rilettura
del 12 agosto, altrimenti il confronto longitudinale parte da un riferimento
errato.

### 1.2 Sei test dichiarati «da fare» che sono già stati fatti `[GRAVE]`

Il capitolo 10 di `03-modello-dati.md` è intitolato «Incertezze e test
necessari». Sei delle dodici voci sono chiuse altrove:

| Voce | Righe | Dove è già risolta |
|---|---|---|
| 10.1 Struttura interna delle sette riconciliazioni — «Test: riconciliare parzialmente una fattura da 1.000 € con un bonifico da 800 €, poi compensare i restanti 200 € con una nota di credito» | 1000-1010 | `04-logiche-di-calcolo.md`, cap. 10, `[VERIFICATO]`: è **esattamente** quell'esperimento, con 800 € di banca e 420 € di nota di credito, e `reconciliationAmounts` letto a ogni passo |
| 10.3 Regime IVA e data della liquidazione — «Test: cambiare il regime IVA in `/settings/company`» | 1021-1029 | `04-logiche-di-calcolo.md`, cap. 4, `[VERIFICATO]`: il regime **è stato** commutato a trimestrale e riportato a mensile, con le due previsioni misurate |
| 10.8 Struttura delle regole — «Cosa non so: praticamente tutto» | 1072-1081 | `02-05`, capp. 1 e 1b: dieci tipi con le chiavi interne, tredici operatori, undici campi, le azioni, e il payload di creazione trascritto |
| 10.10 Presenza di `rowHash` fuori dalla fattura | 1094-1102 | `03-modello-dati.md`, §11.1, nello stesso file: «✔ confermato: `rowHash` presente su `transactions` **e** su `credit-card-movements`» |
| 10.11 Snapshot storici delle previsioni | 1104-1114 | chiusa nel testo stesso con `[VERIFICATO]`, ma il paragrafo «**Test.**» è rimasto sotto |
| 10.12 Entità dei moduli non esplorabili — «L'unica via praticabile è l'estrazione delle stringhe di interfaccia dal bundle […] va decisa esplicitamente prima di procedere» | 1116-1128 | l'estrazione è stata fatta (`assets/cashking/export/guida-in-app-estratta-dal-bundle.txt`, ore 00:34) e `02-04` è interamente costruito su di essa |

**Correzione suggerita:** riscrivere il capitolo 10 tenendo solo le voci ancora
aperte (10.2 aliquote multiple, 10.4 `sbfMode`, 10.5 rate ricorrenti passate,
10.6 movimenti «Previsti», 10.7 gateway e commissioni, 10.9 ruoli multi-azienda)
e spostare le altre sei in un capitolo «incertezze chiuse», con il rimando al
documento che le chiude. Così com'è, il capitolo dice al lettore della sintesi
che sappiamo meno di quanto sappiamo.

### 1.3 Due autocontraddizioni dentro lo stesso paragrafo `[GRAVE]`

`03-modello-dati.md:563-566`:

> «`[VERIFICATO]` Regole automatiche con dieci tipi e tredici operatori (vedi
> `02-aree-funzionali/02-05`) […] **Di questa entità conosco solo il nome
> dell'endpoint**: non ho aperto la schermata e non elenco campi.»

Le due frasi si negano a vicenda, e la seconda è falsa: la schermata è stata
aperta (`02-05`, cap. 1b, con due screenshot).

`03-modello-dati.md:870-876`:

> «`[DEDOTTO]` L'impronta e non una chiave naturale, perché una riga di estratto
> conto non ha un identificativo stabile […] `[VERIFICATO]` Il campo `merchant`
> esiste sui movimenti bancari, dove il problema è più acuto che sulle fatture;
> per simmetria e per la presenza di un'anteprima di importazione è molto
> probabile, **ma non l'ho osservato**.»

Qui il guasto è doppio. La frase è incoerente in sé (`[VERIFICATO]` seguito da
«non l'ho osservato») e attribuisce `merchant` all'entità sbagliata: §11.3 dello
stesso file lo colloca **sul movimento di carta** («Sul movimento di carta:
`merchant` (che è il campo «Esercente» delle regole)»), non su quello bancario.
Sembra una sostituzione mal riuscita di una vecchia `[IPOTESI]` su `rowHash`.

**Correzione suggerita:** in §6.3 tenere solo la prima frase e sostituire la
seconda con un rimando a `02-05`. In §9.2 ripristinare la frase originaria
sull'impronta e spostare `merchant` dove va, cioè fra i campi del movimento di
carta già elencati in §11.3. Non ho corretto io perché entrambe richiedono di
riscrivere un periodo, non una parola.

### 1.4 Un documento che dichiara di non aver fatto ciò che descrive `[GRAVE]`

`02-05-regole-e-sinonimi.md:6-11` apre così:

> «Area **non prioritaria** in questa passata: **non è stata aperta in
> interfaccia**. Quanto segue viene dalla guida in-app estratta dal bundle […] e
> dai nomi degli endpoint.»

Ma alla riga 60 si legge «**Aperta la pagina**, i tipi sono esattamente dieci»,
il capitolo 1b racconta un esperimento completo di creazione di una regola con
il corpo della richiesta e la risposta 400, e cita due screenshot
(`11-costruttore-regole.png`, `16-errore-con-apertura-ticket.png`). Il capitolo
4 «Verifiche rimaste aperte» chiede poi di «enumerare i dieci tipi di regola e i
tredici operatori aprendo `/settings/rules`» e di «capire se le regole agiscono
anche in fase di riconciliazione» — entrambe risolte nello stesso file, la
seconda alla riga 76-80, che dice esplicitamente «Questo scioglie la domanda
lasciata aperta in fondo a questo documento» senza però toglierla.

**Correzione suggerita:** riscrivere il preambolo (l'area **è** stata aperta) e
ridurre il capitolo 4 alla sola terza voce, l'anteprima prima dell'applicazione
massiva, che resta davvero aperta.

### 1.5 `05-analisi-ux.md` chiede in fondo ciò che ha misurato in mezzo `[MEDIO]`

`05:1273-1274`, capitolo «Cosa resta da osservare»:

> «Il comportamento della fascia dei quattro indicatori sotto i 768 px: negli
> screenshot disponibili **non c'è una vista mobile**.»

Contraddetto due volte nello stesso file: `05:87-89` («`[VERIFICATO]` Misurato a
390 px: la fascia **sparisce del tutto**. L'elemento `header-current-balance`
resta nel DOM ma ha larghezza zero») e tutto il capitolo 13d, che misura
`main.scrollWidth` contro `clientWidth` e cita
`15-mobile-390-fatture-a-schede.png`. Esiste inoltre
`14-mobile-390-dashboard.png`, mai citato.

`05:1275` aggiunge «Gli stati di caricamento e di errore, mai catturati», e
`05:387-388` lo ripete. Ma lo stato di errore **è** stato catturato: `02-05`
righe 146-155 ne trascrive il testo integrale e rimanda a
`16-errore-con-apertura-ticket.png`. Resta vero solo per lo stato di
caricamento.

**Correzione suggerita:** togliere la prima voce del capitolo 14, restringere la
seconda al solo caricamento, e portare la descrizione del dialogo d'errore da
`02-05` dentro il capitolo 5.3 di `05`, che è il posto in cui la sintesi la
cercherà.

### 1.6 Due `[IPOTESI]` di `02-02` chiuse — una delle due smentita — altrove `[MEDIO]`

- `02-02:236-239` lascia aperto: «`[IPOTESI]` Errore di scala nella conversione
  del tasso […] Da confrontare col tasso impostato in `/settings/bank-accounts`».
  Il confronto è stato fatto: `04-logiche-di-calcolo.md`, cap. 11b,
  `[VERIFICATO]`, con i tre tassi letti da `/api/bank-accounts` e la doppia
  moltiplicazione per cento ricostruita esattamente.
- `02-02:252-256` ipotizza che i 858,69 € siano «plausibilmente una nota di
  credito o una delle 15 fatture "saldate fuori sistema"» e chiede di
  «filtrare le fatture attive aperte a oggi e cercare l'importo». Il test è
  stato fatto e ha **escluso** proprio quelle spiegazioni:
  `04-logiche-di-calcolo.md:741-747` elenca che «nessuna fattura ha importo o
  residuo pari a 858,69 €; nessuna coppia né terna di fatture aperte somma a
  quella cifra […] le tre note di credito sono tutte in stato "pagata"».

Qui non è solo un'ipotesi rimasta appesa: è un'ipotesi **falsificata** che un
lettore di `02-02` prenderebbe per la spiegazione più probabile.

**Correzione suggerita:** in entrambi i punti sostituire l'`[IPOTESI]` con due
righe di rimando a `04-logiche-di-calcolo.md`, capp. 11b e 14.

### 1.7 Tre stati diversi della stessa domanda sull'IVA `[MEDIO]`

| Dove | Cosa dice |
|---|---|
| `04-logiche-di-calcolo.md:544` (riepilogo) | «Liquidazione IVA al 16 del mese successivo — `[OSSERVATO]`: due test più dichiarazione del produttore» |
| `03-modello-dati.md:929-931` | «la data del 16 resta `[IPOTESI]`, per quanto coerente con entrambi i test» |
| `03-modello-dati.md:1021-1026` (§10.3) | «**Cosa non so.** Se la data del 16 sia costante o dipenda da un campo di regime sull'azienda» |

La terza è la più problematica, perché §11.1 dello stesso file conferma
`vatPeriod` con valori `monthly` e `quarterly`, e `04` cap. 4 misura l'effetto
della commutazione su entrambi gli orizzonti. Va aggiunto che
`03-modello-dati.md:533-537` porta un `[VERIFICATO]` seguito da «Test
necessario: modificare il regime nelle impostazioni azienda e osservare se le
uscite IVA si spostano» — la stessa incoerenza in miniatura.

**Correzione suggerita:** allineare `03` su `04`, cioè `[OSSERVATO]` con le tre
fonti (le due misurazioni, la serie IVA isolata nel grafico, la dichiarazione
del produttore), e togliere le tre richieste di test.

### 1.8 Il capitolo 9 di `00` è stato superato dal capitolo 10 e non aggiornato `[MEDIO]`

`00-ricognizione-pubblica.md:314-318` elenca ancora fra le cose non lette
«`/termini`, `/privacy`, `/dpa`, `/nda`, `/onboarding`, `/prenota-onboarding`» e
chiude con «nell'applicazione esiste un endpoint `/api/auth/api-token` che
**suggerisce un'API a token**». Il capitolo 10, aggiunto alle 11:43, legge tutte
e sei quelle pagine e al §10.3 conclude l'opposto: «Le parole "API" e "token"
hanno **zero occorrenze** in tutti e quattro i documenti legali […] Non è un'API
di prodotto». La stessa conclusione era già in
`01-inventario-rotte.md:47-51`. Il §10 dichiara di chiudere «il secondo punto
aperto al capitolo 9», ma il capitolo 9 non è stato toccato.

Nello stesso capitolo nuovo, `00:747-748` afferma che «**restano non lette** le
pagine `/funzionalita` (panoramica) e `/funzionalita/riconciliazione-bancaria`».
Il testo di quest'ultima è però **già archiviato** dal 10 agosto in
`assets/cashking/export/pagine-pubbliche-testo.txt`, riga 595. La pagina che il
documento indica come «la sola delle quattro vetrine funzionali ancora da
leggere» — e su cui costruisce una domanda importante sull'onestà comunicativa
del fornitore — è a portata di `cat`.

### 1.9 `01-inventario-rotte.md` conserva quattro rimandi al futuro già superati `[MINORE]`

- riga 196: intestazione «### 4.6 Modulo Retail `[DA VERIFICARE — probabilmente
  il più rilevante per noi]`» — il modulo è documentato per intero in `02-04`.
- riga 331: «Motore di regole configurabile dall'utente […] Da verificare in
  Fase 2» — verificato in `02-05`.
- riga 406: «`[IPOTESI]` Sono campi predisposti ma non ancora collegati […] Da
  verificare contro la pagina pubblica dei prezzi» — verificato in `00`, capp. 2
  e 10.7, dove la discrepanza sulle call di onboarding è ricostruita su tre
  fonti.
- righe 411-415: «L'esplorazione finora ha toccato `/login`, `/dashboard`,
  `/settings/reminders` e `/settings/manage-plan`» — vero alla fine della Fase
  1, oggi `PIANO-RESIDUO` ne conta quattordici visitate. La frase è datata nel
  contesto, quindi è la meno grave delle quattro.

### 1.10 Il PSD2 è appena cambiato e non è ancora propagato `[MINORE, ma da fare]`

`01-inventario-rotte.md`, nuovo §4.11 (ore 11:37), stabilisce `[VERIFICATO]` che
la connessione bancaria «è configurata e funzionante lato piattaforma» con 337
istituti a catalogo, ma «**non esiste alcun modo per un cliente di usarla**»:
`/psd2-movements` risponde «Accesso riservato — solo per gli amministratori di
sistema». `00` cap. 7 è già stato corretto di conseguenza. Non lo sono ancora:

- `03-modello-dati.md:268-277` (§2.6), che descrive la connessione PSD2 come
  un'entità del cliente con uno stato e una scadenza del consenso;
- il diagramma ER di `03`, riga 728: `CONTO_BANCARIO ||--o{ CONNESSIONE_PSD2 :
  "alimentato da"`;
- `PIANO-RESIDUO.md:68-81`, che elenca ancora il PSD2 come area `[ALTA]` da
  esplorare con domande a cui il §4.11 ha già risposto.

Trattandosi di lavoro in corso non lo conto come errore, ma è la prima cosa da
propagare: cambia il giudizio complessivo sul prodotto.

### 1.11 Il corpus approva un abbinamento che altrove giudica sbagliato `[MINORE]`

`02-01:392-409` intitola un paragrafo «Un abbinamento discutibile» e argomenta
che «la direzione temporale è invertita: un pagamento di giugno non può saldare
una rata di agosto». Ma `02-01:328-331` (§7b) racconta di aver **approvato**
proprio una proposta di quella famiglia: «Addebito Telecom Italia […] 180,00 €
del **31/07/2026** ↔ Rata #3 di Telefonia e Internet», dove la rata #3 è datata
**10/08/2026** (riga 103). L'approvazione è registrata anche in `04b:312` fra
gli interventi che hanno alterato il fotogramma di riferimento.

Non è un errore — serviva un'approvazione per osservare cosa succede ai
contatori — ma il documento non dice di aver scelto deliberatamente un caso che
considera mal proposto, e un lettore attento lo nota. Basta una riga.

### 1.12 Tre conteggi diversi delle ipotesi aperte `[MINORE]`

| Dove | Cosa dice |
|---|---|
| `PIANO-RESIDUO.md:4-5` | «64 affermazioni verificate sperimentalmente, **45 ipotesi** aperte di cui 8 dichiarate non verificabili» |
| `03-modello-dati.md:1226` | «Otto ipotesi su **cinquantasei** sono di questo tipo» |
| conteggio dei tag sul corpus | **68** occorrenze di `[VERIFICATO]`, **48** di `[IPOTESI]` |

I tre numeri non sono conciliabili fra loro. Il terzo è a sua volta approssimato
per eccesso, perché include i tag nelle tabelle di riepilogo e quelli barrati in
`04b`. Suggerisco di dichiarare una sola volta il criterio di conteggio e di
riportare il numero in un punto solo, `PIANO-RESIDUO`, togliendolo da `03`.

---

## Controllo 2 — Tag sbagliati

### 2.1 `[VERIFICATO]` che copre una congettura

La convenzione è enunciata in `04-logiche-di-calcolo.md:7-8`: «`[VERIFICATO]`
indica una formula confermata da **un esperimento con input noti**, non
semplicemente letta a schermo». Su questo metro, quattro casi sforano:

| File e riga | Testo | Perché non regge |
|---|---|---|
| `03:182` | «`[VERIFICATO]` **smentita**: nei dati coincide con `fidoCassaTotal` su tutti i conti, **verosimilmente un doppione**» | La coincidenza dei valori è verificata; «doppione» è una deduzione sulla causa. Va spezzato in `[VERIFICATO]` + `[DEDOTTO]` |
| `03:540` | «`[VERIFICATO]` **Smentita, o quasi.** […] è **verosimilmente** un token interno di sessione» | Stessa struttura. La medesima conclusione in `01:47-51` è correttamente marcata `[DEDOTTO]` |
| `03:436` | «`[VERIFICATO]` Il catalogo esiste: 8 record con `type`, `days` e `calculationType` (cap. 11.1). **Contiene i termini italiani consueti (30 giorni data fattura, 60 giorni fine mese, 90 giorni, e simili)**» | §11.1 conferma solo i tre nomi di campo, non il contenuto. Curiosamente il contenuto **è** verificabile, ma da un'altra fonte: il CSV esportato alle 11:42 mostra «30 GG DF», «60 GG FM», «90 GG DF», «Immediato», «Bonifico Anticipato». Il tag è giusto, il rimando è alla fonte sbagliata |
| `03:872` | «`[VERIFICATO]` […] ma non l'ho osservato» | Già trattato al punto 1.3 |

### 2.2 Una deriva sistematica, non un errore puntuale

`01:43`, `04b:211` e `03:1108` usano `[VERIFICATO]` per **ricerche esaustive per
esclusione** — «cercata la schermata di gestione: non esiste», «0 occorrenze di
`forecastSnapshot` nel bundle», «l'entità non esiste nella tesoreria». È un uso
difendibile e le ricerche sono fatte bene, ma non è quello che la convenzione
dichiara. Meglio ampliare la definizione in `01-inventario-rotte.md:9-11`
(«confermato da un esperimento con input noti **o da una ricerca esaustiva
dichiarata**») che ritaggare venti righe.

### 2.3 Congetture presentate senza alcun tag

- `02-03:84-86`: «Lo scarto si spiega col fatto che i DSO per cliente sono già
  arrotondati all'unità e che l'aggregato è **con ogni probabilità** calcolato
  sulle singole fatture anziché sui valori di cliente già arrotondati.» È una
  congettura, sta dentro un capitolo intitolato `[VERIFICATO]` e non porta tag.
  Va marcata `[IPOTESI]`.
- `03:557`: «È l'entità che rende l'importazione mensile un'operazione da trenta
  secondi invece che da dieci minuti, ed è **spesso omessa dai prodotti
  concorrenti**.» Affermazione comparativa senza tag e senza prove (vedi anche
  il controllo 5).
- `05:1048-1049`: «I primi sette sono realizzabili in **poche ore** ciascuno,
  senza migrazioni di schema»; `05:322`: «È **mezza giornata di lavoro**». Sono
  stime di sforzo sul nostro lavoro, presentate come fatti. Non rientrano
  strettamente nella convenzione, che riguarda le affermazioni sul prodotto
  osservato, ma andrebbero qualificate come stime.
- `02-01:67`: «La guida dichiara di essere "aggiornata alla versione 0.24.78"».
  Presentata come citazione, non è verificabile (vedi controllo 3.4).

### 2.4 `[IPOTESI]` risolte altrove e lasciate aperte

Oltre ai casi del controllo 1 (`02-02:238`, `02-02:252`, `01:406`, `03` cap. 10):

- `02-03:131-133`: «`[IPOTESI]` "Performance 0/2" conta quanti clienti sono
  "Migliore" su quanti hanno un giudizio diverso da "In linea" — con 0 migliori
  e 2 peggiori tornerebbe, ma la formula non è dichiarata.» Il CSV archiviato
  alle 11:42 la dichiara: la riga dei totali riporta letteralmente «0 migliori /
  2 peggiori», e nelle 18 righe ci sono esattamente due «Peggiore» e zero
  «Migliore». L'ipotesi è confermata dal materiale già su disco.
- `04:361-363`: «**Test residuo per chiudere del tutto:** emettere due fatture,
  una da 100 € incassata a 10 giorni e una da 10.000 € incassata a 60». Il
  chiarimento è arrivato per altra via — il report `/prints/dso-dpo` in `02-03`,
  §«Ipotesi chiusa dal report DSO/DPO» — e lo stesso `04:549-550` elenca
  entrambe le varianti come `[VERIFICATO]`.
- `04:241`: «Test in corso: vedi la sonda B in `04b`». Il test è concluso:
  `04b`, §8, «Ipotesi sciolta in giornata: lo scaduto lo scrive il browser».

### 2.5 Dove i tag funzionano

Va detto, perché è la maggioranza dei casi. `03-modello-dati.md` apre (righe
7-14) dichiarando che «la maggior parte di ciò che segue è `[DEDOTTO]`» e che
solo due entità sono state lette da un'API: è la premessa più onesta di tutto il
corpus, e il documento la rispetta scheda per scheda, arrivando a scrivere «di
questa entità conosco solo il nome dell'endpoint» dove è vero. Il capitolo 11
(«congetture confermate» / «congetture smentite» / «campi trovati che non avevo
previsto») è un modello di come si chiude una passata di verifica. Il capitolo
12 elenca otto ipotesi dichiarate non risolvibili spiegando **perché** ciascuna
non lo è: è esattamente quello che il metodo chiede all'edge case «calcolo non
verificabile».

---

## Controllo 3 — Riferimenti rotti

### 3.1 Nessun asset citato è mancante

Ho estratto tutti i percorsi `assets/cashking/...` citati nel corpus — diciotto
distinti — e verificato l'esistenza di ciascuno. **Esistono tutti.** Non c'è
nessun rimando a un file inesistente.

### 3.2 Un asset esiste ma non contiene ciò che gli si attribuisce `[GRAVE]`

`01-inventario-rotte.md:429` descrive
`assets/cashking/api-traces/01-dashboard-avvio.txt` come «Traffico di rete al
**primo caricamento del cruscotto**». Il file contiene in realtà sei richieste
registrate durante la visita a `https://cashking.biz/blog/acid-test-cassa-crisi-liquidita`
e a `/commercialista-e-tesoreria`: tre beacon di Google Analytics e tre chiamate
API (`/api/auth/api-token`, `/api/auth/me`, `/api/company/suspension-status`).
Non c'è una sola chiamata `/api/dashboard/*`.

La conseguenza non è cosmetica. `04-logiche-di-calcolo.md:734-736` afferma:
«Osservando il traffico di rete al caricamento del cruscotto **non compare
alcuna chiamata a `/api/dashboard/receivables`**: la scheda è calcolata lato
client». È un passaggio decisivo nella diagnosi dello scarto di 858,69 €, e
l'unica traccia archiviata non lo documenta.

**Correzione suggerita:** o ricatturare la traccia del cruscotto — è una delle
due catture HAR che `PIANO-RESIDUO` §1.1 già prevede — o correggere la
descrizione in `01` e dichiarare in `04` cap. 14 che l'osservazione è stata
fatta a schermo e non è archiviata.

### 3.3 La fonte del capitolo più citabile della ricognizione non è archiviata `[GRAVE]`

`00-ricognizione-pubblica.md:4-5` dichiara: «Testo integrale delle pagine
raccolte in `assets/cashking/export/pagine-pubbliche-testo.txt`».

Quel file contiene **sei** pagine, e sono queste: `/confronto`, `/faq`,
`/accesso-commercialista`, `/funzionalita-tesoreria`, `/per-chi-e-cashking`,
`/funzionalita/riconciliazione-bancaria`. **La pagina `/prezzi` non c'è.** Ho
verificato per assenza: le stringhe «9,99», «7,99», «100 posti», «Offerta
Lancio», «Prezzo Speciale» e «Ti contatteremo» hanno zero occorrenze nel file.

Poggiano su `/prezzi`, e quindi oggi non sono verificabili da nessuno che non
riapra il sito:

- l'intera tabella dei prezzi e dei limiti (`00:36-54`);
- il contenuto dichiarato dei tre piani (`00:56-67`);
- **i prezzi pubblici degli add-on** (`00:73-77`): 9,99 € per l'F24 e 7,99 € per
  i Promemoria;
- l'offerta di lancio e i «Solo 100 posti disponibili» (`00:79-85`);
- di conseguenza metà del capitolo 2, cioè le due tabelle di discrepanza fra
  pagina e API (`00:97-110`), che il documento stesso definisce «il risultato
  più rilevante della ricognizione».

Il lato API è invece perfettamente tracciabile: ho riletto
`02-billing-piani-addon.json` e **ogni** numero attribuito all'API combacia —
59/597 e 49/497 per Micro, 89/897 e 69/697 per PMI, 129/1297 e 99/997 per PMI
Plus, 19,99/199,90 per l'F24, 2,99/29,99 per i Promemoria,
`includesConsultantAccess: false`, `onboardingCalls: 0`, `prioritySupport:
false` su tutti e tre i piani, `movementsUsed: 46`, `movementsAvg: 42`. La
discrepanza è dunque reale per metà documentata: manca il termine di paragone.

**Correzione suggerita:** salvare `/prezzi` con lo stesso metodo delle altre
(user agent di crawler), aggiungerla al file di export, e nel frattempo
correggere la riga 4-5, che promette più di quanto consegna. Costa cinque
minuti ed è la lacuna di tracciabilità più facile da chiudere.

Nota minore correlata: `00:213` attribuisce cinque risposte «Dalle FAQ della
**pagina prezzi**». Le FAQ archiviate sono quelle di `/faq`. Tre delle cinque vi
si ritrovano (carta di credito non richiesta, sconto annuale del 15%, disdetta
senza penali); due no — il testo «Ti contatteremo per capire se CashKing fa per
te» e la regola sul cambio piano — perché appartengono alla pagina non salvata.

### 3.4 Tre citazioni senza fonte archiviata `[MEDIO]`

- **I due articoli del produttore.** `04:137-151` cita per esteso «IVA e
  incassi: perché il 16 del mese fa male», con quattro righe fra virgolette e
  un esempio numerico; `04:604-622` ricostruisce la definizione dell'Acid Test
  «pubblicata dal produttore in un articolo dedicato», con gli ingressi, la
  simulazione, le due uscite e le tre fasce. Nessuno dei due è salvato. Non è un
  dettaglio: `04:153-157` li usa come **terza fonte indipendente** che promuove
  il modello IVA da congettura a spiegazione corroborata. L'esistenza
  dell'articolo sull'Acid Test è almeno attestata indirettamente, perché l'URL
  `/blog/acid-test-cassa-crisi-liquidita` compare nella traccia
  `01-dashboard-avvio.txt`.
- **La versione della guida.** `02-01:67` scrive: «La guida dichiara di essere
  "aggiornata alla versione **0.24.78**" mentre l'applicazione è alla 0.26.5».
  Nell'estratto della guida la chiave `wikiVersion` vale letteralmente `"Guida
  aggiornata alla versione"`, senza numero: la versione è interpolata a runtime.
  La stringa «0.24» ha **zero occorrenze** nel file. Il numero va o ripreso
  dallo schermo e dichiarato come tale, o tolto — l'argomento regge comunque,
  perché la parte verificabile lo sostiene da sola: ho controllato l'estratto e
  la guida elenca davvero cinque regole, «R1, R2, R3, R5, R6», saltando la R4,
  esattamente come `02-01` afferma.
- **Il nome dei file esportati.** `02-06:265` cita
  `dso_dpo_clients_2026-08-11.csv` con i trattini bassi; i file archiviati si
  chiamano `dso-dpo-clients-2026-08-11.csv` e `.xlsx`, con i trattini alti. Se
  il nome originale del download è quello con i trattini bassi, va detto che
  l'archiviazione lo ha rinominato, altrimenti chi cerca il file non lo trova.

### 3.5 Due rimandi interni a capitoli sbagliati, e due sospetti

Corretti (vedi in fondo): `02-04:45` rimandava al «capitolo 7» per la sonda sui
codici HTTP, che sta al capitolo 10; `03:506-507` rimandava al «capitolo 6.1» per
capire «perché la struttura conta», ma 6.1 è «Azienda e utente» e la spiegazione
sta al 9.1.

Restano due rimandi che non ho toccato perché il bersaglio è ambiguo: `03:114` e
`03:158` rimandano entrambi al «capitolo 5.1» per i sette canali di
riconciliazione, ma 5.1 descrive il lotto e la proposta; i sette canali sono
trattati in 5.2 e, in profondità, in 9.1. Vanno riportati a uno dei due.

Tutti gli altri rimandi incrociati che ho verificato puntano a capitoli
esistenti e pertinenti: `04b`→`04` capp. 6 e 7; `04`→`04b`; `04`→`02-02` cap. 5;
`02-03`→`02-02` cap. 5.4; `02-06`→`00` cap. 7; `05`→`04` cap. 11b; `03`→`01`
cap. 1; `00`→`01` cap. 4.11; `PIANO-RESIDUO`→`04b` capp. 7 e 8; e i nove rimandi
interni di `05` (1.2, 7, 8.3, 9.2, 9.4, 12.3, 13d).

### 3.6 Sei screenshot non citati da nessuna parte `[MINORE]`

`04-dashboard-completa.png` e `09-riconciliazione-proposte-punteggio.png` sono
citati solo per numero dentro `05` e mai per percorso; `10-stato-vuoto-regole.png`,
`12-report-incongruenze-fatture.png`, `14-mobile-390-dashboard.png` e
`20-acid-test-in-stato-di-rischio.png` non sono citati **affatto**, né per
percorso né per numero.

L'ultimo è il caso che conta: `20-acid-test-in-stato-di-rischio.png` documenta
l'esperimento più spettacolare di tutto il corpus — l'Acid Test che passa da
«12+ mesi / Stabile» a «2 mesi / Rischio → Ottobre 2026» sotto una fattura da
732.000 € — e il capitolo che lo racconta (`04`, cap. 12) non lo nomina. Stesso
discorso per `12-...` rispetto a `02-06` §1.1 e per `10-...` rispetto a `05`
§13b, che descrive lo stato vuoto delle regole senza rimandare all'immagine che
lo mostra.

---

## Controllo 4 — Aritmetica

Ho ricontrollato **venti** verifiche numeriche, prese da cinque file diversi.
Diciannove tornano; le eccezioni sono al punto 4.2.

### 4.1 Verifiche che tornano

| # | Dove | Verifica | Esito |
|---|---|---|---|
| 1 | `04` cap. 2 | 179.193,07 + 70.000 = 249.193,07, e le altre due proiezioni | ✔ |
| 2 | `04` cap. 3 | 179.193,07 + 82.095,74 − 91.173,66 = 170.115,15; scarti +1.830 / +110 / +1.720 | ✔ |
| 3 | `04` cap. 4 | 179.193,07 + 311.091,66 − 168.471,34 = 321.813,39; +330 = 110 + 220 | ✔ |
| 4 | `04` cap. 4 (trimestrale) | 179.193,07 + 82.095,74 − 91.966,05 = 169.322,76; scarti 792,39 e 6.531,26 | ✔ |
| 5 | `04` cap. 5 | −3.145,72 + 610 = −2.535,72 | ✔ |
| 6 | `04` cap. 6 | 201.901,66 / 58.039,47 → +247,9% («+248%»); 87.816,07 / 16.556,62 → +430,4%; 83.975,37 vs 58.039,47 → +44,7%; 18.014,81 vs 16.556,62 → +8,8% | ✔ |
| 7 | `04` cap. 9 | 217.162,96 − 121.004,16 = 96.158,80 | ✔ |
| 8 | `04` cap. 11b | 3,40 / 3 = 1,13333 e ×100 = 113,333; ponderata 174.944,31 / 179.193,07 = 0,976% («0,98%»); 50.000 / 179.193 = 27,9% («poco più di un quarto») | ✔ |
| 9 | `04` cap. 12 | 179.193,07 + 311.950,35 − 871.210,19 = −380.066,77; 871.210,19 − 168.471,34 = 702.738,85; 732.000 − 702.738,85 = 29.261,15; 600.000 × 22% = 132.000 | ✔ |
| 10 | `04` cap. 13 | 179.193,07 − 172.546,33 = 6.646,74; 249.193,07 − 172.546,33 = 76.646,74 | ✔ |
| 11 | `04` cap. 14 | 202.760,35 − 201.901,66 = 858,69 | ✔ |
| 12 | `04b` cap. 3 | tutte e sei le verifiche, compresa 119.693,07 + 50.000 + 9.500 = 179.193,07 | ✔ |
| 13 | `02-01` §7 | 1 scheda singola + 3 schede da 3 alternative = 10 proposte | ✔ |
| 14 | `02-02` §5.4 | 52.604,13 − 54.281,16 = −1.677,03; scarto 858,69 identico sulle due righe | ✔ |
| 15 | `02-03` §4, «Da incassare» | le sette righe mensili sommano **esattamente** a 202.760,35 €, e i due gruppi scaduti a 52.604,13 € | ✔ |
| 16 | `02-03` §4, «Da pagare» | le sette righe sommano a 87.816,07 €, e i quattro gruppi scaduti a 54.281,16 € | ✔ |
| 17 | `02-03` §2, DSO «puro» | 4+31+31+1+32+63+32+60+32 = 286; 286 / 9 = 31,8 → 32. **Confermato indipendentemente** dal CSV archiviato: contiene esattamente quei nove valori | ✔ |
| 18 | `02-03` §2, DSO «pesato» | ponderando i nove valori per i fatturati reali del CSV si ottiene 28,03, coerente con il «circa 28» del documento; il totale dei 18 fatturati dà 313.190,38 € come dichiarato | ✔ |
| 19 | `02-06` §1.1 | 57.545,37 + 122,00 = 57.667,37, e il ritorno a 57.545,37 dopo la correzione | ✔ |
| 20 | `02-06` §3.2 | ordini 45.000+72.000+18.000+28.000+35.000 = 198.000; righe 162.000+18.000+18.000 = 198.000 su 11+2+1 = 14 righe; 198.000 × 1,22 = 241.560 | ✔ |

Le verifiche 15, 16, 17 e 18 meritano una nota: sono quelle che nessuno si
aspetterebbe tornino, perché richiedono di sommare quattordici righe trascritte
a mano da uno screenshot e di rifare una media ponderata. Tornano al centesimo.

### 4.2 Verifiche che non tornano

**a) Lo scarto residuo sulla percentuale dei Crediti — 0,4 contro 1,1 punti.**
`04:288-290` scrive: «Sui Crediti resta uno scarto di 1,7 punti percentuali, che
si assottiglia a **0,4 punti** scorporando la fattura di prova datata 11 agosto:
`(82.755,37 − 57.429,47) / 57.429,47 = 44,1%`». Il calcolo mostrato è corretto —
25.325,90 / 57.429,47 = 44,10% — ma 44,1 meno il 43% mostrato dalla scheda fa
**1,1 punti**, non 0,4. Corretto in tre punti (vedi in fondo). Se l'autore aveva
in mente un altro termine di paragone, va esplicitato, perché dal testo non si
ricava.

**b) La previsione sullo Scaduto in `04b:193`** — trattata al punto 1.1: il
valore atteso −3.755,72 € ha il segno dell'effetto invertito rispetto al
−2.535,72 € misurato.

**c) Gli incassi previsti a 90 giorni valgono due cose diverse, e la differenza
è proprio 858,69 €.** `[NUOVO — non segnalato in nessun documento]`
`04` cap. 4 misura, dopo l'inserimento delle sonde, «Incassi previsti
311.091,66». `04` cap. 12, nello stesso giorno e con le stesse sonde in campo,
verifica l'Acid Test così: «179.193,07 + **311.950,35** − 871.210,19 =
−380.066,77 ✔». La verifica torna, ma l'addendo non è quello del capitolo 4:

```
311.950,35 − 311.091,66 = 858,69
```

È **esattamente** lo scarto di cui parla il capitolo 14, dove il cruscotto
dissente dal server sui crediti proprio di 858,69 €. Che la stessa cifra ricompaia
come differenza fra due letture degli incassi previsti a 90 giorni non è
plausibilmente una coincidenza: è la traccia più promettente rimasta per
spiegare uno scarto che `04:753-756` dichiara irrisolvibile senza decompilare il
bundle. Il capitolo 14 esclude che i 858,69 € corrispondano a una fattura, a una
coppia, a una terna, alle ritenute o alle note di credito — ma non ha provato a
cercarli **fra le due basi di calcolo del previsionale**.

Non ho modo di chiudere la questione senza riaprire il prodotto, quindi non
propongo una spiegazione. Segnalo però che è il singolo filo più interessante
lasciato scoperto dal corpus, e che costa poco tirarlo: basta rileggere nello
stesso istante la scheda del cruscotto e l'addendo «incassi previsti» delle due
schede di proiezione.

**d) Conteggi che non corrispondono agli elenchi che li accompagnano.**

| Dove | Dice | In realtà |
|---|---|---|
| `02-05:185-188` (ripetuto a `02-05:129`) | «**Undici azioni:**» | L'elenco che segue ne contiene **dieci**: Imposta Categoria, Imposta Cliente, Imposta Fornitore, Crea Riconciliazione Banca, Crea Riconciliazione Carta, Collega Estratto Conto Carta, Compensa con Fattura Fornitore, Imposta Termini Pagamento, Segna come Duplicato, Invia Avviso. Non ho corretto perché non so se manchi una voce o sia sbagliato il numero |
| `05:1025` | «**Sette degli undici difetti** elencati» | §12.1 ne elenca 8 e §12.2 ne elenca 9: **17** in tutto. Anche il «sette» è dubbio: la frase che lo esemplifica ne enumera sei |
| `02-04` §2 (e §1, riga 38) | «Le **sette** schermate» | La tabella immediatamente sotto ha **otto** righe. La lettura più probabile è «otto voci di menu, di cui sette operative», visto che §9 documenta che il Registratore di Cassa non è consegnato — ma allora va scritto |
| `PIANO-RESIDUO:65` | «**Quarantanove** rotte applicative non sono mai state visitate, contro **quattordici** visitate» | 49 + 14 = 63, mentre `01:100` dichiara «~93 rotte applicative». Trenta rotte non sono in nessuna delle due colonne |

Nelle stesse tabelle, invece, i conteggi che ho verificato tornano: gli undici
campi condizionabili sono undici, i tredici operatori sono tredici, le venti
categorie del piano dei conti dimostrativo sono venti, gli otto gruppi
richiudibili della barra laterale sono otto e i sette chiusi all'ingresso sono
sette, le 81 fatture sono 42 + 37 + 2.

---

## Controllo 5 — Isolamento

### 5.1 Nessun altro concorrente è mai nominato `[RISPETTATO]`

Ho cercato nel corpus i nomi dei concorrenti plausibili — Sibill, Agicap,
Fatture in Cloud, TeamSystem, Zucchetti, Danea — e non compare nessuno. Le sole
occorrenze della parola «concorrente» riguardano il prodotto stesso: `00`
osserva che la pagina `/confronto` «non nomina mai un concorrente» e che «il
concorrente dichiarato è il foglio di calcolo». Su questo il metodo è rispettato
senza eccezioni.

### 5.2 Tre sconfinamenti verso il confronto di merito con il nostro gestionale

Il metodo consente esplicitamente di annotare «come si tradurrebbe concretamente
nel nostro stack». Distingue però la traduzione dal giudizio comparativo, che
rinvia alla sessione di sintesi. Tre passaggi scavalcano la linea:

- `05:777-780`: «**Il confronto con noi è impietoso.** `[OSSERVATO]` Ho contato
  i file del nostro gestionale che usano `data-testid`: **zero su 317 file
  `.tsx`**.» Il conteggio è utile e va tenuto; è la cornice — «il confronto con
  noi è impietoso» — a essere un verdetto comparativo. Basta riformulare come
  constatazione: «Nel nostro gestionale `data-testid` non è usato: zero
  occorrenze su 317 file `.tsx`.»
- `03:557`: «[il modello di importazione] è **spesso omesso dai prodotti
  concorrenti**.» Giudizio comparativo su concorrenti non nominati e non
  osservati in questa sessione, per giunta senza tag. Va tolto.
- `05:806-807` e `05:1077`: la palette di comandi «sarebbe una cosa che loro non
  hanno». È un confronto fra noi e loro su una funzione che noi non abbiamo
  ancora costruito. Formulazione più corretta: «CashKing non offre una palette
  di comandi né una ricerca globale».

### 5.3 Il capitolo 13 di `05` è un backlog, e il metodo lo vieta

Il metodo chiude i deliverable con: «**Non produrre** matrici di confronto,
backlog o ticket in questa sessione: sono output della sintesi comparata».

`05` §13 è una tabella di trenta accorgimenti «**ordinati per rapporto fra
valore e costo**», introdotta da «I primi sette sono realizzabili in poche ore
ciascuno, senza migrazioni di schema», con stime puntuali («è mezza giornata di
lavoro», `05:322`) e una lista finale «Da non copiare» numerata da 1 a 6. Il
contenuto è quello che il metodo chiede — ogni voce ha cosa fa, perché funziona
e come si realizza sul nostro stack — ma la **forma** è quella di un backlog
prioritizzato.

Non propongo di smontarlo: sarebbe distruggere il lavoro migliore del corpus.
Propongo di togliere l'ordinamento per costo e le stime di sforzo, lasciando le
trenta voci come catalogo, e di spostare la prioritizzazione nella sessione di
sintesi, che è l'unica che potrà confrontarla con quanto emerso dagli altri
prodotti. Le sezioni «Cosa ne ricaviamo» dei sei file di area, che non ordinano
e non stimano, sono già nella forma giusta.

---

## Controllo 6 — Debolezze e pregi

### 6.1 L'equilibrio regge, file per file

Ogni documento di area chiude con una tabella «Cosa ne ricaviamo» di sette-undici
voci positive e una sezione difetti più corta, di due-cinque voci:

| File | Accorgimenti positivi | Difetti |
|---|---|---|
| `02-01` riconciliazione | 11 | 5 (contatori incoerenti, soglie divergenti, taratura conservativa, abbinamento discutibile, date con millesimi) |
| `02-02` liquidità | 8 | 4 |
| `02-03` scadenzario | 7 | 3 |
| `02-04` retail | 7 | 2 |
| `02-05` regole | 7 | 1, ma devastante (nessuna regola è salvabile) |
| `02-06` stampe e import | 12 | 2 |

Il rapporto è circa due a uno a favore dei pregi. Il metodo, nel formato del
report finale, chiede dieci elementi positivi contro tre debolezze: il corpus è
quindi **più severo** del metodo, non meno, ma non al punto di sbilanciarsi.

### 6.2 Dove pende, e perché è comprensibile

`04-logiche-di-calcolo.md` è l'eccezione: otto dei suoi quattordici capitoli
riguardano difetti (le percentuali del cap. 6, il tasso al 113% del cap. 11b, il
saldo che include il futuro del cap. 13, lo scarto di 858,69 € del cap. 14, più
l'etichetta «Scaduto», il suggerimento di sinonimo con il nome vuoto, il «Failed
to delete invoice» su una cancellazione riuscita, e il registro attività che non
registra). È la conseguenza naturale del misurare le formule: se le si misura,
si trovano gli scarti.

Ma è anche il documento con il maggior numero di affermazioni verificate, ed è
un peccato che non abbia un capitolo simmetrico. Il materiale per scriverlo c'è
già, sparso: il trattamento dell'IVA come flusso con una data propria (capp. 3-4)
è una scelta di modellazione che un previsionale su tre sbaglia; il modello a
sette canali di saldo con allocazione parziale molti-a-molti (cap. 10) è
verificato e sostanzialmente corretto; l'Acid Test che nomina il mese critico e
offre un pulsante per andarci (cap. 12) è, per ammissione dello stesso
documento, «la parte più riuscita».

### 6.3 Cosa manca davvero: il contrappeso alla lista «Da non copiare»

Ogni file di area chiude con un «Da non copiare» in grassetto. Nessuno ha il
suo speculare — un «cosa hanno risolto meglio di come lo avremmo pensato noi».
La differenza non è di sostanza ma di leggibilità: chi aprirà questi documenti
fra due settimane per fare la sintesi troverà i difetti raccolti in liste
nominate e i pregi distribuiti in tabelle di traduzione tecnica, e ricaverà
un'impressione più negativa di quella che i documenti effettivamente
sostengono.

Concretamente sarebbero da promuovere a elenco nominato almeno queste: «Saldate
fuori sistema» come controllo di integrità promosso a elemento di interfaccia;
la deduzione dei termini di pagamento dalle date del documento; il confronto DSO
effettivo contro termini pattuiti, che ribalta il giudizio su un cliente che
paga in quattro giorni; l'accredito POS atteso calcolato da incasso e contratto,
con i sei motivi di eccezione codificati; l'export xlsx con le celle numeriche
vere; e il fatto che le regole di abbinamento siano dichiarate **prima**
dell'esecuzione.

### 6.4 Un pregio che il corpus si riconosce troppo poco

`02-06` §3.2 racconta di un errore proprio: «Il mio conto precedente era
sbagliato perché avevo trattato due schede come se contassero la stessa cosa».
`05` §13d fa lo stesso con la misura sul `<table>` mancante: «Precisazione a una
misura iniziale imprecisa […] la presenza o assenza del tag `<table>` non è la
prova di nulla». `00` cap. 7 arriva a scrivere «**Era sbagliato**» sulla propria
conclusione precedente sul PSD2.

Sono tre autocorrezioni esplicite, tenute nel testo invece che cancellate. È
esattamente il comportamento che rende un corpus di analisi affidabile, e vale
la pena dirlo qui perché è la ragione per cui i difetti elencati sopra sono
correggibili: chi ha scritto questi documenti li ha già dimostrati correggibili.

---

## Correzioni applicate

Otto modifiche, tutte circoscritte a una riga o a una parola. Nessun paragrafo
di analisi riscritto, nessuna conclusione toccata.

| # | File | Riga | Prima | Dopo | Perché |
|---|---|---|---|---|---|
| 1 | `02-aree-funzionali/02-04-modulo-retail.md` | 45 | «vedi capitolo 7» | «vedi capitolo 10» | Il capitolo 7 è «Versamenti Contanti»; la sonda sui codici HTTP sta al capitolo 10 |
| 2 | `03-modello-dati.md` | 506 | «Il capitolo 6.1 spiega perché la struttura conta» | «Il capitolo 9.1 spiega…» | 6.1 è «Azienda e utente», estraneo all'argomento; 9.1 è «Sette canali di saldo invece di un flag pagato» |
| 3 | `02-aree-funzionali/02-02-liquidita-e-previsionale.md` | 189 | «### 5.1 **Quattro** valori diversi per lo stesso saldo» | «### 5.1 **Tre** valori diversi…» | La tabella sotto ne elenca tre, e `05:942-944` dice «tre» |
| 4 | `05-analisi-ux.md` | 4-6 | «i **quattro** documenti di area funzionale […] e i **nove** screenshot» | «i **sei** documenti di area funzionale […] e **gli** screenshot» | I file di area sono sei e gli screenshot venti; ho tolto il numero invece di aggiornarlo, perché continua a crescere |
| 5 | `04-logiche-di-calcolo.md` | 289 | «si assottiglia a **0,4 punti**» | «si assottiglia a **1,1 punti**» | 44,1% calcolato meno il 43% mostrato fa 1,1 punti, con i numeri stampati nella riga stessa |
| 6 | `04-logiche-di-calcolo.md` | 305 | «Lo scarto residuo di **0,4 punti**» | «Lo scarto residuo di **1,1 punti**» | Coerenza con la correzione 5 |
| 7 | `03-modello-dati.md` | 1219 | «Lo scarto residuo di **0,4 punti** sulla percentuale dei Crediti» | «…di **1,1 punti**…» | Coerenza con le correzioni 5 e 6 |
| 8 | `03-modello-dati.md` | 540 | «**e'** verosimilmente un token interno» | «**è** verosimilmente…» | Refuso di accento |
| 9 | `05-analisi-ux.md` | 838 | «Tasso medio **ponderato** sui conti attivi e su quelli passivi» | «Tasso medio sui conti attivi e su quelli passivi; nei dati osservati è una media aritmetica semplice, non ponderata per il saldo (vedi `04-logiche-di-calcolo.md`, cap. 11b)» | Contraddiceva un `[VERIFICATO]` dello stesso file (`05:956-957`) e di `04` cap. 11b |

Le correzioni 5, 6 e 7 sono le uniche che toccano un numero usato in un
ragionamento: vanno riviste dall'autore, che potrebbe aver avuto in mente un
termine di paragone diverso da quello stampato.

**Non corretto di proposito**, perché richiede di riscrivere un periodo o di
scegliere fra due letture: i due `[VERIFICATO]` autocontraddittori di `03`
(§6.3 e §9.2), le «undici azioni» di `02-05`, le «sette schermate» di `02-04`,
i «sette degli undici difetti» di `05`, il preambolo di `02-05`, la previsione
sullo Scaduto in `04b:193`, e i due rimandi al «capitolo 5.1» in `03`.

---

## Risposta alle sei domande dei «Criteri di qualità»

### 1. Ogni affermazione è tracciabile a uno screenshot, una traccia API o una fonte pubblica?

**No, con tre eccezioni identificate e nessun'altra emersa dal campione.**

Le eccezioni sono: la pagina `/prezzi`, che sostiene tutto il capitolo 1 e metà
del capitolo 2 di `00` e non è fra le sei pagine archiviate (controllo 3.3); i
due articoli del produttore citati per esteso in `04` capp. 4 e 12, che valgono
come terza fonte indipendente sul modello IVA e non sono salvati (3.4); e la
versione «0.24.78» della guida, che nell'estratto non compare (3.4). Va aggiunta
la traccia API `01-dashboard-avvio.txt`, che esiste ma non contiene il traffico
del cruscotto che le si attribuisce (3.2).

Tutto il resto di quanto ho campionato è tracciabile, e in due casi la
tracciabilità è migliore di quanto il documento dichiari: la corrispondenza dei
prezzi API è verificabile riga per riga sul JSON archiviato, e i nove valori di
DSO usati in `02-03` si ritrovano identici nel CSV esportato ore dopo. Nessun
percorso di asset citato è rotto: tutti e diciotto esistono.

### 2. `[OSSERVATO]`, `[DEDOTTO]` e `[IPOTESI]` sono sempre distinti?

**Quasi sempre, con una deriva sistematica e sei casi puntuali.**

La deriva riguarda `[VERIFICATO]`, che il corpus usa per due cose diverse — un
esperimento con input noti, come la convenzione dichiara, e una ricerca
esaustiva per esclusione, che la convenzione non prevede. Si risolve ampliando
la definizione, non ritaggando.

I casi puntuali sono quattro `[VERIFICATO]` che coprono una congettura
(`03:182`, `03:436`, `03:540`, `03:872`), due dei quali si autocontraddicono
nella stessa frase (`03:563` e `03:872`), e alcune congetture senza tag
(`02-03:84-86`, `03:557`, le stime di sforzo di `05`). Sul fronte opposto —
`[IPOTESI]` rimaste appese su cose risolte altrove — il problema è più esteso e
coincide in larga parte con il controllo 1: il capitolo 10 di `03`, il capitolo
4 di `02-05`, il capitolo 14 di `05`, `02-02` §5.3 e §5.4, `02-03` §3b,
`01:406`, `04:241` e `04:361`.

Il merito da riconoscere è che la distinzione è **presa sul serio**: `03`
dichiara in apertura che quasi tutto è dedotto, e mantiene la promessa fino a
scrivere «di questa entità conosco solo il nome dell'endpoint».

### 3. È stato rispettato l'isolamento — nessun confronto con altri concorrenti o con il nostro gestionale?

**Sì per gli altri concorrenti, senza una sola eccezione. No del tutto per il
nostro gestionale.**

Nessun prodotto terzo è mai nominato. Verso il nostro gestionale ci sono tre
sconfinamenti: «Il confronto con noi è impietoso» in `05:777`, «spesso omessa
dai prodotti concorrenti» in `03:557` — che sconfina in entrambe le direzioni,
perché giudica anche i concorrenti non osservati — e il «loro non ce l'hanno»
sulla palette di comandi. Sono tre frasi, non tre capitoli, e si tolgono in
cinque minuti.

Separato ma dello stesso capo: `05` §13 ha la forma di un backlog prioritizzato
con stime di sforzo, che il metodo riserva alla sintesi comparata (controllo
5.3).

### 4. La documentazione è sufficiente perché la sessione di sintesi possa confrontare questo prodotto senza riaprirlo?

**Sì per sei aree su nove, e il corpus dichiara onestamente quali sono le tre
scoperte.**

Sono coperte in profondità, e a livello di formule verificate: liquidità e
previsionale, riconciliazione assistita, scadenzario, modello dati, regole e
sinonimi, UX. Il modulo retail è coperto per intero dalla guida in-app senza
essere stato usato, il che è una soluzione elegante a un vincolo etico.

Non sono coperte, e la sintesi va avvertita: **alert e notifiche**, l'intero
capitolo che il metodo chiede ai giorni 11-14, non è osservabile perché
l'addon dei promemoria non è attivo (`04b` §6 lo dichiara); **multi-azienda,
ruoli e permessi** — la novità di punta della 0.26.5 e il perno del canale
commercialisti — non è mai stata aperta; **le viste dei movimenti** e **dieci
delle undici stampe** non sono state visitate. `PIANO-RESIDUO` §2 elenca tutto
questo, il che è il modo giusto di consegnare una lacuna.

Una nota di tempistica: l'osservazione longitudinale è **predisposta ma non
svolta**. Le rilevazioni sono a calendario dal 12 al 29 agosto e il metodo
avverte che è «l'unica fase che non si può recuperare dopo». Il fotogramma di
riferimento è preso bene e gli interventi che lo hanno alterato sono a verbale
(`04b` §8) — a patto di correggere prima la previsione sbagliata del punto 1.1.

### 5. Sono state documentate anche le debolezze del prodotto, o solo i suoi pregi?

**Abbondantemente sì, e il rischio semmai è l'opposto.** Il rapporto è circa due
a uno a favore dei pregi nei file di area, contro il dieci a tre che il metodo
si aspetta nel report finale: il corpus è più severo di quanto il metodo
richieda, senza però sbilanciarsi.

Il problema è di presentazione, non di sostanza: i difetti sono raccolti in
sezioni nominate e in liste «Da non copiare» che chiudono ogni documento, mentre
i pregi sono distribuiti dentro tabelle di traduzione tecnica. Chi legge in
diagonale ricava un giudizio più duro di quello che i documenti sostengono.
Serve il contrappeso descritto al controllo 6.3.

### 6. Gli accorgimenti UX hanno tutti una traduzione concreta nel nostro stack?

**Sì, ed è la parte meglio riuscita del corpus.**

Ogni accorgimento porta il componente shadcn nominato, la rotta, e dove serve la
modifica di `prisma/schema.prisma`. Il livello di concretezza va oltre quanto il
metodo chiedeva: `05` §4.4 verifica che `toggle-group` **non** sia fra le 34
primitive presenti e indica il comando per aggiungerlo; §9.4 constata che
`BankAccount` non ha alcun campo per l'affidamento e nomina i due campi da
creare con il tipo Prisma esatto; §6.2 offre due strade alternative — con e
senza migrazione — spiegando quando serve la seconda.

I soli due punti senza traduzione sono quelli in cui non c'è nulla da tradurre,
e lo dicono: `05` §5.3 sugli stati di caricamento mai catturati, e §3.3
sull'ordinamento per colonna non osservato. È il comportamento corretto, e il
documento lo annuncia in apertura: «Dove non riesco a immaginare una traduzione
concreta lo dico esplicitamente invece di scrivere una genericità».
