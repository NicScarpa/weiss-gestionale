# A4 — Codice orfano e integrazione fra moduli

**Audit di sola lettura · 2026-08-06 · Scope: tutto `src/` (180 route API, ~122k righe)**

Metodo: partito da `audit/baseline-logs/11-knip.log` (50 file, 174 export, 113 tipi inutilizzati),
filtrati i falsi positivi (shadcn `components/ui`, `sw.ts`/serwist, barrel interni), poi
cross-reference sistematico in memoria fra i path di tutte le route `src/app/api/**/route.ts`
e ogni stringa `/api/...` presente in `src/` (fetch, `window.open`, `href`, useQuery).
Ogni finding è stato verificato singolarmente con grep mirato.

## Tabella riassuntiva

| ID | Sev | Confidenza | Titolo |
|----|-----|-----------|--------|
| A4-INT-001 | P1 | Certa | Notifiche push: pipeline server completa, mai agganciata al client — nessun token registrabile |
| A4-INT-002 | P1 | Probabile | Cron mai eseguiti in produzione: `auto-clockout` (solo vercel.json, deploy su Railway) e `shifts/reminder` (nessuno scheduler) |
| A4-INT-003 | P1 | Certa | Chiamata fantasma `/api/prima-nota/balances` + route `saldi`/`saldi/storico` orfane + `refreshBalances` mai invocato |
| A4-INT-004 | P1 | Certa | `RecurringExpense`: letta dal forecast della dashboard, ma il CRUD per popolarla non ha UI |
| A4-INT-005 | P2 | Certa | Modulo previsioni cash-flow manuali: 5 route CRUD complete mai chiamate da nessuna pagina |
| A4-INT-006 | P2 | Certa | 26 route API su 180 senza alcun chiamante (14%) — inventario completo |
| A4-INT-007 | P2 | Certa | Guardie e infrastrutture scritte e TESTATE mai collegate: `requireAuth`, `requireVenueAccess`, rate-limit per route, `api-validation`, `cache`, `errors`, `ErrorBoundary` |
| A4-INT-008 | P2 | Certa | 5 file di schemi Zod orfani: le route dei rispettivi domini non li importano |
| A4-INT-009 | P2 | Certa | Doppio flusso di import fatture VIVO in parallelo: `CaricaFattureDialog` e `InvoiceImportDialog` sugli stessi endpoint |
| A4-INT-010 | P2 | Certa | `formatCurrency` definita 15 volte (3 solo in `lib/`), con output incoerente sui null; stesso pattern per le date |
| A4-INT-011 | P2 | Certa | 6 file di tipi interamente morti in `src/types/` accanto ai gemelli vivi (payment/payments, cashflow/cash-flow, categorization×2, fatture) |
| A4-INT-012 | P2 | Certa | Contratti di tipo persi al confine API→UI: `as unknown as` e `: any` su dati di dominio |
| A4-INT-013 | P3 | Certa | Componenti e barrel orfani: `JournalEntryForm/Table`, `ErrorBoundary` mai montato, `ConfidenceBadge` duplicato, alias morti |
| A4-INT-014 | P3 | Certa | Export di dominio "seconda generazione" morti: sdi/matcher, notifications/send, offline/punch-queue, geolocation client, budget-utils, price-tracking |

**Totale: 4 P1 · 8 P2 · 2 P3.** Volume misurato del codice orfano puro: **2.811 righe** in 18 file
lib/types/components a zero import + **~1.600 righe** nelle 10 route orfane principali.

---

## Finding estesi

### [A4-INT-001] Notifiche push: pipeline server completa, mai agganciata al client
- **Severità:** P1
- **Confidenza:** Certa
- **File:** `src/components/portal/NotificationSettings.tsx:117-126`, `src/app/api/notifications/subscribe/route.ts:18` (POST/DELETE/GET, nato `7f49379` 2026-01-04), `src/lib/notifications/send.ts:106,125,187`, `src/app/sw.ts`
- **Evidenza:**
  ```ts
  // NotificationSettings.tsx:117-126 — l'unico punto in cui si potrebbe registrare il token
  if (permission === 'granted') {
    // Register service worker and get push subscription
    await navigator.serviceWorker.ready
    // For now, just enable push in preferences   ← stub esplicito
    ...
    toast.success('Notifiche attivate')            ← promessa falsa all'utente
  ```
  `grep -rn "notifications/subscribe" src --include="*.tsx"` fuori da `src/app/api` → **0 risultati**.
  Nel client non esiste alcuna chiamata a Firebase `getToken()` né a `POST /api/notifications/subscribe`.
- **Perché è un problema:** tutto il resto della catena esiste ed è collegato: ~10 route chiamano
  `notify*` (`leave-requests/[id]/approve`, `schedules/[id]/publish`, `shift-swaps`, `documents/[id]/assign`,
  `attendance/punch`…), `send.ts` legge `pushSubscription.fcmToken` e invia via FCM, `sw.ts` ha gli
  handler push pronti. Ma la tabella `pushSubscription` non è popolabile da nessun percorso: **ogni
  invio push è un no-op silenzioso**. L'utente clicca "attiva notifiche", vede "Notifiche attivate",
  e non riceverà mai una notifica di turno pubblicato, ferie approvate o anomalia presenze.
- **Come verificarlo:** `grep -rn "subscribe\|getToken" src/components src/hooks --include="*.tsx"` →
  nessuna registrazione token; poi attivare le notifiche dal portale e pubblicare un turno: nessuna push.
- **Correzione proposta:** implementare in `requestPushPermission` la registrazione FCM
  (`getToken` con VAPID key) e la POST a `/api/notifications/subscribe`; in alternativa rimuovere il
  toggle push dalla UI finché non esiste, come impone `src/CLAUDE.md` ("Niente UI che promette
  automazioni inesistenti").
- **Effort:** M

### [A4-INT-002] Cron mai eseguiti in produzione: auto-clockout e shifts/reminder
- **Severità:** P1
- **Confidenza:** Probabile (certa per `shifts/reminder`; per `auto-clockout` serve verifica sul dashboard Railway)
- **File:** `vercel.json:1-8`, `src/app/api/attendance/auto-clockout/route.ts` (POST,GET), `src/app/api/shifts/reminder/route.ts:9-21` (POST,GET, nato `5190d15` 2026-01-04)
- **Evidenza:**
  ```json
  // vercel.json — unico scheduler dichiarato nel repo
  { "crons": [ { "path": "/api/attendance/auto-clockout", "schedule": "0 * * * *" } ] }
  ```
  `shifts/reminder` pretende `Bearer ${CRON_SECRET}` (route.ts:20-21) ma **nessun file del repo**
  (vercel.json, workflow, script) lo invoca: `grep -rn "shifts/reminder" .` trova solo la route e i
  documenti di piano. La produzione gira su **Railway** (nessun `railway.json`/`Procfile` nel repo;
  i cron di `vercel.json` sono eseguiti solo da Vercel).
- **Perché è un problema:** l'auto-clockout orario (chi dimentica di timbrare l'uscita) e i
  promemoria turni sono automazioni scritte, autenticate e complete che con ogni probabilità **non
  girano mai**: timbrature restano aperte, anomalie non vengono create, nessun reminder parte
  (che tanto sarebbe push → vedi INT-001, doppio guasto).
- **Come verificarlo:** controllare su Railway se esistono cron/job configurati verso questi due
  endpoint; in DB (fuori audit) l'assenza di punch chiusi da `auto-clockout` lo confermerebbe.
- **Correzione proposta:** configurare i due cron su Railway (o GitHub Actions schedulate con
  `CRON_SECRET`) e rimuovere `vercel.json` se Vercel non è più la piattaforma.
- **Effort:** S

### [A4-INT-003] Chiamata fantasma `/api/prima-nota/balances` + saldi orfani + refresh morto
- **Severità:** P1
- **Confidenza:** Certa
- **File:** `src/components/prima-nota/PrimaNotaContext.tsx:49-54`; route orfane `src/app/api/prima-nota/saldi/route.ts` e `saldi/storico/route.ts` (GET, nate `b144984` 2026-01-02); `src/app/(dashboard)/prima-nota/layout.tsx:29-36`
- **Evidenza:**
  ```ts
  // PrimaNotaContext.tsx:49-54
  const refreshBalances = async () => {
    const response = await fetch(`/api/prima-nota/balances?venueId=${venueId}`)  // route inesistente
  ```
  `/api/prima-nota/balances` non esiste: la richiesta finirebbe su `/api/prima-nota/[id]` con
  `id="balances"` (GET → 404 sull'entry). Le route vere (`/saldi`, `/saldi/storico`) hanno **0
  chiamanti**. E `grep -rn "refreshBalances" src` fuori dal context → **0**: la funzione esposta dal
  provider non è mai invocata da `MovimentiClient`/`PagamentiClient`.
- **Perché è un problema:** tre pezzi dello stesso contratto scritti in sessioni diverse e mai
  collegati: il layout legge i saldi via Prisma lato server (layout.tsx:29-36), il client ha un
  refresh che punta a un endpoint fantasma inglese, il server espone l'endpoint italiano che nessuno
  chiama. Risultato concreto: dopo aver creato/eliminato un movimento le card saldi **restano
  stantie** fino al reload manuale (in `MovimentiClient` non c'è `router.refresh()` né mutate del
  layout), e il giorno in cui qualcuno chiamerà `refreshBalances` otterrà un errore.
- **Come verificarlo:** `grep -rn "prima-nota/balances\|prima-nota/saldi" src` e confronto con
  `find src/app/api/prima-nota -name route.ts`; in UI: creare un movimento e osservare le card.
- **Correzione proposta:** far puntare `refreshBalances` a `/api/prima-nota/saldi`, invocarlo (o
  `router.refresh()`) dopo ogni mutazione; decidere se `/saldi/storico` serve o va rimossa.
- **Effort:** S

### [A4-INT-004] `RecurringExpense` letta dal forecast ma non popolabile: CRUD senza UI
- **Severità:** P1
- **Confidenza:** Certa (la disconnessione; l'effetto sui numeri dipende dai dati in prod, non interrogabili)
- **File:** `src/app/api/dashboard/forecast/route.ts` (usa `prisma.recurringExpense`); route orfane `src/app/api/recurring-expenses/route.ts` (GET,POST) e `[id]/route.ts` (GET,PUT,DELETE), nate `bafa2d6` 2026-01-06; `prisma/schema.prisma:1371`
- **Evidenza:** `grep -rn "recurringExpense" src -l` → solo 3 file: le due route CRUD orfane e
  `dashboard/forecast`. `grep -rn "recurring" src/components src/app/(dashboard)` → **0 file**:
  nessuna pagina, form o fetch permette di creare una spesa ricorrente.
- **Perché è un problema:** il forecast mostrato in dashboard è progettato per includere le spese
  ricorrenti, ma la tabella è alimentabile solo da API mai esposte in UI: la previsione di cassa
  **esclude sistematicamente le uscite ricorrenti** (affitti, canoni, rate) o si basa su dati
  seedati una tantum e mai aggiornabili. Numeri di liquidità sottostimati senza alcun segnale.
- **Come verificarlo:** `grep -rn "api/recurring-expenses" src --include="*.tsx"` → 0; aprire la
  dashboard e cercare un modo per inserire una spesa ricorrente: non esiste.
- **Correzione proposta:** o si costruisce la pagina di gestione spese ricorrenti sopra il CRUD già
  pronto, o si rimuovono route e ramo `recurringExpense` dal forecast per non mentire sul numero.
- **Effort:** M (UI) / S (rimozione)

### [A4-INT-005] Modulo previsioni cash-flow manuali: 5 route CRUD mai chiamate
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `src/app/api/cashflow/forecasts/route.ts` (GET,POST), `[id]/route.ts` (GET,PATCH,DELETE), `[id]/lines/route.ts` (GET,POST), `[id]/lines/[lineId]/route.ts` (PATCH,DELETE), `[id]/summary/route.ts` (GET) — tutte nate in `1be468e` 2026-02-14
- **Evidenza:** cross-reference completo route↔chiamate: nessuna stringa `cashflow/forecasts` in
  `src/` fuori da `src/app/api`. La pagina `src/app/(dashboard)/cash-flow/page.tsx` usa solo
  `projection`, `summary`, `alerts`. I tipi gemelli (`CashFlowForecast`, `CashFlowForecastLine` in
  `src/types/cash-flow.ts:63-95`) sono flaggati inutilizzati da knip.
- **Perché è un problema:** un intero sottodominio (previsioni manuali con righe, stati, summary —
  modello `CashFlowForecast` in schema) è stato scritto lato server in una sessione e mai collegato:
  5 endpoint completi di validazione e auth che nessun utente può raggiungere. È il caso più grande
  di "modulo scritto a metà" del repo. Nota: `1be468e` è un commit-backup («backup:
  pre-unificazione-anagrafiche») che ha introdotto 29 file route in blocco; 6 di questi sono ancora
  oggi orfani (vedi INT-006).
- **Come verificarlo:** `grep -rn "cashflow/forecasts" src --include="*.tsx"` → 0.
- **Correzione proposta:** decidere il destino del modulo: costruire la UI prevista o eliminare le
  5 route + modello per fermare il costo di manutenzione (migrano, si autenticano, si testano a vuoto).
- **Effort:** L (UI) / M (rimozione con migration)

### [A4-INT-006] 26 route API su 180 senza alcun chiamante (14%)
- **Severità:** P2 (contenitore; i casi con impatto proprio sono promossi nei finding P1 sopra)
- **Confidenza:** Certa
- **File/Evidenza:** cross-reference sistematico (script in memoria) fra i 180 path route e tutte le
  stringhe `/api/` in `src/` (fetch, window.open, href, useQuery), più grep singolo per ciascuna:

| Route orfana | Metodi | Nata il | Nota |
|---|---|---|---|
| `/api/attendance/anomalies/[id]` | GET,PUT | 2026-01-04 | la UI usa solo `/resolve` |
| `/api/attendance/auto-clockout` | POST,GET | 2026-01-04 | → INT-002 |
| `/api/attendance/history` | GET | 2026-01-04 | la UI usa `/records` e `/daily-summary` |
| `/api/budget-categories/reorder` | PUT | 2026-01-04 | riordino mai esposto in UI |
| `/api/budget/alerts/generate` | POST | 2026-01-05 | logica comunque invocata internamente da `closure-service.ts:176` |
| `/api/cashflow/alerts/bulk` | PATCH,GET | 2026-02-14 | AlertPanel usa solo `/api/cashflow/alerts` |
| `/api/cashflow/forecasts` (+4 figlie) | CRUD completo | 2026-02-14 | → INT-005 |
| `/api/categorization-rules/test` | POST | 2026-02-14 | test regole senza UI |
| `/api/constraints` | GET,POST | 2026-01 | doppione: la UI crea/lista via `/api/staff/[id]/constraints`, usa `/api/constraints/[id]` solo per update/delete |
| `/api/notifications/subscribe` | POST,DELETE,GET | 2026-01-04 | → INT-001 |
| `/api/pagamenti/summary` | GET | 2026-02-14 | |
| `/api/prima-nota/metadata` | GET | 2026-02-14 | |
| `/api/prima-nota/recategorize` | POST | 2026-02-14 | |
| `/api/prima-nota/saldi` (+`/storico`) | GET | 2026-01-02 | → INT-003 |
| `/api/prima-nota/versamento` | POST | 2026-01-02 | feature "versamento in banca" mai esposta (il tipo `BankDepositData` è tra i tipi morti) |
| `/api/products/[id]/price-history` | GET | 2026-01-06 | price tracking a metà: alert vivi, storico prezzi senza UI |
| `/api/recurring-expenses` (+`[id]`) | CRUD | 2026-01-06 | → INT-004 |
| `/api/scadenzario/[id]/stato` | PATCH | 2026-02-21 | cambio stato: la UI passa da altre vie |
| `/api/shifts/reminder` | POST,GET | 2026-01-04 | → INT-002 |
| `/api/venues/[id]/cash-stations` | GET | 2026-01-02 | (`/api/venues/[id]/staff` invece È usato: turni/[id]/page.tsx:104) |

- **Perché è un problema:** ogni route orfana è superficie di attacco autenticata da mantenere,
  migra a ogni refactor e dà l'illusione che la feature esista. Le date mostrano il pattern
  denunciato dal committente: tre ondate (2 gen, 4-6 gen, 14 feb) di sessioni che hanno scritto API
  senza mai chiudere il cerchio con la UI. Nota positiva: i gruppi duplicati storici
  (`/api/payments`, `/api/categorizzazione`, `/api/regole-categorizzazione`) **non esistono più** —
  il consolidamento citato in `src/CLAUDE.md` li ha rimossi; sopravvive `/api/pagamenti` (vivo) e
  `/api/categorization-rules` (vivo, unico superstite in inglese contro la convenzione).
- **Come verificarlo:** per ciascuna: `grep -rn "<path>" src --include="*.ts" --include="*.tsx" | grep -v "^src/app/api"` → vuoto.
- **Correzione proposta:** per ognuna decidere: collegare (se la feature serve) o cancellare route+
  tipi+validazioni collegate. Aggiungere a CI un check knip/route-consumer per impedire recidive.
- **Effort:** M (triage complessivo)

### [A4-INT-007] Guardie e infrastrutture scritte e TESTATE, mai collegate
- **Severità:** P2 (l'impatto security è di A2; qui si certifica la disconnessione)
- **Confidenza:** Certa
- **File:** `src/lib/api-utils.ts:118,153`; `src/lib/rate-limit.ts:33,59,72`; `src/lib/api-validation.ts`; `src/lib/cache.ts`; `src/lib/errors.ts`; `src/components/ErrorBoundary.tsx`
- **Evidenza:** `grep -rn "requireAuth\|requireVenueAccess" src` fuori da `api-utils.ts` e test →
  **0 route** le usano; eppure `src/lib/__tests__/api-utils.test.ts` le esercita (11 occorrenze) e
  `rate-limit.test.ts` ha 45 blocchi describe/it: contribuiscono ai "504 test verdi" della baseline
  proteggendo codice che non protegge nulla. Il rate-limit è applicato SOLO al login
  (`src/lib/auth.ts:5` usa `authRateLimit`); `ratelimit`, `importRateLimit`, `criticalRateLimit`
  (pensati per import CSV e operazioni critiche) non arrivano a nessuna route. `@/lib/cache`,
  `@/lib/errors`, `@/lib/api-validation`: **0 import** ciascuno. `ErrorBoundary`: mai montato in
  alcun layout → un errore di rendering in un client component butta giù la pagina senza fallback.
- **Perché è un problema:** è il caso da manuale del dubbio del committente: guardie di auth per
  route e per venue, rate-limiting per import, gestione errori centralizzata — tutte scritte,
  testate e mai importate. La suite verde certifica un'infrastruttura fantasma.
- **Come verificarlo:** i grep sopra; `npx vitest run src/lib/__tests__/api-utils.test.ts` passa.
- **Correzione proposta:** adottare `requireAuth`/`requireVenueAccess` nelle route finanziarie (o
  eliminarle e dichiarare che l'auth inline è lo standard); applicare `importRateLimit` a
  `bank-transactions/import`, `prima-nota/import`, `documents/upload-bulk`; montare `ErrorBoundary`
  nel root layout; cancellare `cache.ts`/`errors.ts`/`api-validation.ts` se non adottati.
- **Effort:** M

### [A4-INT-008] 5 file di schemi Zod orfani
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `src/lib/validations/attendance.ts`, `bank-transactions.ts`, `chiusura-cassa.ts`, `invoices.ts`, `users.ts` (insieme: parte delle 2.811 righe orfane)
- **Evidenza:** `grep -rE "from ['\"]@/lib/validations/<nome>['\"]" src` → 0 importer per tutti e
  cinque (mentre `validations/budget.ts`, `prima-nota.ts`, `reconciliation.ts` ecc. sono vivi ma con
  molti export singoli morti, cfr. knip righe 208-218).
- **Perché è un problema:** gli schemi di validazione di presenze, movimenti bancari, chiusura cassa,
  fatture e utenti esistono ma le route corrispondenti validano con schemi inline riscritti
  localmente (es. `attendance/punch/route.ts` definisce il proprio `z.object`): due fonti di verità,
  e nessuna garanzia che coincidano. Il file orfano è quello che uno sviluppatore aggiornerà per
  sbaglio credendo di cambiare la validazione reale.
- **Come verificarlo:** grep sopra; confrontare lo schema inline di `punch/route.ts` con
  `validations/attendance.ts`.
- **Correzione proposta:** unificare: le route importano gli schemi condivisi, oppure si eliminano i
  5 file per lasciare una sola fonte.
- **Effort:** M

### [A4-INT-009] Doppio flusso di import fatture vivo in parallelo
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `src/components/fatture/CaricaFattureDialog.tsx:140,180` (montato da `src/app/(dashboard)/fatture/page.tsx:13`) e `src/components/invoices/InvoiceImportDialog.tsx:165,186` (montato da `InvoiceList.tsx:686`, pagina `fatture/ricevute`)
- **Evidenza:** entrambi chiamano `POST /api/invoices/parse` e `POST /api/invoices`; ognuno ha il
  proprio stato di avanzamento, la propria gestione errori, il proprio `formatCurrency` locale
  (rispettivamente riga 235 e 213). Le cartelle bilingue `components/fatture/` e
  `components/invoices/` coesistono per lo stesso dominio.
- **Perché è un problema:** due implementazioni dello stesso flusso critico (import fatture XML/P7M)
  evolvono separatamente: un fix applicato a una (es. gestione fornitore nuovo, presente solo in
  `InvoiceImportDialog` con `supplierData`/`createNewSupplier`) non arriva all'altra. L'utente ha
  due esperienze diverse per la stessa operazione a seconda della pagina da cui parte.
- **Come verificarlo:** aprire `/fatture` e `/fatture/ricevute`: due dialog di import diversi.
- **Correzione proposta:** eleggere un solo dialog (il più completo è `InvoiceImportDialog`),
  montarlo in entrambe le pagine, eliminare l'altro e la cartella doppione.
- **Effort:** M

### [A4-INT-010] `formatCurrency` ×15 con output incoerente sui null
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `src/lib/utils.ts:8`, `src/lib/constants.ts:58`, `src/lib/invoice-utils.ts:114` + 12 copie locali (DashboardClient:85, 3 report client, PrimaNotaSettings:208, CashFlowForecast:76, CaricaFattureDialog:235, schedule-reconciliation-panel:52, InvoiceImportDialog:213, MovimentiTable:45, PagamentiTable:67, PrimaNotaPdfTemplate:171)
- **Evidenza:**
  ```ts
  // invoice-utils.ts:115 — caso null:   '€ 0,00'  (simbolo davanti)
  if (value === null || value === undefined) return '€ 0,00'
  // Intl it-IT (tutte le altre):        '0,00 €'  (simbolo dietro)
  ```
- **Perché è un problema:** 15 definizioni per la stessa formattazione monetaria in un gestionale
  contabile: oggi quasi tutte coincidono, ma il caso null/undefined già diverge (`€ 0,00` vs
  `0,00 €` nella stessa schermata fatture) e ogni nuova copia è un punto di deriva. Stesso pattern
  per le date (`constants.formatDate`, `invoice-utils.formatDateIT` + `formatDateFullIT` orfana).
- **Come verificarlo:** `grep -rn "formatCurrency" src --include="*.ts*" | grep -c "function formatCurrency\|const formatCurrency"` → 15.
- **Correzione proposta:** una sola `formatCurrency` in `lib/utils.ts` (firma tollerante ai null),
  sostituzione meccanica delle 14 copie; regola ESLint `no-restricted-syntax` per impedirne di nuove.
- **Effort:** M

### [A4-INT-011] 6 file di tipi interamente morti accanto ai gemelli vivi
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `src/types/payment.ts` e `payments.ts` (0 import entrambi), `cashflow.ts` (0 import; il vivo è `cash-flow.ts`), `categorization.ts` e `categorization-rule.ts` (0 import; i tipi vivi stanno in `prima-nota.ts:294-399`), `fatture.ts` (0 import)
- **Evidenza:** `payment.ts` definisce `enum PaymentType { BONIFICO... }`, `payments.ts` ridefinisce
  `type PaymentType = 'BONIFICO' | ...` — due generazioni dello stesso concetto, entrambe morte; la
  terza generazione (viva) è in `types/prima-nota.ts`. Grep esatto `from '@/types/<nome>'` → 0 per
  tutti e sei.
- **Perché è un problema:** l'autocomplete propone tre `PaymentType` diversi; importare quello
  sbagliato compila (structural typing) ma scolla il tipo dal contratto reale dell'API. È la traccia
  fossile delle "sessioni successive" del committente: ogni sessione ha rifatto i tipi invece di
  trovare i precedenti.
- **Come verificarlo:** grep sopra; knip righe 47-52 del log.
- **Correzione proposta:** cancellare i 6 file; eventualmente rinominare `cash-flow.ts` per evitare
  la ricomparsa del gemello senza trattino.
- **Effort:** S

### [A4-INT-012] Contratti di tipo persi al confine API→UI
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `src/app/api/prima-nota/route.ts:279`, `src/app/api/users/route.ts:125,271`, `src/app/(dashboard)/scadenzario/[id]/page.tsx:73,755`, `src/components/staff/tabs/DocumentsTab.tsx:39,78`, `LeaveTab.tsx:137-293`, `ScheduleTab.tsx:35,105`
- **Evidenza:**
  ```ts
  // prima-nota/route.ts:279 — la risposta API viene "promossa" a JournalEntry senza verifica
  })) as unknown as JournalEntry[]
  // staff/tabs/LeaveTab.tsx:293 — il dato arriva in UI come any
  {requests.map((req: any) => {
  ```
  19 occorrenze di `as unknown as` (le più benigne sono i JSON Prisma), 15 `: any` concentrate
  nelle tab staff (Documents/Leave/Schedule) e nella pagina allegati scadenzario.
- **Perché è un problema:** proprio nei punti di sutura API↔UI — dove i moduli costruiti in sessioni
  diverse si incontrano — il typechecker è spento: un rename di campo lato API (es. `status` →
  `state` in leave-requests) non romperebbe la build ma la pagina. Coerente con i 35 errori dello
  strict mode mai applicato (baseline).
- **Come verificarlo:** `grep -rn "as unknown as" src | grep -v __tests__` e `grep -rnE ": any\b" src/components/staff`.
- **Correzione proposta:** tipizzare le risposte con i tipi vivi già esistenti (`types/schedule.ts`,
  `types/prima-nota.ts`); vietare `any` nei componenti con la regola ESLint già in warning.
- **Effort:** M

### [A4-INT-013] Componenti e barrel orfani
- **Severità:** P3
- **Confidenza:** Certa
- **File:** `src/components/prima-nota/JournalEntryForm.tsx` + `JournalEntryTable.tsx` (importati solo dal barrel `prima-nota/index.ts`, anch'esso a 0 import; i vivi sono `movimenti/MovimentoFormDialog` e `MovimentiTable`); `src/components/ErrorBoundary.tsx` (vedi INT-007); `src/components/cashflow/ConfidenceBadge.tsx` (0 import — il gemello vivo è `reconciliation/ConfidenceBadge.tsx`, usato da BankTransactionTable:20 e MatchDialog:17); `RegisterBalanceCards.tsx:150` (`SingleRegisterCard` mai usata); `shared/FiltersToolbar.tsx:17` (si usano solo `SearchInput`/`DateRangePicker`, non il componente eponimo); `src/components/attendance/index.ts`; alias `CreateScheduleSheet` (create-schedule-sheet.tsx:611 — le pagine usano solo l'alias `CreateScheduleDialog`).
- **Perché è un problema:** rumore puro ma insidioso: `JournalEntryForm` è la prima generazione del
  form movimenti — chi la modifica non vede effetti in app. Da knip, filtrati i falsi positivi
  shadcn/serwist/barrel, il codice DOMINIO davvero orfano è questo elenco più INT-007/008/011.
- **Come verificarlo:** grep dei nomi fuori dai file di definizione → 0.
- **Correzione proposta:** cancellazione secca; knip in CI con ignore-list per `components/ui`.
- **Effort:** S

### [A4-INT-014] Export di dominio "seconda generazione" morti nei moduli vivi
- **Severità:** P3
- **Confidenza:** Certa
- **File/Evidenza (campione verificato dal log knip):** `sdi/matcher.ts:58,114,185`
  (`findSupplierByVat`, `extractSupplierData`, `updateSupplierFromData` morti — le route usano la
  generazione nuova `matchSupplier`/`createSupplierFromData`, viva in `invoices/route.ts:6`);
  `notifications/send.ts:306-338` (`markNotificationAsRead`, `getUnreadNotifications`,
  `getNotificationHistory` — la route history fa query proprie); `offline/punch-queue.ts:94-287`
  (7 funzioni della coda offline mai importate: la sync passa da `offline/sync.ts`);
  `geolocation/index.ts:16-233` (la versione client `isWithinRadius`/`useGeolocation`/`checkVenueDistance`
  è morta — il geofencing vive server-side in `attendance/punch/route.ts:92-123` con la sola
  `calculateDistance`); `budget-utils.ts` (10 funzioni), `price-tracking/index.ts:242`
  (`getPriceTrackingStats`), `closure-calculations.ts:41`, `p7m-utils.ts:67`,
  `reconciliation/schedule-matcher.ts:142` (`findScheduleCandidates`), `schedule-rules/engine.ts:161`
  (`risolviRegolaScadenza`), `api-utils.ts:266` (`withRateLimitHeaders`), `auth.ts:213,235`
  (`hasPermission`/`getUserPermissions` + `utils/permissions.ts:24` — un intero layer RBAC
  dichiarativo mai adottato: le route controllano i ruoli inline).
- **Perché è un problema:** ogni voce è una funzione plausibile che un futuro sviluppatore (o
  agente) importerà credendola il percorso ufficiale. Il layer permessi morto in particolare va
  segnalato ad A2: la matrice permessi scritta non corrisponde necessariamente ai check inline reali.
- **Come verificarlo:** knip righe 122-241 del log + grep singolo per nome.
- **Correzione proposta:** potatura guidata da knip in CI; per il layer RBAC decisione esplicita
  (adottarlo o cancellarlo).
- **Effort:** M (potatura complessiva)

---

## Cosa funziona bene

Il consolidamento di agosto ha davvero rimosso i gruppi di route duplicati storici (`/api/payments`,
`/api/categorizzazione`, `/api/regole-categorizzazione` non esistono più) e i 13 handler-stub
`console.log` di PagamentiClient/MovimentiClient segnalati dal DEBUG_REPORT sono spariti (0 residui).
Il service layer (`closure-service`, `invoice-schedule-service`, `schedule-reconciliation-service`) è
correttamente importato dalle route; nessun feature flag né ramo `if (false)` trovato; il grosso dei
50 "unused files" di knip su `components/ui`, `sw.ts`/serwist e i barrel budget/chiusura sono falsi
positivi verificati (i componenti budget e cashflow sono tutti montati).

## Zone d'ombra / DA VERIFICARE

- **Cron su Railway**: il dashboard Railway non è ispezionabile dal repo; se esistono job esterni
  verso `auto-clockout`/`shifts/reminder`, INT-002 si ridimensiona (resta il vercel.json fuorviante).
- **Tabelle realmente vuote**: `pushSubscription`, `recurringExpense`, `cashFlowForecast` — la
  conferma "mai popolate" richiederebbe query in produzione, vietata da questo audit.
- **Chiamate costruite dinamicamente**: il cross-reference copre stringhe letterali e template; URL
  assemblati per concatenazione pura sfuggirebbero (nessun indizio che esistano, ma non escludibile).
- **`nuqs`** (segnalata da depcheck): confermata a 0 occorrenze in `src/` → rimovibile da package.json.
- Le route chiamate solo da pagine a loro volta irraggiungibili non sono state ricorsivamente
  verificate (fuori scope: la raggiungibilità delle pagine dalla navigazione è di A3/A6).
