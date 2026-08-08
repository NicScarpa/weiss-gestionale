# Piano del lavoro residuo — weiss-gestionale

**Scritto l'8 agosto 2026, a remediation conclusa.** Questo documento è autosufficiente: contiene
tutto ciò che serve per riprendere in una sessione nuova senza ricostruire il contesto.

---

## 0. Come riprendere in una sessione nuova

Primo messaggio da incollare:

```
Leggi /Users/nicolascarpa/Desktop/accounting/audit/PIANO-RESIDUO.md e
audit/STATO-REMEDIATION.md, poi parti dalla PRIORITÀ 0.
```

I file stanno **su `main`**, quindi sono al sicuro in git. Copia anche in
`~/Desktop/accounting/audit/`.

### Verifica dello stato prima di agire

```bash
cd ~/Desktop/accounting && git fetch origin
git log --oneline -1 origin/main          # atteso: 35cf013 o successivo
git worktree list                         # chi sta lavorando su cosa
ls audit/W5-*.md                          # le tre relazioni della W5
```

---

## 1. Dove siamo

La remediation post-audit è **finita e in produzione**: sei ondate (W0-W5), `main` = `35cf013`,
distribuito su Railway. Tag: `remediation/W0-completa` … `W5-completa`, rollback su
`pre-W0`, `pre-W2`, `pre-W3`, `pre-W4`.

**Stato del gate su `main`**: 885 test unit · 250 di integrazione · 0 errori tsc · 0 errori lint ·
strict-ratchet 24 · audit-ratchet 0 critical / 0 high · build ok.

**W0-W4 erano correzioni, tutte rilasciate. W5 era un audit in sola lettura: i suoi ~34 finding
sono documentati e NON corretti** — sono il grosso di ciò che resta.

---

## PRIORITÀ 0 — Il registro delle migrazioni (urgente, mezz'ora)

### Perché adesso

**Non esiste alcuna migrazione versionata** e in produzione la tabella `_prisma_migrations` **non
esiste** (verificato: 0 righe). Ogni modifica allo schema è stata applicata con `prisma db push`,
che sincronizza e non lascia storia.

Era rimandabile finché toccava lo schema una persona sola. **Non lo è più**: nelle ultime 48 ore il
database di produzione è stato modificato **due volte**, e sul ramo `conti/piano-v4` c'è una terza
sessione che ha già scritto due file SQL a mano (`2026-08-07_piano_v4_centri_costo.sql`,
`2026-08-08_centro_operativo_provenienza.sql`). Più persone modificano lo stesso schema di
produzione **senza un registro condiviso di cosa è stato applicato e quando**.

### Come farlo

```bash
cd ~/Desktop/accounting-wt/riconciliazione   # o un worktree pulito da origin/main
source ~/.nvm/nvm.sh && nvm use 22
URL=$(grep -m1 '^DATABASE_URL=' ~/Desktop/accounting/.env | cut -d= -f2- | tr -d '"')

# 1. BACKUP (obbligatorio, il client di sistema è la 16 e NON basta: serve libpq 18)
/opt/homebrew/opt/libpq/bin/pg_dump "$URL" -Fc -f ~/Desktop/backup-pre-baseline-$(date +%Y%m%d-%H%M).dump
/opt/homebrew/opt/libpq/bin/pg_restore -l ~/Desktop/backup-pre-baseline-*.dump | grep -c 'TABLE DATA'

# 2. Fotografia dello stato attuale come migrazione iniziale
mkdir -p prisma/migrations/0_baseline
DATABASE_URL="$URL" npx prisma migrate diff \
  --from-empty --to-config-datasource --script > prisma/migrations/0_baseline/migration.sql

# 3. Dichiarala già applicata (NON la esegue: registra soltanto)
DATABASE_URL="$URL" npx prisma migrate resolve --applied 0_baseline

# 4. Verifica
psql "$URL" -tAc "SELECT migration_name, finished_at FROM _prisma_migrations;"
```

### Dopo, la regola cambia per tutti

- In produzione **mai più `db push`**: solo `prisma migrate deploy`.
- Ogni modifica allo schema nasce come `prisma migrate dev --name <nome>` e viaggia in git.
- **Va comunicato alle altre sessioni**, altrimenti la prima che fa `db push` disallinea il registro.
- I due file SQL scritti a mano su `conti/piano-v4` vanno riconciliati con questo impianto: o
  diventano migrazioni vere, o vanno dichiarati applicati.

⚠️ **`prisma/migrations/post-push/constraints.sql` resta com'è**: contiene gli 8 indici unici
**parziali** (`WHERE deleted_at IS NULL`) che Prisma non sa esprimere. Sono già in produzione dal
7 agosto e **non vanno rieseguiti**. Vanno però ricordati: un `migrate reset` li perderebbe.

---

## PRIORITÀ 1 — I finding della W5 (~34, nessuno critico)

Le tre relazioni complete stanno in `audit/W5-F1-categorizzazione-ai.md`,
`audit/W5-F2-allocation-memoria.md`, `audit/W5-F3-presenze.md`, ciascuna con `file:riga`, snippet,
conseguenza concreta e rimedio proposto.

### Il filo comune, da tenere presente in tutte le correzioni

> **Le difese stanno dove qualcuno si aspettava il pericolo, non dove il pericolo capita.**
> E in tutti e tre i casi **l'errore è silenzioso**: nessun avviso, il cartellino esce pulito,
> l'export passa.

**Raccomandazione che viene prima dei numeri**: far **alzare un avviso** a ognuna di queste
situazioni. Un numero sbagliato che si vede costa molto meno di uno che non si vede.

### 1A — Presenze (6 P1) · il lotto più urgente, sono stipendi

⚠️ **Coordinamento obbligatorio**: il modulo presenze è in mano a una sessione parallela
(`~/Desktop/accounting-presenze`). **Prima di assegnare questo lotto, accordarsi su chi lo fa.**

| # | Difetto | Effetto |
|---|---|---|
| 1 | `timekeeping-engine.ts:171-173` — l'uscita tardiva estende il turno **senza limite di distanza** (`lastSegment.end = Math.max(...)`) | `IN 09:00, OUT 13:00, OUT 22:00` → **780 min invece di 240**, `warnings: []`. Chi rientra dalla pausa senza timbrare si fa pagare la pausa: **+123 €/giorno** |
| 2 | `auto-clockout/route.ts:83-85` — chiude a entrata+12h, **orario inventato** | Turno 07-13 dimenticato → 12h invece di 6, **+84 €**. Il sistema sa già calcolare la fine turno: `sessioni-aperte.ts:93-107`, usata dalla cassa. **Quello è il modello a cui riscriverlo** |
| 3 | `auto-clockout/route.ts:55` — `gte: now-24h` lascia **12 ore utili** | Se il servizio sta fermo mezza giornata, quella timbratura non la guarda più nessuno: **la giornata vale zero** |
| 4 | `payroll-calculator.ts:550` — ferie approvate + timbrature reali | Le ore si buttano; il cartellino stampa entrata e uscita vere accanto a «0 ore» |
| 5 | `payroll-calculator.ts:256-259` — `isActive: true, portalEnabled: true` senza criterio di data | Chi cessa il 15 **sparisce dall'export con le ore lavorate**: ~960 € sull'ultimo mese |
| 6 | Nessuna route modifica una timbratura, e aggiungere l'uscita giusta non serve (vince la più tarda, difetto 1) | Le 12 ore sbagliate **si tolgono solo dal database** |

**P2 dello stesso lotto**: ore sospese senza anomalia da approvare e senza blocco export; pausa
aperta mai richiusa pagata (9h invece di 8); **`anomalies/[id]` GET senza controllo di ruolo** —
espone posizione e dispositivo di un collega; `timbrature-aperte` POST ammette `staff` e l'orario
altrui senza notifica all'interessato; timbratura di sistema scritta come `WEB` e indistinguibile in
UI; decorrenza delle regole facoltativa; **39 route su 39 senza `withAuth`**; **l'interruttore
`autoClockOutEnabled` della pagina Impostazioni non è letto da nessuna parte** — spegnerlo non ferma
niente.

**Cosa NON toccare**: il motore di calcolo è la parte migliore del progetto (puro, 139 test verdi;
mezzanotte, cambio d'ora nei due sensi, turno spezzato, arrotondamenti e tetto verificati **per
esecuzione**). La storicizzazione delle regole regge. Timbrare l'*entrata* per un altro è impossibile.

### 1B — Allocazione e memoria fornitore (2 P1)

| # | Difetto | Effetto |
|---|---|---|
| 1 | `schedule-reconciliation-service.ts:102` legge le righe fattura **senza filtrare lo stato** | Le proposte AI mai confermate pesano quanto le confermate → `aggiornaContoDominante` riscrive `JournalEntry.accountId` → `saldi.ts:340` imputa lì l'**intero** importo. Fattura mista da 1.200 € → 1.200 € su "Pulizie". **L'audit registra la riconciliazione, non la riscrittura del conto, e il valore precedente non è salvato**: un difetto che cancella le proprie tracce |
| 2 | Le fette non entrano in nessun report | "Suddiviso 700/300" vale 1.000 € su un conto e 0 sull'altro |

**P2**: `ripartisciProQuota` (`allocation-service.ts:23-28`) — l'`if (centesimi > 0)` scarta il resto
negativo. **Riprodotto**, script eseguibile in `audit/prova-F2-ALL-003.mjs`. Ma **declassato dopo
misura**: 2-3 centesimi in ~1 caso su 500, mai su fatture normali. Serve una riga di coda da pochi
centesimi accanto a molti conti. *Da correggere quando si tocca quella funzione, non un motivo per
toccarla.* Conta perché il commento promette «SEMPRE esattamente la quota» ed è falso, e perché i
controlli di quadratura altrove tollerano ±0,01 € contro i 0,03 € che questa produce.
Inoltre: pesi al netto IVA su quota lorda; `setEntryAllocations` senza blocco né transazione (due PUT
insieme → 6 fette per 2.000 € su un movimento da 1.000 €; **il servizio gemello a due file di
distanza il lock ce l'ha**: `bloccaMovimento`, `SELECT … FOR UPDATE`); memoria che riconosce il
prodotto dal codice articolo senza verificare che sia lo stesso; **una memoria sbagliata è per
sempre** e viene scritta come 'confermata', quindi verde e invisibile, senza schermata per vederla o
cancellarla; «Conferma tutte» non alimenta la memoria.

### 1C — Categorizzazione automatica (3 P1)

| # | Difetto | Effetto |
|---|---|---|
| 1 | `line-categorization/index.ts:19` è `z.number()` nudo; la colonna `InvoiceLineAccount.confidence` (`schema.prisma:1627`) è `Decimal(3,2)`, max 9,99 | Un `87` invece di `0.87` — scivolone plausibile, i modelli pensano in percentuali — fa rifiutare la scrittura e **interrompe la categorizzazione di tutte le righe successive, in silenzio** |
| 2 | `index.ts:251` — le descrizioni dagli XML dei fornitori entrano nel prompt senza filtri | Danno **delimitato**: imputazioni sbagliate fra conti veri, testo dell'attaccante mostrato al titolare, innesco del difetto 1. **Nessun dato può uscire** |
| 3 | `route.ts:640` — chiamata a pagamento attesa dentro la richiesta dell'utente, `new Anthropic()` senza timeout | Fino a 10 min per tentativo × 3. La fattura è salvata ma il browser aspetta; l'utente ricarica e sente «già importata» |

⚠️ **NON toccare la riconciliazione.** `schema.prisma:666` è `ScheduleReconciliation.confidence`,
**difesa due volte** (`min(0).max(1)` in `scadenzario/[id]/riconciliazioni/route.ts:18` e
`toFixed(2)` nel servizio) e alimentata da codice nostro deterministico. È il **contro-esempio**, non
una seconda istanza — il lead lo aveva riferito male e la relazione contiene la correzione.

**P2**: memoria fornitore caricata senza tetto; **la confidenza non è mostrata da nessuna parte**,
quindi «Accetta tutte» è alla cieca (decisione di prodotto); nessun rate limit sull'import.

**Costo: non è un problema.** ~2 €/mese, tetto invalicabile ~20 centesimi per chiamata imposto dalla
finestra del modello, nessun ciclo possibile.

---

## PRIORITÀ 2 — Debito tecnico accumulato

### 2A — Accessi
- **292 handler ancora con l'autorizzazione scritta a mano.** Censimento esatto:
  `node scripts/check-route-auth.mjs` → 27 `withAuth`, 292 inline, 11 pubbliche, 2 cron, 2 senza
  controllo (verificate innocue). Convertirli, poi rendere lo script **bloccante** in CI con
  `--strict`.
- **39 route presenze su 39 senza `withAuth`** (incluse nel conteggio sopra).

### 2B — Test
- **4 `test.fail()` residui** in `e2e/` (offline). Vanno rieseguiti e tolti **solo dopo averli visti
  passare**: toglierli sulla fiducia li rende asserzioni finte.
- **La e2e non è in CI.** Serve un servizio Postgres nel job. Da aggiungere come passo non bloccante
  prima, bloccante poi.
- **Aree e2e deliberatamente scoperte**: presenze/timbrature, portale, turni, ferie, import fatture.
  Richiedono geolocalizzazione simulata e dati di seed che non ci sono.
- **Promuovere `entraCome()`** in `src/test/integration/auth-mock.ts`: da quando `withAuth` fa valere
  `mustChangePassword`, `loginAs` non basta più (403) e l'helper è duplicato in ~5 file.
- Soglie di coverage nello script npm invece che in `vitest.config.ts`.

### 2C — Qualità
- **1 deroga React residua**, dichiarata e cercabile: `AttendanceSection` (`eslint-disable-next-line`
  con motivazione). Scioglierla = spostare `hasLoadedFromSchedule` nel form della chiusura.
- **9 vulnerabilità moderate** non risolvibili senza downgrade major (albero opzionale di
  firebase-admin, exceljs/uuid). Documentate in `scripts/audit-ratchet.mjs`.
- `next` 16.1.6 → 16.3.0 è entrato senza un giro in staging: candidato a una verifica dedicata.
- Scrubbing PII di Sentry duplicato in 3 file: unificarlo in `src/lib/`.
- `eslint.config.mjs` non ignora `coverage/`: se generata in locale produce warning fantasma.
- **`next build --webpack` fallisce** per simboli non consentiti esportati da
  `api/luoghi-lavoro` e `api/promemoria-timbratura`.
- La classe `scrollbar-hide` **non è definita da nessuna parte**: è inerte dove è usata.
- Passo CI per `knip` (il pacchetto è installato, lo script c'è, manca il passo).

### 2D — Offline (limiti dichiarati, non difetti nuovi)
- La **modifica** di una chiusura già sul server non si accoda (la coda sa creare, non modificare).
- Gli **elenchi offline** non sono consultabili: le GET sono NetworkOnly e `cachedClosures` non lo
  legge nessuno. *La promessa è già stata tolta dalla pagina, non reintrodurla senza la funzione.*
- Una chiusura **rifiutata definitivamente** resta in coda col motivo scritto, ma **non c'è una
  schermata che la mostri**: si vede solo il badge «N in attesa».
- I documenti finiscono nella cache `others` (max 32 voci) invece che in `pages`: il matcher di
  `@serwist/next` guarda un header che le navigazioni non hanno. È a monte, funziona, ma non è dove
  ci si aspetterebbe.

### 2E — Codice morto e residui
- **`/api/prima-nota/versamento/route.ts` esiste ancora** ed è orfana: duplica il percorso corretto
  dei trasferimenti. Da cancellare.
- Pattern di sfondamento mobile (A8-UI-007) su **~9 pagine** non ancora corrette (turni,
  riconciliazione, presenze, movimenti…). Criterio giusto: **`main.scrollWidth <= main.clientWidth`,
  NON quello sul body** (in quest'app il body non scrolla mai: la misura sul body è verde a vuoto).
  E il colpevole va **misurato, non dedotto**: sullo scadenzario non era la tabella (shadcn la
  avvolge già) ma la riga delle azioni dell'intestazione.
- `InvoiceDetail.tsx` — modifica di 3 righe non verificata sul browser (dichiarata).
- **Una funzione che dichiari i dipendenti di `CashStation`**: se un domani si aggiunge un altro
  figlio con `onDelete: Restrict`, il PUT delle chiusure torna a rispondere 500 nello stesso modo.

---

## PRIORITÀ 3 — Verifiche in produzione (nessun agente può farle)

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
URL=$(grep -m1 '^DATABASE_URL=' ~/Desktop/accounting/.env | cut -d= -f2- | tr -d '"')

# 1. Timbrature orfane oltre la finestra delle 24h (query completa nella relazione F3)
psql "$URL" -tAc "BEGIN TRANSACTION READ ONLY;
  SELECT count(*) FROM attendance_records a
  WHERE a.punch_type='IN' AND a.punched_at < now() - interval '24 hours'
    AND NOT EXISTS (SELECT 1 FROM attendance_records b
      WHERE b.staff_id=a.staff_id AND b.punch_type='OUT' AND b.punched_at > a.punched_at);
  ROLLBACK;"

# 2. Esiste la riga di configurazione delle presenze?
#    Se manca, i controlli sulla posizione sono spenti IN SILENZIO.
psql "$URL" -tAc "BEGIN TRANSACTION READ ONLY; SELECT count(*) FROM attendance_policies; ROLLBACK;"
```

**3. Sentry riceve davvero?** Le variabili sono configurate (`SENTRY_DSN`,
`NEXT_PUBLIC_SENTRY_DSN`) e il codice è in produzione, ma **nessuno ha ancora visto un errore
arrivare**. Aprire sentry.io, progetto `4511870340300880`, e verificare che compaia qualcosa nelle
ore di uso normale. Se dopo un giorno è vuoto, indagare.

**4. Le notifiche push arrivano davvero a un telefono?** Le chiavi VAPID sono su Railway e la catena
è stata dimostrata in laboratorio (payload decifrato, service worker che mostra la notifica), ma
**non è mai stata provata su un telefono vero**. Ogni dipendente deve attivarle **una volta** dal
portale: le vecchie iscrizioni erano token di un sistema mai funzionante e non sono recuperabili.

---

## PRIORITÀ 4 — Decisioni che spettano al committente

Nessuna di queste è un difetto: sono scelte che il codice non può fare da solo.

| # | Decisione |
|---|---|
| 1 | **Chi crea `InitialBalance` il 1° gennaio** (riporto d'anno). Oggi `saldi.ts` ripiega sulla riga più recente disponibile, che a gennaio è quella dell'anno prima |
| 2 | **Tabella `register_balances`**: mai scritta da alcun codice, e da W2 **nessuno la legge più**. Il DROP è ora senza rischi |
| 3 | **Esistono `Payment` di tipo `ALTRO` in entrata?** Se sì serve un campo direzione esplicito invece di dedurla |
| 4 | **`budget.delete` è una cancellazione definitiva** su un modello che ha il soft delete: `BudgetLine` non ce l'ha, quindi le righe resterebbero orfane visibili. Allineare o lasciare |
| 5 | **Il PATCH della scadenza scarta in silenzio `tipo` e `valuta`**: la UI lascia credere di poter cambiare direzione, il server non applica |
| 6 | **I ricavi per categoria/conto restano a zero** finché le scritture di chiusura non portano un conto di ricavo. Oggi `unassignedRevenue` misura quanto manca. Imputare in `generateJournalEntriesFromClosure` o mostrare il KPI in UI? |
| 7 | **Il margine del budget è cambiato** rispetto a prima: ora include i costi bancari che mancavano. Più basso e più vero — il titolare deve saperlo |
| 8 | **I movimenti nascosti** ora escono dai saldi in modo uniforme (prima `cashflow/projection` li escludeva e i saldi li includevano). Ratificato, ma è una scelta di prodotto |
| 9 | **Il portale ha 8 voci** contro le 5 delle linee guida: raggruppamento «Altro»? |
| 10 | **Lo Switch shadcn è 32×18px**, sotto i target touch: è la primitiva condivisa di tutta l'app |
| 11 | **La seconda DELETE ora risponde 404** invece di `{success:true}` su 7 route. Più corretto, ma se l'interfaccia mostra un errore rosso a chi fa doppio clic va ammorbidito |
| 12 | **Un trasferimento compare come due righe** in prima nota («Uscita» in cassa, «Versamento» in banca): `deriveEntryType` deduce il tipo dalla singola riga. Nessuna regressione, ma è una lettura confondente |
| 13 | **Le notifiche push sono state implementate due volte** da due sessioni. È stata tenuta la versione più ampia (con il fix del service worker) e presa da loro la modifica pulita dello schema. Vale la pena decidere **come si assegnano i perimetri fra sessioni parallele**, perché questo è già costato lavoro doppio |

---

## PRIORITÀ 5 — Igiene operativa

```bash
# Il worktree dell'integrazione è interamente confluito in main: si può rimuovere
git -C ~/Desktop/accounting worktree remove ~/Desktop/accounting-wt/integrazione
git -C ~/Desktop/accounting worktree prune
```

⚠️ **Il worktree `~/Desktop/accounting-presenze` è fermo a un `main` di 26+ commit fa** (`54f0d3e`
contro `35cf013`). Se quella sessione riparte da lì senza aggiornare, lavorerà su una base che non
esiste più — ed è proprio la sessione che dovrà correggere i finding sulle presenze. **Avvisarla.**

---

## 2. Trappole d'ambiente — impararle costa ore

Tutte verificate sul campo. Ognuna produce un errore fuorviante che porta a cercare un bug
inesistente nel codice.

1. **Node 22 obbligatorio**: `source ~/.nvm/nvm.sh && nvm use 22` prima di ogni npm/npx. Il Node di
   sistema (v25) fa fallire npm.
2. **`prisma db push --skip-generate` NON esiste in Prisma 7**: stampa l'help e **non esegue nulla**,
   lasciando il database vuoto senza errore evidente.
3. **Test di integrazione in parallelo**: sempre `TEST_DB_SUFFIX=<nome>`. Senza, due suite si
   distruggono il database a vicenda. Sintomi fuorvianti: *«la tabella roles non esiste»* o
   fallimenti **intermittenti** nei test di concorrenza.
4. **`.env` punta alla PRODUZIONE** (Supabase). Nei worktree non c'è: crearne uno locale temporaneo
   se serve il dev server, e **cancellarlo**.
5. **PostgreSQL locale**: `127.0.0.1:5433`, utente `nicolascarpa`, trust. Client in
   `/opt/homebrew/opt/postgresql@16/bin`. **Ma per parlare con Supabase (17.6) serve libpq 18**:
   `/opt/homebrew/opt/libpq/bin/` — il client 16 rifiuta con «server version mismatch».
6. **`ENCRYPTION_KEY` di test**: 32 byte **prima** della codifica base64. Una chiave di 64 caratteri
   esadecimali decodifica a 48 byte e produce falsi `Invalid key length`.
7. **Colonne che non esistono dove ci si aspetta**: `suppliers` non ha `venue_id`; `payments` ha
   `data_esecuzione` e non `data_scadenza`; `daily_closures` non ha `created_by`.
8. **`npm install --no-package-lock` distrugge l'ambiente**: ignora il lockfile e **ri-risolve
   l'intero albero**. Sintomi che sembrano difetti del codice: 40 falsi errori di lint, e **118 test
   di integrazione rossi** con `The column undefined$1undefined does not exist`. Per uno strumento
   non installato: `npx <nome>`, oppure `npm install --no-save <nome>` **senza** quel flag.
9. **`set -e` NON funziona in questo ambiente**: dopo un comando fallito la catena prosegue. Un gate
   scritto in sequenza può stampare «build: OK» pur avendo un passo rosso in mezzo. **Usare
   `./scripts/gate.sh <percorso> <suffisso>`**, che controlla ogni passo e stampa un verdetto unico.
10. **`git checkout -- <file>` su un fix non committato lo cancella senza errore.** Committare prima,
    sperimentare dopo.
11. **Confronti git fuorvianti**: un ramo derivato prima di un merge mostra il lavoro altrui come
    «cancellato». Confrontare sempre col **proprio** `git merge-base`, non con la punta attuale.
12. **`next dev` riscrive da solo un blocco in fondo a `CLAUDE.md`**: comparirà come modifica non
    committata in ogni worktree. Innocuo. Non committarlo perché «lo dice il file».
13. **Il campo di login si chiama «Username» e contiene l'email.** Gli utenti del seed nascono con
    `mustChangePassword=true`: azzerare il flag sul DB **locale** per navigare.
14. **`localhost` può risolvere a IPv6** mentre il dev server ascolta su IPv4: per Playwright usare
    `E2E_BASE_URL=http://127.0.0.1:<porta>`.
15. **Mai esportare `ANTHROPIC_API_KEY` in shell**: incidente da 8,73 $ del 6 agosto. Vitest **non**
    carica `.env` in `process.env` (verificato), quindi i test non la leggono dal file.

---

## 3. Il metodo che ha funzionato — non improvvisarne un altro

- **Worktree isolati + proprietà esclusiva dei file**: nessun file appartiene a due agenti della
  stessa ondata; ogni commit dichiara `Files-Owned:`; il lead verifica con `git diff --stat`.
  **Anche i sotto-agenti**: farli scrivere nello stesso albero produce misure inaffidabili e, con un
  comando git di mezzo, cancella lavoro.
- **Merge sequenziale con gate completo dopo ognuno.** Se il gate cade, il colpevole è per
  costruzione l'ultimo merge → `git revert -m 1`, l'agente rientra in coda. **Il lead non corregge
  mai a mano sul ramo di integrazione**; i conflitti li risolve l'agente che conosce la semantica.
- **Test-first**: prima il test rosso che riproduce il difetto, poi il fix.
- **Verifica per inversione, fatta dal lead**: rimettere il codice pre-fix e controllare che i test
  falliscano. È l'unico modo per sapere se un verde significa qualcosa. **Committare prima di
  invertire.**
- **Il verde non basta: controllare che il CONTEGGIO dei test sia quello atteso.** Un test che
  sparisce non fa fallire niente, fa solo scendere un numero che nessuno guarda.
- **Un risultato negativo non è una smentita finché non si sa cosa si stava cercando.** (Il lead non
  riusciva a riprodurre uno sbilancio su 200.000 combinazioni perché generava pesi dello stesso
  ordine di grandezza: la condizione non poteva scattare.)
- **Chiedere agli agenti di contestare le indicazioni sbagliate.** In questa remediation è successo
  **dieci volte**, e ogni volta la segnalazione è valsa più dell'obbedienza — inclusa una **verifica
  del lead fatta male** che sembrava confermare un finding.
- **Non fidarsi del racconto, nemmeno del proprio.** Verificare sempre di persona.

---

## 4. Prompt pronti

### 4.1 — Prompt per il lead (sessione nuova)

```
Sei il lead di un'ondata correttiva sul gestionale weiss-gestionale (Next.js 16,
React 19, Prisma 7, PostgreSQL su Supabase, NextAuth v5, deploy su Railway).
È un gestionale contabile IN USO su dati reali: chiusure di cassa, prima nota,
scadenzario, fatture, presenze e stipendi.

Leggi PRIMA di agire:
- audit/PIANO-RESIDUO.md (il piano completo, con priorità e trappole)
- audit/STATO-REMEDIATION.md (come ci siamo arrivati)
- la relazione dell'area su cui lavori: audit/W5-F1/F2/F3-*.md

Metodo obbligatorio, già collaudato su sei ondate:
- worktree isolati, un agente per lotto, proprietà esclusiva dei file
- test-first: prima il test rosso, poi il fix
- verifica per inversione fatta da TE, non dall'agente
- merge sequenziale con ./scripts/gate.sh <percorso> <suffisso> dopo ognuno
- controllare il CONTEGGIO dei test, non solo il verde

Non correggere mai a mano sul ramo di integrazione. Non fidarti dei report:
verifica.
```

### 4.2 — Struttura di un brief per agente correttivo

Ogni brief che ha funzionato conteneva, in quest'ordine:

```markdown
Sei l'agente **<NOME>**. <Una riga che dice perché questo lotto conta.>
Worktree ESCLUSIVO: ~/Desktop/accounting-wt/<id>, branch <branch>, derivato da
<base>. Dipendenze già installate.

## Regole d'ambiente (violarle costa ore — sono tutte successe davvero)
<le trappole rilevanti dalla §2 di questo documento, non tutte: quelle che lo
riguardano. Sempre incluse: Node 22, TEST_DB_SUFFIX, mai --no-package-lock,
mai comandi contro la produzione, git checkout che cancella, set -e che non
funziona, il conteggio dei test.>

## File di tua proprietà ESCLUSIVA
<elenco esplicito>

VIETATO: <elenco esplicito, con i file degli altri agenti attivi nominati uno
per uno e il motivo>. Se un fix richiede un file non tuo: FERMATI e segnalalo.

## Il difetto, verificato dal lead
<file:riga, snippet, conseguenza concreta con numeri, e come è stato verificato>

## Obiettivi (test-first: PRIMA il test rosso, POI il fix)
<numerati, con il criterio di riuscita esplicito per ciascuno>

## Consegna
- Commit convenzionali in italiano con trailer `Files-Owned:`. Niente merge,
  niente push.
- Gate finale verde: `./scripts/gate.sh . <suffisso>`.
- Report finale ≤30 righe (MANDALO SEMPRE via messaggio: senza report non
  integro): cosa hai cambiato, evidenza test-first (rossi→verdi), conteggi del
  gate, file toccati, dubbi aperti.

**Se una mia indicazione si rivela sbagliata sui fatti, FERMATI e dimmelo invece
di eseguirla**: in questa remediation è già successo dieci volte e ogni volta la
segnalazione è valsa più dell'obbedienza.
```

### 4.3 — Aggiunta per i lotti che toccano le presenze

```
⚠️ Il modulo presenze è in mano a una sessione parallela
(~/Desktop/accounting-presenze). Prima di toccare src/lib/attendance/** o
src/components/attendance/**, verifica con `git -C ~/Desktop/accounting-presenze
diff --name-only $(git merge-base HEAD main) HEAD` che non ci stia lavorando in
questo momento, e accordati col lead.

Contesto: il motore di calcolo (timekeeping-engine.ts) è la parte migliore del
progetto — puro, 139 test verdi, casi limite verificati per esecuzione. I difetti
stanno tutti AI BORDI e sono tutti SILENZIOSI. Non riscrivere il motore.
```

### 4.4 — Aggiunta per i lotti che toccano lo schema

```
`prisma/schema.prisma` non è tuo. Se ti serve una modifica, FERMATI e chiedi un
micro-slot spiegando perché. Se concesso: un commit dedicato SOLO allo schema,
trailer `Files-Owned: prisma/schema.prisma`, motivazione nel corpo, e nessun
altro modello toccato (una terza sessione lavora sui centri di costo).

Dopo la baseline delle migrazioni (PRIORITÀ 0) la modifica va fatta con
`prisma migrate dev --name <nome>`, MAI con `db push`.
```

### 4.5 — Aggiunta per i lotti d'audit (sola lettura)

```
## REGOLA PRIMA, NON NEGOZIABILE: NON CORREGGERE NULLA
L'unica cartella in cui puoi scrivere è `audit/`. Se trovi un difetto grave lo
DOCUMENTI, non lo aggiusti: la correzione sarà un'ondata a parte, con test-first
e verifica per inversione, e mescolare le due cose rovina entrambe.

Ogni finding deve avere: file:riga, snippet, conseguenza concreta («cosa succede
a chi usa il gestionale», con numeri), gravità P0/P1/P2/P3, e un passo di
verifica riproducibile. NESSUN FINDING SENZA PROVA: preferisco dieci finding
certi a quaranta plausibili. Ciò che è fatto bene: una riga e avanti — mi serve
sapere dove NON tornare.
```

---

## 5. Comandi di riferimento

```bash
# Gate completo (il percorso è OBBLIGATORIO di proposito)
./scripts/gate.sh . <suffisso-db>

# Censimento dell'autorizzazione sulle route
node scripts/check-route-auth.mjs

# I due cricchetti
node scripts/strict-ratchet.mjs      # baseline 24, può solo scendere
node scripts/audit-ratchet.mjs       # 0 critical / 0 high, è una barriera

# Test end-to-end (servono dev server e DB seedato — istruzioni in e2e/README.md)
E2E_BASE_URL=http://127.0.0.1:3012 npx playwright test

# Riproduzione dello sbilancio di arrotondamento
node audit/prova-F2-ALL-003.mjs
```
