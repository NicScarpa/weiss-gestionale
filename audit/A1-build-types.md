# A1 — Build & Type Integrity

**Agente:** A1 · **Data:** 2026-08-06 · **Base:** `audit/01-BASELINE.md` + log in `audit/baseline-logs/`
**Scope:** config di root (tsconfig, eslint, next.config, vercel.json, prisma.config, vitest.config, postcss), `.github/workflows/ci.yml`, `.husky/pre-commit`, `src/types/**`, config Sentry.

## Tabella riassuntiva

| ID | Sev | Confidenza | Titolo |
|----|-----|------------|--------|
| A1-BUILD-001 | P1 | Certa | Strict mode rotto (35 errori) e mai imposto: né CI, né husky, né script |
| A1-BUILD-002 | P1 | Certa | Bug reale nascosto dal non-strict: `/api/cashflow/summary` mostra 5 KPI su 6 sempre sbagliati |
| A1-BUILD-003 | P2 | Certa | `ConfidenceBadge` crasha a ogni render (doppio indexing) — oggi salvo solo perché è codice morto |
| A1-BUILD-004 | P1 | Certa | Sentry mai inizializzato: i 3 file `sentry.*.config.ts` non sono caricati da nessuno |
| A1-BUILD-005 | P1 | Probabile | Cron `auto-clockout` definito in `vercel.json` ma la produzione è su Railway: non gira mai |
| A1-BUILD-006 | P1 | Certa | CI su Node 20, produzione e engines su 22, README dice 18+ |
| A1-BUILD-007 | P2 | Certa | CI senza denti: coverage e `npm audit` `continue-on-error` (con 7 CVE critiche), nessun gate E2E |
| A1-BUILD-008 | P2 | Certa | Service worker Serwist non generato con Turbopack: PWA/offline-sync presenze senza SW |
| A1-BUILD-009 | P2 | Certa | 39 `eslint-disable` in `src/`: 22 zittiscono `no-explicit-any`, 11 `exhaustive-deps` |
| A1-BUILD-010 | P2 | Certa | 81 warning ESLint senza `--max-warnings`: il debito può solo ricrescere |
| A1-BUILD-011 | P2 | Certa | 6 file di tipi morti in `src/types/`, coppie duplicate e divergenti (già segnalate a feb 2026) |
| A1-BUILD-012 | P3 | Certa | File `.bak` tracciati in git |
| A1-BUILD-013 | P2 | Certa | 3 dipendenze usate ma non dichiarate; `e2e/` tracciata ma ineseguibile e nascosta a tsc |
| A1-BUILD-014 | P3 | Certa | 5 export duplicati (knip) |
| A1-BUILD-015 | P2 | Certa | next.config: CSP con `unsafe-eval`/`unsafe-inline`; convenzione `middleware` deprecata da Next 16 |

---

### [A1-BUILD-001] Strict mode rotto (35 errori) e mai imposto: né CI, né husky, né script
- **Severità:** P1
- **Confidenza:** Certa
- **File:** `tsconfig.json:11`, `tsconfig.strict.json:7`, `.github/workflows/ci.yml:50`, `.husky/pre-commit:19`
- **Evidenza:**
  ```jsonc
  // tsconfig.json:11 — la config usata da build, CI e pre-commit
  "strict": false,
  ```
  ```
  $ grep -rn "tsconfig.strict" . --include="*.{json,yml,ts,mjs}" (esclusi node_modules/audit)
  → nessun risultato
  ```
  CI esegue `npx tsc --noEmit` (ci.yml:50) e husky idem (pre-commit:19): entrambi usano la config
  non-strict. `tsconfig.strict.json` non è referenziato da alcuno script di `package.json`, workflow o hook.
  `tsc --noEmit -p tsconfig.strict.json` → **exit 2, 35 errori** (`baseline-logs/04-tsc-strict.log`).
- **I 35 errori, per file:**

  | File | Errori | Righe | Natura |
  |------|--------|-------|--------|
  | `src/app/(portal)/portale/timbra/page.tsx` | 12 | 218–242 | TS18047/18048: `statusData`/`todayAssignment` possibly null/undefined. A runtime è protetto da un guard su variabile locale (`{todayAssignment && (`, riga 207) che il compilatore non può narroware: rumore di tipo, non bug |
  | `src/app/api/cashflow/summary/route.ts` | 4 | 49, 65 | TS7053: indexing `[0]` su oggetto già destrutturato → **bug reale**, vedi A1-BUILD-002 |
  | `src/components/cashflow/ConfidenceBadge.tsx` | 2 | 18–19 | TS7053: doppio indexing → **crash a runtime**, vedi A1-BUILD-003 |
  | `src/app/(dashboard)/fatture/page.tsx` | 2 | 127, 187 | Formatter recharts: `value` può essere `undefined` |
  | `src/components/scadenzario/aging-chart.tsx`, `src/components/staff/tabs/StatisticsTab.tsx` | 1+1 | 53, 101 | idem recharts |
  | `src/app/(dashboard)/prima-nota/layout.tsx` | 2 | 63–64 | `null` passato dove il tipo accetta solo `undefined` (`RegisterData \| undefined`) |
  | `src/app/(dashboard)/prima-nota/movimenti/page.tsx`, `regole/page.tsx` | 1+1 | 22, 23 | `color: string \| null` (Prisma) vs `color?: string` (prop): contratto null/undefined incoerente |
  | `src/app/api/cashflow/forecasts/[id]/lines/[lineId]/route.ts`, `forecasts/[id]/route.ts`, `categorization-rules/[id]/route.ts` | 1+1+1 | 41, 139, 82 | TS7053: `data[field] = body[field]` su `Prisma.*UpdateInput` — copia dinamica non tipizzata dal body (pattern mass-assignment, cross-ref A2/A3) |
  | `src/app/api/cashflow/forecasts/route.ts` | 1 | 130 | `tipo: string` dove Prisma vuole l'enum `FlowType` |
  | `src/app/api/pagamenti/route.ts` | 1 | 94 | `Date \| null` dove Prisma vuole `string \| Date` |
  | `src/components/prima-nota/movimenti/MovimentiFilters.tsx`, `pagamenti/PagamentiFilters.tsx` | 1+1 | 85, 66 | callback che non accetta `undefined` passata a prop che lo può emettere |
  | `src/components/scadenzario/payment-dialog.tsx` | 1 | 109 | `react-day-picker` senza `required`: `onSelect` può ricevere `undefined` ma lo stato è `Date` — deselezione = `setDate(undefined)` latente |
  | `src/lib/utils/username.ts` | 1 | 78 | parametro `u` implicit any (conseguenza del `prisma: ... \| any` a riga 55) |
- **Perché è un problema:** senza `strictNullChecks`/`noImplicitAny`, il compilatore non vede né i 2 bug
  reali già presenti (002, 003) né i contratti null/undefined incoerenti tra Prisma e componenti. Il file
  strict esiste dal consolidamento ma è pura intenzione: nessun processo lo esegue, quindi gli errori
  possono solo crescere. In un gestionale contabile la classe di bug che strict previene è esattamente
  quella che produce importi sbagliati (vedi 002).
- **Come verificarlo:** `source ~/.nvm/nvm.sh && nvm use 22 && npx tsc --noEmit -p tsconfig.strict.json` → exit 2, 35 errori.
- **Correzione proposta:** aggiungere uno step CI non bloccante che conta gli errori strict e fallisce se
  aumentano (ratchet); azzerare i 35 (metà è in 6 file); poi promuovere `strict: true` nel tsconfig
  principale ed eliminare il file separato.
- **Effort:** M (ratchet: S; azzeramento errori: M)

### [A1-BUILD-002] Bug reale nascosto dal non-strict: `/api/cashflow/summary` mostra 5 KPI su 6 sempre sbagliati
- **Severità:** P1 (rasenta il P0 "importi sbagliati mostrati": sono metriche previsionali derivate, non scritture contabili)
- **Confidenza:** Certa
- **File:** `src/app/api/cashflow/summary/route.ts:41-72` — consumata da `src/app/(dashboard)/cash-flow/page.tsx:40`
- **Evidenza:**
  ```ts
  const [oldBalance] = await prisma.$queryRaw`...` as Array<{ balance: bigint }>
  // oldBalance È GIÀ la prima riga: {balance}. Indicizzarla con [0] dà sempre undefined:
  const trend7gg = saldoAttuale - (oldBalance[0]?.balance ? Number(oldBalance[0].balance) : 0)
  ...
  const [movementStats] = await prisma.$queryRaw`...` as Array<{ avg_debit: number; avg_credit: number }>
  const avgDailyNet = (movementStats[0]?.avg_credit || 0) - (movementStats[0]?.avg_debit || 0) // sempre 0 - 0
  ```
  Conseguenze deterministiche: `trend7gg = saldoAttuale` (mai un trend), `previsione30gg = 0`,
  `deltaPrevisione = 0`, `burnRateMensile = 0`, `runwayMesi = 999` (riga 70-72: `avgDailyNet >= 0` è
  sempre vero). L'unico valore corretto è `saldoAttuale`. Sono esattamente i 4 errori TS7053 del log
  strict (`04-tsc-strict.log` righe 46-53): il compilatore in strict li segnala, la config di produzione no.
- **Perché è un problema:** la dashboard Cash Flow (`cash-flow/page.tsx` fetcha questo endpoint) mostra
  al titolare trend, previsione a 30 giorni, burn rate e runway **costanti e falsi**. Chiunque prenda
  decisioni di tesoreria su quei numeri decide su dati inventati.
- **Come verificarlo:** lettura del codice (destructuring + indexing); oppure aprire `/cash-flow` e
  osservare previsione 30gg = 0 € e runway = 999 mesi con qualsiasi dato.
- **Correzione proposta:** rimuovere il doppio accesso: usare `oldBalance?.balance` e
  `movementStats?.avg_credit/avg_debit`. Aggiungere un test unit sul calcolo. (Cross-ref al modulo cashflow.)
- **Effort:** S

### [A1-BUILD-003] `ConfidenceBadge` crasha a ogni render — oggi salvo solo perché è codice morto
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `src/components/cashflow/ConfidenceBadge.tsx:10-21`
- **Evidenza:**
  ```tsx
  const config = { CERTA: {...}, ALTA: {...}, MEDIA: {...}, BASSA: {...} }[level]
  // config è già {label, className}; reindicizzarlo con [level] dà undefined:
  <Badge className={cn('text-xs', config[level].className)}>  // TypeError garantito
  ```
  Strict lo segnala (TS7053, log righe 58-61). Knip elenca il file tra gli "Unused files"
  (`11-knip.log:30`): nessuno lo importa e lo renderizza, quindi il crash non si manifesta.
- **Perché è un problema:** è una bomba innescata: il primo sviluppatore che ricollega il badge (il
  nome è plausibilissimo nel modulo cashflow) ottiene una pagina bianca in produzione. Dimostra inoltre
  che la build "verde" non prova la correttezza: questo file compila senza errori con la config attuale.
- **Come verificarlo:** `npx tsc --noEmit -p tsconfig.strict.json 2>&1 | grep ConfidenceBadge`; o
  renderizzare il componente in un test.
- **Correzione proposta:** rimuovere il doppio indexing (`config.className`) oppure eliminare il file
  insieme agli altri morti (A1-BUILD-011).
- **Effort:** S

### [A1-BUILD-004] Sentry mai inizializzato: i 3 file `sentry.*.config.ts` non sono caricati da nessuno
- **Severità:** P1
- **Confidenza:** Certa (server/edge) · Probabile (client, da confermare a runtime)
- **File:** `sentry.server.config.ts`, `sentry.edge.config.ts`, `sentry.client.config.ts`, `next.config.ts:74-77`, `src/lib/logger.ts:74-77`
- **Evidenza:**
  ```
  $ find . -maxdepth 2 -name "instrumentation*" -not -path "./node_modules/*"   → nessun file
  $ grep -rn "sentry.server.config\|sentry.client.config\|sentry.edge.config" --include="*.ts*" .  → 0 risultati
  ```
  - `@sentry/nextjs` è alla **v10** (`package.json`: `^10.32.1`): dalla v8 l'init server/edge **deve**
    essere importata da `instrumentation.ts` (hook `register()` + `onRequestError`); `withSentryConfig`
    non la inietta più. Il file non esiste → `Sentry.init` server non viene mai eseguita.
  - La build di produzione usa **Turbopack** (`08-build.log:27`: "Next.js 16.1.6 (Turbopack)"): con
    Turbopack `sentry.client.config.ts` non viene iniettato; serve `instrumentation-client.ts`, assente.
  - Non esiste `src/app/global-error.tsx`: anche con SDK client attivo, gli errori di rendering App
    Router non verrebbero catturati.
  - Il codice stesso lo ammette — `src/lib/logger.ts:74`:
    ```ts
    // TODO: Integrare Sentry quando configurato
    // if (process.env.NEXT_PUBLIC_SENTRY_DSN && error instanceof Error) {
    //   Sentry.captureException(error)
    ```
    Unica occorrenza di `Sentry.` in tutto `src/`, ed è commentata.
- **Perché è un problema:** il progetto paga il costo pieno di Sentry (dipendenza che porta metà delle
  64 CVE della baseline via stack OTel, build step, `tunnelRoute /monitoring`, CSP con `*.sentry.io`)
  e in cambio **non riceve alcun errore**: un crash in produzione su un gestionale di soldi e stipendi
  passa inosservato finché non chiama un utente. La presenza dei 3 file config dà una falsa sensazione
  di monitoraggio attivo.
- **Come verificarlo:** in produzione: `window.__SENTRY__` nel browser è undefined / nessuna richiesta
  a `/monitoring`; lato server: lanciare un errore di prova e verificare che non arrivi nulla al progetto Sentry.
- **Correzione proposta:** creare `instrumentation.ts` (register + `onRequestError` da
  `@sentry/nextjs`), rinominare `sentry.client.config.ts` in `instrumentation-client.ts`, aggiungere
  `global-error.tsx`, riattivare la riga in `logger.ts`. Le config esistenti sono buone (vedi "Cosa
  funziona bene") — vanno solo collegate.
- **Effort:** S/M

### [A1-BUILD-005] Cron `auto-clockout` definito in `vercel.json` ma la produzione è su Railway: non gira mai
- **Severità:** P1
- **Confidenza:** Probabile (da confermare nel dashboard Railway)
- **File:** `vercel.json:2-7`
- **Evidenza:**
  ```json
  { "crons": [ { "path": "/api/attendance/auto-clockout", "schedule": "0 * * * *" } ] }
  ```
  `vercel.json` è letto solo da Vercel. La produzione è su Railway (`docs/storage.md:26`: "Produzione
  oggi: filesystem su volume Railway"). Nel repo non esiste alcun altro trigger (niente `railway.json`/
  `nixpacks.toml`/scheduler; `grep -rn auto-clockout src/` → solo la route stessa). Le note di progetto
  (memoria: "cron da configurare su Railway") confermano che la configurazione è ancora pendente.
- **Perché è un problema:** la route `src/app/api/attendance/auto-clockout/route.ts` esiste ed è la
  rete di sicurezza per i dipendenti che dimenticano di timbrare l'uscita. Se nessuno la invoca ogni
  ora, le timbrature restano aperte → ore di presenza gonfiate → **stipendi calcolati su dati errati**,
  a meno di correzione manuale. Il file `vercel.json` è residuo di una piattaforma non più usata e
  documenta un'automazione che non c'è.
- **Come verificarlo:** dashboard Railway → nessun cron configurato; oppure query sulle timbrature
  aperte oltre mezzanotte nei log/DB (senza toccare il DB di produzione: chiedere al titolare).
- **Correzione proposta:** configurare il cron su Railway (o GitHub Actions `schedule` che invoca la
  route con secret) ed eliminare `vercel.json` per non documentare una piattaforma fantasma.
- **Effort:** S

### [A1-BUILD-006] CI su Node 20, produzione e engines su 22, README dice 18+
- **Severità:** P1
- **Confidenza:** Certa
- **File:** `.github/workflows/ci.yml:10`, `package.json` (`engines`), `.node-version`, `README.md:7`
- **Evidenza:**
  ```yaml
  env:
    NODE_VERSION: '20'          # ci.yml:10
  ```
  ```json
  "engines": { "node": ">=22.0.0 <23.0.0" }   // package.json
  ```
  `.node-version` = `22.22.0`; README = "Node.js 18+". Quattro fonti, tre valori.
- **Perché è un problema:** ogni esito CI (lint, typecheck, test, build) è misurato su un runtime
  **fuori dal range dichiarato dagli engines** e diverso da quello di produzione Railway. Differenze
  V8/ICU/API tra 20 e 22 (es. `Intl`, timer, fetch) possono far passare in CI codice che si comporta
  diversamente in produzione — su un progetto dove i test di timezone sono già delicati (`TZ=UTC`).
  `npm ci` su Node 20 inoltre non fa rispettare gli engines (nessun `engine-strict`), quindi nessuno
  se ne accorge.
- **Come verificarlo:** leggere i tre file; i log CI mostrano "Setup Node 20.x".
- **Correzione proposta:** `NODE_VERSION: '22'` in ci.yml (o meglio `node-version-file: .node-version`),
  allineare il README.
- **Effort:** S

### [A1-BUILD-007] CI senza denti: coverage e `npm audit` `continue-on-error`, nessun gate E2E, strict mai eseguito
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `.github/workflows/ci.yml:73-75, 116-118`
- **Evidenza:**
  ```yaml
  - name: Run Tests with Coverage
    run: npm run test:coverage
    continue-on-error: true        # ci.yml:75
  ...
  - name: Run npm audit
    run: npm audit --audit-level=high
    continue-on-error: true        # ci.yml:118
  ```
  Baseline: `npm audit` fallisce con **64 vulnerabilità (7 critiche**, tra cui next-auth) ma il job
  "Security Audit" risulta verde. La coverage (33% di `src/lib`, 0% delle 180 route API) non ha soglia.
  Nessun job E2E (la suite è comunque ineseguibile, vedi A1-BUILD-013). `tsconfig.strict.json` mai
  eseguito (A1-BUILD-001).
- **Perché è un problema:** la CI verde comunica "tutto a posto" mentre non blocca né CVE critiche sul
  layer di autenticazione, né regressioni di coverage, né regressioni sui flussi utente. È teatro di
  qualità: il badge verde è la prova che i job girano, non che proteggono.
- **Come verificarlo:** ultimo run GitHub Actions: job Security verde nonostante `09-npm-audit.log` esca 1.
- **Correzione proposta:** togliere `continue-on-error` dall'audit (con `--audit-level=critical` come
  primo passo realistico + allowlist temporanea); soglia coverage minima; step strict-ratchet (001).
- **Effort:** S (config) — M (rientro CVE, di competenza A2)

### [A1-BUILD-008] Service worker Serwist non generato con Turbopack: PWA e offline-sync presenze senza SW
- **Severità:** P2
- **Confidenza:** Certa (build locale) · Probabile (comportamento in produzione Railway)
- **File:** `next.config.ts:5-9`
- **Evidenza:**
  ```ts
  const withSerwist = withSerwistInit({ swSrc: "src/app/sw.ts", swDest: "public/sw.js", ... })
  ```
  - `08-build.log:15`: "`[@serwist/next]` WARNING: … doesn't support Turbopack" e `:27`: la build di
    produzione usa Turbopack (default Next 16).
  - Dopo la build baseline (exit 0), `public/sw.js` **non esiste** (`ls public/sw.js` → not found) e
    non è tracciato in git.
  - Coerente con knip: `src/app/sw.ts` figura tra gli unused files (`11-knip.log:28`) — nessun
    bundler lo tocca.
- **Perché è un problema:** `src/components/portal/PunchButton.tsx:280-283` registra un background
  sync (`sync.register('sync-punches')`) sul service worker per le **timbrature offline**: senza
  `sw.js` servito, `navigator.serviceWorker.ready` non risolve mai o punta a un SW inesistente → la
  timbratura offline promessa dalla UI non sincronizza. Config in `next.config.ts` che dichiara una
  feature che la toolchain non produce più dall'upgrade a Next 16.
- **Come verificarlo:** `npm run build && ls public/sw.js` → assente; in produzione: DevTools →
  Application → Service Workers su `/portale`.
- **Correzione proposta:** migrare a `@serwist/turbopack` o a configurator mode (le due opzioni
  indicate dal warning stesso), oppure buildare con `next build --webpack` finché la migrazione non è fatta.
- **Effort:** M

### [A1-BUILD-009] 39 `eslint-disable` in `src/`: 22 zittiscono `no-explicit-any`, 11 `exhaustive-deps`
- **Severità:** P2
- **Confidenza:** Certa
- **File:** vedi elenco (`grep -rn "eslint-disable" src/` → 39 occorrenze)
- **Evidenza — distribuzione per regola:**

  | Regola zittita | # | Dove si concentra |
  |---|---|---|
  | `@typescript-eslint/no-explicit-any` | 22 | `scadenzario/[id]/page.tsx` (5), staff tabs `EmployeeDetailTabs`+7 tab (13), `api/scadenzario/saldo-scalare/route.ts:8`, `lib/reconciliation/csv-parser.ts:319`, `lib/utils/username.ts:54` |
  | `react-hooks/exhaustive-deps` | 11 | quasi tutti i componenti `settings/` (`AccountManagement:108`, `AccountMappingManager:187,194`, `BudgetCategoryManagement:116,124`, `SupplierManagement:114`, `BancheEContiClient:105`), `chiusura/AttendanceSection:252`, `profilo/page:158`, `ui/address-autocomplete:85` |
  | `react-hooks/set-state-in-effect` | 5 | scadenzario (dialog/sheet/panel + 2 pagine) |
  | `jsx-a11y/alt-text` | 1 | `lib/pdf/ClosurePdfTemplate.tsx:474` (falso positivo: `<Image>` di react-pdf) |
  | direttiva inutile | 1 | `create-recurrence-dialog.tsx:147` (segnalata dallo stesso ESLint) |

  I "26 errori ESLint" del DEBUG_REPORT (feb 2026) oggi sono 0, ma il rientro è avvenuto in due modi:
  le route API (es. `categorization-rules/[id]/route.ts:80`) sono state **tipizzate davvero**
  (`Prisma.CategorizationRuleUpdateInput` al posto di `any`), mentre pagine scadenzario e staff tabs
  hanno **spostato il problema nei commenti disable** (22 `any` zittiti, contro i 17 errori `any` di feb).
- **Perché è un problema:** i 22 `no-explicit-any` sono esattamente i punti in cui lo strict mode
  (001) non potrà mai mordere: dati di scadenzario e dossier dipendenti passano come `any` tra tab e
  pagine. Gli 11 `exhaustive-deps` sui componenti settings sono il pattern classico di stale closure:
  un filtro che non si aggiorna in una schermata di configurazione conti/fornitori è un bug d'uso a
  bassa visibilità. I 5 `set-state-in-effect` hanno almeno la motivazione scritta nel commento.
- **Come verificarlo:** `grep -rn "eslint-disable" src/ | wc -l` → 39.
- **Correzione proposta:** vietare nuovi disable senza motivazione (`--report-unused-disable-directives`
  è già attivo di default in flat config: sfruttarlo); tipizzare le props dei staff tabs e le pagine
  scadenzario con i tipi già esistenti in `src/types/`.
- **Effort:** M

### [A1-BUILD-010] 81 warning ESLint senza `--max-warnings`: il debito può solo ricrescere
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `package.json` (`"lint": "eslint"`), `.husky/pre-commit:16`, `.github/workflows/ci.yml:29`, log `05-lint.log`
- **Evidenza:** `npm run lint` → `✖ 81 problems (0 errors, 81 warnings)`. Composizione:
  **75×** `@typescript-eslint/no-unused-vars` (import e variabili morte sparsi in ~40 file),
  **4×** `react-hooks/incompatible-library` (react-hook-form `watch` in `LeaveRequestForm`,
  `MovimentoFormDialog`, `PagamentoFormDialog`, `RegolaFormDialog` — il React Compiler non può
  analizzarli), **1×** `import/no-anonymous-default-export` (`postcss.config.mjs:1`), **1×** direttiva
  disable inutile. Rispetto a feb 2026 (26 err/132 warn) il trend è buono, ma né `lint` script, né
  husky, né CI passano `--max-warnings`: un warning nuovo non blocca nulla.
- **Perché è un problema:** i 75 unused-vars sono rumore che nasconde i warning veri (i 4
  `incompatible-library` indicano componenti-form dove la memoizzazione del compiler è disattivata);
  senza tetto, il conteggio risale silenziosamente.
- **Come verificarlo:** `npm run lint` (o `05-lint.log`, riga finale).
- **Correzione proposta:** una passata `--fix` + pulizia manuale (quasi tutti auto-rimovibili), poi
  `"lint": "eslint --max-warnings 0"` così da congelare a zero.
- **Effort:** S/M

### [A1-BUILD-011] 6 file di tipi morti in `src/types/`, coppie duplicate e divergenti (già segnalate a feb 2026)
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `src/types/{payments,payment,cashflow,cash-flow,categorization,categorization-rule,fatture}.ts`
- **Evidenza:** verifica coppia per coppia (grep di ogni stile di import su tutto `src/`):

  | Coppia | Esistono entrambi? | Importato da | Divergenze |
  |---|---|---|---|
  | `payments.ts` (101 r.) / `payment.ts` (67 r.) | sì | **nessuno / nessuno** | union `'BONIFICO'\|...` vs `enum PaymentType`; `payments.ts` ha in più `PaymentFormData`, `PaymentFilters`, `BulkPaymentAction` |
  | `cashflow.ts` (190 r.) / `cash-flow.ts` (139 r.) | sì | **nessuno** / `AlertPanel.tsx:12`, `ConfidenceBadge.tsx:3` (quest'ultimo a sua volta morto) | union vs enum; **`AlertType`: `'SOVRA_SOGLIA'` in cashflow.ts vs `'SOPRA_SOGLIA'` in cash-flow.ts** — un valore proprio diverso |
  | `categorization.ts` (88 r.) / `categorization-rule.ts` (33 r.) | sì | **nessuno / nessuno** | union+labels vs enum |

  In più `fatture.ts`: 0 import. Knip conferma: 6 file di `src/types/` tra gli Unused files
  (`11-knip.log:47-52`) più decine di export/tipi morti anche nei file vivi (es. label in
  `prima-nota.ts:227-397`, `budget.ts`). I moduli reali (route API, pagine) usano i tipi Prisma o tipi
  locali: i file `/types` dei moduli Sibill sono rimasti scenografia della generazione iniziale.
- **Perché è un problema:** il DEBUG_REPORT segnalava le 3 coppie a **feb 2026** (righe 148-150): sei
  mesi dopo sono tutte ancora lì. Chi riprende il modulo pagamenti/cashflow trova due sorgenti di
  verità con valori divergenti (`SOVRA_` vs `SOPRA_SOGLIA`) e nomi identici: importare quello sbagliato
  compila comunque (sono union di stringhe) e produce confronti sempre falsi a runtime. Viola la regola
  di `src/CLAUDE.md` ("quattro varianti dello stesso concetto").
- **Come verificarlo:** `grep -rEn "types/(payments|payment|cashflow|categorization|categorization-rule|fatture)['\"]" src/` → 0 risultati fuori da `src/types/`.
- **Correzione proposta:** eliminare i 6 file morti (con `ConfidenceBadge.tsx` va rimosso anche
  l'ultimo import di comodo); tenere `cash-flow.ts` come unico sorgente e allinearlo agli enum Prisma.
- **Effort:** S

### [A1-BUILD-012] File `.bak` tracciati in git
- **Severità:** P3
- **Confidenza:** Certa
- **File:** `prisma/schema.prisma.bak` (269 B), `src/app/globals.css.bak` (4,6 KB)
- **Evidenza:** `git ls-files | grep '\.bak$'` → entrambi; committati in `1be468e` ("backup:
  pre-unificazione-anagrafiche commit"). `schema.prisma.bak` è uno stub di 12 righe senza segreti
  (datasource senza url), `globals.css.bak` è una vecchia palette.
- **Perché è un problema:** git È il backup; i `.bak` confondono (uno "schema Prisma" alternativo nella
  cartella prisma/) e knip/tooling li ignorano solo per fortuna di estensione. Nessun dato sensibile dentro.
- **Come verificarlo:** comando sopra.
- **Correzione proposta:** `git rm` entrambi; aggiungere `*.bak` a `.gitignore`.
- **Effort:** S

### [A1-BUILD-013] 3 dipendenze usate ma non dichiarate; `e2e/` tracciata ma ineseguibile e nascosta a tsc
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `playwright.config.ts:1`, `prisma.config.ts:1`, `scripts/replace-console-with-logger.mjs:10`, `tsconfig.json:41-48`
- **Evidenza:**
  - `@playwright/test`: rimosso dal repo nel commit `2c8b617`, ma restano tracciati
    `playwright.config.ts` + 10 spec `e2e/` + 3 helper che lo importano. `npx playwright test` →
    module not found. Il buco è invisibile a `tsc` perché `tsconfig.json` **esclude esplicitamente**
    `"e2e"` e `"playwright.config.ts"` (righe 46-47): l'esclusione è stata aggiunta per far tornare
    verde il typecheck invece di decidere il destino della suite.
  - `@prisma/config`: importato da `prisma.config.ts:1` ma assente da `package.json` (knip: "Unlisted
    dependencies", `11-knip.log:65`). Oggi risolve per hoisting transitivo del CLI `prisma`: un
    aggiornamento minore può romperlo.
  - `glob`: importato da `scripts/replace-console-with-logger.mjs:10`, non dichiarato → lo script
    crasha se eseguito (è comunque tra i file morti knip).
- **Perché è un problema:** l'unica suite che coprirebbe i flussi end-to-end (timbrature, chiusure,
  prima nota — 10 spec già scritte) è zavorra ineseguibile che sembra copertura; le dipendenze
  fantasma rompono al primo `npm ci` che cambia l'albero.
- **Come verificarlo:** `10-depcheck.log` ("missing"), `11-knip.log:65`; `npx playwright test`.
- **Correzione proposta:** decisione esplicita sulla E2E: reinstallare `@playwright/test` e rimetterla
  in CI, oppure eliminare `e2e/`+config. Dichiarare `@prisma/config` in devDependencies. Rimuovere lo
  script morto o dichiarare `glob`.
- **Effort:** S (dipendenze) / M (rimessa in piedi E2E)

### [A1-BUILD-014] 5 export duplicati (knip)
- **Severità:** P3
- **Confidenza:** Certa
- **File:** `11-knip.log:356-361`
- **Evidenza:** `logger|default` (`src/lib/logger.ts`), `prisma|default` (`src/lib/prisma.ts`),
  `BudgetCategoryManagement|default`, `CreateScheduleDialog|CreateScheduleSheet`
  (`create-schedule-sheet.tsx` — alias di retrocompatibilità), `parseXLS|parseXLSX`
  (`csv-parser.ts:313` e `:356`, dove `export const parseXLSX = parseXLS`).
- **Perché è un problema:** doppio nome per lo stesso simbolo → import misti nel codebase (`import
  prisma from` vs `import { prisma } from`) che rendono i grep e i refactor meno affidabili. Innocuo a runtime.
- **Come verificarlo:** `npx knip` sezione "Duplicate exports".
- **Correzione proposta:** scegliere una forma (named) e deprecare l'altra alla prossima passata.
- **Effort:** S

### [A1-BUILD-015] next.config: CSP con `unsafe-eval`/`unsafe-inline`; convenzione `middleware` deprecata da Next 16
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `next.config.ts:29-39`, `src/middleware.ts`, `08-build.log:32`
- **Evidenza:**
  ```ts
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",   // next.config.ts:32
  ```
  Verificato in positivo: **nessun** `typescript.ignoreBuildErrors` né `eslint.ignoreDuringBuilds`
  (grep → 0 risultati): la build verde è una build vera, sia pure con typecheck non-strict. Gli header
  di sicurezza ci sono e sono buoni (HSTS con preload, X-Frame-Options DENY, nosniff,
  Referrer-Policy, Permissions-Policy). Ma `script-src` con `unsafe-eval`+`unsafe-inline` riduce la
  CSP a poco più di una dichiarazione d'intenti contro XSS (valutazione di sfruttabilità → A2).
  Inoltre `08-build.log:32`: "The `middleware` file convention is deprecated. Please use `proxy`
  instead" — a ogni build; alla prossima major il file di autenticazione smette di essere caricato.
- **Perché è un problema:** su un gestionale con dati finanziari, una XSS con CSP permissiva è
  esfiltrazione completa; la deprecation del middleware è una rottura annunciata sul componente che fa
  da prima linea dell'auth.
- **Come verificarlo:** `curl -sI https://<prod>/ | grep -i content-security` ; warning nel log build.
- **Correzione proposta:** pianificare nonce-based CSP (Next la supporta) e la migrazione
  `middleware` → `proxy` prima dell'upgrade a Next 17.
- **Effort:** M

---

## Cosa funziona bene

`tsc --noEmit` base a 0 errori e build senza flag `ignore*`: nessuna scorciatoia nascosta lì. Gli
header di sicurezza in `next.config.ts` sono sopra la media. Le tre config Sentry — pur mai caricate
(004) — sono scritte con cura: `sendDefaultPii: false`, scrubbing di IBAN/CF/stipendi/PIN in
breadcrumb, body e user, `tunnelRoute`, `hideSourceMaps`, sampling 0.1 in prod. Pre-commit husky
completo (gitleaks + lint + tsc). Il rientro ESLint feb→ago (26 err → 0) nelle route API è stato fatto
tipizzando davvero, non solo zittendo.

## Zone d'ombra / DA VERIFICARE

- **Sentry client in produzione** (004): confermare dal browser (`window.__SENTRY__`, richieste a
  `/monitoring`) che il bundle Turbopack non contenga l'init — la parte server è certa, quella client dedotta.
- **Cron Railway** (005): solo il dashboard Railway può escludere un cron configurato fuori repo.
- **Build di produzione su Railway**: assunta identica alla locale (`npm run build` = Turbopack);
  se Railway forzasse `--webpack`, i finding 008 e la parte client di 004 cambierebbero esito.
- `react-hooks/incompatible-library` (010): capire se la mancata memoizzazione dei 4 form pesa
  davvero (percezione UI, area A5/A6).
- I 12 errori strict su `timbra/page.tsx` sono valutati runtime-safe per via del guard a riga 207:
  vale un ricontrollo se quel render viene rifattorizzato.
