# A6 — Test & QA infrastructure

**Audit di sola lettura · 2026-08-06 · Agente A6**
Baseline di riferimento (non rifatta): 504 test / 23 file tutti verdi; coverage 33.06% righe misurata SOLO su `src/lib`; 180 route API; `@playwright/test` rimosso nel commit `2c8b617`.

## Tabella riassuntiva

| ID | Sev | Confidenza | Titolo |
|----|-----|------------|--------|
| A6-TEST-001 | P1 | Certa | Suite E2E (10 spec, 85 test) ineseguibile dal 9 gen 2026: dipendenza rimossa, nessuno script |
| A6-TEST-002 | P2 | Certa | Le spec E2E sono anche in drift: il login helper cerca una label "Email" che non esiste più; credenziale staff mai seedata |
| A6-TEST-003 | P2 | Certa | 34 `expect(true).toBe(true)` e 59 guardie `isVisible()` nelle spec E2E: anche vive, metà non fallirebbero mai |
| A6-TEST-004 | P1 | Certa | `validateClosure` (approvazione/rifiuto chiusura → genera/cancella scritture contabili) senza alcun test |
| A6-TEST-005 | P1 | Certa | Calcolo paghe (`payroll-calculator.ts`, 511 righe) a coverage 0%: straordinari, notturni, festivi non protetti |
| A6-TEST-006 | P1 | Certa | Parser estratti conto bancari (`csv-parser.ts`, 751 righe) 0% e matcher riconciliazione al 20% |
| A6-TEST-007 | P1 | Certa | Prima nota: 12 route API (versamento, import, saldi, verify) senza un solo test |
| A6-TEST-008 | P2 | Certa | Budget: zero test su lib (3 file a 0%) e 13 route API |
| A6-TEST-009 | P2 | Certa | Import fatture coperto a metà: parser SDI 65%, ma `sdi/matcher` 0%, `zip-utils` 0%, `invoice-utils` 0%, route 0 |
| A6-TEST-010 | P2 | Certa | Coverage misurata solo su `src/lib`, nessuna soglia `thresholds`, e in CI è `continue-on-error`: può scendere a zero senza che nulla fallisca |
| A6-TEST-011 | P2 | Certa | CI senza denti: nessun gate E2E, `npm audit` non blocca (64 CVE, 7 critiche), Node 20 vs prod 22 (già A1) |
| A6-TEST-012 | P2 | Certa | Pre-commit: i test non girano mai; gitleaks è opzionale (macchina senza gitleaks = segreti passano) |

**Conteggio: 0×P0 · 5×P1 · 7×P2 · 0×P3**

---

## Finding

### [A6-TEST-001] Suite E2E (10 spec, 85 test) ineseguibile dal 9 gennaio 2026
- **Severità:** P1
- **Confidenza:** Certa
- **File:** `package.json` (devDependencies e scripts), `playwright.config.ts:1`, `e2e/*.spec.ts`
- **Evidenza:**
  ```
  $ git show --stat 2c8b617
  2c8b617 Fri Jan 9 12:37:41 2026 +0100  chore: remove playwright and playwright-mcp
   package.json      |  2 --      # rimossi @playwright/mcp e @playwright/test ^1.57.0
   package-lock.json | 73 +-
  ```
  - `package.json` scripts: `test`, `test:run`, `test:coverage`, `test:watch`, `test:ui` — **nessun `test:e2e`** (mai esistito).
  - L'unica occorrenza di `@playwright/test` nel lockfile (riga 15373) è la *peerDependency opzionale di Next.js*, non un pacchetto installato.
  - `playwright.config.ts:1` importa `@playwright/test` → qualunque `npx playwright test` fallisce al parsing della config.
  - Restano 10 spec (85 `test()`) in `e2e/`: chiusura-cassa (18), prima-nota (27), attendance-punch (10), attendance-offline (11), auth (4), portal (5), shifts (4), staff (3), leave-management (2), invoice-batch-upload (1). Knip le elenca tutte tra i 50 file orfani (`audit/baseline-logs/11-knip.log`).
- **Perché è un problema:** l'unica rete che testerebbe i flussi completi (login → chiusura → validazione → prima nota) è morta da 7 mesi, ma il codice resta nel repo e viene perfino manutenuto: le spec sono state ritoccate il 22/1 (`b327cad`) e il 28/1 (`a97cc83`, fix ESLint) — **dopo** la rimozione della dipendenza. Si paga il costo di mantenere test che non possono girare.
- **Come verificarlo:** `grep -n "test:e2e\|playwright" package.json` (nessun match utile); `git log -S "@playwright/test" -- package.json` → ultima rimozione in `2c8b617`.
- **Correzione proposta:** decidere esplicitamente: (a) riattivare — `npm i -D @playwright/test`, `npx playwright install chromium`, script `test:e2e`, DB di test separato (il `.env` attuale punta a produzione: il `webServer: npm run dev` della config scriverebbe sul DB reale) e bonifica delle spec (vedi 002/003); oppure (b) cancellare `e2e/` e `playwright.config.ts`. Lo stato attuale è il peggiore dei due.
- **Effort:** L (riattivazione) / S (rimozione)

### [A6-TEST-002] Le spec E2E sono anche in drift: login helper rotto e credenziale staff inesistente
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `e2e/helpers/auth.ts:31`, `src/app/(auth)/login/page.tsx:157-160`, `prisma/seed.ts:125-141`
- **Evidenza:**
  ```ts
  // e2e/helpers/auth.ts:31 (ultimo aggiornamento 2026-01-04)
  await page.getByLabel(/email/i).fill(email)
  ```
  ```tsx
  // src/app/(auth)/login/page.tsx:157 — dal commit 5aef350 (2026-01-10)
  <Label htmlFor="identifier">Username</Label>
  ```
  - Il campo login si chiama "Username" dal 10/1/2026 — **il giorno dopo** la rimozione di Playwright: il drift è iniziato subito e nessuno se n'è accorto perché la suite non girava già più.
  - `TEST_CREDENTIALS.staff = staff@weisscafe.it` (`e2e/helpers/auth.ts:16`) ma `grep -c "staff@weisscafe.it" prisma/seed.ts` → **0**: il seed crea `vanessa@weisscafe.it / staff123` (`prisma/seed.ts:260`).
- **Perché è un problema:** anche reinstallando `@playwright/test`, tutte le spec autenticate (9 su 10) fallirebbero al primo passo: `getByLabel(/email/i)` non trova nulla e il login staff usa un utente mai creato. La riattivazione non è un `npm install`: è un lavoro di bonifica.
- **Come verificarlo:** confronto diretto dei due file citati; `grep "staff@weisscafe" prisma/seed.ts`.
- **Correzione proposta:** in caso di riattivazione, aggiornare `login()` a `getByLabel(/username/i)` (o `#identifier`), allineare `TEST_CREDENTIALS` al seed, e rivalidare spec-per-spec i selettori delle pagine interne (drift probabile anche lì, non verificato una per una).
- **Effort:** M

### [A6-TEST-003] Spec E2E vacue: 34 `expect(true).toBe(true)` e 59 guardie `isVisible()`
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `e2e/chiusura-cassa.spec.ts:127-141` (e altri 9 punti nello stesso file), `e2e/prima-nota.spec.ts` (13), `e2e/attendance-offline.spec.ts` (9), `e2e/attendance-punch.spec.ts` (2)
- **Evidenza:**
  ```ts
  // e2e/chiusura-cassa.spec.ts:127-141
  if (await saveDraftButton.isVisible()) {
    await saveDraftButton.click()
    ...
  } else {
    const saveButton = page.getByRole('button', { name: /salva/i }).first()
    if (await saveButton.isVisible()) {
      // Non clicchiamo per evitare side effects non voluti
      expect(true).toBe(true)
    }
  }
  ```
  Conteggi: `grep -rc "expect(true).toBe(true)" e2e/` → chiusura-cassa 10, prima-nota 13, attendance-offline 9, attendance-punch 2 (**34 totali**). Guardie `if (await x.isVisible())`: 59 nelle stesse 4 spec.
- **Perché è un problema:** proprio le spec dei moduli soldi (chiusura cassa e prima nota) sono scritte in modo che se la UI cambia o il pulsante sparisce il test **passa in silenzio** invece di fallire. 10 dei 18 test di chiusura-cassa e 13 dei 27 di prima-nota terminano su un assert che non può fallire. Anche riattivata, questa suite darebbe un verde di facciata.
- **Come verificarlo:** `grep -rn "expect(true).toBe(true)" e2e/`.
- **Correzione proposta:** in caso di riattivazione, riscrivere le spec con assert incondizionati su elementi che DEVONO esistere; una guardia `isVisible()` va sostituita da `await expect(x).toBeVisible()`.
- **Effort:** M

### [A6-TEST-004] `validateClosure` — la transizione che genera/cancella le scritture contabili — senza alcun test
- **Severità:** P1
- **Confidenza:** Certa
- **File:** `src/lib/services/closure-service.ts:81-195`, `src/lib/services/__tests__/closure-service.test.ts:1-77`, `src/app/api/chiusure/[id]/validate/route.ts`
- **Evidenza:**
  - Il test del service (77 righe) copre **solo** `calculateBankDeposit`; coverage di `closure-service.ts`: **24.24% righe, uncovered 87-189** (`audit/baseline-logs/07-coverage.log:216`) — esattamente il corpo di `validateClosure`.
  ```ts
  // closure-service.ts:105-121 — ramo reject: transazione che CANCELLA scritture
  const { updated, deletedEntries } = await prisma.$transaction(async (tx) => {
    const deletedEntries = await deleteJournalEntriesForClosure(closureId, tx)
    const updated = await tx.dailyClosure.update({ ... status: 'DRAFT' ... })
  ```
  - Nessun file di test esiste per `src/app/api/chiusure/[id]/validate`, `[id]/submit`, `[id]` (PUT/DELETE) né `bulk-delete`: l'unico test API chiusure è su GET/POST `/api/chiusure` (`src/app/api/chiusure/__tests__/route.test.ts`).
  - Paradosso: la generazione pura delle scritture (`closure-journal-entries.ts`) è testata benissimo (100%, importi esatti, 20 casi), ma **l'orchestrazione transazionale che la invoca** — controllo di stato SUBMITTED, approve che genera, reject che cancella e retrocede a DRAFT — non ha una sola riga di test.
- **Perché è un problema:** è il punto esatto in cui i contanti contati diventano prima nota. Una regressione qui (es. reject che non cancella le scritture, o approve su stato sbagliato) produce scritture duplicate o orfane nel libro giornale e nessun test rosso lo segnalerebbe.
- **Come verificarlo:** `npm run test:coverage` e leggere la riga `closure-service.ts` (24.24%); `ls src/app/api/chiusure/[id]/validate/__tests__` → non esiste.
- **Correzione proposta:** test del service con prisma mockato in transazione: approve genera le scritture attese e marca VALIDATED; reject cancella (soft) e torna DRAFT; stato ≠ SUBMITTED → `invalid_status`; not found → `not_found`.
- **Effort:** M

### [A6-TEST-005] Calcolo paghe a coverage 0%: 511 righe che decidono gli stipendi
- **Severità:** P1
- **Confidenza:** Certa
- **File:** `src/lib/attendance/payroll-calculator.ts:22-511`
- **Evidenza:**
  ```
  audit/baseline-logs/07-coverage.log:175-176
   lib/attendance    |  0 |  0 |  0 |  0 |
    ...calculator.ts |  0 |  0 |  0 |  0 | 22-511
  ```
  Il file calcola ore ordinarie, straordinari, notturne e festive (con la lista `ITALIAN_HOLIDAYS` cablata) per l'export paghe (`src/app/api/attendance/export/payroll/route.ts`, anch'essa senza test). Nessuna delle 14 route `/api/attendance/*` ha un file di test; anche `src/lib/offline/punch-queue.ts` e `sync.ts` (timbrature offline) sono a 0% (log:194-198), e `src/lib/validations/attendance.ts` 0%.
- **Perché è un problema:** un errore su una soglia (mezzanotte, festivo, arrotondamento minuti) cambia le buste paga di tutti i dipendenti e nessun test lo intercetta. È denaro reale che esce ogni mese sulla base di codice mai verificato automaticamente.
- **Come verificarlo:** riga `lib/attendance` nel coverage log; `find src -path "*attendance*" -name "*.test.ts"` → vuoto.
- **Correzione proposta:** test tabellare puro su `payroll-calculator` con giornate note: turno ordinario, straordinario oltre soglia, cavallo di mezzanotte, domenica, Ferragosto, timbratura mancante. La logica è già isolabile (dipende da prisma solo per il fetch: estrarre il calcolo puro come fatto per `timekeeping-engine` nel worktree presenze).
- **Effort:** M

### [A6-TEST-006] Riconciliazione bancaria: parser estratti conto 0% (751 righe), matcher al 20%
- **Severità:** P1
- **Confidenza:** Certa
- **File:** `src/lib/reconciliation/csv-parser.ts:25-751`, `src/lib/reconciliation/matcher.ts:82-423`, `src/app/api/bank-transactions/import/route.ts`
- **Evidenza:**
  ```
  audit/baseline-logs/07-coverage.log:201-205
   ...reconciliation |  13.59 | 11    |  9.75 | 13.11 |
    csv-parser.ts    |  0     |  0    |  0    |  0    | 25-751
    matcher.ts       |  21.95 |  9.57 | 15.38 | 20.35 | 35,82-423
  ```
  `csv-parser.ts` fa parsing di CSV/XLS bancari con formato italiano (`decimalSeparator: ','`, `thousandSeparator: '.'`, date `D/M/YY` — config RelaxBanking a riga 23-30): esattamente il terreno classico degli errori di importo (1.000,50 letto 1,00050). Le route `/api/reconciliation/*` e `/api/bank-transactions/import` non hanno test. In compenso `schedule-matcher.ts` ha un buon test comportamentale (51%, 17 casi con nomi parlanti) e `schedule-reconciliation-service` è al 77%.
- **Perché è un problema:** l'estratto conto importato male produce movimenti bancari con importi o date sbagliati, e il matcher (80% non testato) può marcare come riconciliati movimenti che non lo sono: la quadratura banca/prima nota si inquina alla fonte.
- **Come verificarlo:** righe 201-205 del coverage log; `ls src/lib/reconciliation/__tests__` → esiste solo `schedule-matcher.test.ts`.
- **Correzione proposta:** golden test del parser con file campione reali anonimizzati (RelaxBanking e gli altri formati configurati): importi con migliaia/decimali italiani, importi negativi, righe malformate → `errors[]`. Poi estendere i test di `matcher.ts` sul modello di `schedule-matcher.test.ts`.
- **Effort:** M

### [A6-TEST-007] Prima nota: utils coperti al 98%, ma le 12 route API sono a zero test
- **Severità:** P1
- **Confidenza:** Certa
- **File:** `src/app/api/prima-nota/**` (12 `route.ts`), `src/lib/validations/prima-nota.ts` (0%, coverage log:237)
- **Evidenza:**
  - `find src/app/api/prima-nota -name "*.test.ts"` → vuoto. Route senza alcun test: `route.ts` (CRUD movimenti), `[id]/verify`, `[id]/categorize`, `[id]/hide`, `versamento` (creazione movimento di versamento in banca), `import`, `export`, `saldi` e `saldi/storico`, `recategorize`, `metadata`.
  - L'unico test del dominio è `src/lib/__tests__/prima-nota-utils.test.ts` (380 righe, ottimo: direzioni dare/avere, saldi progressivi, totali) — ma copre le funzioni pure, non le route che scrivono sul DB né la validazione Zod (`validations/prima-nota.ts` 0%).
- **Perché è un problema:** la prima nota è il libro contabile centrale: creazione/modifica/verifica/occultamento di movimenti e calcolo saldi passano da handler mai testati. Il pattern già esistente per chiusure e scadenzario (route testate con prisma mockato) qui semplicemente non è stato applicato.
- **Come verificarlo:** `find src/app/api/prima-nota -name "__tests__"` → nulla; coverage log riga 237 (`prima-nota.ts | 0`).
- **Correzione proposta:** replicare il pattern di `src/app/api/chiusure/__tests__/route.test.ts` su POST `/api/prima-nota`, `versamento` e `saldi`: 401, ruolo, validazione importi/direzione, e where-clause su venue.
- **Effort:** M

### [A6-TEST-008] Budget: zero test su tutto il modulo
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `src/lib/budget-utils.ts` (0%, log:151), `src/lib/budget/alert-generator.ts` (0%, log:178), `src/lib/budget/category-aggregator.ts` (0%, 60-456, log:179), `src/app/api/budget*/**` (13 route)
- **Evidenza:** coverage log righe 151, 177-179 tutte a 0; nessun file `*.test.ts` con "budget" nel path (`find src -name "*budget*test*"` → vuoto); anche `validations/budget.ts` 0% (log:232).
- **Perché è un problema:** `category-aggregator` (400 righe di aggregazione consuntivo vs budget) e `alert-generator` producono i numeri su cui si prendono decisioni di spesa; un errore di aggregazione mostra scostamenti sbagliati. P2 e non P1 solo perché il budget è strumento di pianificazione, non scrittura contabile.
- **Come verificarlo:** coverage log righe citate.
- **Correzione proposta:** test puro di `category-aggregator` con un dataset piccolo e totali attesi a mano; test di `alert-generator` sulle soglie (sotto/sopra/al limite).
- **Effort:** M

### [A6-TEST-009] Import fatture coperto a metà: il parser sì, tutto il contorno no
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `src/lib/sdi/matcher.ts` (0%, 32-250, log:212), `src/lib/invoice-utils.ts` (0%, log:162), `src/lib/zip-utils.ts` (0%, 73-407, log:174), `src/lib/p7m-utils.ts` (48.9%, log:164), `src/app/api/invoices/**` (6 route, 0 test)
- **Evidenza:** il parser SDI è il file meglio testato del repo (`sdi-parser.test.ts`, 1250+ righe, 65.5% su un parser XML enorme), ma: `sdi/matcher.ts` (abbinamento fattura→anagrafica/scadenza) 0%; `zip-utils.ts` (estrazione batch upload) 0%; `invoice-utils.ts` 0%; nessun test su `/api/invoices/parse`, `[id]/record`, `bulk-delete`. L'unica spec E2E del flusso (`invoice-batch-upload.spec.ts`, 1 test) è morta con la suite (001).
- **Perché è un problema:** una fattura parsata bene ma abbinata al fornitore sbagliato o registrata male genera scadenze e prima nota errate: il rischio si è solo spostato a valle del parser, dove i test finiscono.
- **Come verificarlo:** coverage log righe citate; `find src/app/api/invoices -name "__tests__"` → nulla.
- **Correzione proposta:** test di `sdi/matcher.ts` con anagrafiche ambigue (P.IVA uguale, denominazioni simili) e di `zip-utils` con archivi misti (P7M+XML+file spuri).
- **Effort:** M

### [A6-TEST-010] La coverage misura solo `src/lib`, senza soglie, e in CI non blocca
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `vitest.config.ts:12-21`, `.github/workflows/ci.yml:73-75`
- **Evidenza:**
  ```ts
  // vitest.config.ts:12-15 — nessuna chiave `thresholds`
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
    include: ['src/lib/**/*.ts'],
  ```
  ```yaml
  # ci.yml:73-75
  - name: Run Tests with Coverage
    run: npm run test:coverage
    continue-on-error: true
  ```
- **Perché è un problema:** tripla illusione: (1) il "33.06%" è calcolato su `src/lib` soltanto — 180 route API e tutti i componenti sono esclusi dal denominatore, la coverage reale sul codice eseguito in produzione è molto più bassa; (2) senza `thresholds` la coverage può scendere a zero senza far fallire nulla; (3) anche se fallisse, `continue-on-error: true` la ignora. Il numero esiste solo per essere guardato, mai per proteggere.
- **Come verificarlo:** leggere i due file citati; `grep thresholds vitest.config.ts` → nessun match.
- **Correzione proposta:** togliere `continue-on-error`, aggiungere `thresholds` al livello attuale (ratchet: si può solo salire), e allargare `include` almeno a `src/app/api/**` così il buco diventa visibile nel numero.
- **Effort:** S

### [A6-TEST-011] CI senza denti: nessun gate E2E, `npm audit` non blocca, runtime diverso dalla produzione
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `.github/workflows/ci.yml:10,101-118`
- **Evidenza:**
  - Jobs presenti: `lint`, `typecheck`, `test`, `build`, `security` — **nessun job E2E** (coerente con 001, ma significa che nessuna pipeline si accorgerebbe della suite morta).
  - `ci.yml:116-118`: `npm audit --audit-level=high` con `continue-on-error: true` → le 64 vulnerabilità note (7 critiche, baseline log 09) non fermano nessun deploy.
  - `ci.yml:10`: `NODE_VERSION: '20'` mentre `.node-version` = 22.22.0 — **già registrato come finding P1 da A1**, qui solo richiamato: i 504 test verdi sono verdi su un runtime che non è quello di produzione.
  - `tsconfig.strict.json` non è invocato da nessun job (grep "strict" su ci.yml → 0 match).
- **Perché è un problema:** la CI dà un segnale di qualità che non corrisponde a ciò che va in produzione: runtime diverso, vulnerabilità ignorate, flussi end-to-end mai esercitati.
- **Come verificarlo:** lettura di `ci.yml`; confronto con `.node-version`.
- **Correzione proposta:** Node 22 in CI; `npm audit` bloccante almeno su `--audit-level=critical`; quando/se la E2E rinasce, job Playwright con DB Postgres di servizio.
- **Effort:** S

### [A6-TEST-012] Pre-commit: i test non girano mai e lo scan segreti è opzionale
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `.husky/pre-commit:6-19`
- **Evidenza:**
  ```sh
  if command -v gitleaks >/dev/null 2>&1; then
    gitleaks protect --staged --redact || { ... exit 1; }
  else
    echo "ATTENZIONE: gitleaks non installato ... - scan segreti saltato"
  fi
  npm run lint || exit 1
  npx tsc --noEmit || exit 1
  ```
  L'hook esegue: gitleaks **solo se installato** (altrimenti un echo e avanti), lint e `tsc --noEmit`. `npm run test:run` (3 secondi in baseline) non è presente.
- **Perché è un problema:** (1) su una macchina senza gitleaks (nuovo collaboratore, CI locale) i segreti passano con un semplice avviso — rilevanza security, di competenza A2, qui registrata come gap del gate; (2) i 504 test costano 3 secondi e non girano né in pre-commit né in pre-push: un commit può rompere `calculateBankDeposit` e accorgersene solo in CI (se si guarda).
- **Come verificarlo:** leggere `.husky/pre-commit`; cronometro: `npm run test:run` ≈ 3s (baseline log 06).
- **Correzione proposta:** aggiungere `npm run test:run` all'hook (costo 3s); rendere gitleaks bloccante (fallire se non installato, o vendorizzarlo via npx).
- **Effort:** S

---

## Copertura reale vs rischio economico (compito 2)

23 file di test / 504 test contro 180 route API e ~122k righe. Solo 6 file testano route API (1× chiusure, 5× scadenzario) ≈ 6 handler su 180 (~3%). Per modulo critico (percentuali righe da `audit/baseline-logs/07-coverage.log:142-241`):

| Modulo | Test? | Profondità | Buchi principali |
|---|---|---|---|
| **Chiusura cassa** | Sì | Buona sui calcoli: `calculations` 100%, `closure-form-utils` 100%, route GET/POST testata (653 righe, incl. 401 e venue-override) | `closure-service` 24% → `validateClosure` scoperto (004); route `[id]/validate`, `submit`, `bulk-delete` 0 test |
| **Scritture contabili** | Sì | La migliore del repo: `closure-journal-entries` 100% con importi esatti e edge case | l'orchestrazione che le genera/cancella (004) |
| **Prima nota** | Parziale | `prima-nota-utils` 98% (ottimo) | tutte le 12 route API a 0, validazioni Zod 0% (007) |
| **Scadenzario** | Sì | Il modulo meglio presidiato: `stima-data-attesa` 97%, `invoice-schedule-service` 100%, 5 file di test API | `schedule-rules/engine` 53% (rami 251-357), `recurrence-utils` 0% |
| **Riconciliazione** | Parziale | `schedule-matcher` 51% con test comportamentali seri, service 77% | `csv-parser` 0% su 751 righe, `matcher` 20%, route 0 (006) |
| **Budget** | **No** | — | tutto a 0%: 3 lib + 13 route (008) |
| **Presenze/paghe** | **No** | — | `payroll-calculator` 0% su 511 righe, 14 route, offline-sync 0% (005). Nota: i *turni* (shift-generation) invece sono all'81-90% |
| **Import fatture** | Parziale | `sdi-parser` 65% con 1250 righe di test | `sdi/matcher` 0%, `zip-utils` 0%, `invoice-utils` 0%, route 0 (009) |

## Qualità dei test esistenti (compito 3)

Campione: `closure-journal-entries.test.ts`, `closure-service.test.ts`, `chiusure/route.test.ts`, `schedule-matcher.test.ts`, `scadenzario/route.test.ts`, `performance.test.ts`.

**Verdetto: la qualità è buona; il problema è l'estensione.** I test dei moduli soldi testano comportamento con valori attesi calcolati a mano: `closure-service.test.ts:28-29` verifica `(600+400)−(100+50)−(30+20) = 800` e il caso Decimal di Prisma; `closure-journal-entries.test.ts` asserisce importi esatti per cassa/POS/spese/versamenti; `schedule-matcher.test.ts:49-96` copre direzione sbagliata, residuo vs totale, acconti e ritardi; `chiusure/route.test.ts:62-153` testa 401 e l'override del venueId estraneo. I mock prisma nei test di route restituiscono dati neutri e gli assert cadono sulla *where-clause costruita* (es. `scadenzario/route.test.ts:53-57`), non sull'eco del mock: accettabile per test di contratto.

Debolezze puntuali (marginali): `performance.test.ts:163-164` `expect(timer.stop).toBeDefined()` (non fallirebbe con un'implementazione vuota); `calculations.test.ts:453,461` `toBeDefined()` su chiavi di un oggetto appena inizializzato; 17 assert deboli totali su 504 test — fisiologico. I test *veramente* vacui stanno tutti nella suite E2E morta (003).

## Cosa funziona bene (max 5 righe)

I 504 test unit girano in 3 secondi, sono deterministici (env mockato in `vitest.setup.ts`) e quelli che esistono sono scritti bene, con nomi parlanti in italiano e valori attesi espliciti. Scadenzario e generazione scritture sono un modello da replicare: il pattern route-test con prisma mockato è già pronto, va solo applicato a prima nota, presenze e budget.

## Zone d'ombra / DA VERIFICARE

- **Drift interno delle altre 9 spec E2E**: verificato in dettaglio solo il login helper (rotto, 002); i selettori delle pagine interne sono *probabilmente* in drift dopo 7 mesi ma non validati spec-per-spec (servirebbe eseguirle, impossibile senza reinstallare Playwright).
- **`webServer` E2E contro il DB di produzione**: `playwright.config.ts:22` lancia `npm run dev`, che leggerebbe l'attuale `.env` (produzione). Qualunque riattivazione DEVE prima introdurre un env di test — non verificato se esista un meccanismo `.env.test`.
- **Flakiness**: suite eseguita una sola volta in baseline; nessuna misura di stabilità su run ripetuti.
- **`src/test/factories`**: esiste una cartella factories il cui uso effettivo nei 23 file non è stato censito.

## Piano di test minimo, ordinato per rischio economico (compito 6)

| # | Modulo | Comportamento da bloccare con un test | Perché conta per i soldi |
|---|---|---|---|
| 1 | Chiusura cassa | `validateClosure`: approve genera le scritture giuste e marca VALIDATED; reject le cancella (soft) e torna DRAFT; stato ≠ SUBMITTED rifiutato | È il punto in cui il contante contato diventa libro giornale: una regressione = scritture duplicate/orfane |
| 2 | Paghe | `payroll-calculator`: giornate campione con ordinarie/straordinari/notturne/festivi/cavallo di mezzanotte | Determina gli stipendi di tutti, ogni mese, oggi a coverage 0 |
| 3 | Riconciliazione | Golden test `csv-parser` su estratti reali anonimizzati: importi formato italiano, negativi, righe rotte → `errors[]` | Un importo letto male inquina tutti i movimenti bancari a valle |
| 4 | Prima nota | POST `/api/prima-nota` + `/versamento`: validazione importi/direzione, 401/ruolo, venue forzato | Scritture manuali e versamenti entrano nel libro contabile senza alcun controllo automatico |
| 5 | Prima nota | `/api/prima-nota/saldi` e `saldi/storico`: saldi attesi su un dataset noto | Il saldo mostrato è il numero su cui si decide; già coperto in utils, mai a livello route |
| 6 | Riconciliazione | `matcher.ts`: nessun falso match su importi vicini ma direzione/data incompatibili | Un falso "riconciliato" nasconde un ammanco reale |
| 7 | Import fatture | `sdi/matcher.ts`: abbinamento fattura→fornitore con P.IVA ambigue; `zip-utils` con archivi misti | Fattura attribuita al fornitore sbagliato = scadenze e pagamenti sbagliati |
| 8 | Trasversale | Test tabellare di autorizzazione sulle route finanziarie (prima-nota, budget, pagamenti, report, riconciliazione): 401 senza sessione, 403 per ruolo staff | La regola "solo admin/manager sui dati finanziari" (CLAUDE.md di src) oggi è verificata da un solo test in un solo modulo |

Nono posto (fuori dagli 8): `category-aggregator` del budget con totali attesi a mano.
