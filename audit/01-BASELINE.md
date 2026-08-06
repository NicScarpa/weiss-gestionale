# FASE 1 — Baseline oggettiva

**Data:** 2026-08-06 · **Node:** 22.22.0 (via nvm) · Log grezzi in `audit/baseline-logs/`

## Esiti dei comandi

| # | Comando | Esito | Note oggettive |
|---|---------|-------|----------------|
| 1 | `npm ci` | ✅ exit 0 (25s) | installa pulito |
| 2 | `prisma generate` | ✅ exit 0 | |
| 3 | `tsc --noEmit` | ✅ **0 errori** | il progetto compila |
| 4 | `tsc --noEmit -p tsconfig.strict.json` | ❌ **exit 2 — 35 errori** | strict mode fallisce (vedi sotto) |
| 5 | `npm run lint` | ⚠️ **0 errori, 81 warning** | i 26 errori ESLint del feb 2026 SONO stati risolti |
| 6 | `npm run test:run` | ✅ **504 test / 23 file, tutti verdi** (3s) | |
| 7 | `npm run test:coverage` | ✅ exit 0 | **33.06% righe** (solo `src/lib`; API e componenti non misurati) |
| 8 | `npm run build` | ✅ exit 0 (27s) | build pulita |
| 9 | `npm audit --audit-level=high` | ❌ **exit 1 — 64 vulnerabilità** | 7 critiche, 27 alte, 27 moderate, 3 basse |
| 10 | `depcheck` | ⚠️ exit 255 | 4 dep + 6 devDep inutilizzate; 3 dip. "mancanti" |
| 11 | `knip` | ⚠️ exit 1 | 50 file inutilizzati, 174 export morti, 113 tipi morti, 5 export duplicati |

## Dettaglio significativo

### tsc strict — 35 errori (top file)
- `src/app/api/cashflow/summary/route.ts` (4), `src/components/cashflow/ConfidenceBadge.tsx` (2),
  poi 1 ciascuno in ~25 file (cashflow, scadenzario, prima-nota, staff, `src/lib/utils/username.ts`).
- **Implicazione:** il codebase NON è strict-clean; `tsconfig.strict.json` esiste ma non è usato da CI
  né pre-commit → è un file di intenzioni mai applicato.

### npm audit — 64 vulnerabilità (7 CRITICHE)
- **`next-auth`/Auth.js** (critica): `getToken()` eccezione su Bearer malformato; bypass homoglyph email.
- **`basic-ftp`** (critica, transitiva via firebase-admin): path traversal.
- **`axios`** (alta): SSRF + auth bypass prototype pollution.
- `@grpc/grpc-js`, `@hono/node-server`, `ws`, `protobufjs`, OpenTelemetry (alte/moderate).
- Molte arrivano da **firebase-admin** (grpc, gcp-metadata, basic-ftp) e dallo stack Sentry/OTel.
- La CI esegue `npm audit` ma è **`continue-on-error`** → non blocca nulla.

### depcheck
- Inutilizzate: `nuqs`, `pino-pretty`, `@tailwindcss/postcss`, `@testing-library/react`,
  `@vitest/coverage-v8`, `tailwindcss`, `tw-animate-css` (molte sono falsi positivi di tooling,
  ma `nuqs` va verificata da A4).
- **Mancanti (dichiarate in file ma non in package.json):** `@playwright/test` (playwright.config.ts),
  `@prisma/config` (prisma.config.ts), `glob` (uno script). → conferma E2E rotta.

### knip (input per A4 — codice orfano)
- **50 file inutilizzati**, tra cui: tutte le 10 spec `e2e/` + helpers, `src/app/sw.ts`,
  `src/components/ErrorBoundary.tsx`, `src/lib/api-validation.ts`, `src/lib/cache.ts`,
  `src/lib/errors.ts`, `src/components/prima-nota/JournalEntryForm.tsx` e `JournalEntryTable.tsx`,
  vari `scripts/`.
- **174 export inutilizzati + 113 tipi inutilizzati + 5 export duplicati.** Molti sono re-export di
  `components/ui` (falsi positivi da libreria shadcn), ma la parte dominio va filtrata da A4.
- Log completo: `audit/baseline-logs/11-knip.log`.

## Coerenza dell'ambiente (4 fonti, valori diversi) — CONFERMATO

| Fonte | Valore Node |
|-------|-------------|
| `.node-version` | **22.22.0** |
| `package.json` `engines` | **>=22 <23** |
| `.github/workflows/ci.yml` `NODE_VERSION` | **20** |
| `README.md` | **18+** |

→ La CI valida su Node 20 mentre la produzione (Railway) e lo sviluppo girano su 22. La pipeline di
qualità testa un runtime diverso da quello di esercizio. **Finding P1** (registrato in A1).

## Verdetto baseline

La pipeline "verde" è ingannevole: compila, i 504 test passano e la build funziona, ma
(a) lo strict mode è rotto e non applicato, (b) 64 CVE aperte non bloccano il deploy,
(c) la coverage reale copre 1/3 di `src/lib` e **zero** delle 180 route API e dei componenti,
(d) l'unica suite che testerebbe i flussi end-to-end (E2E) è stata rimossa dalle dipendenze.
Una pipeline che gira ma non protegge.
