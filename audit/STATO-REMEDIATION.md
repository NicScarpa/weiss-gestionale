# Stato della remediation — documento di continuità

**Ultimo aggiornamento:** 7 agosto 2026 · **Scopo:** riprendere il lavoro da zero senza ricostruire
il contesto. Se stai leggendo questo file in una sessione nuova, **leggilo tutto prima di agire**.

---

## 1. In una pagina

Un audit completo (8 agenti, report in `audit/A1..A8-*.md`) ha diagnosticato ~112 problemi nel
gestionale contabile di Weiss Cafè. Da lì è nato un piano di remediation in 6 ondate, di cui **tre
sono complete e verificate** (W0 fondazioni, W1 fix contabili critici, W2 numeri/import/qualità/UI)
e **tre restano da fare** (W3, W4, W5).

**I tre problemi critici sono risolti (W1). Con la W2:** saldi, budget e cash-flow rispondono la
stessa cifra (con un test permanente che lo pretende), gli import sono atomici e idempotenti, Sentry
è attivo, la CI è bloccante, e chiusura/portale/tabelle funzionano da telefono a 390px.

Tutto il lavoro vive sul branch `remediation/integrazione`, **non è ancora su `main`** per scelta
del committente: si porta su main solo a revisione completata.

---

## 2. Dove sta il lavoro

| Cosa | Dove |
|---|---|
| **Ramo con tutto il lavoro** | `remediation/integrazione` (worktree `~/Desktop/accounting-wt/integrazione`) |
| Base di partenza | `main` = `fb99dce` |
| Punti di rollback | tag `remediation/pre-W0`, `remediation/pre-W2` |
| Fine ondate | tag `remediation/W0-completa`, `remediation/W1-completa`, `remediation/W2-completa` |
| Report dell'audit | `audit/*.md` + `audit/screenshots/` (committati sul ramo) |
| Piano approvato | `~/.claude/plans/cryptic-wandering-flute.md` |
| Screenshot verifica mobile W2 | `~/Desktop/accounting/.playwright-mcp/b5/` (gitignored, prima/dopo a 390px) |

**Worktree attivi**: `integrazione` più i quattro della W3 (`c1-auth`, `c2-orfani`, `c3-moduli-a`,
`c4-moduli-b`). Quelli di W0/W1/W2 e `c0-vulnerabilita` sono stati rimossi dopo l'integrazione.

**ATTENZIONE — tre sessioni parallele lavorano sullo stesso repository** (stato al 7 ago, ore 18):
- `~/Desktop/accounting-presenze` su `presenze/chiusura-ore-timbrate` — **non toccarlo**;
- `~/Desktop/accounting` (worktree principale) su **`conti/piano-v4`**, che ha
  `prisma/schema.prisma` **modificato e non committato**: aggiunge `CostCenter`, l'enum
  `CostCenterRule` e campi su DailyClosure, DailyExpense, Account, JournalEntry, ScheduleRule,
  AuditLog (56 righe, tutte additive). **Non tocca `PushSubscription`**, quindi non collide con il
  micro-slot concesso a C3 in W3; ma quando questi rami convergeranno lo schema andrà riconciliato
  con attenzione. È anche il motivo per cui la baseline delle migrazioni (§5 n.1) diventa ogni
  giorno più urgente.

---

## 3. Fatto e verificato

### W0 — Fondazioni (4 agenti)
Guard anti-produzione sui comandi npm · 8 indici unici parziali (`prisma/migrations/post-push/constraints.sql`) ·
harness di integrazione su PostgreSQL locale · censimento read-only dei dati corrotti.

### W1 — Fix contabili critici (3 agenti)
P0 segno pagamenti (il pagamento ora scarica la banca, non ripetibile) · P0 chiusura validata
(la correzione rigenera le scritture in transazione) · scadenzario con una sola macchina a stati
(`src/lib/scadenzario/stato-schedule.ts`), tetto di capienza, sovrapagamento vietato ·
`src/lib/money.ts` unico modulo per l'aritmetica del denaro.
Verifica per inversione: 26 test rossi sul codice pre-fix.

### W2 — Numeri, import, qualità, UI (5 agenti + 2 seconde passate) — chiusa il 7 agosto
- **B1-IMPORT**: import fatture atomico (fattura+righe+scadenze in una `$transaction`, P2002 →
  risposta idempotente) e deduplica estratti conto per occorrenza (`auto:<sha256>:<n>`, compatibile
  con le impronte vecchie); `sortBy` a whitelist. **B1 aveva introdotto un byte NUL letterale nel
  sorgente** (git lo trattava come binario): corretto con escape, impronta dimostrata identica.
- **B2-NUMERI** (il lotto più pesante): `src/lib/saldi.ts` fonte unica dei saldi (InitialBalance
  dell'anno + movimenti dal 1/1; se manca la riga dell'anno si riporta la più recente); `/api/cashflow/summary`
  non risponde più 500; budget actual da `JournalEntry` (non più `DailyExpense`); `pagamenti/summary`
  senza SQL grezzo (rispetta soft-delete, contatore `daApprovare` funzionante); **`cashflow/projection`
  aveva i segni invertiti (P1)** — corretto, apertura da `saldi.ts`; `budget/confronto` allineato
  all'aggregatore senza terza copia; primo paint dei saldi corretto; **il verso lo decide la natura
  del conto**, non la categoria; KPI `unassignedRevenue` in entrambe le viste; test permanente
  `src/test/integration/quadratura.itest.ts` (saldi = budget = cash-flow, per sempre).
- **B3-QUALITÀ**: Sentry inizializzato (l'installazione era a metà: 3 config mai caricati — da
  @sentry/nextjs v8 serve `instrumentation.ts`, e Turbopack ignora il config client legacy);
  scrubbing PII testato; degradazione silenziosa senza DSN; CI senza `continue-on-error` (coverage
  con soglia 40%, `audit-ratchet` con baseline critical 5 / high 16); `strict-ratchet` baseline 29.
- **B4-UI-SCADENZARIO**: un solo POST su click multipli (guardia con ref sincrono); errore server →
  toast e form aperto coi dati; **date come giorni civili `yyyy-MM-dd`** (prima slittavano di un
  giorno via UTC); primi test di componente del repo (montaggio con createRoot+act di React 19).
- **B5-UI-MOBILE**: chiusura cassa, portale, tabelle e sidebar usabili a 390px, verificati su browser
  vero con misure prima/dopo (es. tabella pagamenti 767→326px); griglia presenze della chiusura a
  schede sotto `sm`; nomi accessibili sulla rail. Nota tecnica: i trigger Select shadcn sono
  `w-fit whitespace-nowrap` → serve `min-w-0` sulla cella; l'altezza va su `data-[size=default]:h-11`.

**Metodo di verifica (ogni lotto)**: inversione — codice pre-fix ripristinato, test rieseguiti.
Rossi ottenuti: B4 14/14 · B2 prima passata 24/37 (13 verdi = regressione dichiarata) · B1 13/20 ·
B2 seconda passata 11/13. B5 verificato con misure browser (nessun test, dichiarato).

**Gate finale W2 su `remediation/integrazione`**: tsc 0 errori · lint 0 errori (77 warning, da 81) ·
**809 test unit** (52 file) · **138 test di integrazione** (21 file, erano 68) · strict 29 (da 35) ·
audit critical 5 / high 16 alla baseline · build OK.

---

## 4. Da fare — ondate rimanenti

Dettaglio in `~/.claude/plans/cryptic-wandering-flute.md` §4.

### W3 — Auth, orfani, moduli (4 agenti)
- **C1-AUTH**: `withAuth` sopra i `requireAuth`/`requireRole` esistenti; 17 route finanziarie senza
  guard di ruolo; `venueId` sempre da sessione. Aggiungere al suo perimetro: tetto sul `limit` di
  paginazione (A5-API-010, B1 ha solo tolto il NaN).
- **C2-ORFANI**: 26 route senza chiamante; `calculations.ts`, `errors.ts`, `api-validation.ts` da
  cancellare; `formatCurrency` definita 15 volte.
- **C3-MODULI-A**: notifiche push + dark mode.
- **C4-MODULI-B**: UI previsioni cash-flow + spese ricorrenti. **Suo anche il fix di
  `CashFlowSummaryCards.tsx`** (stampa importi in euro con `%`, segnalato da B2).
- Candidati emersi in W2 da assegnare in W3: race di `createSupplierFromData` (`src/lib/sdi/matcher.ts`,
  check-then-act fuori transazione, P2002 → messaggio fuorviante, segnalato da B1); helper
  "Date locale → yyyy-MM-dd" in `src/lib/timezone.ts` (B4 usa `format()` date-fns in locale);
  `scadenzario/[id]/page.tsx` che ingoia gli errori (il dialog di modifica si chiude anche su PATCH
  fallito); pattern A8-UI-007 sulle ~9 pagine non ancora corrette; unificare lo scrubbing PII Sentry
  (oggi in 3 file); ignore di `coverage/` in `eslint.config.mjs`; soglie coverage in `vitest.config.ts`
  invece che nello script npm.

### W4 — Coda seriale (mai in parallelo)
- **D1-SOFTDELETE**: estensione Prisma su `findUnique`/`update` (~40 call site).
- **D2**: check bloccanti definitivi in CI, quadratura finale, **aggiornamento di
  `audit/00-REGISTRO.md` con gli esiti** (nota già acquisita: A8-UI-005 era già risolto dal commit
  `b495446` di gennaio; il criterio giusto per l'overflow è `main.scrollWidth`, non il body).

### W5 — Audit delle aree mai esaminate (sola lettura)
`allocation-service.ts`, `line-categorization/` (SDK Anthropic in produzione), memoria
fornitore-prodotto, modulo presenze NoBadge. **Presenze: audit sì, fix no** finché è attiva la
sessione parallela su `presenze/regole-orario`.

---

## 5. Questioni aperte che richiedono il committente

| # | Questione | Stato |
|---|---|---|
| 1 | **Baseline migrazioni Prisma** | RIMANDATA, ma da fare **prima dei dati veri** (5 minuti a DB vuoto) |
| 2 | Bonifica dati storici | DECADUTA (non ci sono dati reali); script di censimento pronti |
| 3 | Merge su `main` | A revisione completata, per decisione del committente |
| 4 | Chi crea `InitialBalance` il 1° gennaio | Aperta; nel frattempo `saldi.ts` riporta l'ultima riga disponibile |
| 5 | Tabella `register_balances` mai scritta: eliminarla? | Aperta; da W2 **nessun codice la legge più** — il DROP è ora senza rischi |
| 6 | `Payment` di tipo `ALTRO` in entrata? | Aperta, emergerà dal censimento |
| 7 | Cron `auto-clockout` solo su `vercel.json`, produzione su Railway | **CHIUSA — IL FINDING ERA SBAGLIATO** (verificato 7 ago sui log Railway): esiste un servizio dedicato **`cron-presenze`** che gira ogni ~15 minuti e chiama *entrambi* gli endpoint (`/api/promemoria-timbratura/cron` e `/api/attendance/auto-clockout`); ultima esecuzione riscontrata `2026-08-07T15:45Z`, risposte `success:true`. `vercel.json` è un residuo inerte che ha ingannato l'audit: **va cancellato** (assegnare a C2-ORFANI in W3) |
| 8 | **`SENTRY_DSN` da configurare su Railway** e forzare un errore di prova | **IN CORSO** (7 ago): verificato che sul servizio `weiss-gestionale` la variabile **non esiste** (le variabili presenti sono DATABASE_URL, AUTH_SECRET, NEXTAUTH_*, ENCRYPTION_KEY, ANTHROPIC_API_KEY, CRON_SECRET, UPLOAD_ROOT, NEXT_PUBLIC_*). Non esiste alcun account Sentry: nessun DSN in codice, storia git o `.env`. Serve che il committente crei il progetto su sentry.io e fornisca il DSN; poi `railway variables --service weiss-gestionale --set 'SENTRY_DSN=...' --set 'NEXT_PUBLIC_SENTRY_DSN=...'` |
| 9 | **5 vulnerabilità critical + 16 high nelle dipendenze di produzione** | **CHIUSA** (7 ago, merge `a0cd25f`): ora **0 critical / 0 high**, cricchetto CI a barriera. `jspdf` 4.2.1, `next-auth` beta.32, `firebase-admin` 13.10.0 (dentro il range, trascina `websocket-driver` 0.7.5 e `protobufjs` 7.6.5), `next` 16.3.0, `axios` 1.19.0; unico `overrides`: `js-yaml` 4.3.1 perché `swagger-ui-react` la pinna esatta. **Login verificato a mano dal lead** (dev server locale, sessione JWE valida su pagina protetta) più verifica indipendente dell'agente. Restano 9 moderate non risolvibili senza downgrade major: documentate nello script. Da tenere d'occhio: `next` 16.1.6→16.3.0 è il candidato per un giro in staging; l'override su `js-yaml` va tolto quando swagger allenterà il pin |
| 10 | **Ricavi per categoria/conto a zero** finché le scritture di chiusura non portano un conto di ricavo | **RATIFICATA** (7 ago): per ora va bene l'approccio col KPI `unassignedRevenue`; l'imputazione a conto resta per dopo |
| 11 | **Il margine del budget cambierà** (ora include i costi bancari che prima mancavano) | **RATIFICATA** (7 ago): il committente è avvisato e d'accordo |
| 12 | Movimenti nascosti fuori dai saldi in modo uniforme | Nuova (W2): decisione presa da B2, da ratificare |
| 13 | Il PATCH scadenza scarta in silenzio `tipo` e `valuta` mentre la UI lascia credere di poterli cambiare | Nuova (W2): serve decisione + modifica route |
| 14 | Portale a 8 voci (linee guida: max 5); Switch shadcn 32×18 sotto i target touch | Nuove (W2): scelte di prodotto/design system |
| 15 | Date estratto conto parse-ate nel fuso del server (`new Date(a,m,g)` → `@db.Date`) | Nuova (W2): ok finché Railway resta UTC, fragile; legata alle impronte di deduplica |
| 16 | `BankTransaction` senza legame a `BankAccount` (A3-DATA-018) | Con più conti bancari gli estratti si mescolano per sede; richiede schema |
| 17 | Fix di `PrimaNotaContext` provato dal diff, non da un test | Debito di copertura dichiarato da B2 |
| 19 | **Il versamento manuale cassa→banca scrive una sola riga invece di due** | **NUOVO P1, verificato dal lead il 7 ago.** La route orfana `/api/prima-nota/versamento` (cancellata in W3 perché senza chiamanti) creava **due** scritture in `$transaction`: `CASH` in avere + `BANK` in dare. Il percorso **vivo** — `MovimentoFormDialog` con `entryType: 'VERSAMENTO'` → `POST /api/prima-nota` — fa un solo `journalEntry.create`. Un versamento è un trasferimento a saldo netto zero: registrandone un lato solo, **il saldo totale si muove dell'intero importo**. Stessa famiglia del P0 sul segno dei pagamenti. **Attenuante importante:** la chiusura di cassa giornaliera — il percorso normale — genera correttamente le due righe (`closure-journal-entries.ts:181-211`), quindi il difetto colpisce solo i versamenti registrati a mano fuori dalla chiusura. Scoperto da C2 mentre censiva il codice orfano |
| 18 | **40 violazioni `react-hooks/set-state-in-effect`** (setState dentro effetti → render a cascata) in ~30 file: pagine di autenticazione, anagrafiche, budget, hook `useOffline` | Nuova (7 ago). Emerse per caso da un ambiente andato alla deriva (vedi §6 n.10), ma **sono difetti reali**: oggi passano come avvisi solo perché `eslint-plugin-react-hooks` è alla 7.0.1; nella **7.1.1 sono errori bloccanti**. Debito con data di scadenza: al primo aggiornamento legittimo del plugin la CI si ferma. Da pianificare come lotto a sé (candidato W4) |

---

## 6. Trappole d'ambiente — impararle costa ore

1. **Node 22 obbligatorio**: `source ~/.nvm/nvm.sh && nvm use 22` prima di ogni npm/npx.
2. **`--skip-generate` NON esiste in Prisma 7**: stampa l'help e non esegue nulla.
3. **Test di integrazione in parallelo**: sempre `TEST_DB_SUFFIX=<nome>` (un suffisso per worktree
   E per attore: se il lead verifica nel worktree di un agente attivo, suffissi diversi).
4. **`.env` punta alla produzione** (Supabase). Nei worktree nuovi `.env` non c'è affatto: crearne
   uno locale temporaneo se serve il dev server, e cancellarlo.
5. **PostgreSQL locale**: `127.0.0.1:5433`, utente `nicolascarpa`, trust; client in
   `/opt/homebrew/opt/postgresql@16/bin`.
6. **`ENCRYPTION_KEY` di test**: 32 byte prima della codifica base64.
7. **Colonne che non esistono dove ci si aspetta**: `suppliers` senza `venue_id`; `payments` con
   `data_esecuzione` e non `data_scadenza`; `daily_closures` senza `created_by`.
8. **I comandi Bash in background girano sotto zsh**: le variabili non quotate NON si spezzano in
   parole — un `git checkout $BASE -- $LISTA` fallisce come pathspec unico e i "test sul pre-fix"
   girano in realtà sul codice corrente, sembrando una verifica riuscita. Percorsi sempre espliciti.
9. **`@testing-library/react` senza `@testing-library/dom`** falliva all'import (ora la peer è
   installata, da B3): era il motivo per cui il repo non aveva test di componente.
10. **`npm install --no-package-lock` distrugge l'ambiente del worktree.** Il flag non aggiunge solo
    il pacchetto richiesto: **ignora il lockfile e ri-risolve l'intero albero** dalle forcelle di
    `package.json`. Caso reale del 7 ago (un `npm install --no-save --no-package-lock knip@5`):
    `@prisma/client` e `@prisma/adapter-pg` 7.4.1 → 7.9.1, `pg` 8.18.0 → 8.22.0, ESLint e React
    Compiler più recenti. Due sintomi, entrambi somigliantissimi a difetti gravi del codice:
    (a) **40 errori di lint `react-hooks/set-state-in-effect`** inesistenti sul ramo base (nella
    7.1.1 del plugin quell'avviso è errore); (b) **118 test di integrazione su 138 rossi** con
    `The column undefined$1undefined does not exist in the current database`, che sembra uno schema
    distrutto ed è solo disallineamento fra client Prisma e adapter.
    **Regole:** per uno strumento non installato usare `npx <strumento>`, mai installarlo; prima di
    credere a un gate rosso verificare che l'installato coincida col lockfile
    (`node -p "require('./node_modules/eslint-plugin-react-hooks/package.json').version"` → 7.0.1) e
    nel dubbio `npm ci && npx prisma generate`; **non aggirare il pre-commit con `--no-verify`** per
    far passare un gate rosso — l'hook non è rotto, sta segnalando un ambiente rotto.
    **Corollario sul metodo:** la verifica per inversione va fatta anche sull'ambiente, non solo sul
    diff. Mettere da parte le proprie modifiche non prova nulla se entrambe le esecuzioni girano
    sullo stesso `node_modules` guasto — è esattamente l'errore che ha prodotto il falso allarme.

---

## 7. Metodo di lavoro che ha funzionato

- **Worktree isolati + proprietà esclusiva dei file**; ogni commit con trailer `Files-Owned:`;
  dipendenze nuove solo via `Needs-Dep:` al proprietario di `package.json` dell'ondata.
- **Merge sequenziale con gate completo dopo ognuno**; se il gate cade → `git revert -m 1`.
- **Test-first** e **verifica per inversione fatta dal lead** (non fidarsi del report: rifare).
- **Il "verde" non basta: controllare che il CONTEGGIO dei test sia quello atteso.** Un test che
  sparisce non fa fallire niente — fa solo scendere un numero che nessuno guarda. Caso reale del
  7 ago: un agente ha perso due test appena scritti facendo `stash`/`checkout` in detached HEAD, e
  se n'è accorto solo perché i test di integrazione erano 167 invece di 169. Corollario: `git status`
  pulito non va controllato solo prima di consegnare, ma **subito dopo ogni stash o checkout**.
- **`set -e` NON funziona in questo ambiente**: dopo un comando fallito la catena prosegue. Un gate
  scritto come sequenza con `set -e` può stampare "build: OK" in fondo pur avendo un passo rosso in
  mezzo. Controllare il codice di uscita di **ogni** passo e stampare un verdetto unico
  (script pronto: vedi §7 "Gate di verifica").
- **Report standard richiesto a ogni agente** (gli agenti si fermano senza inviarlo: richiederlo
  esplicitamente): esito gate coi numeri, evidenza test-first, file toccati, dubbi aperti.
- **Estensione di proprietà mid-ondata**: lecita se decisa dal lead dopo verifica che nessun altro
  (nemmeno sessioni parallele) tocchi quei file.
- **Cercare le falle fra agenti paralleli** (es. peer dependency mancante scoperta da B4, risolta
  da B3, notificata a B5).

### Gate di verifica (comandi esatti)
```bash
cd ~/Desktop/accounting-wt/integrazione && source ~/.nvm/nvm.sh && nvm use 22
npm ci && npx prisma generate
npx tsc --noEmit && npm run lint && npm run test:run
TEST_DB_SUFFIX=int npm run test:integration
node scripts/strict-ratchet.mjs && node scripts/audit-ratchet.mjs
npm run build
```

---

## 8. Come riprendere

1. Leggi questo file per intero.
2. Leggi `~/.claude/plans/cryptic-wandering-flute.md` §4 (W3 in dettaglio).
3. Per i finding: `audit/00-REGISTRO.md` e `audit/A1..A8-*.md`.
4. Verifica lo stato: `git -C ~/Desktop/accounting worktree list` e `git log --oneline main..remediation/integrazione`.
5. Riparti dall'ondata W3 creando i worktree **da `remediation/integrazione`**; ricordati i
   candidati W2→W3 elencati al §4.
