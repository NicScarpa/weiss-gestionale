# REGISTRO UNICO DEI FINDING — audit weiss-gestionale

**Consolidato dal lead il 2026-08-06.** Fonti: report A1–A8 in `audit/`.
Confidenza di default "Certa" salvo diversa indicazione. Effort: S <1h · M 1-4h · L >4h.
Colonna **Cluster** = causa radice comune (vedi `REPORT.md` §Cause radice): **CR1** auth duplicata inline · **CR2** operazioni non atomiche · **CR3** logica duplicata e divergente · **CR4** codice scritto-mai-collegato · **CR5** niente migrazioni/qualità non applicata · **CR6** float sul denaro.

> **Nota su A2:** due sessioni parallele hanno prodotto due report di sicurezza (`A2-security.md` del team, `A2-sicurezza-accessi.md` di una sessione peer). Il registro usa `A2-security.md` come canonico e integra i finding *unici* del peer con prefisso `A2p-`. Il finding peer **A2-19 ("admin di produzione ha admin123", CRITICO) è stato RITIRATO**: nasceva dall'errata attribuzione dell'attività di A8 (che ha operato sul DB locale `weiss_audit:5433`, non sulla produzione — verificato dal lead). Resta la raccomandazione, non confermata, di verificare le credenziali reali → `REC-01`.

---

## P0 — Critico (3)

| ID | Area | File | Sintesi | Cluster | Effort |
|----|------|------|---------|---------|--------|
| A3-DATA-001 | Contabilità | `api/pagamenti/[id]/esegui/route.ts:53` | Pagamento in uscita scritto come `debitAmount` su BANCA: ogni pagamento eseguito **aumenta** il saldo banca (errore doppio: 1.000 € = +2.000 € di scarto). Verificato dal lead. | CR6/CR3 | S+M |
| A3-DATA-002 | Contabilità | `api/chiusure/[id]/route.ts:383-479` | Admin modifica una chiusura VALIDATA ma le scritture di prima nota non vengono rigenerate → chiusura/prima nota/saldi/budget divergono in modo permanente. | CR2 | M |
| A3-DATA-003 | Migrazioni | `package.json:20-22`, `prisma/` | Nessuna migrazione versionata (solo `db push`); `npm run db:reset` = `--force-reset` sul `.env` di produzione = wipe. Drift schema↔DB non diagnosticabile. | CR5 | M |

## P1 — Alto (42)

### Contabilità e numeri (A3 + correlati A5/A1)
| ID | File | Sintesi | Cluster | Effort |
|----|------|---------|---------|--------|
| A3-DATA-004 | `services/schedule-reconciliation-service.ts:100-125` | Riconciliazione senza tetto sulla capienza del movimento: un bonifico da 100 € può "saldare" 500 € di scadenze. | CR2 | M |
| A3-DATA-005 | `services/schedule-reconciliation-service.ts:67-169` | Read-modify-write fuori transazione + nessun `@@unique(scheduleId,journalEntryId)` → doppio click duplica riconciliazione e pagamento. | CR2 | M |
| A3-DATA-006 | `services/schedule-reconciliation-service.ts:154-166,270-288` | L'annullo riconciliazione non riporta la fattura da PAID; invariante `dataAttesaSource` violata. | CR2/CR3 | M |
| A3-DATA-007 | `api/scadenzario/[id]/pagamenti/route.ts:101-157` | Pagamento manuale scadenza: 4 scritture senza `$transaction`; sovrapagamento libero (residuo negativo). | CR2 | S |
| A3-DATA-008 | `prisma.ts:66-78` + ~40 call site | Soft delete non copre `findUnique`/`update`: i cancellati "camminano" (chiusura morta validabile) e "bloccano i vivi" (unique include i deleted → giorno chiusura bloccato per sempre). | CR2/CR5 | L |
| A3-DATA-009 | `api/prima-nota/[id]/route.ts:214-227` | Si può cancellare un movimento riconciliato/matchato: la scadenza resta "pagata" verso un movimento sparito. | CR2 | S |
| A3-DATA-010 | `api/invoices/route.ts:284-305,459-492` | Import fatture: dedup check-then-act senza unique DB (duplicati su doppio invio); se le scadenze falliscono, re-import 409 e nessun recovery. | CR2 | M |
| A3-DATA-011 | `api/scadenzario/ricorrenze/[id]/genera/route.ts:55-87` | Generazione ricorrenze non idempotente: doppio click = scadenze duplicate (affitto ×2). | CR2 | S |
| A3-DATA-012 | `api/prima-nota/saldi/route.ts:42-101` | Saldo = iniziale anno corrente + movimenti di TUTTI gli anni, **futuri inclusi** (le regole datano al futuro). | CR3 | M |
| A3-DATA-013 | `services/closure-service.ts:87-171` | Doppia validazione concorrente della chiusura duplica le scritture (check di stato fuori transazione). | CR2 | S |
| A3-DATA-014 | `api/scadenzario/[id]/route.ts:10-30,138-146` | PATCH scadenza: `importoTotale` sotto il pagato (residuo negativo), `stato`/`dataPagamento` scrivibili senza coerenza; bypassa pagamenti. | CR2 | M |
| A3-DATA-015 | `api/pagamenti/[id]/route.ts:83-91` | PATCH pagamenti: `...body` mass assignment, nessuno Zod: `importo`/`stato`/`deletedAt` scrivibili dopo l'esecuzione. | CR1/CR2 | S |
| A3-DATA-016 | `lib/budget/category-aggregator.ts:82-158` | Budget: gli actual ignorano la prima nota (costi banca esclusi); il totale ricavi assegnato a OGNI categoria REVENUE; liquidity senza saldo iniziale. | CR3 | L |
| A3-DATA-017 · A1-BUILD-002 | `api/cashflow/summary/route.ts:23-73` | `/api/cashflow/summary` rotto: legge `registerBalance` mai scritta, cast `::uuid` su cuid (500), doppio indexing dopo destructuring → 5 KPI su 6 sempre falsi/costanti. | CR5/CR6 | M |
| A3-DATA-018 | `api/bank-transactions/import/route.ts:134-172` | Import estratto conto: dedup scarta transazioni legittime identiche; `bankReference` sintetico può collidere; loop fuori transazione; nessun legame `BankAccount`. | CR2/CR3 | M |
| A5-API-017 | `services/schedule-reconciliation-service.ts` + 3 route | Macchina a stati pagamento scadenza in 4 copie divergenti (Decimal vs float; PATCH stato cambia stato senza toccare `importoPagato`). | CR3/CR6 | M |
| A5-API-018 | `api/scadenzario/[id]/stato/route.ts:60-65` | Marcare SCADUTA scrive `dataPagamento=oggi` su scadenza non pagata; il pagamento reale non la corregge → dato corrotto che inquina la stima ritardo fornitore. | CR3 | S |

### Sicurezza (A2 + peer)
| ID | File | Sintesi | Cluster | Effort |
|----|------|---------|---------|--------|
| A2-SEC-001 · A2p-04 | `package.json` | 64 CVE (7 critiche) incl. core auth `@auth/core`/`next-auth` (homoglyph bypass + crash getToken) e `jspdf`; CI `npm audit` in `continue-on-error`. | CR5 | M |
| A2p-01 (era A2-SEC-002 P2) | `api/categorization-rules/proposals/route.ts` | Un utente **staff** autenticato può **riclassificare in blocco le scritture di prima nota** via API senza guard di ruolo, senza Zod, senza audit log: falsifica la classificazione su cui si costruiscono budget e report. Sfruttabile oggi con account staff reali (via chiamata diretta). | CR1 | S |
| A2p-02 | `credenziali.env`, `credenziali_fluida.env` | Credenziali **Entratel/FiscoOnline (incl. PIN non facilmente ruotabile), banca e HR** in chiaro su disco nella cartella di progetto (gitignored, non in history): esposte a backup di cartella, sync cloud e contesto di qualsiasi tool che legga la directory. | — | S |
| A2p-03 | `prisma/seed.ts`, `package.json` | Guard anti-seed basato su `NODE_ENV`: non protegge lo scenario reale (`.env`→produzione, `tsx` da macchina dev). `db:seed`/`db:reset` scrivono/azzerano il DB di produzione. Stesso cluster di A3-DATA-003 (vedi LOTTO 0). | CR5 | S |

### Build / infrastruttura (A1)
| ID | File | Sintesi | Cluster | Effort |
|----|------|---------|---------|--------|
| A1-BUILD-001 | `tsconfig.json:11`, CI, husky | Strict mode rotto (35 errori) e mai imposto (né CI, né husky, né script): nasconde i bug reali 002/003. | CR5 | M |
| A1-BUILD-004 | `sentry.*.config.ts`, manca `instrumentation.ts` | Sentry mai inizializzato (v10 richiede `instrumentation.ts`; Turbopack non inietta il client config): monitoraggio errori di produzione inesistente. | CR4/CR5 | S/M |
| A1-BUILD-005 · A4-INT-002 | `vercel.json` | Cron `auto-clockout` (e `shifts/reminder`) definiti solo per Vercel ma la produzione è su Railway: non girano → timbrature mai chiuse → ore/stipendi da correggere a mano. | CR4 | S |
| A1-BUILD-006 | `.github/workflows/ci.yml:10` | CI su Node 20, engines e produzione su 22, README "18+": la qualità è misurata su un runtime diverso da quello di esercizio. | CR5 | S |

### Integrazione / moduli scollegati (A4)
| ID | File | Sintesi | Cluster | Effort |
|----|------|---------|---------|--------|
| A4-INT-001 · A7-PRD-001 | `components/portal/NotificationSettings.tsx:117-126` | Notifiche push: pipeline server completa (FCM, ~10 trigger, sw.ts) ma il client non registra mai il token (stub "For now, just enable"): la UI mostra "Notifiche attivate" ma nessuna push arriverà mai. | CR4 | M |
| A4-INT-003 | `components/prima-nota/PrimaNotaContext.tsx:49-54` | Chiamata fantasma `/api/prima-nota/balances` (inesistente) + route `/saldi` orfana + `refreshBalances` mai invocato → card saldi stantie dopo ogni movimento. | CR4 | S |
| A4-INT-004 | `api/dashboard/forecast/route.ts` | `RecurringExpense` letta dal forecast ma il CRUD per popolarla non ha UI → la previsione esclude sistematicamente le uscite ricorrenti. | CR4 | M/S |

### Test (A6)
| ID | File | Sintesi | Cluster | Effort |
|----|------|---------|---------|--------|
| A6-TEST-001 | `package.json`, `e2e/` | Suite E2E (10 spec, 85 test) ineseguibile dal 9 gen 2026: `@playwright/test` rimosso, nessuno script `test:e2e`. | CR4/CR5 | S/M |
| A6-TEST-004 | `services/closure-service.ts:81-195` | `validateClosure` (genera/cancella scritture all'approvazione chiusura) senza un solo test — mentre la generazione pura è al 100%. | CR5 | M |
| A6-TEST-005 | `lib/attendance/payroll-calculator.ts` | Calcolo paghe (511 righe: straordinari/notturni/festivi) a coverage 0%. | CR5 | M |
| A6-TEST-006 | `lib/reconciliation/csv-parser.ts` | Parser estratti conto (751 righe, formato IT) 0%; matcher riconciliazione 20%. | CR5 | M |
| A6-TEST-007 | `api/prima-nota/*` | Prima nota: 12 route API senza un solo test. | CR5 | M |

### Contratti API (A5)
| ID | File | Sintesi | Cluster | Effort |
|----|------|---------|---------|--------|
| A5-API-009 | `api/products/route.ts:57-59`, `api/scadenzario/route.ts:139` | `orderBy[sortBy]` senza whitelist: `?sortBy=<campo>` arbitrario → 500 a comando (anche profilo sicurezza → A2). | CR3 | S |
| A5-API-012 | `api/staff/invite/route.ts:22,53-63` | `GET /api/staff/invite` crea un token di invito (side effect su metodo safe): prefetch/refresh generano credenziali di onboarding. | CR1 | S |

### PRD (A7)
| ID | File | Sintesi | Cluster | Effort |
|----|------|---------|---------|--------|
| A7-PRD-001 | `components/portal/NotificationSettings.tsx` | (= A4-INT-001) Push promesse da PRD e UI, mai consegnate. | CR4 | M |

### UI / responsiveness (A8, app viva)
| ID | File | Sintesi | Cluster | Effort |
|----|------|---------|---------|--------|
| A8-UI-001 | `components/chiusura/CashCountGrid.tsx:99`, `ClosureMetadataSection.tsx:126` | Chiusura cassa **inutilizzabile su telefono** (390px): i totali del conteggio contanti sono renderizzati fuori viewport, i 3 select meteo si sovrappongono; pagina scrolla lateralmente di 240px. È il flusso quotidiano dello staff. | — | S |
| A8-UI-002 | `components/scadenzario/create-schedule-sheet.tsx:600`, `scadenzario/page.tsx:265` | **Doppio submit salva scadenze duplicate**: `isLoading` non passato dal parent → 3 click = 3 POST 200 = 3 scadenze identiche (verificato). Server non deduplica. Correla con CR2 (A3-DATA-010/011). | CR2/CR4 | S |
| A8-UI-003 | `scadenzario/page.tsx:168-183` | Creazione scadenza **senza feedback**: nessun toast su successo; su errore il dialog si chiude e resetta comunque → l'utente crede di aver salvato, riprova, duplica. Correla A5-API-016. | CR3 | S |
| A8-UI-004 | `components/scadenzario/create-schedule-sheet.tsx:88,199-203` | **Data scadenza salvata un giorno indietro** (Date locale → UTC → troncamento): una scadenza inserita "per oggi" nasce già scaduta ieri; slittano tutte quelle create tra mezzanotte e le 2. Lo scadenzario non usa `lib/timezone.ts`. | CR3/CR6 | M |
| A8-UI-005 | `components/portal/PortalNavigation.tsx:53,63` | Portale: la voce **"Chiusura" della bottom nav è fuori schermo** a 390px (7 voci = 448px > 390), nessun indicatore di scroll → lo staff non la raggiunge dal telefono. | — | S |
| A8-UI-006 · A3-DATA-017 · A1-BUILD-002 | `api/cashflow/summary/route.ts` | **Conferma a runtime**: `/api/cashflow/summary` risponde **500** a ogni load e la pagina Cash Flow mostra "0,00 € / Runway 0.0 mesi" come dati validi, senza errore. (Non è l'artefatto della chiave test: la route non tocca campi cifrati.) | CR5/CR6 | M |

## P2 — Medio (selezione consolidata)

| ID | Area | File | Sintesi | Cluster | Effort |
|----|------|------|---------|---------|--------|
| A2-SEC-002 · A2p-05 | Sicurezza | `api/categorization-rules/*`, `budget-categories/*` | Anche il resto del CRUD categorizzazione/budget è scrivibile da **qualsiasi utente autenticato** senza guard di ruolo; `venueId` dal body (la variante `proposals`, più grave, è promossa a P1 → A2p-01). | CR1 | S |
| A2p-09 | Sicurezza | `api/documents/route.ts` | Upload cedolini: magic bytes verificati solo se il client dichiara PDF; `contentType` riemesso `inline` → rischio XSS stored (con CSP `unsafe-inline`). | CR3 | S |
| A2p-10 · A3-DATA-020 | Contabilità | `api/cashflow/summary`, `api/pagamenti/summary` | Query raw aggirano il soft delete: i record cancellati rientrano nei totali. | CR2 | S |
| A2-SEC-005 | Sicurezza | `middleware.ts:46-57` | Middleware verifica solo la presenza del cookie, non firma/scadenza (limite edge/JWE). | CR1 | M |
| A2-SEC-007 | Sicurezza | `prisma-encryption.ts:8-16` | Cifratura at-rest copre IBAN/CF ma **non** stipendi (`hourlyRate*`,`totalPay`) né `portalPin` (VULN-016 parziale). | — | L |
| A1-BUILD-003 | Build | `components/cashflow/ConfidenceBadge.tsx:10-21` | Componente che crasha a ogni render (doppio indexing); oggi salvo solo perché codice morto. | CR4 | S |
| A1-BUILD-007 · A6-TEST-010/011 | CI | `ci.yml:73-75,116-118` | CI senza denti: coverage e `npm audit` `continue-on-error`, nessuna soglia, nessun gate E2E. | CR5 | S |
| A1-BUILD-008 | PWA | `next.config.ts:5-9` | Service worker Serwist non generato con Turbopack: `public/sw.js` assente → sync offline timbrature a rischio. | CR5 | M |
| A1-BUILD-009 | Build | 39 `eslint-disable` in `src/` | 22 zittiscono `no-explicit-any` (scadenzario, staff tabs), 11 `exhaustive-deps` (settings). | CR5 | M |
| A1-BUILD-015 | Sicurezza | `next.config.ts:29-39` | CSP con `unsafe-inline`/`unsafe-eval`; convenzione `middleware` deprecata da Next 16. | CR5 | M |
| A3-DATA-019 | Contabilità | `schema.prisma:294` vs `chiusure/[id]/route.ts:402` | Contraddizione `onDelete:Restrict` vs `deleteMany` stazioni: o la modifica chiusure è rotta o il DB è in drift (prova del rischio A3-DATA-003). | CR5 | S+M |
| A3-DATA-021 | Contabilità | `closure-journal-entries.ts`, reconciliation, saldo-scalare | Denaro come float JS con tolleranze ±0,01 sparse; `decimal.js` disponibile ma non usato nei moduli scadenzario/riconciliazione/chiusure. | CR6 | L |
| A3-DATA-022 | Contabilità | `api/prima-nota/saldi/storico/route.ts` | Storico saldi parte da zero (ignora `InitialBalance`); aggregazioni in JS caricando tutte le righe. | CR3 | M |
| A3-DATA-023 | Contabilità | `schema.prisma` Schedule | Stati contabili come stringhe libere: 7 enum definiti e mai usati; annullata vs deletedAt (fattura mai PAID). | CR5 | L |
| A3-DATA-024 | Contabilità | `schema.prisma` | Vincoli/indici mancanti: `Supplier.vatNumber` non unique (doppioni fornitore → storico ritardi rotto), no unique riconciliazione, no indici Payment/dataAttesa. | CR5 | M |
| A3-DATA-025 | Contabilità | `recurrence-utils` vs 2 copie | `calcolaProssimaGenerazione` triplicata, 2 copie senza clamp fine mese (31/1→3/3). | CR3 | S |
| A3-DATA-026 | Contabilità | `services/invoice-schedule-service.ts:28-97` | La nota di credito non riduce le scadenze della fattura originaria: si rischia di pagare il lordo. | — | L |
| A4-INT-005 | Integrazione | `api/cashflow/forecasts/*` | Modulo previsioni cash-flow manuali: 5 route CRUD complete mai chiamate da nessuna UI. | CR4 | L |
| A4-INT-006 | Integrazione | 26 route | 26 route API su 180 (14%) senza alcun chiamante — inventario completo. | CR4 | M |
| A4-INT-007 | Integrazione | `api-utils.ts`, `rate-limit.ts`, `errors.ts`, `ErrorBoundary` | Guardie/infrastrutture scritte e **testate** ma collegate a 0 route (`requireAuth`, rate-limit per import, error handler, ErrorBoundary mai montato). | CR1/CR4 | M |
| A4-INT-008 | Integrazione | `lib/validations/{attendance,bank-transactions,chiusura-cassa,invoices,users}.ts` | 5 file di schemi Zod orfani: le route validano con schemi inline riscritti (due fonti di verità). | CR3/CR4 | M |
| A4-INT-009 | Integrazione | `components/fatture/` vs `components/invoices/` | Doppio flusso di import fatture vivo in parallelo sugli stessi endpoint (esperienze e fix divergenti). | CR3 | M |
| A4-INT-010 | Integrazione | 15 def. `formatCurrency` | Formattazione valuta definita 15 volte, output incoerente sui null (`€ 0,00` vs `0,00 €`). | CR3 | M |
| A4-INT-012 | Integrazione | confini API→UI | `as unknown as` e `: any` nei punti di sutura (staff tabs, prima-nota): il typechecker spento dove i moduli si incontrano. | CR3/CR5 | M |
| A5-API-001/002/003 | API | `api-utils.ts` (morto) + 180 route | 4 envelope di successo diversi; creazioni a 200; 1.596 `NextResponse.json` grezzi; `parsePagination`/`paginatedResponse` mai usati. | CR3/CR4 | L |
| A5-API-004/005/007/008 | API | route varie | `error.message`/dump Zod esposti con 500; ZodError → 500 invece di 400; route senza try/catch; errori Prisma mai mappati. | CR3 | M |
| A5-API-010/011 | API | 68 route | `limit` senza tetto; 68 `findMany` senza `take` (report/export/presenze crescono col tempo). | CR3 | M |
| A5-API-015/016 | API | scadenzario, invoices, documenti-dipendenti | TanStack Query: chiavi diverse per la stessa risorsa, invalidazioni mancanti → KPI scadenzario stale, fallimenti pagamento silenziati. | CR3 | M |
| A5-API-019 | API | `api/scadenzario/route.ts:161`, `types/schedule.ts:76` | Decimal serializzati come stringa ma tipizzati `number`: il contratto TS mente, la UI compensa con `Number()` ovunque. | CR6 | M |
| A6-TEST-008/009 | Test | budget, sdi | Budget: 0 test su lib + 13 route. Import fatture: matcher/zip/invoice-utils 0%. | CR5 | M |
| A6-TEST-012 | Test | `.husky/pre-commit` | Pre-commit non esegue i test; gitleaks opzionale (macchina senza gitleaks = segreti passano). | CR5 | S |
| A7-PRD-002 | PRD | `PRD/*` vs `venue.ts` | I PRD descrivono multi-sede; l'app è single-venue (decisione presa) ma i PRD non sono stati aggiornati → confusione di riferimento. | CR3 | S |
| A7-PRD-003 | PRD | `model Schedule` vs `/api/schedules` | Collisione "Schedule": modello = scadenza, route = turni: trappola di dominio sistemica. | CR3 | S |
| A7-PRD-006 | PRD | `docs/Analisi_*` | Le tre analisi di stato si contraddicono e sono superate; ~18 feature reali non esistono in alcun PRD. | — | M |
| A7-PRD-008 | PRD | `fatture/emesse`, `fatture/corrispettivi` | 2 tab su 4 del modulo fatture sono stub dichiarati (in attesa provider). | CR4 | — |
| A8-UI-007 | UI | `fatture/layout.tsx:25` + ~10 pagine | Pattern trasversale a 390px: toolbar/tab bar sforano e fanno scrollare lateralmente quasi tutte le pagine admin; bottoni "Nuovo…" mezzi fuori schermo. | — | M |
| A8-UI-008 | UI | `components/prima-nota/pagamenti/PagamentiTable.tsx:113` | `PagamentiTable` senza wrapper `overflow-x`: a 390/767px la tabella trascina l'intera pagina (contro-esempi corretti in budget/personale). | — | S |
| A8-UI-009 | UI/a11y | `components/layout/sidebar.tsx:216-217,257-258` | Sidebar icon-only senza label né `aria-label` (7 link "vuoti" per screen reader); flyout hover-based che resta aperto dopo il tap su touch; voce "Personale" `href="#"`. | — | M |
| A8-UI-010 | UI | `globals.css:110`, `next-themes` | Dark mode inerte: CSS `.dark` completo (~120 righe) ma nessun `ThemeProvider` né toggle → non attivabile; unico effetto visibile, toast scuri su app chiara. | CR4 | S/L |
| A8-UI-011 | UI | `components/scadenzario/create-schedule-sheet.tsx:211` | Dialog scadenza: "Aggiungi" crea una riga vuota che disabilita "Conferma" senza spiegazione (bottone morto). | — | S |
| A8-UI-012 | UI | `scadenzario/[id]/page.tsx:409-420` | Dettaglio scadenza a 390px: importi Pagato e Residuo sovrapposti e illeggibili (stesso anti-pattern di A8-UI-001). | — | S |

## P3 — Basso (selezione)

| ID | Area | File | Sintesi | Effort |
|----|------|------|---------|--------|
| A1-BUILD-011 · A4-INT-011 | Build | `src/types/*` | 6 file di tipi morti e divergenti (`SOVRA_`/`SOPRA_SOGLIA`), segnalati già a feb 2026. | S |
| A1-BUILD-012 | Build | `*.bak` | `prisma/schema.prisma.bak`, `src/app/globals.css.bak` tracciati in git. | S |
| A1-BUILD-014 · A4-INT-013/014 | Build | vari | Export duplicati e di dominio "seconda generazione" morti (sdi/matcher, offline/punch-queue, geolocation client, layer RBAC dichiarativo). | M |
| A2-SEC-003 | Sicurezza | `api-utils.ts:118-164` | `requireAuth`/`requireVenueAccess` implementate ma usate da 0 route (sicurezza teorica). | L |
| A2-SEC-004 | Sicurezza | `README.md:59-61` | Credenziali di test reali documentate nel README (= password del seed). | S |
| A3-DATA-027 | Contabilità | `schema.prisma:397,1484` | `runningBalance` mai scritto ma esportato (colonna vuota nell'export); typo `totale_entrare`; `dataAttesaSource='manuale'` promesso e non scrivibile. | S |
| A5-API-013/014 | API | vari | PUT/PATCH incoerenti, toggle verifica non idempotente; Swagger documenta 2 route su 180 e dichiara rate-limit inesistente. | S |
| A8-UI-013 | UI | `DashboardClient.tsx:409` | "0" orfano renderizzato in home (truthy-zero: `count && ...` con count=0). | S |
| A8-UI-014 | UI | `components/portal/LeaveRequestForm.tsx:43` | Form ferie: errore Zod grezzo in inglese ("Invalid input: expected string…") accanto a messaggi italiani. | S |
| A8-UI-015 | a11y | modale password, dialog scadenza, tab anagrafiche | Bottoni icon-only senza `aria-label` (occhio password, cestini righe, tab): controlli anonimi per screen reader. | S |
| A8-UI-016 | UI | movimenti, dashboard, scadenzario | Refusi/copy: "Iniziana", "liquidita" senza accento, empty state tagliato dentro la tabella scrollabile. | S |
| A8-UI-017 | UI | dialog scadenze, tabelle | Importi: input `type=number` (solo punto) vs visualizzazione con virgola; `tabular-nums`/mono solo in chiusura cassa. | S |

## Raccomandazioni non-finding

| ID | Raccomandazione | Origine |
|----|-----------------|---------|
| REC-01 | Verificare dal pannello Supabase (sola lettura: `email, must_change_password, last_login_at, created_at`) che gli account reali **non** portino le password di default del seed; trattare come sospetti gli account vecchi che non hanno mai cambiato password e **forzarne il reset** invece di tentare il login (il login stesso sarebbe distruttivo). Rimuovere le credenziali dal README. **Limite:** senza log di autenticazione (A2-07), `last_login_at` registra solo l'ultimo accesso riuscito — serve a scegliere chi resettare, non a escludere accessi passati. Non confermabile da analisi statica. | Sostituisce A2-19 ritirato; rafforza priorità di A2-07 |
| REC-02 | Eseguire `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma` (sola lettura) per fotografare il drift schema↔produzione. | A3-DATA-003/019 |
| REC-03 | Verificare su Railway l'esistenza dei cron verso `auto-clockout`/`shifts/reminder`. | A1-BUILD-005 / A4-INT-002 |
| REC-04 | Confermare in produzione se `UPSTASH_REDIS_REST_*` è valorizzato (senza, il rate limit login è per-istanza). | A2-SEC / A2p-08 |

## Conteggio finale

**~112 finding**: 3 P0 · 42 P1 · ~47 P2 · ~20 P3 · + 4 raccomandazioni non-finding.
Le scritture di A8 (cambio password e 4 scadenze di test) sono sul **DB locale usa-e-getta** `weiss_audit`,
eliminato a fine audit: nessun impatto su produzione.

*Regressioni febbraio (DEBUG_REPORT) verificate a runtime da A8: R1 (`/api/customers` 500) risolta, R2
(`/api/scadenzario/summary` 400) risolta, R4 (hydration movimenti) non riprodotta.*
