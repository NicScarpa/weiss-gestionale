# Cosa resta da fare — 13 agosto 2026

Fotografia di ciò che manca, presa il giorno in cui l'open banking è andato in produzione.

**Da dove si parte.** Le Fasi 0, 1, 2a e 2b dell'integrazione GoCardless sono in produzione
(`origin/main` = `a5d24e8`, deploy Railway riuscito). Dal gestionale si collega la banca dal
browser, si vedono i conti che il consenso copre, si sceglie quali importare e da quale data, si
mettono da parte quelli che non riguardano l'attività, e arriva l'avviso prima che il consenso
scada, col pulsante che lo rinnova senza perdere la configurazione.

**Nessun movimento viene ancora scaricato.** È la Fase 3.

**Come leggere questo documento.** Dove scrivo «verificato» ho guardato il codice o il database
il 13 agosto. Dove scrivo «da appunti» la fonte è la memoria di progetto, che è una fotografia
del momento in cui è stata scritta: prima di agire, ricontrollare.

---

## Parte 1 — Open banking: le tre fasi che restano

### Fase 3 — La sincronizzazione

È quella che dà senso a tutto il resto: oggi il collegamento c'è e non arriva niente.

**Cosa costruire**

- Il cron che sincronizza **solo i conti accesi**, leggendo davvero `syncCutoffDate` per decidere
  da quando scaricare. Quel campo esiste, è documentato, ed è l'unica cosa che impedisce a un
  movimento già entrato via CSV di entrare una seconda volta — ma **oggi nessuno lo legge**.
- **Il contatore delle chiamate HTTP reali**, non delle sincronizzazioni. Il contingente della
  banca è di **4 chiamate al giorno per conto e per endpoint**, e nel caso peggiore una sola
  sincronizzazione ne consuma sei. Un contatore che conta le sincronizzazioni conta la cosa
  sbagliata e non protegge da niente.
- La scrittura dei movimenti in `BankTransaction`, e da lì la **scrittura di prima nota non
  verificata**, passata dalle regole di categorizzazione. È la decisione dell'8 agosto: il
  modello già adottato nel resto del gestionale.
- Mostrare all'amministratore **quante letture gli restano oggi**. Il dato arriva già dalla banca
  negli header di ogni risposta e il client lo legge (`src/lib/gocardless/client.ts`), ma ogni
  rotta lo butta via. È il pezzo che trasforma un tetto subìto in un tetto governato, e va deciso
  ora perché la Fase 3 spende sullo stesso conto.

**Una buona notizia che non era nel piano** (verificato il 13 agosto). `BankTransaction` è il lato
banca, `JournalEntry` è il lato contabile, e `src/lib/reconciliation/matcher.ts` è già il ponte
fra i due: prende un movimento bancario, cerca le scritture candidate in una finestra di date,
calcola un punteggio e scrive l'abbinamento sul movimento. **La sincronizzazione scriverà proprio
nella tabella che il matcher già consuma**: i movimenti scaricati entrano nella riconciliazione
esistente senza costruire alcun ponte.

**Il controllo da fare presto, appena i primi movimenti veri entrano.** Guardare **quanti**
abbinamenti il matcher trova e con che confidenza. Un matcher che non ha mai visto dati veri e
uno che funziona si assomigliano moltissimo finché l'ingresso è vuoto — e al 13 agosto
`bank_transactions` in produzione è **vuota** (verificato). È la stessa forma del backfill della
Fase 1, che ha girato su zero righe dentro un deploy riuscito: un registro verde non distingue
«non ha trovato niente» da «ha sbagliato tutto».

**Da fare prima di scrivere la Fase 3, e costa poco.** La deduplicazione poggia sull'ipotesi che
gli identificativi dei movimenti forniti dalla banca siano **stabili nel tempo**, e quell'ipotesi
non è mai stata verificata. Serve solo rilanciare `scripts/gocardless-probe.ts --step=fetch` a
distanza di giorni dal 12 agosto e confrontare, poi `--step=report`. Se non fossero stabili, la
Fase 3 va costruita diversamente: meglio saperlo prima di scriverla.

**Dentro la Fase 3 entrano anche le otto voci lasciate dalla Fase 2b**, elencate nella Parte 2.

### Fase 4 — La categorizzazione

**La premessa è cambiata dopo lo spike, ed è il punto più importante di questa fase.** La spec
originale la immaginava come «riusa le regole che ci sono». Ma `categorization_rules` è **vuota**:
non c'è un patrimonio da riusare, serve un innesco. Un motore di regole senza regole non
categorizza niente.

**L'innesco l'ha trovato la sonda sul campo.** Il codice proprietario che la banca mette su ogni
movimento è presente sul **100%** dei 678 movimenti letti, con 28 codici distinti e semanticamente
puliti: commissioni su bonifico, emolumenti, F24, rata mutuo, versamento contante, operazione POS,
giroconti. Una tabella **«codice → conto»**, compilata una volta, categorizza **con certezza** e
non per somiglianza. È il contrario di una regola a parole chiave, che indovina.

**Il principio che regge tutto** (deciso l'8 agosto): *nessuna decisione automatica sovrascrive
una decisione dell'operatore.* Vale per i codici della banca come per le regole. Il codice della
banca non compete con le regole: **le precede in mancanza d'altro, e le alimenta**. E siccome
`JournalEntry.categorizationSource` registra chi ha deciso (`manual`, `rule`, `import`, `split`),
la precedenza è verificabile a posteriori su ogni singolo movimento, invece di essere una
convenzione che vive solo nella testa di chi ha scritto il codice.

**La decisione ancora aperta.** Estrarre il nome della controparte dal testo della causale in modo
**deterministico** (tagli e normalizzazioni sul separatore) oppure con l'**AI**. Il deterministico
è gratis, riproducibile e provabile sulle fixture; l'AI prende i casi storti ma costa e non è
riproducibile in un test. La risposta ragionevole, già scritta nella spec: **prima il
deterministico, e l'AI solo sul residuo** che quello non risolve — circa il 18%, non su tutto.

**Un limite già noto e non aggirabile:** la controparte non arriva. Banca della Marca non manda
`creditorName`/`debtorName` in nessun campo, quindi ogni progetto che assuma di avere il nome di
chi paga o incassa è già smentito.

### Fase 5 — Il CSV cambia ruolo, non si dismette

> **Decisione del proprietario, 13 agosto 2026.** L'import da CSV e XLSX **non va dismesso**.
> Resta come riserva e per i conti correnti che GoCardless non copre.

Questo riscrive la fase: non è più «spegnere il CSV», è **far convivere due fonti** e rendere
esplicito quale serve a cosa.

**I tre ruoli che il CSV conserva**

1. **Il recupero dello storico.** Da GoCardless lo storico anteriore ai 90 giorni **non si
   recupererà mai** — è ciò che concede la banca, non un limite del nostro codice. Per il passato
   il CSV è insostituibile.
2. **I conti che l'open banking non copre.** Un conto presso un istituto non supportato, o che si
   sceglie di non collegare, continua a vivere di import manuale. Il gestionale deve gestire i due
   casi insieme, non uno alla volta.
3. **La riserva.** Se il consenso scade, se la banca smette di rispondere o se il contingente
   giornaliero è esaurito, l'import resta la strada per non fermarsi.

**Cosa questo richiede, e la buona notizia: quasi tutto c'è già** (verificato il 13 agosto).

- `ImportSource` prevede **già** `PSD2_GOCARDLESS` accanto a `CSV` e `XLSX`: il campo per
  distinguere la provenienza di ogni movimento esiste, va solo scritto.
- L'indice di deduplicazione `ux_bank_transactions_conto_provider` è **parziale** e le righe senza
  identificativo del fornitore — cioè quelle importate da file — **non collidono fra loro**,
  perché PostgreSQL considera distinti i valori nulli in un indice unico. Le due fonti convivono
  senza inciampare l'una nell'altra.
- La data di taglio obbligatoria per accendere un conto è **già** il presidio contro il doppio
  ingresso dello stesso movimento dalle due strade.

**Cosa resta da costruire, quindi**

- Scrivere davvero `importSource` sui movimenti che arrivano dalla sincronizzazione.
- Mostrare la provenienza nell'elenco dei movimenti: chi guarda deve poter distinguere a colpo
  d'occhio ciò che è arrivato da solo da ciò che è stato caricato a mano.
- Dire con chiarezza nel pannello che l'import resta disponibile, invece di lasciar credere che
  collegare la banca lo escluda.
- Decidere cosa succede se lo **stesso** movimento arriva da entrambe le strade nonostante la data
  di taglio: oggi la deduplicazione non può accorgersene, perché le due chiavi sono disgiunte e
  nessuna vede le righe dell'altra. Con la data di taglio impostata bene non capita — ma «impostata
  bene» è una cosa che fa una persona, e le persone sbagliano.

---

## Parte 2 — Le otto voci lasciate dalla Fase 2b

Sono scritte per esteso in `docs/superpowers/plans/2026-08-13-open-banking-fase-2b.md`, sezione
*Dopo il piano: cosa resta*. Qui solo l'elenco, per non avere due versioni che divergono.

1. **La Fase 3** (vedi sopra).
2. **Riassegnare un conto della banca a un altro conto del gestionale produce un 500**:
   `providerAccountId` è unico globale e la violazione non è tradotta.
3. **La stabilità degli identificativi dei movimenti** non è verificata (la sonda, vedi sopra).
4. **Il rilascio**: fatto il 13 agosto, questa voce è chiusa.
5. **Il ritorno dal wizard col tasto Indietro lascia il pannello inerte** finché non si ricarica.
6. **«Mostra archiviati» perde le scelte non salvate** la prima volta che lo si accende. Rimedio
   noto e non applicato: `placeholderData: keepPreviousData`.
7. **La data di scadenza del consenso è una stima per eccesso**, non il valore concesso
   dall'agreement, quindi l'avviso a quattordici giorni può arrivare tardi. La fonte autorevole è a
   una chiamata di distanza e fuori dal contingente; manca il metodo nel client.
8. **Il cricchetto delle autorizzazioni è a 258** contro una baseline di 255. Due erano lì prima di
   questo lavoro, uno è nostro: la rotta di ritorno dalla banca, che non può avere la guardia
   standard. Il modo giusto di chiuderla è **toglierla da sotto `/api`** — non è un'API, è una
   redirezione per il browser.

---

## Parte 3 — Le cose piccole tracciate solo negli appunti

Da appunti: verificare prima di agire.

- **`SET NOT NULL` su `cost_center_id`.** Oggi costa zero perché la tabella è vuota; più si aspetta,
  più costa.
- **Il seed delle categorie della riclassificazione cash flow**, e guardare quella pagina con gli
  occhi: è implementata e in produzione dal 12 agosto, ma nessuno l'ha ancora vista funzionare su
  dati veri.
- **Il ciclo tesoreria**: restano le regole multi-azione e la fase dei report.
- **L'imputazione dei ricavi**, decisa il 10 agosto e allora bloccata dal piano dei conti v4.
  **Quel blocco non c'è più**: il v4 è in produzione dal 12 agosto, quindi la spec è eseguibile.
- **La rotazione delle credenziali** dopo la riscrittura della storia del repository del 5 agosto è
  ancora manuale e non risulta fatta.

---

## Parte 4 — Fuori dall'open banking

**Il pezzo grosso: `analisi/onda-1`.** Verificato il 13 agosto: **57 commit** mai integrati, fermi
al 12 agosto, e nel frattempo a quel ramo mancano **87 commit** di `main`. Da appunti risulta
pronto — quindici task, e le tre proiezioni che coincidono. È il lavoro che si deteriora da solo:
ogni giorno che passa il riallineamento costa di più, e misurare qualcosa su un ramo vecchio fa
«trovare» problemi chiusi da settimane. **Se vale la pena tenerlo, va riallineato adesso; se non
vale, va chiuso e detto.** La via di mezzo è la sola che costa senza rendere.

**La CI non verifica la build di nessuno.** Il controllo del lint è rosso da prima dell'open
banking e delle fatture, per due rotte che non appartengono a nessuno dei due lavori; e **quando
quel controllo fallisce, il controllo della build viene saltato**. È proprio la verifica capace di
vedere un import che rompe il pacchetto finale, invisibile ai tipi, ai test e a qualunque
rilettura del codice. Tre rotte da convertire in tutto (le due preesistenti più la nostra):
lavoro piccolo, effetto sproporzionato.

**Rami da sistemare.** Quattro rami da un commit ciascuno — una modifica alle linee guida, la
sintesi dell'analisi competitiva, una regola sulle presenze, una correzione di commento — più due
rami di lavoro temporaneo di agenti, e **63 rami già dentro `main`** che sono soltanto residui da
potare.

---

## Un ordine che ha senso

1. **La sonda, secondo passaggio.** Costa un comando e può cambiare il progetto della Fase 3.
2. **Il riallineamento o la chiusura di `onda-1`.** È l'unica voce che peggiora da sola.
3. **Le tre rotte del cricchetto**, che riaccendono la verifica della build per tutti.
4. **La Fase 3**, con dentro le voci 2, 5, 6, 7 e 8 della Parte 2.
5. **La Fase 4**, partendo dalla tabella «codice della banca → conto», che è l'innesco senza il
   quale il motore di regole non ha niente da masticare.
6. **La Fase 5**, che con la decisione di oggi è più piccola di come era stata immaginata: non
   spegnere il CSV, ma dichiarare chi fa cosa e mostrare la provenienza di ogni movimento.

---

## Parte 5 — Il contesto necessario per eseguire

Tutto ciò che chi riprende deve sapere prima di scrivere una riga. Verificato il 13 agosto 2026.

### Dove si lavora

- **`main` vive nella worktree `~/Desktop/accounting-presenze`**, non nella cartella principale.
  La cartella `~/Desktop/accounting` è su un altro ramo, e ce ne sono una quindicina di altre.
- **Più sessioni lavorano in parallelo su questo repository.** Prima di toccare file condivisi —
  `prisma/schema.prisma` su tutti — vale la pena chiedere all'altra sessione cosa sta facendo:
  il 13 agosto è servito a evitare due rilasci intrecciati e a sapere in anticipo che il conflitto
  sarebbe stato solo testuale.
- **Node 22 obbligatorio**: anteporre `source ~/.nvm/nvm.sh && nvm use 22 &&` a ogni comando
  `npm`/`npx`/`node`, **nella stessa riga di shell**. Il Node di sistema è la v25 e `npm` si
  rifiuta di partire (`EBADENGINE`), non fallisce in modo vago.

### Le misure di partenza, da non peggiorare

| Cosa | Valore al 13 agosto |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | 0 errori, **62 warning** |
| `npx vitest run` | **1638 test su 122 file** |
| `npm run test:integration` | **515 test su 63 file** |
| `npm run build` | exit 0 |
| `node scripts/check-route-auth.mjs --ratchet` | **258** (baseline scritta: 255) |

**Il build va eseguito e il suo codice d'uscita letto direttamente.** Mai `npm run build | tail`:
il codice d'uscita diventerebbe quello di `tail`, cioè sempre zero. È l'unico controllo capace di
vedere un import lato client che tira dentro Prisma e rompe il pacchetto finale — invisibile a
`tsc`, ai test e a qualunque rilettura del codice.

**I test di integrazione girano su PostgreSQL locale, porta 5433.** Se un'altra sessione lavora,
serve `TEST_DB_SUFFIX=<nome>` davanti al comando, altrimenti due suite si ricreano il database a
vicenda e i sintomi sembrano difetti veri (tabelle inesistenti, fallimenti intermittenti).

### Le trappole che hanno già morso, e come non ricascarci

1. **Dopo un merge o un cambio di ramo, il client Prisma è quello di prima**, e `tsc` accusa file
   perfettamente corretti — di solito quelli scritti dall'altra sessione. Cura: `npx prisma
   generate`; cambiando ramo nella stessa worktree serve anche `rm -rf .next`. **La tentazione è
   `--no-verify` ed è sbagliata**: il controllo sta dicendo la verità su uno stato dell'albero
   diverso da quello che si crede di avere.
2. **`bank_accounts` contiene anche le casse** (`accountType`: `CASH` o `BANK`). Ogni lettura che
   non filtri il tipo è sbagliata: in questa integrazione l'errore è già stato commesso **tre
   volte**, e ogni volta sembrava innocuo.
3. **La cifratura non è deterministica.** `encrypt` usa un vettore d'inizializzazione casuale,
   quindi due cifrature dello stesso IBAN sono byte diversi e nessun indice unico le vede uguali.
   **L'unica colonna confrontabile è `ibanHash`.** Un ragionamento che si appoggi all'unicità
   dell'IBAN cifrato è sbagliato in partenza.
4. **Gli indici parziali vanno scritti in due posti**: nel `migration.sql` e in
   `prisma/sql/constraints.sql`. Il database dei test nasce da `prisma db push`, che le migrazioni
   non le esegue: se manca il secondo, il test che verifica il vincolo passa in verde **senza che
   il vincolo esista**.
5. **`errore.meta?.target` non esiste su un `P2002` in questo progetto**, perché si usa l'adapter
   driver Postgres: il nome del vincolo violato compare solo dentro `originalMessage`. La forma
   «da manuale» non riconosce nulla e lascia passare un 500 anonimo dove doveva esserci un 409.
6. **`@testing-library/react` non è importabile**: manca il suo peer e il solo import fa fallire
   la suite prima di eseguirla. I test dei componenti montano con `createRoot` + `act` usando gli
   aiutanti di `src/components/scadenzario/__tests__/render-helpers.tsx`. **Quegli aiutanti
   impongono `retry: false` a tutti i test**, quindi un difetto legato ai ritentativi delle query
   è invisibile sotto test: le query che chiamano la banca vanno guardate a mano.
7. **Una migrazione Prisma non è atomica.** Se uno statement fallisce, le colonne già aggiunte
   restano scritte mentre il registro dice che non è stato applicato nulla. Recupero:
   `prisma migrate resolve --rolled-back <nome>`, poi disfare a mano, poi ridare il deploy.

### Come si rilascia, adesso

`railway.json` imposta `preDeployCommand: npm run db:migrate:deploy`, che è
`prisma migrate deploy && npm run rls:enable`. Conseguenze:

- **Spingere su `main` applica le migrazioni da solo**, dopo la build e **prima** che la versione
  nuova prenda traffico. Se una migrazione fallisce, il deploy si ferma e il traffico resta al
  codice vecchio.
- **`rls:enable` cicla su `pg_tables`**, quindi ogni tabella nuova nasce protetta. Con
  `prisma migrate deploy` nudo non sarebbe successo, e il deploy sarebbe stato verde lo stesso.
- Prima di una migrazione che tocca dati, **copia di sicurezza**: serve il client PostgreSQL 18 in
  `/opt/homebrew/opt/libpq/bin/pg_dump`, perché il `postgresql@16` di Homebrew si rifiuta di
  leggere un server più recente. Verificarla davvero con `pg_restore -l`, non solo produrla.
- Guardare l'SQL prima: `npx prisma migrate diff --from-config-datasource --to-schema
  prisma/schema.prisma --script`. **Se compaiono `DROP`, fermarsi.**

### Cosa esiste già, per non riscriverlo

**Moduli** in `src/lib/gocardless/`:

| File | A cosa serve |
|---|---|
| `client.ts` | Il client HTTP. `creaClient()`, e `Risposta<T>` porta `limiti` con i contatori del contingente letti dagli header |
| `servizio.ts` | `clientDaAmbiente()` — **l'unico punto che legge i segreti** — e `impostaClientPerTest()` |
| `mapper.ts` | `mappaMovimento` / `mappaMovimenti`: dal grezzo della banca a `MovimentoDaSalvare` |
| `dedup.ts` | `filtraGiaPresenti()`: la deduplicazione, **per conto**, non globale |
| `abbinamento.ts` | `abbinaConti()`: accoppia i conti della banca con quelli del gestionale, **per impronta** |
| `stati.ts` | `descriviStato`, `eCollegata`, `eDaRifare`: gli stati della requisition in italiano |
| `risposte.ts` | `rispostaErroreGoCardless()`: 429 con i secondi alla ripresa, 503, 502 |
| `maschere.ts`, `scadenza.ts`, `parametri.ts` | Maschera dell'IBAN, giorni alla scadenza, tetti dei giorni |

**Rotte** sotto `/api/gocardless/`: `istituzioni`, `collegamenti` (GET/POST), `collegamenti/[id]`
(DELETE), `collegamenti/[id]/conti` (GET/PUT), `collegamenti/[id]/rinnovo` (POST), `callback` (GET).
Tutte con `withAuth(handler, { roles: ['admin'], venueScoped: true })` tranne il callback, che è la
redirezione della banca e non può averla.

**Campi già a schema, e ancora nessuno li usa**: `BankAccount.syncEnabled`, `syncCutoffDate`,
`lastSyncAt`, `providerAccountId`, `connectionId`, `openBankingReady`. E il modello
**`BankSyncRun`**, pensato apposta per il contatore: `movimentiLetti`, `movimentiNuovi`,
`movimentiDuplicati`, `rateLimitRemaining`, `rateLimitResetAt`, `esito`, `httpStatus`, `errore`.

**Il ponte verso la contabilità**: `src/lib/reconciliation/matcher.ts` prende un `BankTransaction`,
cerca i `JournalEntry` candidati e scrive l'abbinamento sul movimento bancario.

### I fatti della banca, misurati sul campo (spike del 12 agosto)

- **4 chiamate al giorno per conto e per endpoint.** Una sprecata costa un giorno.
- **90 giorni di storico, 180 di accesso** — è ciò che concede Banca della Marca, non i massimi
  teorici del protocollo.
- **`transactionId` non è unico fra conti**: 249 collisioni su 678 movimenti. La deduplicazione
  deve essere **per conto**, e lo è.
- **La controparte non arriva.** `creditorName`/`debtorName` non esistono nella risposta reale,
  esistono solo nella documentazione.
- **Il codice proprietario è valorizzato sul 100% dei movimenti**, 28 codici distinti.
- Lo script della sonda è ancora in `scripts/gocardless-probe.ts`, ripartibile per passi
  (`--step=institutions|consent|accounts|fetch|report`) e salva ogni risposta su disco **prima** di
  analizzarla, perché una chiamata sprecata costa un giorno.

### Il metodo che ha funzionato

Discussione → specifica → piano → esecuzione con un subagente per task, ciascuno rivisto da un
revisore indipendente, e **una revisione finale sull'intero ramo**. Quella finale, sulla Fase 2b,
ha trovato due difetti gravi e quattro importanti su un ramo dove **ogni task era già stato
approvato**: nascevano tutti *fra* i pezzi, dove una revisione per task non può guardare. Vale la
pena chiederle esplicitamente quattro cose: quanto consuma una giornata d'uso della risorsa
scarsa, quali invarianti reggono solo per una ragione scritta in un altro file, quali
ragionamenti sono stati copiati insieme a una premessa che altrove non vale, e cosa succede a una
persona che percorre il flusso dall'inizio alla fine.

---

## Parte 6 — I prompt per ricominciare

Da incollare così come sono, in una sessione nuova aperta su `~/Desktop/accounting-presenze`.

### Prompt A — La sonda, secondo passaggio (prima di tutto, costa poco)

> Leggi `docs/Cosa_Resta_Da_Fare_2026-08-13.md` per il contesto.
>
> Devi verificare un'ipotesi su cui poggia la deduplicazione dei movimenti bancari: che gli
> identificativi che GoCardless assegna ai movimenti siano **stabili nel tempo**. Lo spike del 12
> agosto li ha letti una volta sola, quindi la stabilità non è mai stata provata.
>
> Rilancia `scripts/gocardless-probe.ts --step=fetch` e poi `--step=report`, confronta con le
> risposte salvate il 12 agosto in `scripts/gocardless/snapshots/`, e dimmi se gli identificativi
> dei movimenti già visti sono rimasti gli stessi.
>
> Vincoli non negoziabili: le chiavi stanno in `.env`, non cercarle altrove e **non stamparne mai
> il valore**. Il limite è di **4 chiamate al giorno per conto e per endpoint** e una sprecata
> costa un giorno: salva ogni risposta su disco prima di analizzarla, e non rilanciare un passo
> «per sicurezza». Il conto personale dell'amministratore (finale 2322) resta **escluso**.
>
> Se gli identificativi non fossero stabili, dimmelo con chiarezza: cambierebbe il progetto della
> Fase 3, e va saputo prima di scriverla.

### Prompt B — Decidere di `analisi/onda-1`

> Leggi `docs/Cosa_Resta_Da_Fare_2026-08-13.md`, Parte 4.
>
> Il ramo `analisi/onda-1` ha 57 commit mai integrati, fermi al 12 agosto, e nel frattempo gli
> mancano 87 commit di `main`. È l'unica voce dell'elenco che peggiora da sola.
>
> Non riallinearlo ancora. Prima dimmi **cosa contiene davvero** e **quanto costa recuperarlo**:
> quali file tocca, quali di quelli sono stati cambiati anche su `main`, e quali dei problemi che
> quel lavoro risolveva sono già stati chiusi altrove nel frattempo — misurando su `main`, non sul
> ramo, perché un ramo vecchio fa «trovare» problemi chiusi da settimane.
>
> Poi propommi una delle tre: riallineare, recuperare solo una parte, o chiudere e archiviare.
> Con il costo di ciascuna. Decido io.

### Prompt C — Riaccendere la verifica della build

> Leggi `docs/Cosa_Resta_Da_Fare_2026-08-13.md`, Parte 2 punto 8 e Parte 4.
>
> La CI non verifica la build di nessuno: il controllo del lint è rosso — `node
> scripts/check-route-auth.mjs --ratchet` dà 258 contro una baseline di 255 — e quando quello
> fallisce, il job Build viene **saltato**. È proprio la verifica capace di vedere un import lato
> client che tira dentro Prisma e rompe il pacchetto finale.
>
> Tre handler da sistemare. Due preesistenti, che vanno convertiti a `withAuth(handler, { roles,
> venueScoped })` seguendo il modello di `src/app/api/prima-nota/[id]/riallinea/route.ts` — non le
> rotte sorelle di `prima-nota/`, che usano ancora il controllo scritto a mano e riprodurrebbero il
> debito. Il terzo è `GET /api/gocardless/callback`, che **non può** avere `withAuth`: è il
> bersaglio della redirezione con cui la banca rimanda l'utente, e con la sessione scaduta
> risponderebbe con un JSON 401 al posto della pagina. Quello va tolto da sotto `/api` — non è
> un'API, è una redirezione per il browser — e il conteggio guarda solo `src/app/api/`.
>
> Attenzione: spostarlo cambia il percorso di ritorno dalla banca, che si prova solo con un
> collegamento vero. Fallo quando puoi verificarlo, o dimmi come intendi verificarlo.
>
> Alla fine il cricchetto deve dare **255 o meno**, e la baseline nello script va abbassata a
> quel numero.

### Prompt D — La Fase 3, la sincronizzazione

> Leggi `docs/Cosa_Resta_Da_Fare_2026-08-13.md` per intero: contiene il contesto, le trappole e
> cosa esiste già. Poi leggi la specifica
> `docs/superpowers/specs/2026-08-08-open-banking-gocardless-design.md` e la sezione «Dopo il
> piano: cosa resta» di `docs/superpowers/plans/2026-08-13-open-banking-fase-2b.md`.
>
> Progetta ed esegui la Fase 3 dell'integrazione open banking: la sincronizzazione dei movimenti.
> Usa il metodo che ha funzionato: discussione, poi specifica, poi piano, poi esecuzione con un
> subagente per task e una revisione indipendente per ciascuno, e alla fine **una revisione
> dell'intero ramo** sul modello più capace.
>
> **Non cominciare a scrivere codice prima di avermi presentato il progetto e avere il mio via.**
>
> Le cose su cui non transigere:
>
> - **Il contingente della banca**: 4 chiamate al giorno per conto e per endpoint, e nel caso
>   peggiore una singola sincronizzazione ne consuma sei. Il contatore deve contare **le chiamate
>   HTTP reali**, non le sincronizzazioni. `BankSyncRun` è già a schema con i campi per farlo.
> - **`syncCutoffDate` va letto davvero** per calcolare da quando scaricare. Esiste, è
>   obbligatorio per accendere un conto, e oggi non lo legge nessuno: è l'unica cosa che impedisce
>   a un movimento già entrato da file di entrare una seconda volta.
> - **Solo i conti accesi**, e mai una cassa: `bank_accounts` contiene anche quelle.
> - **Ogni movimento diventa subito una scrittura di prima nota non verificata**, passata dalle
>   regole. È la decisione dell'8 agosto.
> - **L'import da CSV e XLSX non si dismette**: resta come riserva e per i conti che GoCardless
>   non copre. Scrivi `importSource` sui movimenti e rendi visibile la provenienza.
> - **Nessuna chiamata di rete vera nei test**, mai: si inietta un client finto con
>   `impostaClientPerTest`.
>
> E una verifica da fare **appena i primi movimenti veri entrano**, non alla fine: guardare
> **quanti** abbinamenti il matcher della riconciliazione trova e con che confidenza. Oggi
> `bank_transactions` in produzione è vuota, e un matcher che non ha mai visto dati veri assomiglia
> moltissimo a uno che funziona finché l'ingresso è vuoto.
