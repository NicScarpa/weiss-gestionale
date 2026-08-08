# A7 — PRD vs implementazione

**Data:** 2026-08-06 · **Agente:** A7 · **Metodo:** lettura dei PRD (`PRD/`), delle analisi
(`docs/Analisi_PRD_vs_Implementazione_2026-01-04.txt`, `…2026-01-06.md`,
`docs/Analisi_Stato_Progetto_2026-08-05.pdf`), dei piani (`modifiche/`, `tasks/`,
`piano-regole-scadenzario.md`, `docs/Ciclo_Tesoreria_Modello_Sibill.md`) e verifica a campione
sul codice (`src/app/(dashboard)`, `src/app/(portal)`, `src/app/api`, `prisma/schema.prisma`,
`src/lib`). Nessuna percentuale dei documenti è stata presa per buona.

> **Caveat di perimetro:** il worktree auditato è sul branch `scadenzario/stima-data-attesa`
> (HEAD `68be147`), che è **37 commit dietro `origin/main`** (`git log --oneline HEAD..main | wc -l`
> → 37; in cima a main c'è l'allocation pro-quota dei movimenti: `a3cd959`, `0270f0d`).
> La matrice fotografa il worktree; dove main aggiunge qualcosa lo segnalo. Vedi A7-PRD-012.

---

## MATRICE FUNZIONALITÀ → STATO REALE (output principale)

Stati: **IMPL** = implementata · **PARZ** = parziale · **ASS** = assente ·
**DIV** = implementata diversamente dal PRD.

### Contabilità (PRD_v1_1.md)

| # | Funzionalità (rif. PRD) | Stato | Prova (file/route/modello) |
|---|---|---|---|
| 1 | Autenticazione + RBAC (§5.1, SPEC_Gestione_Utenti) | **IMPL** | `src/lib/auth.ts` (rate limit 5 tent./min su `authorize()`, righe 77-82), modelli `Role`/`Permission`/`RolePermission` (`prisma/schema.prisma:96-127`), `/api/users*`, `/api/roles`, pagine `anagrafiche/utenti`, invito con token (`/api/staff/invite`, `InvitationToken` schema:1582), `mustChangePassword` (schema:57), `src/lib/utils/username.ts` |
| 2 | Chiusura cassa giornaliera (§5.2, incl. evento §5.2.2) | **IMPL** | `/api/chiusure` + `[id]/submit|validate|pdf|excel`, `ClosureForm.tsx` (`isEvent` riga 76, stazioni `isEventOnly`), workflow `ClosureStatus` (schema:1666), scritture automatiche `src/lib/closure-journal-entries.ts` + service `src/lib/services/closure-service.ts` |
| 3 | Prima nota cassa e banca (§5.3-5.4) | **IMPL** | `/api/prima-nota` + `saldi`, `saldi/storico`, `versamento`, `export`, `import`; UI `(dashboard)/prima-nota/{movimenti,pagamenti,regole}`; oltre il PRD: `verify`, `hide`, `categorize`, `recategorize` |
| 4 | Dashboard e report (§5.5) | **IMPL** | `/api/report/{incassi-giornalieri,confronto-annuale,analisi-costi,riepilogo-mensile}`, `/api/dashboard` + `forecast`, `DashboardClient.tsx` |
| 5 | Anagrafiche (§5.6) | **IMPL** | pagine `anagrafiche/{fornitori,clienti,personale,utenti}`, `/api/suppliers`, `/api/customers` (clienti: oltre il PRD), `/api/products`, `/api/accounts`, `/api/venues` |
| 6 | Import fatture SDI XML/P7M (§6.1) | **IMPL** | parser proprietario `src/lib/sdi/{parser,matcher,types}.ts` (matcher fornitori via `lookupHash`, matcher.ts:99), `/api/invoices/parse`, upload ZIP (commit `f306735`), rate → scadenze (`invoice-schedule-service.ts`, commit `b10780e`) |
| 7 | Sincronizzazione automatica SDI (§6.1/§11.1) | **ASS** | nessun polling/cron; pianificata via A-Cube (`tasks/prd-integrazione-acube.md`, gate aperti). Import solo manuale |
| 8 | Fatture emesse + corrispettivi (tab modulo fatture) | **ASS** | 2 tab su 4 sono stub dichiarati: `(dashboard)/fatture/emesse/page.tsx:3-13`, `fatture/corrispettivi/page.tsx` ("arriverà con l'integrazione del provider") |
| 9 | Budget e scostamenti (§6.2 + Budget_Section_Specifications) | **IMPL/DIV** | `/api/budget*`, `/api/budget-categories` + `mappings`/`reorder`/`seed`, `BudgetSetupWizard.tsx`, `BudgetAlerts.tsx`, benchmark in `BudgetCategoryRow.tsx`; pagina raggiunta da sidebar (`sidebar.tsx:67-82`). **Diversamente:** il mapping conti→categorie non è drag & drop (spec §5.6 `AccountDragItem`): nessun riferimento dnd in `src/components/budget/` |
| 10 | Tracking prezzi fornitori (§6.3) | **IMPL** | modelli `Product`/`PriceHistory`/`PriceAlert` (schema:1251-1320), `/api/products/[id]/price-history`, `/api/price-alerts`, `src/lib/price-tracking/` |
| 11 | Labor cost % avanzato (§6.4) | **PARZ** | esiste `src/lib/attendance/payroll-calculator.ts` + export paghe (`/api/attendance/export/payroll`) e benchmark 30% nel budget; manca il modulo dedicato con breakdown per fascia oraria e trend (RF-LAB-002/003) |
| 12 | Sistema alert potenziato (§6.5) | **PARZ** | `BudgetAlert`, `PriceAlert`, `CashFlowAlert` + campanella in-app (`NotificationBell.tsx`, in `layout/header.tsx`, commit `8d01dd2`); **push mai consegnate** (v. A7-PRD-001), email digest giornaliero assente, i tre sistemi di alert non sono unificati (già rilevato in `modifiche/plan/plan-Dashboard_Avvisi_Inbox.md`) |
| 13 | Open Banking PSD2 (§7.1 RF-BANK-010) | **ASS** | solo import CSV (`/api/bank-transactions/import`, `src/lib/reconciliation/csv-parser.ts`); PSD2 pianificato via A-Cube (EPIC C del PRD A-Cube), zero codice |
| 14 | Riconciliazione bancaria (§7.1 RF-BANK-011/012/013) | **IMPL** | matching con confidence (`src/lib/reconciliation/matcher.ts`), workflow `confirm/ignore/match/unmatch` (`/api/bank-transactions/[id]/*`), `/api/reconciliation/summary`, pagina `riconciliazione` |
| 15 | Cash flow previsionale (§7.2) | **IMPL** | `/api/cashflow/{projection,summary,forecasts,alerts}`, pagina `cash-flow`, componenti `CashFlowChart/SummaryCards/AlertPanel/ConfidenceBadge`. **Eccezione:** what-if RF-CF-004 **ASS** (v. A7-PRD-004) |
| 16 | Scadenzario avanzato (§7.3) | **IMPL+** | calendario (`/api/scadenzario/calendar`), aging (`/aging`), pagamenti parziali (`[id]/pagamenti`), export; **oltre il PRD:** regole con motore (`src/lib/schedule-rules/engine.ts`), ricorrenze, riconciliazione movimento↔scadenza, stima data attesa, saldo scalare (v. §Compito 5) |
| 17 | Export XBRL / integrazione commercialista (§11.2, Fase 4) | **ASS** | nessun riferimento nel codice; solo export CSV/Excel/PDF generici |
| 18 | AI categorizzazione spese (§8.4/Fase 3) | **DIV** | niente ML: regole deterministiche `CategorizationRule` (schema:1452) + mining proposte (`/api/categorization-rules/proposals`, `test`). Funziona, ma non è ciò che il PRD chiama "AI" |

### Personale (PRD_Modulo_Gestione_Personale_v1.0.md)

| # | Funzionalità (rif. PRD) | Stato | Prova |
|---|---|---|---|
| 19 | Anagrafica dipendenti avanzata (RF-EMP-001) | **IMPL** | `staff/[id]` a tab, `/api/staff*`; oltre il PRD: certificazioni (`Certification` schema:1409, `/api/staff/[id]/certifications`) |
| 20 | Vincoli individuali (RF-EMP-002/004) | **IMPL** | `EmployeeConstraint` (schema:839), `/api/constraints` + `[id]` (edit/delete presenti), `/api/staff/[id]/constraints` |
| 21 | Vincoli relazionali (RF-EMP-003) | **IMPL** | `RelationshipConstraint` (schema:861), `/api/relationship-constraints`; tutti e 5 i tipi gestiti dal solver (`src/lib/shift-generation/constraints.ts:600-633` per NEVER/ALWAYS_TOGETHER e MIN_OVERLAP; SAME_DAY_OFF e MAX_TOGETHER altrove nello stesso file), soglie configurabili (commit `3e138da`) |
| 22 | Generazione turni AI (RF-SHIFT-001..008) | **IMPL** | solver greedy + local search reale (commit `ae070a1`, fix vincoli `03beada`), `/api/schedules/[id]/{generate,publish,export/pdf,export/excel}` |
| 23 | Portale dipendente (RF-PORTAL-001..007) | **IMPL** | `(portal)/portale/{turni,ferie,scambi,documenti,profilo,timbra}`, PWA (Serwist attivo: `next.config.ts:6` → `src/app/sw.ts`; il "file inutilizzato" di knip è un falso positivo) |
| 24 | Scambio turni (RF-PORTAL-006) | **IMPL** | `/api/shift-swaps` + `[id]`, pagina `portale/scambi` (a gennaio era assente) |
| 25 | Ferie e permessi (RF-LEAVE-001..004, RF-PORTAL-004/005) | **PARZ** | workflow completo (`/api/leave-requests` + `approve/reject`, `leave-types`, `leave-balance`); la UI saldi esiste (`LeaveBalanceCard.tsx`, `LeaveTab.tsx`) ma l'analisi 2026-08-05 (§7.8) segnala card sempre vuote — alimentazione dei `LeaveBalance` da verificare (v. A7-PRD-010) |
| 26 | Presenze e timbratura (RF-ATT-001..007) | **PARZ** | punch APP/WEB/MANUAL + `OFFLINE_SYNC` (schema:1784-1792, commit `475b8e4`), geofencing lato server (`/api/attendance/punch`, commit `bc8658c`), anomalie + auto-clockout + export paghe. **Mancano:** QR (v. A7-PRD-005); il motore regole orario NoBadge (`timekeeping-engine.ts`) vive sul branch `presenze/regole-orario`, non in questo worktree |
| 27 | QR code timbratura (RF-ATT-003) | **ASS** | enum `PunchMethod.QR_CODE` presente (schema:1787) ma zero codice di generazione/scansione (grep "qr" in `src/`: solo falso positivo `haversine.ts`) |
| 28 | Notifiche personale (§7 PRD Personale, RF-PORTAL-008) | **PARZ** | trigger collegati alle API (publish/approve/reject/punch/auto-clockout, v. Compito 2), storico in-app; push mai consegnate (A7-PRD-001) |

### Trasversali

| # | Tema | Stato | Prova |
|---|---|---|---|
| 29 | Multi-sede (PRD §2.1, §10.2: Sacile + Villa Varda + Casette) | **DIV** | architettura dichiarata single-venue (`src/lib/venue.ts:1-23`: guard sulla seconda sede, `getVenueId()` = unica sede attiva; commit `751c438`). I PRD non sono stati aggiornati (A7-PRD-002) |
| 30 | Offline-first (PRD §1.3/§3.2) | **PARZ** | offline reale solo per le timbrature (`src/lib/offline/punch-queue.ts`, `sync.ts`); persistenza offline del form chiusura (IndexedDB) non trovata in `src/lib/offline/` — coerente col gap "Offline persistence" dell'analisi 2026-01-06 §3.2 |

**Conteggio (30 righe):** 16 IMPLEMENTATE · 6 PARZIALI · 5 ASSENTI · 3 DIVERSAMENTE.
La fotografia "78-82%" di gennaio oggi sottostima contabilità/scadenzario e sovrastimava
presenze/notifiche; la stima "~80% costruito" dell'analisi di agosto è quella più vicina, ma
molti dei suoi rossi (budget scollegato, regole senza motore, catena notifiche) sono stati
risolti dai commit del 5 agosto, lo stesso giorno del documento.

---

## Tabella riassuntiva dei finding

| ID | Sev | Confidenza | Titolo |
|----|-----|------------|--------|
| A7-PRD-001 | P1 | Certa | Push notification promesse da PRD e UI ma mai consegnate: client mai collegato |
| A7-PRD-002 | P2 | Certa | Multi-sede: il codice è single-venue per decisione, i PRD raccontano ancora 3 sedi |
| A7-PRD-003 | P2 | Certa | "Schedule" significa sia scadenza che turno: collisione di naming sistemica |
| A7-PRD-004 | P2 | Certa | What-if cash flow (RF-CF-004): modello `CashFlowScenario` morto nello schema |
| A7-PRD-005 | P2 | Certa | QR timbratura: previsto dal PRD, enum in DB, zero implementazione |
| A7-PRD-006 | P2 | Certa | Tre documenti di analisi contraddittori e tutti superati: nessuna fonte di verità sullo stato |
| A7-PRD-007 | P3 | Certa | Modulo fatture: 2 tab su 4 sono stub (emesse, corrispettivi) |
| A7-PRD-008 | P3 | Certa | Bilinguismo it/en su API e UI: la convenzione vale solo per il futuro |
| A7-PRD-009 | P3 | Certa | `modifiche/`: 5 piani senza indicazione di stato, 3 già implementati |
| A7-PRD-010 | P2 | Probabile | Saldi ferie: UI presente, alimentazione dei dati incerta |
| A7-PRD-011 | P3 | Certa | A-Cube: PRD completo e gate espliciti, zero codice — stato corretto ma da presidiare |
| A7-PRD-012 | P2 | Certa | Il worktree su cui gira l'audit è 37 commit dietro main |

---

## Finding estesi

### [A7-PRD-001] Push notification promesse da PRD e UI ma mai consegnate
- **Severità:** P1
- **Confidenza:** Certa
- **File:** src/components/portal/NotificationSettings.tsx:118-124
- **Evidenza:**
  ```ts
  if (permission === 'granted') {
    // Register service worker and get push subscription
    await navigator.serviceWorker.ready
    // For now, just enable push in preferences
    const newPreferences = { ...preferences, pushEnabled: true }
    ...
    toast.success('Notifiche attivate')
  ```
  Il server è pronto (`src/lib/notifications/fcm.ts`, `/api/notifications/subscribe`,
  modello `PushSubscription` schema:1171) ma il client non chiama mai
  `pushManager.subscribe()` né invia un token: nessuna subscription viene creata.
- **Perché è un problema:** RF-ALERT-002 (PRD_v1_1:1032-1035) e RF-PORTAL-008 promettono push;
  la UI dice "Notifiche attivate" e l'utente crede di ricevere avvisi su turni/anomalie che non
  arriveranno mai. È la definizione di P1 del brief: feature dichiarata funzionante ma rotta.
  L'analisi 2026-08-05 (§7.9 "catena rotta") l'aveva rilevato; il commit `8d01dd2` ha aggiunto la
  campanella in-app ma NON ha chiuso il ramo push.
- **Come verificarlo:** attivare le notifiche dal portale → in DevTools `Application → Push
  Messaging` nessuna subscription; tabella `push_subscriptions` resta vuota.
- **Correzione proposta:** o si completa (`pushManager.subscribe()` + POST a
  `/api/notifications/subscribe` + invio via FCM), o si toglie il toggle push dalla UI lasciando
  in-app ed email, coerente con la regola di `src/CLAUDE.md` ("niente UI che promette
  automazioni inesistenti").
- **Effort:** M

### [A7-PRD-002] Multi-sede: codice single-venue per decisione, PRD mai aggiornati
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/lib/venue.ts:1-23 · PRD/PRD_v1_1.md §2.1, §10.2 · PRD/PRD_Modulo_Gestione_Personale_v1.0.md §1
- **Evidenza:**
  ```ts
  * ARCHITETTURA SINGLE-VENUE (decisione del 5 agosto 2026)
  * L'applicazione gestisce UNA SOLA sede. Il campo `venueId` è presente su
  * quasi tutti i modelli, ma non abilita il multi-tenant ...
  ```
  Il PRD prevede 3 sedi (Sacile, Villa Varda, Casette) e "report multi-sede"; la SPEC utenti la
  esclude (incoerenza già notata come P-DOC-3 nell'analisi 2026-08-05).
- **Perché è un problema:** chiunque legga i PRD pianifica feature multi-sede che il codice
  rifiuta by-design (`POST /api/venues` → 409 sulla seconda sede). Il `venueId` ovunque nello
  schema è debito interpretativo: sembra multi-tenant, non lo è.
- **Come verificarlo:** confrontare il commento di `venue.ts` con PRD_v1_1 §10.2; provare a creare
  una seconda sede via API → 409.
- **Correzione proposta:** una riga di errata in testa a PRD_v1_1 e PRD Personale ("dal 5/8/2026
  l'app è single-venue; multi-sede richiede i 3 passi in `src/lib/venue.ts`").
- **Effort:** S

### [A7-PRD-003] "Schedule" significa sia scadenza che turno
- **Severità:** P2
- **Confidenza:** Certa
- **File:** prisma/schema.prisma:500, 912, 1553 · src/app/api/schedules/route.ts:47 · src/app/api/scadenzario/route.ts:135
- **Evidenza:**
  ```
  model Schedule       { ... @@map("schedules") }        // = SCADENZA (tesoreria)
  model ShiftSchedule  { ... }                            // = pianificazione TURNI
  model ScheduleRule   { ... }                            // = regola dello SCADENZARIO
  // però:
  /api/schedules            → prisma.shiftSchedule.findMany()   (turni!)
  /api/scadenzario          → prisma.schedule.findMany()        (scadenze)
  ```
  In più: `SchedulePayment/Attachment/Reminder/Reconciliation` = scadenzario, ma
  `ScheduleReminder` convive con `shifts/reminder` (route dei turni); in
  `src/lib/reconciliation/` c'è `schedule-matcher.ts` (scadenze) mentre i turni stanno in
  `src/lib/shift-generation/`. Gli enum `ScheduleStatus/Type/Priority/Source` (scadenze) e
  `ShiftScheduleStatus` (turni) si distinguono solo per il prefisso.
- **Perché è un problema:** la route `/api/schedules` NON tocca il modello `Schedule`: è il tipo
  di trappola che produce query sul modello sbagliato o autorizzazioni copiate dal dominio
  sbagliato. Chi arriva dal PRD ("supplier_deadlines", §4.2.6) non ha alcun modo di intuire che
  la tabella si chiami `schedules`.
- **Come verificarlo:** `grep -n "prisma.shiftSchedule" src/app/api/schedules/route.ts` vs
  `grep -n "prisma.schedule.findMany" src/app/api/scadenzario/route.ts`.
- **Correzione proposta:** non serve rinominare ora (migrazione DB costosa): basta un blocco di
  commento in testa ai due modelli + una riga nel `src/CLAUDE.md` ("Schedule=scadenza,
  ShiftSchedule=turni, /api/schedules serve i turni"). Da valutare rename `Schedule→Scadenza` se
  mai si tocca lo schema per altro. Collegare ad A4 per la mappa dei domini.
- **Effort:** S (documentazione) / L (rename)

### [A7-PRD-004] What-if cash flow: modello `CashFlowScenario` morto
- **Severità:** P2
- **Confidenza:** Certa
- **File:** prisma/schema.prisma:1520 · PRD/PRD_v1_1.md:1084-1088 (RF-CF-004)
- **Evidenza:** il modello `CashFlowScenario` esiste nello schema ma
  `grep -rl "cashFlowScenario" src/app/api src/lib` → nessun risultato: zero API, zero UI.
  Il PRD promette "Simulazioni what-if: posticipo/anticipo pagamenti, variazione incassi".
- **Perché è un problema:** tabella in produzione senza scrittori né lettori = requisito PRD
  iniziato a livello schema e abbandonato. Confonde chi legge lo schema (sembra una feature).
- **Come verificarlo:** il grep sopra; la pagina `cash-flow` non ha alcun controllo di scenario.
- **Correzione proposta:** decidere: o si pianifica il what-if (allora il modello resta), o si
  droppa il modello alla prossima migrazione, annotando il gap nel PRD.
- **Effort:** S

### [A7-PRD-005] QR timbratura: previsto, enumerato, mai implementato
- **Severità:** P2
- **Confidenza:** Certa
- **File:** prisma/schema.prisma:1787 (`PunchMethod.QR_CODE`) · PRD Personale RF-ATT-001/003 (righe 1046-1065)
- **Evidenza:** il PRD dedica al QR un requisito intero (tablet con QR rotante ogni 30s, token
  temporale). In `src/` non c'è alcun file/route/componente QR (unico hit di grep:
  `haversine.ts`, falso positivo). `docs/Soluzioni_Timbratura_Dipendenti.md` raccomandava
  l'ibrido QR+GPS: eseguita solo la metà GPS.
- **Perché è un problema:** requisito con enum in DB da mesi: chi legge `PunchMethod` crede che
  il canale esista. È anche un buco anti-frode dichiarato dal PRD (validazione presenza fisica).
- **Come verificarlo:** `grep -ri "qrcode\|qr-code\|qr_code" src/ --include="*.tsx" --include="*.ts"`.
- **Correzione proposta:** decisione esplicita: se il geofencing server-side (commit `bc8658c`)
  è ritenuto sufficiente, rimuovere `QR_CODE` dall'enum e stralciare RF-ATT-003; altrimenti
  pianificarlo. Nota: il lavoro NoBadge sul branch `presenze/regole-orario` può renderlo obsoleto.
- **Effort:** S (stralcio) / L (implementazione)

### [A7-PRD-006] Tre analisi contraddittorie, nessuna fonte di verità sullo stato
- **Severità:** P2
- **Confidenza:** Certa
- **File:** docs/Analisi_PRD_vs_Implementazione_2026-01-04.txt · docs/Analisi_PRD_vs_Implementazione_2026-01-06.md · docs/Analisi_Stato_Progetto_2026-08-05.pdf
- **Evidenza:** a 48 ore di distanza, per lo stesso codice: Budget 40% (01-04) vs 80% (01-06);
  Fase 3 integrazioni 0% (01-04) vs "Riconciliazione 80% operativa" (01-06); "Testing E2E 100%"
  (01-04) contro una suite E2E oggi ineseguibile (baseline: `@playwright/test` rimosso, commit
  `2c8b617`). L'analisi 2026-08-05 è la più solida ma è stata superata lo stesso giorno: dichiara
  "Budget SCOLLEGATO" (oggi in sidebar, `sidebar.tsx:67-82`), "Notifiche CATENA ROTTA" (campanella
  aggiunta in `8d01dd2`; resta rotto solo il push), "Regole CRUD senza motore" (motore in
  `src/lib/schedule-rules/engine.ts`, applicato dai commit `c8645be`→`a099474`), "3 vincoli
  relazionali su 5 non implementati" (tutti e 5 in `constraints.ts:600+`, commit `03beada`).
- **Perché è un problema:** chi pianifica sulla base di questi documenti lavora su gap già chiusi
  o su percentuali mai state vere. Il costo è reale: la roadmap §9 del PDF elenca interventi in
  parte già eseguiti.
- **Come verificarlo:** i riscontri puntuali sopra, tutti verificati su file/commit.
- **Correzione proposta:** un solo documento di stato vivo (o la matrice di questo report come
  base), con data e commit di riferimento in testa; le vecchie analisi marcate "storico" nel
  nome o in un frontespizio.
- **Effort:** S

### [A7-PRD-007] Modulo fatture: 2 tab su 4 sono stub
- **Severità:** P3
- **Confidenza:** Certa
- **File:** src/app/(dashboard)/fatture/layout.tsx:14-19 · fatture/emesse/page.tsx:3-13 · fatture/corrispettivi/page.tsx:3-14
- **Evidenza:**
  ```tsx
  const tabs = [ ...{ value: '/fatture/emesse', label: 'Emesse' },
                 { value: '/fatture/corrispettivi', label: 'Corrispettivi' } ]
  // emesse/page.tsx: "L'emissione ... arriverà con l'integrazione del provider"
  ```
- **Perché è un problema:** lieve: gli stub sono onesti (spiegano che la feature arriverà con
  A-Cube) e risolvono il "3 tab in 404" dell'analisi di agosto. Ma restano navigazione verso il
  nulla, al limite della regola di `src/CLAUDE.md` sull'UI che promette moduli inesistenti.
- **Come verificarlo:** aprire `/fatture/emesse` e `/fatture/corrispettivi`.
- **Correzione proposta:** accettabile così finché il gate A-Cube è vivo; se A-Cube salta,
  rimuovere le tab.
- **Effort:** S

### [A7-PRD-008] Bilinguismo it/en su API e UI
- **Severità:** P3
- **Confidenza:** Certa
- **File:** src/app/api/* (elenco) · src/CLAUDE.md ("Una sola lingua: l'italiano per i nuovi percorsi")
- **Evidenza:** stesse entità, due lingue a seconda dello strato:
  - pagina `(dashboard)/fatture` ↔ API `/api/invoices`; pagina `riconciliazione` ↔ API
    `/api/reconciliation` + `/api/bank-transactions`; pagina `ferie-permessi` ↔ API
    `/api/leave-requests`; pagina `anagrafiche/fornitori` ↔ API `/api/suppliers`; pagina
    `anagrafiche/clienti` ↔ `/api/customers`; pagina `turni` ↔ `/api/schedules` + `/api/shift-definitions`.
  - API italiane: `chiusure`, `prima-nota`, `scadenzario`, `pagamenti`; inglesi: `invoices`,
    `suppliers`, `customers`, `products`, `staff`, `documents`, `constraints`.
  - DB inglese (`Supplier`, `Customer`, `DailyClosure`, `JournalEntry`) con PRD italiano
    (fornitore, cliente, chiusura, movimento prima nota) — la mappa vive solo nella testa di chi
    sviluppa.
- **Perché è un problema:** attrito e rischio di duplicazione: il consolidamento di agosto
  (commit `751c438`) è nato proprio per rimuovere API duplicate. La convenzione nel
  `src/CLAUDE.md` congela il bilinguismo dello stock esistente senza una tabella di mappatura.
- **Come verificarlo:** `find src/app/api -maxdepth 1 -type d | sort` e confronto con le pagine.
- **Correzione proposta:** non rinominare le route (breaking): aggiungere in `src/CLAUDE.md` la
  tabella dominio → pagina → route → modello (10 righe). Collega ad A4 per eventuali cartelle
  parallele.
- **Effort:** S

### [A7-PRD-009] `modifiche/`: piani senza stato, in gran parte già eseguiti
- **Severità:** P3
- **Confidenza:** Certa
- **File:** modifiche/plan/*.md (5 piani + 5 prompt speculari)
- **Evidenza:** nessun piano indica se è stato eseguito. Verifica sul codice/git:
  - `plan-PDF_Chiusura_Cassa.md` → **fatto** (route `chiusure/[id]/pdf`, commit `4db2b62`)
  - `plan-Pagamento_Personale_Chiusura_Cassa.md` → **fatto** (`hourlyRate/totalPay/isPaid` negli
    Zod di `api/chiusure/route.ts:24-26`, commit `cf3bd50`)
  - `plan-Dashboard_Azioni_Rapide.md` → **fatto** (commit `6219fe1`)
  - `plan-Modulo_Chiusura_Cassa.md` → **fatto** (serie commit 3-5 feb)
  - `plan-Dashboard_Avvisi_Inbox.md` → **parziale**: campanella + history sì (`8d01dd2`),
    Telegram / cron scadenze / unificazione BudgetAlert+PriceAlert+NotificationLog mai fatti
- **Perché è un problema:** chi apre `modifiche/` non sa cosa resta da fare; il rischio concreto
  è rifare o ri-pianificare lavoro già consegnato (stesso pattern del finding A7-PRD-006).
- **Come verificarlo:** riscontri sopra.
- **Correzione proposta:** una riga di stato in testa a ciascun piano (fatto il / parziale:
  cosa manca / abbandonato), o spostare i completati in `modifiche/archivio/`.
- **Effort:** S

### [A7-PRD-010] Saldi ferie: UI presente, alimentazione incerta
- **Severità:** P2
- **Confidenza:** Probabile
- **File:** src/components/portal/LeaveBalanceCard.tsx · src/app/api/leave-balance/route.ts:28 · docs/Analisi_Stato_Progetto_2026-08-05.pdf §7.8
- **Evidenza:** la route legge `prisma.leaveBalance.findMany` e la card esiste, ma l'analisi
  di agosto segnala "manca la UI del monte ferie e le card saldo sono sempre vuote". Non ho
  trovato nel codice un punto che POPOLI `LeaveBalance` (nessun seed/cron/trigger individuato
  su questo branch); senza righe in tabella la card resta vuota per sempre.
- **Perché è un problema:** RF-PORTAL-005 promette al dipendente i saldi; un residuo ferie
  sempre a zero è un dato sbagliato mostrato all'utente su un tema retributivo.
- **Come verificarlo:** in produzione: `SELECT count(*) FROM leave_balances;` (non eseguito:
  divieto di query sul DB reale). In alternativa: cercare chi scrive `leaveBalance.create/upsert`
  → su questo branch nessun hit fuori dai test.
- **Correzione proposta:** job/azione admin che inizializza i saldi annui per dipendente e li
  decrementa all'approvazione ferie; oppure calcolo derivato dalle `LeaveRequest` approvate.
- **Effort:** M

### [A7-PRD-011] A-Cube: PRD completo, gate espliciti, zero codice — corretto, ma da presidiare
- **Severità:** P3
- **Confidenza:** Certa
- **File:** tasks/prd-integrazione-acube.md:3-49
- **Evidenza:** stato "In attesa di risposta dal team commerciale"; 6 gate bloccanti (G-1..G-6).
  Nessun `src/lib/acube/` esiste (verificato: `ls src/lib` → assente): il team ha rispettato il
  gate, NON è una feature a metà. `src/lib/sdi/` è il parser FatturaPA usato dall'import manuale,
  vivo e testato (`src/lib/__tests__/sdi-parser.test.ts`) — non va confuso con A-Cube né rimosso.
  Nota: dei gate, G-4 (matcher fornitori su campo cifrato) risulta già risolto
  (`src/lib/sdi/matcher.ts:99` usa `lookupHash`), e G-5 (93 file non committati) è superato
  dai commit di agosto: il PRD non è stato aggiornato.
- **Perché è un problema:** solo di processo: il PRD elenca gate in parte già chiusi; se la
  risposta commerciale arriva tra mesi, nessuno saprà quali prerequisiti sono ancora veri.
- **Come verificarlo:** riscontri sopra.
- **Correzione proposta:** spuntare nel PRD i gate già chiusi (G-4, G-5) con data e commit;
  fissare una data di decadenza per la decisione build/buy.
- **Effort:** S

### [A7-PRD-012] Il worktree dell'audit è 37 commit dietro main
- **Severità:** P2
- **Confidenza:** Certa
- **File:** repo root (branch `scadenzario/stima-data-attesa`, HEAD `68be147`)
- **Evidenza:** `git log --oneline HEAD..main | wc -l` → **37**. Su main (non qui): allocation
  pro-quota dei movimenti (`0270f0d` "il movimento eredita le fette della fattura",
  `a3cd959` "l'annullamento della riconciliazione ritira le fette"), fix fatture/prima-nota.
  `docs/Ciclo_Tesoreria_Modello_Sibill.md:199-201` dichiara l'allocation "assente": vero sul
  worktree, falso su main.
- **Perché è un problema:** tutta la Fase 1 dell'audit (baseline) e i report degli agenti
  fotografano uno stato che main ha già superato di 37 commit: alcuni finding potrebbero
  essere già risolti (o nuovi bug introdotti) su main.
- **Come verificarlo:** comando sopra.
- **Correzione proposta:** dichiararlo nel registro audit; a fine audit rieseguire baseline e
  spot-check dei finding P0/P1 su main prima di pianificare le correzioni.
- **Effort:** S

---

## Compito 2 — Delta rispetto alle analisi di gennaio

**Segnalato mancante a gennaio → RISOLTO oggi** (verificato su codice/commit):

| Gap di gennaio (fonte) | Stato oggi | Prova |
|---|---|---|
| Trigger notifiche mai chiamati dalle API (01-04, tabella dedicata) | Risolto | `notifyShiftPublished`&co. importati in `schedules/[id]/publish`, `leave-requests/[id]/approve|reject`, `attendance/punch`, `attendance/auto-clockout` |
| Auto journal entries da chiusura "parziale" (01-04 §2.2) | Risolto | `src/lib/closure-journal-entries.ts` + `closure-service.ts` (refactor `a42e784`) |
| Budget categories/wizard/mapping "CRITICO" (01-04 §2.1) | Risolto | `BudgetCategory`+`AccountBudgetMapping` (schema:709/743), `BudgetSetupWizard.tsx`, `/api/budget-categories/*` |
| Scambio turni (01-04 §4.4) | Risolto | `/api/shift-swaps`, `portale/scambi` |
| API POST vincoli + UI (01-04 §4.2) | Risolto | `/api/constraints` + `[id]`, `/api/staff/[id]/constraints` |
| Import fatture XML SDI (01-04: 0%) | Risolto (import manuale) | `src/lib/sdi/parser.ts`, upload ZIP, P7M |
| Import estratto conto (01-04: 0%) | Risolto (CSV) | `/api/bank-transactions/import`, `csv-parser.ts` |
| Tracking prezzi (01-04: 0%) | Risolto | v. matrice riga 10 |
| Saldo progressivo prima nota (01-06 §3.3) | Risolto | `/api/prima-nota/saldi` + `saldi/storico`, `RegisterBalanceCards.tsx` |
| BUG-001 Prima Nota `accountId` FK (01-06 §5.1) | Probabilmente risolto | il flusso movimenti è stato riscritto (tab `movimenti/pagamenti/regole`); non riprodotto — Da verificare in A5/A6 |

**Segnalato mancante a gennaio → ANCORA MANCANTE:**

- Sincronizzazione SDI automatica (01-06 §3.1 "priorità critica") — assente, delegata al PRD A-Cube fermo al gate commerciale.
- Open Banking PSD2 (01-06 §3.1) — assente, idem.
- QR code timbratura (01-06 §3.2) — assente (A7-PRD-005).
- Notifiche push reali (01-04 §4.8 "manca collegamento") — il collegamento server c'è, il client no (A7-PRD-001): gap di gennaio ancora aperto nella sostanza.
- AI categorizzazione (01-06 §3.1) — mai fatta come ML; sostituita dalle regole deterministiche (accettabile, da stralciare dal PRD).
- Bulk operations riconciliazione (01-06 §3.3) — nessuna route bulk sotto `/api/bank-transactions`.
- Export XBRL / integrazione commercialista — assente.
- Offline persistence del form chiusura (01-06 §3.2) — in `src/lib/offline/` c'è solo la coda timbrature.

**Completato dopo gennaio senza che nessun documento lo tracci** (git ago 2026): l'intero ciclo
di tesoreria modello Sibill (riconciliazione movimento↔scadenza `87936b1`, regole con azione
`a099474`, data attesa `0ac3311`→`68be147`, ponte fatture→scadenze `b10780e`), consolidamento
sicurezza (cifratura con hash lookup `20a5982`, soft delete scritture `3654055`, storage
centralizzato `2d283b6`), service layer (`a42e784`, `src/lib/services/`), solver turni completato
(`03beada`, `ae070a1`, `3e138da`), sede unica (`751c438`), campanella (`8d01dd2`), termini di
pagamento fornitori (`16dc5fd`). Su main anche l'allocation (A7-PRD-012).

---

## Compito 3 — Feature avviate e abbandonate

1. **A-Cube (SDI/Open Banking)** — NON è codice a metà: zero file, gate rispettato. Va tenuta
   (è la risposta pianificata a 3 assenze della matrice: righe 7, 8, 13), aggiornando i gate già
   chiusi (A7-PRD-011). `src/lib/sdi/` è un'altra cosa (parser import manuale, vivo, testato).
2. **`CashFlowScenario`** — avviata a livello schema e abbandonata: nessun consumer (A7-PRD-004).
3. **`PunchMethod.QR_CODE`** — enum senza implementazione (A7-PRD-005).
4. **`ScheduleRule.contoId`** — campo deprecato nello schema con nota "rimuovere dopo la
   migrazione dei dati" (schema.prisma:1560-1562): coda di migrazione aperta, da chiudere.
5. **`modifiche/`** — 4 piani su 5 completati ma mai marcati; il quinto (Avvisi/Inbox) fermo a
   metà: mancano Telegram, cron scadenze/certificazioni e l'unificazione dei tre sistemi di
   alert (A7-PRD-009). `modifiche/test/` è una directory vuota.
6. **Suite E2E** (`e2e/`, 10 spec) — orfana: `@playwright/test` rimosso dal repo (baseline);
   di fatto una feature di qualità avviata e abbandonata. Di competenza A1/A6, la cito perché
   il PRD (§13 KPI tecnici) presuppone flussi verificati.
7. **Componenti prima nota legacy** — `JournalEntryForm.tsx`/`JournalEntryTable.tsx` risultano
   inutilizzati (knip, baseline) dopo il refactoring a tab: candidati alla rimozione (→ A4).

## Compito 4 — Incoerenze di naming (sintesi; dettaglio nei finding A7-PRD-003 e A7-PRD-008)

- **Schedule = scadenza E turno** (A7-PRD-003) — la più pericolosa: `/api/schedules` ≠ `model Schedule`.
- **Pagine it ↔ API en ↔ DB en**: fatture/`invoices`/`ElectronicInvoice`; fornitori/`suppliers`/`Supplier`;
  clienti/`customers`/`Customer`; ferie-permessi/`leave-requests`/`LeaveRequest`;
  riconciliazione/`reconciliation`+`bank-transactions`/`BankTransaction`; chiusura-cassa/`chiusure`/`DailyClosure` (A7-PRD-008).
- **Scadenza in tre forme**: `Schedule` (tesoreria), `InvoiceDeadline` (rata della fattura,
  schema:1232), "scadenze stimate" (da termini fornitore). Non è duplicazione — il ponte
  `invoiceDeadlineId @unique` (schema:543-545) le collega correttamente — ma senza glossario i
  tre nomi sembrano tre feature.
- Nessuna cartella parallela it/en trovata a livello route (`/api/pagamenti` non ha un gemello
  `/api/payments`; il refactor `751c438` ha rimosso i duplicati): la doppiezza residua è
  fra strati, non dentro lo stesso strato.

## Compito 5 — Feature nel codice ma non nei PRD (da mantenere e documentare)

Nessun PRD copre queste funzionalità già in produzione; l'unica documentazione è
`docs/Ciclo_Tesoreria_Modello_Sibill.md` (ottima, ma copre solo il primo blocco):

1. **Motore regole scadenzario** — `ScheduleRule` (schema:1553), `src/lib/schedule-rules/engine.ts`, UI `scadenzario/regole/*`.
2. **Stima preventiva della data attesa** — `dataAttesa`/`dataAttesaSource` (schema:516-525), `src/lib/scadenzario/stima-data-attesa.ts`, ritardo tipico per fornitore.
3. **Riconciliazione movimento↔scadenza N:M** — `ScheduleReconciliation` (schema:579), `schedule-reconciliation-service.ts`, `reconciliation/schedule-matcher.ts`.
4. **Verifica come asse ortogonale** — `Schedule.verificata` + `prima-nota/[id]/verify`.
5. **Saldo scalare** — `/api/scadenzario/saldo-scalare`, `saldo-scalare-chart.tsx`.
6. **Ricorrenze scadenze** — `Recurrence` (schema:657), `/api/scadenzario/ricorrenze/*`.
7. **Modulo pagamenti** — `Payment` (schema:1427), `/api/pagamenti` + `esegui`, tab in prima nota.
8. **Regole di categorizzazione + proposte** — `CategorizationRule`, `/api/categorization-rules/{proposals,test}`.
9. **Geofencing con policy per sede** — `AttendancePolicy` (schema:1073), validazione server-side in `attendance/punch`.
10. **Timbrature offline con coda** — `PunchMethod.OFFLINE_SYNC`, `src/lib/offline/punch-queue.ts`.
11. **Documenti dipendenti / split cedolini PDF** — `EmployeeDocument` (schema:1603), `/api/documents/upload-bulk`, pagine `documenti-dipendenti` e `portale/documenti`.
12. **Certificazioni dipendente con scadenza** — `Certification` (schema:1409).
13. **Anagrafica clienti** — `Customer` (schema:477), `anagrafiche/clienti` (il PRD conosce solo i fornitori).
14. **Inviti utente con token + email** — `InvitationToken`, `/api/staff/invite` (la SPEC utenti prevede consegna manuale credenziali).
15. **Audit log** — `AuditLog` (schema:1636), `src/lib/audit.ts`.
16. **Spese ricorrenti per il cash flow** — `RecurringExpense` (schema:1371), `/api/recurring-expenses`.
17. **Multi conto bancario** — `BankAccount` (schema:176), `impostazioni/banche-e-conti` (il PRD assume un solo conto banca).
18. Su main, non ancora qui: **allocation pro-quota dei movimenti** ("fette").

Raccomandazione: un'appendice "delta v1.1 → implementato" di 2 pagine (o la promozione del doc
Ciclo Tesoreria a PRD-bis) che elenchi queste 18 voci; senza, ogni futura gap analysis le
riclassificherà come "non richieste" o le ignorerà.

---

## Cosa funziona bene (max 5 righe)

Il ciclo tesoreria (fatture→scadenze→movimenti→riconciliazione) è oltre il PRD ed è l'unica
area con un documento di continuità eccellente (`Ciclo_Tesoreria_Modello_Sibill.md`, aggiornato,
con fonti dichiarate). Il consolidamento di agosto ha chiuso in pochi giorni la maggioranza dei
rossi dell'analisi 2026-08-05, e `src/CLAUDE.md` codifica le lezioni (una lingua, niente route
orfane, soft delete, hash di lookup): il metodo c'è, va solo esteso alla documentazione PRD.

## Zone d'ombra / DA VERIFICARE

- **Saldi ferie** (A7-PRD-010): serve un controllo dati in produzione (non eseguibile in audit).
- **BUG-001 prima nota** (gennaio): non riprodotto dopo il refactoring; da smoke test UI (A5/A6).
- **Offline del form chiusura**: Serwist è attivo ma non ho trovato persistenza IndexedDB del
  form; confermare con test manuale offline.
- **Stato su main**: 37 commit non auditati qui (allocation, fix fatture/prima-nota) — ogni
  finding di quest'area va ricontrollato su main prima delle correzioni (A7-PRD-012).
- **Branch `presenze/regole-orario`**: il motore NoBadge (memoria di progetto: fasi 1-5 riviste)
  non è in questo worktree; la riga 26 della matrice potrebbe essere migliore su quel branch.
- `docs/Analisi_Stato_Progetto_2026-08-05.pdf` §7 (difetti funzionali per modulo) e §9 (roadmap)
  contengono altri difetti puntuali che non ho ricontrollato uno a uno: vanno triangolati con i
  report A5/A6 prima di riusarli.
