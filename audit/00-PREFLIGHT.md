# FASE 0 — Preflight

**Data:** 2026-08-06 · **Branch:** `scadenzario/stima-data-attesa` (pulito) · **Auditor:** lead (Claude)

## Vincoli operativi accertati

1. **`.env` punta al database di PRODUZIONE** (`aws-1-eu-west-2.pooler.supabase.com:5432`, Supabase).
   Conseguenze per l'audit: vietato `npm run db:reset` / `db:push` / `db:seed`; l'ondata B (UI con
   app in esecuzione) richiede un DB locale dedicato o modalità di sola lettura con estrema cautela.
2. **Node**: sistema a v25.6.1, il progetto richiede 22.x (`engine-strict=true` in `.npmrc`).
   Tutti i comandi npm vanno preceduti da `source ~/.nvm/nvm.sh && nvm use 22`.
3. **I test unit NON toccano il DB reale**: `vitest.setup.ts` sovrascrive `DATABASE_URL` con
   `postgresql://test:test@localhost:5432/test` e l'ambiente è jsdom. La baseline test è sicura.

## Verifiche sui "segnali già noti" (§9 del brief)

| # | Segnale | Esito preflight |
|---|---------|-----------------|
| 1 | `CLAUDE.md` root = prompt di scaffolding estraneo | **CONFERMATO**: 20.994 byte, contenuto "Spec Creation Assistant"/autoforge, caricato a ogni sessione. → finding, proposta in `audit/CLAUDE.md.proposto` |
| 4 | Suite E2E ineseguibile | **CONFERMATO in parte**: `e2e/` con 10 spec + helpers, `playwright.config.ts` presente, `@playwright/test` assente da `package.json`. Approfondisce A6 |
| 6 | Node incoerente su 4 fonti | **CONFERMATO**: `.node-version`=22.22.0, `engines`=">=22 <23", README="Node 18+". CI da verificare (A1) |
| 10 | Nessuna cartella `prisma/migrations/` | **CONFERMATO**: `prisma/` non contiene `migrations/`; esiste però `prisma/schema.prisma.bak` **tracciato in git** |
| 13 | Report precedenti coesistono | **CONFERMATO** + trovato un secondo audit sicurezza più vecchio: `docs/Security_Audit_Report_2026-01-11.md`, oltre a `SECURITY_AUDIT_REPORT.md` (feb 2026, 47 VULN) |

## Osservazioni immediate dalla root (da trasformare in finding formali)

- `credenziali.env` e `credenziali_fluida.env` esistono sul disco in root (non tracciati in git —
  rimossi dal tracking a feb 2026 — ma presenti localmente accanto al codice).
- **`prisma/schema.prisma.bak` e `src/app/globals.css.bak` sono tracciati in git.**
- ~20 screenshot `.png` di lavoro nella root del repo (non tracciati, ma inquinano la working dir).
- `dev.db` (SQLite, 741KB, gen 2026): residuo di una fase in cui il progetto girava su SQLite; lo
  stack attuale è PostgreSQL. File morto.
- `test-fattura.xml` e `test-parser.ts` in root: script di prova fuori da ogni struttura.
- File `CLAUDE.md` generati (claude-mem) sparsi in quasi ogni cartella (`src/`, `src/app/`, `docs/`,
  `PRD/`, `plan/`, `e2e/`…).
- La history git è stata **riscritta il 5 ago 2026** (remediation VULN-001); la rotazione delle
  credenziali risultava ancora manuale/da completare.

## Storia del progetto (da git log, 100 commit)

Ordine di costruzione dei moduli, dal più vecchio: chiusura cassa → report/PDF → certificazioni
dipendenti → portale dipendenti (3 redesign: verde Ledgerix → viola Sesame → B&W JetHR) →
unificazione anagrafiche → architettura single-venue + scadenzario + conti bancari → documenti
dipendenti (split cedolini) → fix login/middleware (feb 2026) → **ondata di remediation sicurezza
(ago 2026)**: cifratura campi, soft delete scritture, storage centralizzato, geofencing server,
notifiche → service layer (closure-service) → motore regole scadenzario → ponte fatture→scadenze →
riconciliazione movimenti↔scadenze → stima data attesa (branch corrente).

Punti di attenzione dalla storia: commit "motore delle regole, prima applicato da nessuno" (c8645be)
conferma il pattern "scritto ma non collegato"; doppio ciclo di audit già avvenuto (gen + feb 2026).

## Documenti letti

- `README.md` (obsoleto: Node 18+, credenziali di test in chiaro, multi-venue implicito)
- `SECURITY_AUDIT_REPORT.md` (feb 2026): 47 VULN-xxx → base per la regressione di A2
- `DEBUG_REPORT.md` + `DEBUG_FIX_PLAN.md` (feb 2026): 26 err/132 warn ESLint, duplicazioni note
- `docs/Ciclo_Tesoreria_Modello_Sibill.md` (ago 2026): modello di dominio scadenzario/riconciliazione
- `piano-regole-scadenzario.md`, `docs/Analisi_PRD_vs_Implementazione_2026-01-06.md` (skim)
- PRD presenti in `PRD/` → delegati ad A7
