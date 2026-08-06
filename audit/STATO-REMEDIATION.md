# Stato della remediation — documento di continuità

**Ultimo aggiornamento:** 6 agosto 2026 · **Scopo:** riprendere il lavoro da zero senza ricostruire
il contesto. Se stai leggendo questo file in una sessione nuova, **leggilo tutto prima di agire**.

---

## 1. In una pagina

Un audit completo (8 agenti, report in `audit/A1..A8-*.md`) ha diagnosticato ~112 problemi nel
gestionale contabile di Weiss Cafè. Da lì è nato un piano di remediation in 6 ondate, di cui **due
sono complete e verificate** (W0 fondazioni, W1 fix contabili critici) e **quattro restano da fare**.

**I tre problemi critici sono risolti.** Tutto il lavoro vive sul branch `remediation/integrazione`,
**non è ancora su `main`** per scelta del committente: si porta su main solo a revisione completata.

---

## 2. Dove sta il lavoro

| Cosa | Dove |
|---|---|
| **Ramo con tutto il lavoro** | `remediation/integrazione` (worktree `~/Desktop/accounting-wt/integrazione`) |
| Base di partenza | `main` = `fb99dce` |
| Punto di rollback | tag `remediation/pre-W0` |
| Fine ondata 0 | tag `remediation/W0-completa` |
| Fine ondata 1 | tag `remediation/W1-completa` |
| Report dell'audit | `audit/*.md` (15 documenti) + `audit/screenshots/` (51 immagini) |
| Piano approvato | `~/.claude/plans/cryptic-wandering-flute.md` |

**ATTENZIONE:** la cartella `audit/` **non è tracciata in git** (`?? audit/`). Contiene l'intero
audit e questo documento. Va committata o messa al sicuro, altrimenti una pulizia la cancella.

**Worktree attivi** (`git worktree list`): oltre a integrazione, ci sono i sette worktree degli
agenti (`f1-safety`, `f2-harness`, `f3-schema`, `f4-assess`, `a1-segno`, `a2-chiusure`,
`a3-scadenzario`), tutti già integrati: si possono rimuovere con `git worktree remove`.
Esiste anche `~/Desktop/accounting-presenze` su `presenze/regole-orario`: **è di un'altra sessione,
non toccarlo**. Il worktree principale `~/Desktop/accounting` è fermo sul branch obsoleto
`scadenzario/stima-data-attesa` (47 commit dietro main, già confluito).

---

## 3. Fatto e verificato

### W0 — Fondazioni (4 agenti, tutti integrati)
- **Guard anti-produzione** (`scripts/guards/assert-not-prod.ts`): `db:push`/`db:seed`/`db:reset`
  si rifiutano di partire se `DATABASE_URL` non è locale. Legge anche `.env`. `db:reset` è stato
  disinnescato (esiste `db:reset:local`). Override consapevole con `I_KNOW_THIS_IS_PROD=1`.
- **Vincoli di unicità** (`prisma/migrations/post-push/constraints.sql`, 8 indici unici parziali):
  impediscono doppia riconciliazione, doppia fattura, doppia occorrenza ricorrente, fornitori
  doppioni per P.IVA; e convertono a *parziali* gli unique che includevano i record cancellati —
  ora **una chiusura annullata non blocca più quel giorno per sempre**.
  Gli `@@unique` composti corrispondenti sono stati **rimossi** dallo schema Prisma: i `findUnique`
  su quelle chiavi sono diventati `findFirst` (già corretti in `budget/route.ts` e `chiusure/route.ts`).
- **Harness di test di integrazione** su PostgreSQL locale (`vitest.integration.config.ts`,
  `src/test/integration/**`): database veri, isolati per worker, con i vincoli applicati.
  Si rifiuta di partire se puntato a un host non locale.
- **Censimento dei dati corrotti** (`scripts/remediation/assess/**`): sola lettura garantita dal
  server (`default_transaction_read_only`), transazione read-only chiusa con rollback.

### W1 — Fix contabili critici (3 agenti, tutti integrati)
- **P0 segno pagamenti**: il pagamento eseguito ora **scarica** la banca. Prima ogni pagamento
  spostava il saldo di *due volte* l'importo nella direzione sbagliata. Operazione in transazione e
  non ripetibile (presa in carico con aggiornamento condizionale).
- **P0 chiusura validata**: correggerla ora **rigenera** le scritture di prima nota nella stessa
  transazione, con le vecchie annullate e audit log dei totali prima/dopo. Rifiuta la correzione se
  una scrittura è già riconciliata in banca. Doppia validazione concorrente impossibile.
- **Scadenzario**: una sola macchina a stati (`src/lib/scadenzario/stato-schedule.ts`) usata da tutti
  i percorsi; tetto di capienza sul movimento (un bonifico da 100 € non può più saldare 500 € di
  scadenze); sovrapagamento vietato ovunque; l'annullo riporta indietro lo stato della fattura;
  marcare SCADUTA non inventa più una data di pagamento; generazione ricorrenze idempotente;
  i movimenti riconciliati non si cancellano più (409).
- **`src/lib/money.ts`**: aritmetica del denaro in un unico modulo (unico che importa `decimal.js`).

**Metodo di verifica usato per ogni lotto:** rimettere il codice pre-fix e rieseguire i test.
Hanno fallito 5 test (pagamenti), 6 (chiusure), 15 (scadenzario) — **26 in totale**. I test
catturano davvero i difetti.

**Stato del gate su `remediation/integrazione`:** `tsc` 0 errori · lint 0 errori (81 warning
preesistenti) · **779 test unit** · **68 test di integrazione** · build OK.

---

## 4. Da fare — ondate non ancora eseguite

Dettaglio completo in `~/.claude/plans/cryptic-wandering-flute.md` §4. In sintesi:

### W2 — Numeri, import, qualità, UI (5 agenti)
- **B1-IMPORT**: idempotenza import fatture e estratti conto; transazione unica per fattura;
  due movimenti bancari reali identici devono entrare entrambi; whitelist su `sortBy`.
- **B2-NUMERI**: `src/lib/saldi.ts` unico; `/api/cashflow/summary` **oggi risponde 500** (legge una
  tabella mai scritta, cast `::uuid` su cuid, doppio indexing); budget actual da `JournalEntry` e non
  da `DailyExpense`; ricavi ripartiti per conto invece che assegnati per intero a ogni categoria;
  filtro `hidden`/soft-delete nelle query raw. Obiettivo: **saldi = budget = cash-flow**.
- **B3-QUALITÀ**: `instrumentation.ts` (Sentry **oggi non è mai inizializzato**: nessun errore di
  produzione viene registrato); togliere `continue-on-error` da CI su audit e coverage; ratchet
  strict-mode (baseline 35 errori).
- **B4-UI-SCADENZARIO**: doppio submit che salva scadenze duplicate; nessun feedback su errore;
  **data salvata un giorno indietro** (usare `src/lib/timezone.ts`).
- **B5-UI-MOBILE**: chiusura cassa inutilizzabile a 390px; voce "Chiusura" del portale fuori schermo;
  tabelle senza `overflow-x`; sidebar senza nomi accessibili.

### W3 — Auth, orfani, moduli (4 agenti)
- **C1-AUTH**: `withAuth` unico sopra i `requireAuth`/`requireRole` esistenti; **17 route
  finanziarie senza guard di ruolo** (elenco in `audit/A2-security.md`); `venueId` sempre da sessione.
- **C2-ORFANI**: 26 route senza chiamante; tipi e validazioni morte; `calculations.ts`,
  `errors.ts`, `api-validation.ts` da cancellare; `formatCurrency` oggi definita 15 volte.
- **C3-MODULI-A**: notifiche push (oggi la UI dice "attivate" e non arriva nulla) + dark mode
  (CSS pronto, nessun modo di attivarla).
- **C4-MODULI-B**: UI previsioni cash-flow (5 route CRUD mai collegate) + UI spese ricorrenti.

### W4 — Coda seriale (mai in parallelo)
- **D1-SOFTDELETE**: l'estensione Prisma copre solo 7 metodi, **non** `findUnique`/`update`:
  i record cancellati "camminano" (una chiusura soft-deleted è ancora validabile).
- **D2**: check auth/knip bloccanti in CI, soglia coverage, quadratura finale.

### W5 — Audit delle aree mai esaminate (sola lettura)
`allocation-service.ts`, `line-categorization/` (**SDK Anthropic in produzione**: prompt injection da
descrizioni XML, costi, timeout, nessun rate limit), memoria fornitore-prodotto, e **intero modulo
presenze NoBadge** (20 route, 10 modelli).
**Regola sulle presenze, decisa dal committente: audit sì, fix no** finché è attiva la sessione
parallela su `presenze/regole-orario` — i fix si consegnano come lista pronta.

---

## 5. Questioni aperte che richiedono il committente

| # | Questione | Stato |
|---|---|---|
| 1 | **Registro delle modifiche al database** (baseline migrazioni + fotografia del drift) | **RIMANDATA**, ma raccomandato **prima che il gestionale entri in uso con dati veri**: a database vuoto costa 5 minuti e non ha rischi; dopo è delicato. Comandi in `plan` §4 gate W0 |
| 2 | Bonifica dati storici | **DECADUTA**: non ci sono dati reali in produzione. Gli script di censimento restano pronti. Da riaprire solo se un censimento futuro trovasse anomalie |
| 3 | Merge su `main` | **Da fare a revisione completata**, per decisione del committente |
| 4 | Chi crea `InitialBalance` il 1° gennaio (riporto d'anno) | Aperta — la semantica del saldo diventa "iniziale dell'anno + movimenti dal 1/1 a oggi" |
| 5 | Tabella `register_balances` mai scritta da alcun codice: eliminarla? | Aperta, proposta: eliminarla dopo W2 |
| 6 | Esistono `Payment` di tipo `ALTRO` in entrata? | Aperta — emergerà dal censimento quando ci saranno dati |
| 7 | Cron `auto-clockout` configurato solo su `vercel.json` mentre la produzione è su Railway | **Aperta**: le timbrature non si chiudono da sole → ore e stipendi da correggere a mano. `vercel.json` ha ora **due** cron, entrambi inerti |

---

## 6. Trappole d'ambiente — impararle costa ore

1. **Node 22 obbligatorio**: `source ~/.nvm/nvm.sh && nvm use 22` prima di ogni npm/npx. Il Node di
   sistema (v25) fa fallire npm (`engine-strict=true`).
2. **`--skip-generate` NON esiste in Prisma 7**: `prisma db push --skip-generate` stampa l'help e
   **non esegue nulla**, lasciando il database vuoto senza errore evidente. Usare `npx prisma db push`.
3. **Test di integrazione in parallelo**: più copie di lavoro condividono lo stesso PostgreSQL. Usare
   sempre `TEST_DB_SUFFIX=<nome>` (es. `TEST_DB_SUFFIX=a1 npm run test:integration`), altrimenti due
   suite si distruggono il database a vicenda. Il sintomo è fuorviante: *"la tabella `roles` non
   esiste"* oppure fallimenti **intermittenti** nei test di concorrenza.
4. **`.env` punta alla produzione** (Supabase). Il guard di W0 protegge i comandi npm, ma non un
   comando `psql` scritto a mano.
5. **PostgreSQL locale**: `127.0.0.1:5433`, utente `nicolascarpa`, auth trust. Client in
   `/opt/homebrew/opt/postgresql@16/bin` (non nel PATH di default).
6. **`ENCRYPTION_KEY` di test**: devono essere **32 byte** prima della codifica base64. Una chiave di
   64 caratteri esadecimali decodifica a 48 byte e produce falsi `Invalid key length` sui campi cifrati.
7. **Colonne che non esistono dove ci si aspetta**: `suppliers` non ha `venue_id` (anagrafica
   globale); `payments` non ha `data_scadenza` ma `data_esecuzione`; `daily_closures` non ha `created_by`.

---

## 7. Metodo di lavoro che ha funzionato

- **Worktree isolati + proprietà esclusiva dei file**: nessun file appartiene a due agenti della
  stessa ondata; ogni commit dichiara `Files-Owned:`; il lead verifica con `git diff --stat`.
- **Merge sequenziale con gate completo dopo ognuno**: se il gate cade, il colpevole è per
  costruzione l'ultimo merge → `git revert -m 1`, l'agente rientra in coda. **Il lead non corregge
  mai a mano su main.**
- **Test-first**: prima il test rosso che riproduce il bug, poi il fix.
- **Verifica per inversione**: rimettere il codice pre-fix e controllare che i test falliscano.
  È l'unico modo per sapere se un test verde significa qualcosa.
- **Diffidare dei confronti**: un ramo derivato prima di un merge mostra il lavoro altrui come
  "cancellato". Confrontare sempre col **proprio** punto di derivazione (`git merge-base`).
- **Falle di integrazione fra agenti paralleli**: due agenti corretti possono produrre un insieme
  rotto (l'harness non applicava i vincoli creati dall'altro agente). Cercarle esplicitamente.

### Gate di verifica (comandi esatti)
```bash
cd ~/Desktop/accounting-wt/integrazione && source ~/.nvm/nvm.sh && nvm use 22
npm ci && npx prisma generate
npx tsc --noEmit && npm run lint && npm run test:run
TEST_DB_SUFFIX=int npm run test:integration
npm run build
```

---

## 8. Come riprendere

1. Leggi questo file per intero.
2. Leggi `~/.claude/plans/cryptic-wandering-flute.md` (il piano approvato, con le ondate in dettaglio).
3. Per il dettaglio di un finding: `audit/00-REGISTRO.md` (tabella unica) e `audit/A1..A8-*.md`.
4. Verifica lo stato: `git -C ~/Desktop/accounting worktree list` e `git log --oneline main..remediation/integrazione`.
5. Riparti dall'ondata W2 creando i worktree **da `remediation/integrazione`** (non da `main`).
