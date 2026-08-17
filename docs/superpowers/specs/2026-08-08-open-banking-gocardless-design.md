# Open Banking GoCardless — verifica sul campo, poi integrazione

**Stato**: spec approvata l'8 agosto 2026. **Fase 0 (spike) eseguita il 12 agosto 2026** su dati veri di Banca della Marca: 653 movimenti, 2 conti aziendali, 90 giorni di storico. Referto in `docs/gocardless-referto-2026-08-12.md`, sonda in `scripts/gocardless-probe.ts`. Nessuna migrazione applicata, nessuna riga del gestionale toccata.

I dati hanno smentito tre ipotesi su cui questa spec era costruita. Le sezioni interessate sono state riscritte: cerca i blocchi **✅ Verificato sul campo** e **❌ Smentito sul campo**. Si riparte dalla Fase 1 — vedi *Come ripartire* in fondo.

## Requisiti non negoziabili

Tre cose che nessuna fase può rimandare, saltare o reinterpretare. Se una implementazione le contraddice, è l'implementazione a essere sbagliata.

1. **L'interruttore per conto nelle impostazioni.** L'amministratore deve poter accendere e spegnere, dal pannello impostazioni, quali conti importare — in qualsiasi momento, non solo al collegamento. Spento significa che la chiamata non parte; il default di un conto mai visto prima è spento. Motivo: il consenso PSD2 copre l'intero home banking, e in quello di WEISS c'è anche un conto personale. Dettagli in *La selezione dei conti*.
2. **`(bankAccountId, transactionId)` come chiave di deduplicazione.** L'identificativo della banca da solo non è unico fra conti diversi: usarlo così fa sparire movimenti veri. Dettagli nel difetto 2.
3. **Nessuna decisione automatica sovrascrive una decisione dell'operatore.** Vale per i codici della banca come per le regole. Dettagli in *Come i codici della banca convivono col sistema esistente*.

## Contesto

Oggi i movimenti bancari entrano nel gestionale **a mano**: un file CSV/XLSX/CBI scaricato dal portale della banca, caricato da `POST /api/bank-transactions/import` e parsato con un preset tarato su RelaxBanking (`src/lib/reconciliation/csv-parser.ts:25`). Da lì diventano `BankTransaction` e, solo se l'import parte dalla pagina Prima Nota, anche scritture di prima nota.

GoCardless Bank Account Data è un'API PSD2 gratuita. Il gestionale può scaricare i movimenti da solo, ogni giorno.

> ❌ **Smentito sul campo.** Questa riga diceva «fino a 24 mesi di storico e 90 giorni di accesso continuo». Sono i massimi teorici del protocollo, non ciò che concede la banca: Banca della Marca espone **90 giorni** di storico e **180 giorni** di accesso. Il primo numero è la metà buona della sorpresa (meno storico da riconciliare al primo sync), il secondo è tutto guadagnato (SCA due volte l'anno, non quattro).

Il repo è **già predisposto ma vuoto**: `BankAccount.openBankingReady` (`prisma/schema.prisma:208`) non è mai scritto, l'enum `ImportSource` prevede `PSD2_FABRICK`/`PSD2_TINK` che nessuno produce, e `src/components/settings/BancheEContiClient.tsx:325-347` mostra una card "Open Banking — Coming Soon". Zero righe di codice dietro a tutto questo.

**Esito atteso**: i movimenti dei conti Banca della Marca arrivano da soli, diventano scritture di prima nota già categorizzate dalle regole, e il saldo reale del conto è sempre visibile accanto a quello calcolato.

**Decisioni prese** (sessione dell'8 ago 2026):
- Più conti presso **lo stesso istituto** → un solo consenso copre tutti i conti. ✅ *confermato: un consenso, tre conti.*
- Il sync crea **subito la scrittura di prima nota**, non verificata, passata dalle regole di categorizzazione. È il modello Sibill già adottato per il resto del gestionale.
- Rinnovo del consenso: **solo banner in app**, niente email.
- **Si parte dalla verifica sul campo.** Il modello dati non si progetta su ipotesi: prima si guarda cosa espone davvero la banca.

**Decisioni aggiunte** (sessione del 12 ago 2026, dopo lo spike):
- **Quali conti importare si sceglie nel gestionale, con un interruttore per conto nelle impostazioni.** Il consenso PSD2 si dà per home banking, non per conto: all'SCA la banca ha esposto tutti e tre i conti presenti, di cui uno personale dell'amministratore. Un conto deselezionato **non va letto**, non va nascosto: la chiamata non parte proprio. Vedi *La selezione dei conti* più sotto.
- **Le regole di categorizzazione non preesistono: nascono dalla riconciliazione.** Oggi `categorization_rules` è vuota. Le regole verranno scritte man mano dall'operatore e proposte dall'AI, con convalida dell'operatore. Cambia il senso della Fase 4: non c'è un patrimonio di regole da riusare, c'è un innesco da fornire.

---

## Perché la verifica viene prima

Due incognite decidono metà del design e nessuna delle due si risolve leggendo la documentazione:

1. **Copertura.** Banca della Marca è una BCC. Su GoCardless le BCC italiane passano di norma dall'hub ICCREA, con un unico `institution_id` per tutto il gruppo — ma va verificato, insieme a `transaction_total_days` (quanto storico espone) e `max_access_valid_for_days`.
2. **Qualità delle causali.** La documentazione GoCardless avverte esplicitamente che *"le istituzioni finanziarie non sempre seguono le stesse strutture dati"*. Se `remittanceInformationUnstructured` arriva troncato o generico, e `creditorName`/`debtorName` sono vuoti, la categorizzazione automatica non funziona e va ripensata. Se `transactionId` è assente o instabile, la deduplicazione va costruita diversamente.

Un'ora di spike risponde a entrambe con dati veri.

### Le risposte, dal campo (12 agosto 2026)

**Copertura.** ❌ Non esiste un `institution_id` unico per l'hub ICCREA: ogni BCC ha il proprio. Banca della Marca è `BANCA_DELLA_MARCA_ICRAITRRU40` (BIC `ICRAITRRU40`). Su 403 istituzioni italiane, 150 rispondono ai termini del gruppo BCC e **due** contengono "marca" — l'altra è Centromarca Banca: qualunque ricerca automatica dell'istituto va disambiguata a mano. Storico 90 giorni, accesso 180.

**Qualità delle causali.** Metà avvertimento azzeccato, metà no.

- ✅ `remittanceInformationUnstructured` è **sempre** valorizzata, mediana 102 caratteri, massimo 230. Non arriva né troncata né generica: ciò che è troncato è l'etichetta iniziale del tipo di operazione, non il resto.
- ❌ `creditorName`, `debtorName`, `creditorAccount`, `debtorAccount` **non esistono nel payload**. Non sono vuoti: la banca manda nove campi in tutto e quelli non ci sono. Il nome della controparte è dentro la causale, dopo un `*` presente nel 54% dei movimenti.
- ❌ `transactionId` c'è sempre ma **non è una chiave globale**: formato `YYYYMMDD-N`, un contatore per giorno *e per conto*. Su 653 movimenti di due conti, **244 valori compaiono su entrambi**. Anche `internalTransactionId`, che è un hash del contenuto, collide 32 volte. La stabilità nel tempo resta da verificare con un secondo scarico a distanza.
- ➕ Fuori programma: **`proprietaryBankTransactionCode` è valorizzato sul 100% dei movimenti**, 28 codici distinti, tassonomia stabile decisa dalla banca. È il segnale di categorizzazione più forte del lotto, e non era nel piano.

---

## Fase 0 — Lo spike ✅ ESEGUITA il 12 agosto 2026

> Questa sezione resta com'era scritta, come traccia del piano. Ciò che ne è uscito sta nel referto `docs/gocardless-referto-2026-08-12.md` (versione pubblicabile, solo aggregati) e in `scripts/gocardless/snapshots/referto-2026-08-12.md` (versione completa, con i campioni in chiaro, fuori dal repository).
>
> Due scostamenti dal piano, entrambi voluti:
> - **`access_valid_for_days` chiesto a 180, non a 90.** L'istituto concede 180 ed è lo stesso principio che la spec applicava allo storico: si chiede il massimo.
> - **Il referto è doppio.** La spec dava per scontato che un referto «anonimizzato» potesse stare in `docs/`, ma questo repository è **pubblico**: il primo referto generato conteneva i saldi dei conti, le ultime quattro cifre degli IBAN e le iniziali di una persona su un movimento di stipendio. Mascherare del testo libero è una difesa per esclusione, e sbaglia appena la banca cambia formato. Il referto pubblicabile ora è costruito **per inclusione** — la funzione che lo scrive riceve solo conteggi e prosa, mai una stringa proveniente dalla banca — e quello completo resta fra i file non versionati.

### 0.1 Mettere in sicurezza le chiavi

Il file `~/Downloads/gestionale-weiss.json` contiene `secret_id` (36 char) e `secret_key` (128 char). Vanno spostate in `.env` (già in `.gitignore`) e il file originale cancellato:

```
GOCARDLESS_SECRET_ID=...
GOCARDLESS_SECRET_KEY=...
```

Aggiungere i **soli nomi** a `.env.example`, che è già fuori sync (mancano `ANTHROPIC_API_KEY`, `FIREBASE_*`, `DATABASE_CA_CERT`, `APP_URL`, `LOG_LEVEL`): l'occasione per riallinearlo.

> `~/Desktop/accounting/.venv` è l'ambiente Python degli strumenti di qualità (black, mypy, pytest): non serve qui. Lo spike è TypeScript e gira con `nvm use 22 && npx tsx`.

### 0.2 (facoltativo) L'MCP GoCardless

```
claude mcp add --transport http GoCardless https://mcp.gocardless.com
```

Poi l'autenticazione OAuth dal browser, con scelta dell'ambiente e dei permessi.

**Aspettative da tenere basse**: la documentazione dell'MCP descrive esclusivamente l'API **pagamenti** (`payments`, `mandates`, `customers`, `subscriptions`, `payouts`, `refunds` — Direct Debit su `api.gocardless.com`). Non nomina mai `requisition`, `institution` o le transazioni di open banking, e le chiavi `secret_id`/`secret_key` di Bank Account Data non sono le credenziali che l'MCP usa. Costa un comando: si prova, e se non copre Bank Account Data si rimuove. La sonda del punto 0.3 non ne dipende.

### 0.3 Lo script di sonda

Nuovo file `scripts/gocardless-probe.ts` (`tsx` standalone, stesso stile degli script esistenti in `scripts/`). **Non tocca il database.** Sequenza:

| # | Chiamata | Cosa risponde |
|---|---|---|
| 1 | `POST /api/v2/token/new/` | access token (24h) + refresh (30gg) |
| 2 | `GET /institutions/?country=IT` | l'elenco completo; filtra su `marca`, `iccrea`, `bcc`, `credito cooperativo` |
| 3 | `POST /agreements/enduser/` | `max_historical_days` al massimo consentito, `access_valid_for_days: 90`, scope `[balances, details, transactions]` |
| 4 | `POST /requisitions/` | il **link di consenso** da aprire nel browser |
| 5 | *(manuale)* | apri il link, SCA in banca, seleziona i conti |
| 6 | `GET /requisitions/{id}/` | `status: LN` + array degli `accounts` |
| 7 | `GET /accounts/{id}/details/` · `/balances/` · `/transactions/` | i dati veri, per ogni conto |

Lo script salva **ogni payload grezzo** in `scripts/gocardless/snapshots/`, da aggiungere a `.gitignore` accanto a `/scripts/piano-v4/snapshots/` e per lo stesso motivo: contengono IBAN e nomi di controparti reali, vanno conservati fuori dal versionamento ma vanno conservati. Il salvataggio è obbligatorio, non un comodo: il rate limit è di **4 chiamate al giorno per conto e per endpoint**, quindi ogni analisi successiva deve lavorare sui file, non richiamare l'API.

Lo script va scritto **ripartibile per step** (`npx tsx scripts/gocardless-probe.ts --step=institutions`), perché fra il passo 4 e il 6 c'è un'azione umana nel browser e i passi 1-3 non vanno rifatti.

Per il `redirect` della requisition: in fase di sonda basta un URL raggiungibile, l'id della requisition lo abbiamo già. Se GoCardless rifiuta `http://localhost`, si usa l'URL di produzione Railway — lo script deve segnalarlo chiaramente invece di fallire in silenzio.

### 0.4 Il referto

Un secondo comando (`--step=report`) legge i JSON salvati e produce `docs/gocardless-referto-<data>.md`, **anonimizzato** (IBAN e nomi mascherati), che risponde a sette domande:

1. Quale `institution_id` serve, e quanti giorni di storico espone?
2. Quanti conti sono stati trovati, e i loro IBAN corrispondono ai `BankAccount` già a sistema?
3. `transactionId` è sempre presente? È stabile fra due chiamate successive? (verificabile solo con una seconda chiamata a distanza — lo script lo confronta con il salvataggio precedente se esiste)
4. Quanto è ricca `remittanceInformationUnstructured`? Contiene numeri di fattura e nomi utili?
5. `creditorName`/`debtorName` sono valorizzati, e quanto spesso?
6. Che percentuale dei movimenti scaricati verrebbe intercettata dalle **regole di categorizzazione già esistenti** (`CategorizationRule.keywords`)? Si calcola a secco sui dati salvati, senza scrivere nulla.
7. `bookingDate` vs `valueDate`: quale corrisponde alla data che oggi usiamo in prima nota?

La domanda 6 è quella che vale di più: dice in anticipo se la promessa "categorizzazione automatica" regge.

### 0.5 Le fixture

I payload, **anonimizzati**, diventano `src/lib/gocardless/__tests__/fixtures/*.json` e sono la base dei test del mapper nella Fase 1. Questo è il vero lascito dello spike: senza dati veri il mapper si testerebbe contro le proprie assunzioni.

---

## Cosa emerge già dall'esplorazione (vincoli per le fasi successive)

Non serve implementarli ora, ma il design li deve incorporare.

### Tre difetti da correggere, non da aggirare

1. **La deduplicazione è rotta oggi.** `src/app/api/bank-transactions/import/route.ts:141` cerca i duplicati su `data+importo+descrizione`, ma il vincolo a DB è `@@unique([venueId, bankReference])` (`prisma/schema.prisma:1749`). Chiavi diverse, e la `create` a `:156` non ha try/catch: una violazione `P2002` fa fallire l'intero import con un 500 e il batch resta a metà. Con un sync automatico e ricorrente questo esplode al primo giorno.

2. **`BankTransaction` non ha `bankAccountId`** (`prisma/schema.prisma:1725-1754`): l'unico legame è `venueId`.

   ✅ **Verificato sul campo, ed è peggio di come era scritto qui.** Non è che «i movimenti diventano indistinguibili»: è che vengono **perduti**. `transactionId` vale `YYYYMMDD-N`, un contatore per giorno e per conto, quindi il sesto movimento del 10 agosto esiste su ogni conto con lo stesso identificativo. Sui due conti aziendali, 244 valori su 653 sono condivisi. Usando `transactionId` come `bankReference`, il vincolo `@@unique([venueId, bankReference])` scarterebbe il secondo movimento come duplicato — un movimento vero, silenziosamente. `bankAccountId` non è «il primo campo da aggiungere», è la **precondizione** perché la deduplicazione sia corretta, e la chiave è `(bankAccountId, transactionId)`.

3. ~~**Le regole di categorizzazione guardano solo la descrizione**, estendere il match a `creditorName`/`debtorName` è ciò che rende utile la categorizzazione automatica.~~

   ❌ **Smentito sul campo: quei campi non arrivano.** `src/app/api/prima-nota/recategorize/route.ts:82-86` fa davvero solo `entry.description.includes(keyword)` (e la route non ha ancora consumer nella UI), ma l'estensione proposta non è realizzabile: Banca della Marca non manda la controparte in nessun campo. Al suo posto ci sono due appigli, ed è su questi che va rifatta la Fase 4:

   - **`proprietaryBankTransactionCode`**, presente sul 100% dei movimenti, 28 codici distinti e semanticamente puliti: `16//37` commissioni su bonifico, `39//11` emolumenti, `19//83` F24, `15//10` rata mutuo, `78//50` versamento contante, `43//10` operazione POS, `34//00` e `79//00` giroconti. Una tabella `codice → conto`, compilata una volta, categorizza con **certezza** e non per somiglianza. È anche l'innesco che oggi manca: `categorization_rules` è vuota, e un operatore che parte da zero ha bisogno di una base, non di un motore di regole senza regole.
   - **Il testo dopo il `*`** nella causale (54% dei movimenti), da cui estrarre il nome del fornitore. Serve per bonifici e SDD, che sono la fetta grossa e quella dove il codice della banca dice solo «bonifico», non «a chi».

   La divisione del lavoro è netta: il codice della banca dice *che tipo di operazione è*, il testo dice *con chi*. Il primo è deterministico, il secondo è il terreno dell'AI e della convalida dell'operatore.

4. **La selezione dei conti non esiste, e serve.** Vedi la sezione dedicata qui sotto.

### Come i codici della banca convivono col sistema esistente

Il codice della banca **non è un classificatore alternativo** e da solo non basta: su 653 movimenti decide da solo nel 40% dei casi e nel restante 60% dice soltanto «è un bonifico» o «è un SDD», che non è un conto. Il punto non è scegliere fra i due sistemi, è capire dove si innestano.

**Il sistema che esiste già.** `JournalEntry` ha quattro campi che servono a questo: `description`, `counterpartName`, `appliedRuleId`, `categorizationSource` (vocabolario in uso: `manual`, `rule`, `import`, `split`). Sopra ci sono tre pezzi: le regole a keyword (`recategorize`), il motore di proposte (`/api/categorization-rules/proposals`, che raggruppa i movimenti non categorizzati per `counterpartName || description` e propone una regola quando un gruppo ha almeno 2 occorrenze), e il matcher delle scadenze (`schedule-matcher.ts:120`, che cerca già dentro `[description, counterpartName]`).

**Il conflitto vero, e non è quello che sembra.** `counterpartName` oggi **non lo scrive quasi nessuno**: lo popola solo `schedule-rules/engine.ts:371`, l'import CSV no. Con i movimenti GoCardless il motore di proposte ripiegherebbe quindi su `description`, che è la causale intera — e le causali non sono mai identiche fra loro, perché contengono date, numeri d'ordine e riferimenti. Ogni gruppo avrebbe una sola occorrenza, la soglia del 2 li scarterebbe tutti: **il motore di proposte produrrebbe zero proposte, per sempre.** Non è un conflitto fra i due sistemi, è il sistema esistente che gira a vuoto perché gli manca un dato.

**L'innesto è riempire due campi, non costruire un secondo motore.**

| segnale | dove va | cosa abilita |
|---|---|---|
| `proprietaryBankTransactionCode` | campo nuovo su `BankTransaction`/`JournalEntry` + `categorizationSource: 'bank-code'` | imputazione deterministica per commissioni, imposte, emolumenti, mutuo, contante, POS, giroconti |
| nome estratto dal testo dopo il `*` | **`counterpartName`, che esiste già** | fa partire il motore di proposte e migliora il matcher delle scadenze senza toccarli |

Misurato sui 653 movimenti veri:

| | movimenti | quota |
|---|---|---|
| basta il codice della banca | 226 | 35% |
| basta la controparte ricorrente (≥2 occorrenze, la soglia già in uso) | 273 | 42% |
| entrambi i segnali concordi | 35 | 5% |
| **nessun segnale — resta all'operatore e all'AI** | **119** | **18%** |

Estraendo le prime parole dopo il `*` si formano 87 gruppi distinti, 43 dei quali superano la soglia delle 2 occorrenze e coprono 312 movimenti: sono 43 proposte di regola al primo giro, contro le zero di oggi.

**La regola che impedisce il conflitto: una precedenza stretta, un solo scrittore.**

1. `manual` — decisione dell'operatore. **Non viene mai sovrascritta da niente.**
2. `rule` — regola convalidata dall'operatore. Vince su qualunque automatismo.
3. `bank-code` — imputazione dal codice della banca. Interviene **solo** se nessuna regola ha preso, e lascia il movimento non verificato.
4. niente — il movimento resta scoperto e alimenta il motore di proposte.

Il codice della banca quindi non compete con le regole: le precede in mancanza d'altro, e le alimenta. E siccome `categorizationSource` registra chi ha deciso, la precedenza è verificabile a posteriori su ogni singolo movimento, invece di essere una convenzione che vive solo nella testa di chi ha scritto il codice.

**Secondo innesto, meno ovvio.** Il codice va dato anche al motore di proposte come chiave di raggruppamento alternativa, quando `counterpartName` manca. Un gruppo «tutti i movimenti `16//37`» è una proposta di regola perfettamente sensata («commissioni su bonifico → conto spese bancarie»), e nasce con 138 occorrenze alle spalle invece che con 2.

**Cosa resta aperto** e va deciso in Fase 4, non ora: se l'estrazione del nome dal testo debba essere una funzione deterministica (tagli e normalizzazioni sul separatore `*`) o una chiamata all'AI. La deterministica è gratis, riproducibile e testabile sulle fixture; l'AI prende i casi storti ma costa e non è riproducibile in test. La risposta ragionevole è: prima la deterministica, e l'AI solo sul residuo che quella non risolve — cioè sul 18% qui sopra, non su tutto.

### La selezione dei conti

**Il consenso PSD2 si dà per home banking, non per conto.** All'SCA la banca ha proposto tutti i conti visibili con quelle credenziali: tre, di cui uno personale dell'amministratore. L'API li espone tutti e tre, e nessuna opzione lato GoCardless permette di restringere il consenso dopo.

Quindi la selezione è un problema del gestionale, e ha tre requisiti:

1. **Un interruttore per conto nelle impostazioni**, nel pannello connessioni che sostituisce la card "Coming Soon" (`src/components/settings/BancheEContiClient.tsx:325-347`). Acceso = si importa; spento = non si importa. Deve poter essere spento anche dopo, e riacceso.
2. **Spento significa "non leggere", non "non mostrare".** La chiamata a `/accounts/{id}/transactions/` per un conto deselezionato non deve partire. Su un conto personale la differenza fra non trattare un dato e trattarlo per poi nasconderlo non è di forma: è la differenza fra non averlo e averlo in un database aziendale.
3. **Il default è spento.** Un conto che compare per la prima volta dopo un rinnovo del consenso non entra da solo: entra quando qualcuno lo accende.

Effetto collaterale gradito: ogni conto spento è una chiamata al giorno in meno contro il limite della banca.

La sonda dello spike implementa già questa logica lato script (`--escludi`/`--includi`, con `--purga` per cancellare quanto già scaricato): il conto personale è stato escluso e i suoi dati rimossi dal disco. La versione in app è Fase 2.

### La sovrapposizione con lo storico CSV

Al primo sync GoCardless restituisce **90 giorni** di movimenti (non i 24 mesi ipotizzati), molti dei quali sono già a sistema come import CSV con un `bankReference` sintetico. Serve comunque una **data di taglio per conto**, scelta dall'admin al collegamento e proposta di default come "data dell'ultimo movimento importato +1" — ma il danno che previene è un trimestre di prima nota duplicata, non un anno, e il problema è quindi molto più piccolo di come era stato dimensionato.

Il rovescio: **da GoCardless lo storico anteriore ai 90 giorni non si recupererà mai.** Se serve, l'unica via resta l'import CSV dal portale della banca. Questo pesa sulla Fase 5 (dismissione del CSV): il CSV non è sostituibile per il recupero storico, solo per il flusso corrente.

### Il nodo dei due flussi di import

Oggi la stessa route si comporta in due modi: da Prima Nota (`CaricaMovimentiDialog.tsx:112`) ogni movimento diventa subito una scrittura `MATCHED` con confidence 1.0 e conto vuoto; da Riconciliazione resta `PENDING` in attesa del matcher. Hai scelto il primo modello per il sync — ma va reso coerente, altrimenti restano due comportamenti che nessuno sa spiegare.

### Rate limit: 4 chiamate al giorno per conto e per endpoint

Vincolo imposto dalla banca, non da GoCardless. Un sync giornaliero consuma 1 chiamata su `/transactions/` e 1 su `/balances/`. Il pulsante "Sincronizza ora" va contingentato (3 al giorno, margine 1) con un contatore persistito, non solo lato UI.

✅ **Verificato sul campo**, e la risposta lo dichiara da sé: gli header `http_x_ratelimit_account_success_limit=4`, `..._remaining` e `..._reset` (secondi) arrivano su ogni chiamata per conto. Il contatore persistito serve comunque — un header si legge solo dopo aver speso la chiamata — ma questi header sono la fonte di verità con cui riallinearlo, e vanno registrati a ogni sync. Gli endpoint non legati al conto (`/institutions/`, `/requisitions/`, `/token/`) hanno limiti molto più larghi: 300, 100 e 10 al minuto.

### Dove girano i cron

`vercel.json` dichiara 2 job, ma `docs/storage.md:26` dice che la produzione è su **Railway**, dove `vercel.json` è ignorato. Da chiarire prima di aggiungere il cron di sync. Sintomo esistente dello stesso equivoco: `/api/shifts/reminder` ha il guard `CRON_SECRET` ma non è né in `vercel.json` né in `PUBLIC_PREFIXES` del middleware — è irraggiungibile.

### Il PRD concorrente

`tasks/prd-integrazione-acube.md` progetta la stessa funzione con **A-Cube su infrastruttura Salt Edge**, in modo dettagliato (EPIC D, righe 181-233) e arrivando in autonomia alle stesse conclusioni su deduplica e rinnovo consenso. Va **superato esplicitamente** con una nota in testa, o riconciliato: due PRD vivi sullo stesso modulo è come si costruiscono due implementazioni parallele.

---

## Roadmap dopo lo spike (da dettagliare quando avremo il referto)

| Fase | Contenuto | Nota |
|---|---|---|
| 1 | Modello dati (`BankConnection`, `BankSyncRun`, campi su `BankAccount` e `BankTransaction`), client `src/lib/gocardless/`, mapper testato sulle fixture, correzione della deduplicazione | Tabelle create con **DDL esplicito, mai `db push`** — il DB Supabase è condiviso con la produzione. `BankTransaction.bankAccountId` è **bloccante**, non opzionale, e la chiave d'unicità diventa `(bankAccountId, transactionId)` |
| 2 | Wizard di collegamento + callback, pannello connessioni al posto della card "Coming Soon", **interruttore per conto (default: spento)**, banner scadenza consenso a 180 giorni | Abbinamento conti GoCardless ↔ `BankAccount` **via `ibanHash`**, mai con un `where` sull'IBAN cifrato |
| 3 | Cron di sync giornaliero **sui soli conti accesi**, contatore anti-rate-limit riallineato sugli header `x-ratelimit-account-success-*`, saldo reale nel summary di riconciliazione | Riusa `verificaSegretoCron()` di `src/app/api/promemoria-timbratura/cron/route.ts:24` |
| 4 | Estrazione della controparte dal testo dopo il `*` → **dentro `counterpartName`**, che il motore di proposte e il matcher delle scadenze già leggono; mappa `proprietaryBankTransactionCode → conto` come innesco deterministico; precedenza `manual > rule > bank-code` registrata in `categorizationSource` | Riscritta dopo lo spike. Vedi *Come i codici della banca convivono col sistema esistente*: i due segnali insieme coprono l'82% dei movimenti, il resto resta all'operatore e all'AI |
| 5 | Dismissione dell'import CSV per il **flusso corrente**, dopo un periodo di parallelo | Il CSV resta l'unica via per lo storico oltre i 90 giorni: non è dismissibile del tutto |

### Da riusare, non da riscrivere

- `encrypt`/`decrypt`/`lookupHash` — `src/lib/encryption.ts`; `counterpartIban` va aggiunto a `SENSITIVE_FIELDS` in `src/lib/prisma-encryption.ts:8`
- `createAuditLog` — `src/lib/audit.ts` (nota: da cron `headers()` non è disponibile, ip/ua restano null senza rompere nulla)
- `getVenueId()` — `src/lib/venue.ts:28`; ruolo `admin` per collegare/scollegare, come `bank-accounts/route.ts:67`
- `findScheduleCandidates` — `src/lib/reconciliation/schedule-matcher.ts:142`: le scritture create dal sync entrano da sole nel pool del matcher, non serve codice nuovo
- Il test `src/lib/line-categorization/__tests__/index.test.ts` come modello per mockare un servizio esterno

### Da creare, perché non esiste

- Un wrapper HTTP con retry/backoff e gestione del 429 (nel repo non c'è nulla del genere)
- Un mock di `fetch` nei test (saremmo i primi)
- Il valore `PSD2_GOCARDLESS` nell'enum `ImportSource`, replicato nei **tre punti fuori dallo schema**: `src/types/reconciliation.ts:3`, `src/lib/validations/reconciliation.ts:9-10`, `src/components/reconciliation/TransactionDetailsDialog.tsx:51-52`

### Non serve

Nessun SDK. `nordigen-node` è l'client legacy, fermo ad aprile 2025 e in CommonJS; non esiste un SDK ufficiale mantenuto per Bank Account Data. Un client scritto in casa su `fetch` è più piccolo, tipizzato e coerente col resto del progetto.

---

## Verifica della Fase 0 — esito

1. ✅ `--step=institutions` stampa `BANCA_DELLA_MARCA_ICRAITRRU40`, storico 90 giorni, accesso 180.
2. ✅ Link di consenso aperto, SCA a buon fine, `--step=accounts` restituisce `status: LN` e tre conti.
3. ✅ `--step=fetch` ha scaricato 653 movimenti reali sui due conti aziendali (il terzo, personale, è stato escluso e i suoi dati cancellati).
4. ✅ `--step=report` produce due referti: quello pubblicabile in `docs/`, quello completo fra i file non versionati. Sette domande su sette hanno risposta — la sesta con esito «zero regole a sistema», che è a sua volta un risultato.
5. ⏸️ **Fixture non generate, deliberatamente.** Lo script le produce con `--step=report --fixtures`, ma `src/lib/gocardless/__tests__/fixtures/` è tracciato e il repository è pubblico: metterci dentro causali di movimenti veri, ancorché mascherate, è la stessa trappola del referto. Da decidere in Fase 1 — vedi *Domande ancora aperte*.
6. ✅ `npx tsc --noEmit` esce 0, `npm run lint` 0 errori (i 62 warning sono preesistenti; `scripts/**` è fuori dal perimetro di eslint).

Nessuna migrazione, nessuna scrittura sul database, nessuna modifica alle route esistenti. L'unica lettura del database è stata una `SELECT` su `categorization_rules`, autorizzata a parte, per la domanda 6.

## Domande ancora aperte

- **Fixture in un repository pubblico.** Il mapper della Fase 1 va testato su dati veri, ma i dati veri non possono stare in `src/`. Tre strade: fixture scritte a mano che imitano la forma (nove campi, `YYYYMMDD-N`, causale col `*`) senza copiare nulla di reale; fixture generate ma sintetizzate (importi e date randomizzati, causali ricostruite dai prefissi comuni per codice); oppure fixture reali tenute fuori dal repository e caricate dai test solo se presenti, con i test che si saltano da soli altrove. La prima è la più onesta e la più povera, la terza rende i test non riproducibili in CI.
- **Stabilità degli id nel tempo.** Non verificabile con un solo scarico. Serve un secondo `--step=fetch` a qualche giorno di distanza: il referto confronta da sé i due salvataggi. Finché non è verificata, la deduplicazione su `transactionId` resta un'ipotesi — se gli id si rivelassero instabili servirebbe una chiave di contenuto `(bankAccountId, bookingDate, amount, hash della causale)`.
- **Costo**: il tier gratuito di GoCardless Bank Account Data e i suoi limiti (numero di conti collegati) non sono documentati pubblicamente in modo verificabile. Nulla è stato addebitato o bloccato durante lo spike, ma resta da controllare nel portale prima della Fase 1.
- **Cron su Railway o Vercel** (vedi sopra).
- **Sorte del PRD A-Cube** (vedi sopra).

---

## Come ripartire

### Già fatto il 12 agosto 2026 (non rifare)

- **Fase 0 completa.** `scripts/gocardless-probe.ts` esiste ed è ripartibile per passo; `scripts/gocardless/snapshots/` è in `.gitignore` e contiene i payload grezzi, lo stato della sonda (`_stato.json`, permessi 0600), le causali in chiaro e il referto completo.
- **Il consenso è vivo e vale 180 giorni**: scade attorno all'**8 febbraio 2027**. Requisition `a991abf9-…`, tre conti collegati, di cui uno escluso. Non serve rifare l'SCA per la Fase 1: i dati si rileggono con `--step=fetch`, entro il limite di 4 chiamate al giorno per conto e per endpoint.
- **Il conto personale è escluso e i suoi dati cancellati dal disco.** In `_stato.json` resta il solo id, che serve a non riscaricarlo.
- Il referto pubblicabile è in `docs/gocardless-referto-2026-08-12.md`.

### Da fare per prima cosa in Fase 1

1. **Un secondo `--step=fetch`**, a qualche giorno dallo spike, e poi `--step=report`: chiude l'ultima domanda aperta sulla stabilità degli id, ed è la premessa della deduplicazione. Costa due chiamate per conto.
2. Decidere la strada delle fixture (vedi *Domande ancora aperte*), perché il mapper si scrive contro quelle.
3. Solo dopo, il modello dati — con `bankAccountId` e la chiave `(bankAccountId, transactionId)` come punto di partenza, non come rifinitura.

### Già fatto l'8 agosto 2026 (non rifare)

- `GOCARDLESS_SECRET_ID` e `GOCARDLESS_SECRET_KEY` sono **in `.env`**, verificate contro l'originale. Il file `~/Downloads/gestionale-weiss.json` è stato cancellato: le chiavi non esistono da nessun'altra parte sul disco. Se servono di nuovo, si rigenerano dal portale.
- I nomi delle due variabili sono documentati in `.env.example` (valori vuoti).
- `.nvmrc` con `22.22.0` creato: `nvm` legge quello, non `.node-version`.
- `CLAUDE.md` porta in cima la regola su `nvm use 22`, con la spiegazione dell'`EBADENGINE`.

### Il prompt che ha avviato la Fase 0 (archivio, già eseguito)

```
Esegui la Fase 0 (lo spike) della spec
docs/superpowers/specs/2026-08-08-open-banking-gocardless-design.md.

Le chiavi GOCARDLESS_SECRET_ID e GOCARDLESS_SECRET_KEY sono già in .env: non
cercarle altrove e non stamparne mai il valore.

Perimetro: crea solo scripts/gocardless-probe.ts e la voce in .gitignore per
scripts/gocardless/snapshots/. Non toccare prisma/schema.prisma, il database,
le route esistenti né la UI. Nessuna migrazione.

Lo script deve essere ripartibile per step (--step=institutions|consent|
accounts|fetch|report) e salvare ogni payload grezzo su disco prima di
analizzarlo: il rate limit è di 4 chiamate al giorno per conto e per endpoint,
quindi una chiamata sprecata costa un giorno.

Fermati dopo --step=consent e passami il link: l'SCA in banca la faccio io
nel browser.
```

### Come si è svolta

1. `--step=institutions` — trovata Banca della Marca fra 403 istituzioni italiane.
2. `--step=consent` — agreement e requisition creati, link di consenso consegnato. Il redirect `http://localhost:3000/api/gocardless/callback` **è stato accettato**: non è servito ripiegare sull'URL di produzione. Dopo l'SCA il browser atterra su quell'indirizzo e il gestionale chiede il login — è atteso e ininfluente, la rotta non esiste e il consenso è già concluso lato GoCardless.
3. SCA in banca, a mano, con selezione dei conti.
4. `--step=accounts` → `LN` e tre conti; `--step=fetch` → 653 movimenti sui due aziendali.
5. `--escludi=<ultime 4 cifre> --purga` per il conto personale, poi `--step=report`.

**Nota sul branch**: lo spike è stato eseguito su `conti/cash-flow-prospetto`. Non tocca nulla di quel lavoro — aggiunge un file in `scripts/`, una voce in `.gitignore` e il referto in `docs/` — ma la Fase 1, che modifica lo schema, conviene farla su un branch proprio.

### Riferimenti

- Quick start: https://developer.gocardless.com/bank-account-data/quick-start-guide/
- Stati e codici di errore: https://developer.gocardless.com/bank-account-data/statuses
- Schema delle transazioni: https://developer.gocardless.com/bank-account-data/transactions
- Base URL: `https://bankaccountdata.gocardless.com/api/v2/`
