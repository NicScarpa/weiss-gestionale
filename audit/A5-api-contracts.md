# A5 — Contratti API e coerenza

**Audit di sola lettura · 2026-08-06 · Agente A5**
Scope: `src/app/api/**` (180 route), `src/lib/api-utils.ts`, `src/lib/api-validation.ts`,
`src/lib/errors.ts`, `src/lib/validations/**`, `src/hooks/**`, `src/lib/swagger.ts`, client TanStack Query.
Coordinamento: autorizzazione → A2; orfanità route → A4.

## Tabella riassuntiva

| ID | Sev | Confidenza | Titolo |
|----|-----|-----------|--------|
| A5-API-009 | P1 | Certa | Ordinamento con campo arbitrario dal client (products, scadenzario) |
| A5-API-012 | P1 | Certa | GET /api/staff/invite crea un token di invito (side effect su metodo safe) |
| A5-API-017 | P1 | Certa | Macchina a stati del pagamento scadenza duplicata in 4 punti divergenti |
| A5-API-018 | P1 | Certa | Marcare una scadenza SCADUTA imposta `dataPagamento` su scadenza non pagata |
| A5-API-001 | P2 | Certa | Envelope di successo: 4 convenzioni diverse tra moduli |
| A5-API-002 | P2 | Certa | Creazioni a 200 invece di 201, incoerenti anche dentro lo stesso modulo |
| A5-API-003 | P2 | Certa | Tre infrastrutture di contratto (api-utils, api-validation, errors) — adozione ~0 |
| A5-API-004 | P2 | Certa | `error.message` interno esposto al client con status 500 |
| A5-API-005 | P2 | Certa | Zod parse non gestito: errori di validazione restituiti come 500 |
| A5-API-006 | P2 | Certa | Forma di `details` incoerente; client accoppiato alla stringa d'errore; lingua mista |
| A5-API-007 | P2 | Certa | Route senza alcun try/catch (pagamenti, cashflow) |
| A5-API-008 | P2 | Certa | Errori Prisma (P2002/P2025) mai mappati → 500 generici |
| A5-API-010 | P2 | Certa | `limit` di paginazione senza tetto in quasi tutte le liste |
| A5-API-011 | P2 | Certa | 68 file route con `findMany` senza `take` |
| A5-API-015 | P2 | Certa | TanStack Query: chiavi diverse per la stessa risorsa, invalidazioni parziali |
| A5-API-016 | P2 | Certa | Due regimi di fetch nel client; KPI scadenzario stale e errori silenziati |
| A5-API-019 | P2 | Certa | Decimal serializzati come stringa ma tipizzati `number` nel contratto TS |
| A5-API-013 | P3 | Certa | PUT con semantica PATCH, PATCH alias di PUT, toggle non idempotente |
| A5-API-014 | P3 | Certa | Swagger: 2 route documentate su 180, claim di rate limiting falso |

**Totale: 19 finding — 4 P1, 13 P2, 2 P3.**

---

## 1. Coerenza del formato di risposta

### [A5-API-001] Envelope di successo: 4 convenzioni diverse tra moduli
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/app/api/suppliers/route.ts:96 · src/app/api/staff/route.ts:143,220 · src/app/api/pagamenti/route.ts:61 · src/app/api/scadenzario/route.ts:306-312 · src/app/api/bank-accounts/route.ts
- **Evidenza:**
  ```ts
  // suppliers/route.ts:96          → chiave-risorsa
  return NextResponse.json({ suppliers })
  // staff/route.ts:143 (GET)       → { data }
  return NextResponse.json({ data: staff })
  // staff/route.ts:220 (PUT)       → oggetto nudo, stesso file
  return NextResponse.json(updatedStaff)
  // pagamenti/route.ts:61          → array nudo
  return NextResponse.json(pagamenti)
  // scadenzario/route.ts:306       → wrapper ad hoc
  return NextResponse.json({ schedule: {...}, regolaApplicata: regola.applicata })
  ```
  In più `bank-accounts/route.ts` risponde `{ accounts: formatted }` — stessa chiave di
  `/api/accounts` (piano dei conti), risorsa diversa. Le liste paginate (scadenzario:167,
  invoices:213, prima-nota:316, bank-transactions:112) ricostruiscono a mano lo stesso blocco
  `pagination: { page, limit, total, totalPages: Math.ceil(...) }` benché `paginatedResponse`
  esista già in api-utils.ts:196 (mai importato).
- **Perché è un problema:** ogni consumer deve sapere a memoria la forma di ciascun endpoint;
  un refactor client (`data.data` vs `data.suppliers` vs array) rompe silenziosamente pagine
  diverse. È la causa diretta dei `|| []` e `?.` difensivi sparsi nel client.
- **Come verificarlo:** `grep -n "return NextResponse.json" src/app/api/{suppliers,staff,pagamenti}/route.ts`
- **Correzione proposta:** adottare `ok()/created()/paginatedResponse()` di api-utils.ts come unico
  formato (`{data}` / `{data,pagination}`), migrando modulo per modulo.
- **Effort:** L

### [A5-API-002] Creazioni a 200 invece di 201, incoerenti anche dentro lo stesso modulo
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/app/api/scadenzario/route.ts:306 vs src/app/api/scadenzario/regole/route.ts, ricorrenze/route.ts
- **Evidenza:** 81 file con handler POST, solo 29 restituiscono `status: 201`.
  `POST /api/scadenzario` (route.ts:306) crea una scadenza e risponde **200**; i sibling
  `POST /api/scadenzario/regole` e `POST /api/scadenzario/ricorrenze` rispondono **201**.
  `422` è usato una sola volta in tutto `src/app/api` benché `BusinessError` (422) esista in errors.ts:99.
- **Perché è un problema:** il client non può distinguere creazione da aggiornamento dallo status;
  test e monitoring che filtrano per classe di status contano male.
- **Come verificarlo:** `grep -rln "status: 201" src/app/api --include=route.ts | wc -l` (29) vs
  `grep -rln "export async function POST" ... | wc -l` (81).
- **Correzione proposta:** regola unica "creazione → 201" applicata via helper `created()`.
- **Effort:** M

### [A5-API-003] Tre infrastrutture di contratto parallele, adozione ~0
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/lib/api-utils.ts · src/lib/api-validation.ts · src/lib/errors.ts
- **Evidenza:**
  - `api-utils.ts`: builders `ok/created/errorResponse/handleApiError/parsePagination/paginatedResponse` —
    **0 route** li usano. Solo 7 route su 180 importano dal file, e solo per `checkRequestRateLimit`/`requireRole`
    (es. chiusure/route.ts:7, users/route.ts:19).
  - `api-validation.ts`: **0 import** in tutto `src` (confermato da knip in 01-BASELINE).
  - `errors.ts`: **0 import**; contiene un secondo `handleApiError`, un secondo `ValidationError`
    e `handlePrismaError` (righe 248-270) tutti morti.
  - Le 180 route fanno **1.596** chiamate dirette a `NextResponse.json`.
- **Perché è un problema:** esistono due `handleApiError` e due `ValidationError` con firme diverse:
  chi tocca il codice non sa quale sia "quello vero", e ogni route reinventa il contratto a mano —
  è l'origine dei finding 001-008. Codice morto da segnalare anche ad A4.
- **Come verificarlo:** `grep -rl "from '@/lib/api-utils'" src/app/api --include=route.ts` (7 file);
  `grep -rl "api-validation\|from '@/lib/errors'" src -r` (vuoto).
- **Correzione proposta:** scegliere UNA delle tre (api-utils è la più completa), cancellare le altre
  due, e imporre l'uso via lint rule (`no-restricted-syntax` su `NextResponse.json` nei route handler).
- **Effort:** M (decisione) + L (migrazione)

## 2. Gestione errori

### [A5-API-004] `error.message` interno esposto al client con status 500
- **Severità:** P2 (info leak → segnalato anche ad A2)
- **Confidenza:** Certa
- **File:** src/app/api/bank-transactions/[id]/match/route.ts:29-34 (idem unmatch:26-33, ignore, confirm) · src/app/api/budget-categories/seed/route.ts:259-269 · src/app/api/shifts/reminder/route.ts:120
- **Evidenza:**
  ```ts
  // match/route.ts:29-34 — QUALSIASI errore, incluso Prisma, arriva al client
  } catch (error) {
    logger.error('POST /api/bank-transactions/[id]/match error', error)
    const message = error instanceof Error ? error.message : 'Errore nel match della transazione'
    return NextResponse.json({ error: message }, { status: 500 })
  }
  // budget-categories/seed/route.ts:261-268 espone anche il codice Prisma
  const errorMessage = error instanceof Error ? error.message : String(error)
  return NextResponse.json({ error: '...', details: errorMessage, code: errorCode }, { status: 500 })
  ```
  Doppio problema: (a) gli errori di business del service (`matcher.ts:320-368` lancia
  `throw new Error('Transazione non trovata')`, `'Questo movimento è già associato...'`) escono
  con **500** invece di 404/409; (b) un errore Prisma inatteso espone il messaggio grezzo
  (nomi di tabelle/colonne/constraint) e uno `ZodError` — che è `instanceof Error` — espone
  l'intero dump JSON delle issues come `message`, sempre con 500.
- **Perché è un problema:** l'utente vede toast con errori interni; un client automatizzato non può
  distinguere "già riconciliata" (409, riprovabile no) da errore server (500, riprovabile sì).
- **Come verificarlo:** POST `/api/bank-transactions/<id>/match` con body `{}` → 500 con dump Zod nel campo error.
- **Correzione proposta:** classi errore tipizzate nel service (NotFound/Conflict) mappate a status
  nel route; per il resto messaggio generico + log.
- **Effort:** M

### [A5-API-005] Zod parse non gestito: errori di validazione restituiti come 500
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/app/api/reconciliation/route.ts:21,41-46 · src/app/api/reconciliation/summary/route.ts · src/app/api/bank-transactions/route.ts:28,146-152 · src/app/api/bank-transactions/import/route.ts:61,191-196
- **Evidenza:**
  ```ts
  // reconciliation/route.ts
  const data = reconcileSchema.parse(body)      // riga 21: può lanciare ZodError
  } catch (error) {                              // riga 41: catch generico
    return NextResponse.json({ error: 'Errore nella riconciliazione' }, { status: 500 })
  ```
  Nessuno di questi 5 file contiene `ZodError` o `safeParse`: un filtro o body malformato
  (errore del client, 400) viene risposto come errore del server (500) senza dettagli.
- **Perché è un problema:** il form di riconciliazione non può mostrare quale campo è sbagliato;
  Sentry/log si riempiono di finti 500.
- **Come verificarlo:** `for f in $(grep -rln "\.parse(" src/app/api --include=route.ts); do grep -q "ZodError\|safeParse" "$f" || echo "$f"; done`
- **Correzione proposta:** branch `if (error instanceof z.ZodError)` → 400 con issues, come già
  fatto in 90 altre route.
- **Effort:** S

### [A5-API-006] Forma di `details` incoerente; client accoppiato alla stringa d'errore; lingua mista
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/app/api/pagamenti/route.ts:79 · src/app/api/budget-categories/seed/route.ts:266 · src/app/api/chiusure/bulk-delete/route.ts:81 · src/hooks/useClosureMutation.ts:68-71
- **Evidenza:** quattro forme diverse per `details`:
  `details: error.issues` (array Zod raw, 90 occorrenze) · `details: parsed.error.flatten()`
  (pagamenti:79, oggetto `{formErrors,fieldErrors}`) · `details: errorMessage` (stringa, seed:266) ·
  `details: errors` (array custom, bulk-delete:81). Il client è costretto allo string-match:
  ```ts
  // useClosureMutation.ts:68-70
  (payload.error === 'Dati non validi' && Array.isArray(payload.details)
    ? 'Impossibile salvare: dati non validi' : payload.error)
  ```
  Lingua mista: 26 `error: 'Unauthorized'` (tutto il modulo cashflow, categorization-rules,
  pagamenti) contro 267 `'Non autorizzato'` e 2 `'Non autenticato'`.
- **Perché è un problema:** senza un campo `code` stabile il client dipende dalla stringa italiana
  esatta; cambiare un messaggio rompe la gestione errori della UI in modo invisibile.
- **Come verificarlo:** `grep -rn "flatten()" src/app/api --include=route.ts`; `grep -rn "error: 'Unauthorized'" src/app/api | wc -l`
- **Correzione proposta:** contratto errore unico `{error, code, details?}` (già definito in
  api-utils.ts:16-20), client che discrimina su `code`.
- **Effort:** M

### [A5-API-007] Route senza alcun try/catch
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/app/api/pagamenti/route.ts (GET/POST) · src/app/api/pagamenti/summary/route.ts · src/app/api/cashflow/alerts/route.ts · src/app/api/cashflow/summary/route.ts · src/app/api/cashflow/projection/route.ts
- **Evidenza:** `pagamenti/route.ts:75` fa `const body = await request.json()` fuori da try:
  body non-JSON → eccezione non gestita → 500 generico di Next (non nel formato `{error}`) e
  nessun log applicativo. Idem per qualsiasi errore Prisma in queste 6 route.
- **Come verificarlo:** `for f in $(find src/app/api -name route.ts); do grep -q "try {" "$f" || echo "$f"; done`
- **Correzione proposta:** try/catch con handler comune; per il body, helper `validateBody` (esiste già, morto).
- **Effort:** S

### [A5-API-008] Errori Prisma (P2002/P2025) mai mappati → 500 generici
- **Severità:** P2
- **Confidenza:** Certa
- **File:** tutte le route; mapper esistente e morto in src/lib/errors.ts:248-270
- **Evidenza:** `grep -rn "P2002\|P2025\|P2003" src/app/api --include=route.ts` → **0 occorrenze**.
  19 route fanno pre-check manuale + 409 (`findFirst` poi `create`, pattern TOCTOU): se la race si
  verifica, la violazione unique del DB diventa un 500 "Errore interno" invece di 409.
- **Perché è un problema:** il caso "record duplicato" — l'errore utente più comune in un gestionale —
  non ha una risposta affidabile a livello di contratto.
- **Correzione proposta:** usare `handlePrismaError` (errors.ts:248) nel catch handler comune.
- **Effort:** S (una volta scelto l'handler unico di A5-API-003)

## 3. Paginazione, filtri, ordinamento

### [A5-API-009] Ordinamento con campo arbitrario dal client
- **Severità:** P1 (→ segnalato ad A2 per il profilo sicurezza/DoS)
- **Confidenza:** Certa
- **File:** src/app/api/products/route.ts:24-25,57-59 · src/app/api/scadenzario/route.ts:68-69,139
- **Evidenza:**
  ```ts
  // products/route.ts:57-59 — nessuna whitelist
  const orderBy: Record<string, string> = {}
  orderBy[sortBy] = sortOrder            // sortBy = searchParams.get('sortBy')
  // scadenzario/route.ts:139
  orderBy: { [sortBy]: sortOrder },
  ```
  Qualunque `?sortBy=<campo>` finisce in Prisma: campo inesistente o `sortOrder` diverso da
  asc/desc → `PrismaClientValidationError` → 500 riproducibile a comando; campo valido qualsiasi →
  ordinamento su colonne mai previste dal contratto. Contrasto virtuoso nello stesso repo:
  invoices/route.ts:149 usa `validSortFields.includes(sortBy) ? sortBy : 'invoiceDate'`.
- **Come verificarlo:** `GET /api/scadenzario?sortBy=pippo` da autenticati → 500.
- **Correzione proposta:** whitelist come in invoices, o schema Zod `z.enum([...])` sui campi ordinabili.
- **Effort:** S

### [A5-API-010] `limit` di paginazione senza tetto in quasi tutte le liste
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/app/api/invoices/route.ts:66 · src/app/api/scadenzario/route.ts:67 · src/app/api/products/route.ts:22 · src/app/api/documents/route.ts:30 · src/app/api/scadenzario/ricorrenze/route.ts:43 · src/app/api/cashflow/forecasts/route.ts:24 · src/app/api/price-alerts/route.ts:25 · attendance/{records,anomalies,history}
- **Evidenza:**
  ```ts
  const limit = parseInt(searchParams.get('limit') || '50')   // nessun Math.min
  ```
  Solo due eccezioni virtuose: chiusure/route.ts:205 (`Math.min(..., 100)`) e lo schema
  `journalEntryFiltersSchema` di prima-nota (validations/prima-nota.ts:56, `.max(100)`).
  `parsePagination` con maxLimit esiste in api-utils.ts:173 ed è usato da **0 route**.
  Nota: `page` negativa → `skip` negativo → errore Prisma → 500.
- **Perché è un problema:** `?limit=1000000` scarica l'intera tabella in una risposta (memoria +
  tempi); con le fatture il payload include righe e allegati collegati.
- **Come verificarlo:** `GET /api/invoices?limit=999999` autenticato.
- **Correzione proposta:** adottare `parsePagination` ovunque (già pronto, con clamp su page e limit).
- **Effort:** S/M

### [A5-API-011] 68 file route con `findMany` senza `take`
- **Severità:** P2
- **Confidenza:** Certa
- **File:** 68 dei 96 file route con findMany; i più esposti a crescita: src/app/api/scadenzario/export/route.ts, aging, calendar · src/app/api/report/{incassi-giornalieri,analisi-costi,confronto-annuale}/route.ts · src/app/api/portal/documents/route.ts · src/app/api/attendance/daily-summary/route.ts
- **Evidenza:** `for f in $(grep -rln "findMany" src/app/api --include=route.ts); do grep -q "take:" "$f" || echo "$f"; done | wc -l` → 68.
  Molti sono su tabelle di dominio piccole (venues, roles, leave-types: accettabile), ma report,
  export e presenze crescono linearmente con i mesi di esercizio.
- **Perché è un problema:** endpoint che oggi rispondono in 50ms degraderanno in modo invisibile;
  nessun contratto dichiara che la risposta è "tutto lo storico".
- **Correzione proposta:** censire i ~15 endpoint su tabelle a crescita mensile e imporre
  finestra temporale obbligatoria o paginazione.
- **Effort:** M

## 4. Semantica REST

### [A5-API-012] GET /api/staff/invite crea un token di invito (side effect su metodo safe)
- **Severità:** P1 (→ coordinato con A2: il token è una credenziale di onboarding)
- **Confidenza:** Certa
- **File:** src/app/api/staff/invite/route.ts:22,53-63
- **Evidenza:**
  ```ts
  export async function GET() {
    ...
    // Crea nuovo token generico             ← dentro il GET
    const token = globalThis.crypto.randomUUID()
    const invitation = await prisma.invitationToken.create({ data: { token, invitedById, expiresAt } })
  ```
- **Perché è un problema:** un metodo safe non deve mutare stato: prefetch del browser, estensioni,
  crawler interni o un semplice refresh generano token di invito validi 7 giorni a insaputa
  dell'admin. Caso minore analogo: GET /api/notifications/preferences:46-50 crea il record di
  default (lazy-init idempotente, accettabile ma da conoscere).
- **Come verificarlo:** due GET consecutivi da admin senza token attivo → 1 riga creata; con
  prefetch aggressivo → creazioni non intenzionali.
- **Correzione proposta:** GET solo lettura (404/`{token:null}` se assente); creazione solo su POST
  (l'azione `regenerate` esiste già nel POST della stessa route).
- **Effort:** S

### [A5-API-013] PUT con semantica PATCH, PATCH alias di PUT, toggle non idempotente
- **Severità:** P3
- **Confidenza:** Certa
- **File:** src/app/api/suppliers/route.ts:221 · src/app/api/notifications/preferences/route.ts:111-114 · src/app/api/scadenzario/[id]/verifica/route.ts:44
- **Evidenza:** 26 file PUT (moduli storici: staff, suppliers, invoices, budget) e 21 PATCH
  (moduli recenti: scadenzario, cashflow, prima-nota, pagamenti) — il verbo dipende dall'età del
  modulo, non dalla semantica: suppliers PUT valida `supplierSchema.partial()` (riga 221), cioè un
  aggiornamento parziale = PATCH. `notifications/preferences` espone entrambi con
  `PATCH = alias di PUT` (righe 111-114). `PATCH /scadenzario/[id]/verifica` è un toggle senza
  body (`verificata: !current.verificata`, riga 44): un retry automatico o doppio click annulla
  l'operazione appena fatta.
- **Perché è un problema:** minore, ma il toggle non idempotente è un bug reale con retry di rete.
- **Correzione proposta:** convenzione unica (PATCH per parziali); per verifica accettare
  `{verificata: boolean}` nel body rendendola idempotente.
- **Effort:** S

  Nota non-finding: le DELETE che internamente fanno `update` (invoices, scadenzario, prima-nota,
  chiusure) sono il soft delete **di progetto** (`SOFT_DELETE_MODELS`, deletedAt) — semantica
  corretta e documentata, non un delete mascherato.

## 5. Swagger / OpenAPI

### [A5-API-014] Swagger: 2 route documentate su 180, claim di rate limiting falso
- **Severità:** P3 (drift; profilo esposizione → A2/VULN-031)
- **Confidenza:** Certa
- **File:** src/lib/swagger.ts:22-26 · src/app/api/docs/route.ts:21-23 · src/app/(public)/api-docs/page.tsx
- **Evidenza:** annotazioni `@swagger` presenti solo in chiusure/route.ts, prima-nota/route.ts e
  docs/route.ts stessa → coverage ~1% delle 180 route. La spec dichiara:
  ```
  Le API sono soggette a rate limiting: ... API generiche: 100 richieste/minuto per utente
  ```
  ma solo **7 route su 180** applicano `checkRequestRateLimit`. Dichiara inoltre "importi
  monetari rappresentati come numeri" mentre i Decimal viaggiano come stringhe (A5-API-019).
  `/api/docs` risponde 404 in produzione (docs/route.ts:21-23) ma la pagina `(public)/api-docs`
  resta raggiungibile e renderizza una SwaggerUI rotta.
- **Perché è un problema:** documentazione all'1% che per giunta afferma protezioni inesistenti è
  peggio di nessuna documentazione: crea false aspettative di sicurezza e contratto.
- **Come verificarlo:** `grep -rln "@swagger" src/app/api --include=route.ts` (3 file);
  `grep -rln "checkRequestRateLimit" src/app/api --include=route.ts` (7 file).
- **Correzione proposta:** o si rimuove l'apparato swagger (pagina inclusa), o si corregge la
  descrizione e si genera la spec dagli schemi Zod (zod-openapi) invece che da annotazioni manuali.
- **Effort:** S (rimozione) / L (allineamento)

## 6. TanStack Query lato client

### [A5-API-015] Chiavi di cache diverse per la stessa risorsa, invalidazioni parziali
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/app/(dashboard)/documenti-dipendenti/page.tsx:351,518,702 · src/components/invoices/InvoiceDetail.tsx:176-192 · src/components/invoices/InvoiceList.tsx:235
- **Evidenza:** stessa risorsa, chiavi diverse:
  - lista sedi: `['venues']` (5 file), `['venues-list']` (3 file), `['portal-venues']`;
  - lista dipendenti: `['staff-list']`, `['employees-list']`, `['staff-users']` — la stessa
    `queryFn` su `/api/users?active=true&limit=200` è copiata identica 3 volte nello stesso file
    (documenti-dipendenti:351,518,702). `invalidateQueries(['staff-list'])` avviene 4 volte,
    `['employees-list']` **mai**;
  - fatture: `InvoiceDetail` dopo `recordMutation` (registrazione in prima nota, cambia lo status)
    invalida solo `['invoice', invoiceId]` (riga 190) e non `['invoices']`: tornando alla lista
    entro `staleTime` (60s, providers.tsx:13) la fattura appare ancora non registrata.
- **Perché è un problema:** l'invalidazione per chiave è l'unico contratto di freschezza del client;
  chiavi divergenti = dato stale mostrato dopo un salvataggio riuscito.
- **Come verificarlo:** registrare una fattura dal dettaglio e tornare alla lista entro 60s.
- **Correzione proposta:** query-key factory centrale (es. `src/lib/query-keys.ts`) + invalidazione
  per prefisso risorsa nelle mutation.
- **Effort:** M

### [A5-API-016] Due regimi di fetch nel client; KPI scadenzario stale e fallimenti silenziati
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/app/(dashboard)/scadenzario/page.tsx:98-112,145-166,168-183
- **Evidenza:** react-query è adottato in staff/turni/presenze/fatture (51 file), mentre i moduli
  finanziari usano `fetch`+`useState` (scadenzario: 10 file a fetch manuale vs 1 con react-query;
  prima-nota 6 vs 0; chiusure, riconciliazione, cashflow idem). Nella pagina scadenzario:
  ```ts
  useEffect(() => { ...fetch('/api/scadenzario/summary')... }, [])   // 98-112: solo al mount
  // handlePayment 145-166: aggiorna la riga ma NON il summary; e su resp non-ok:
  if (resp.ok) { ... }        // nessun else: pagamento rifiutato = nessun messaggio, dialog aperto
  ```
  Dopo la registrazione di un pagamento le card KPI in testa (totale da pagare, scaduto) mostrano
  i valori pre-pagamento finché non si ricarica la pagina; un errore 4xx/5xx della POST non produce
  alcun feedback (solo `console.error` sul ramo di rete). Stesso pattern in `handleCreateSchedule`.
- **Perché è un problema:** numeri finanziari incoerenti a schermo nella stessa vista (riga
  aggiornata, totali no) e fallimenti invisibili all'utente su operazioni di pagamento.
- **Come verificarlo:** registrare un pagamento dalla lista scadenzario e osservare le card KPI.
- **Correzione proposta:** portare il modulo su react-query con invalidazione di lista+summary
  dopo mutation; in ogni caso aggiungere il ramo di errore con toast.
- **Effort:** M

## 7. Logica di business nelle route

### [A5-API-017] Macchina a stati del pagamento scadenza duplicata in 4 punti divergenti
- **Severità:** P1
- **Confidenza:** Certa
- **File:** src/lib/services/schedule-reconciliation-service.ts:150-160,180 · src/app/api/scadenzario/[id]/pagamenti/route.ts:118-157 · src/app/api/scadenzario/[id]/pagamenti/[paymentId]/route.ts:64-79 · src/app/api/scadenzario/[id]/stato/route.ts:50-70
- **Evidenza:** il passaggio APERTA → PARZIALMENTE_PAGATA → PAGATA (+ cascata fattura → PAID) vive in:
  1. il service di riconciliazione (canonico: `Prisma.Decimal`, `toFixed(2)`, righe 150-160;
     cascata fattura riga 180);
  2. inline nel POST pagamenti (righe 118-157: aggregato ricalcolato in **float** `Number(...)`,
     confronto `nuovoImportoPagato >= importoTotale` senza arrotondamento; cascata fattura
     ri-implementata alle righe 143-156);
  3. inline nel DELETE pagamento (righe 64-79, terza variante con reset ad APERTA);
  4. il PATCH stato, che cambia `stato` **senza toccare `importoPagato`**: si può marcare PAGATA
     una scadenza con residuo > 0 — la lista continuerà a mostrare `importoResiduo` positivo su
     una scadenza "pagata".
- **Perché è un problema:** stessa transizione, tre aritmetiche diverse (Decimal vs float) e una
  che bypassa l'importo: è il terreno classico dei "numeri che non quadrano tra moduli" (P1 da
  scala). La cascata fattura→PAID duplicata può divergere alla prima modifica di una delle due copie.
- **Come verificarlo:** confronto diretto dei 4 blocchi citati; per il punto 4, PATCH
  `/api/scadenzario/<id>/stato` con `{"stato":"PAGATA"}` su scadenza con pagamenti parziali, poi
  GET lista → stato PAGATA con residuo > 0.
- **Correzione proposta:** un'unica funzione `ricalcolaStatoSchedule(scheduleId, tx)` nel service,
  chiamata da tutti e quattro i punti; il PATCH stato dovrebbe passare dallo stesso ricalcolo.
- **Effort:** M

### [A5-API-018] Marcare SCADUTA imposta `dataPagamento` su una scadenza non pagata
- **Severità:** P1
- **Confidenza:** Certa (comportamento del codice); reachability UI da confermare con A4
- **File:** src/app/api/scadenzario/[id]/stato/route.ts:60-65 · src/app/api/scadenzario/[id]/pagamenti/route.ts:135-137
- **Evidenza:**
  ```ts
  // stato/route.ts:61-65
  if (stato === ScheduleStatus.SCADUTA && !existing.dataPagamento) {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    updateData.dataPagamento = today        // ← data di PAGAMENTO su scadenza NON pagata
  }
  ```
  E il pagamento reale successivo non correggerà mai il dato, perché il POST pagamenti scrive la
  data solo se assente: `...(nuovoStato === PAGATA && !schedule.dataPagamento && { dataPagamento })`
  (pagamenti/route.ts:135-137).
- **Perché è un problema:** dato contabile corrotto e permanente: una scadenza scaduta risulta con
  data pagamento valorizzata "oggi 23:59:59"; qualunque report o stima sul ritardo fornitore
  (`stima-data-attesa`) che legga `dataPagamento` viene inquinato.
- **Come verificarlo:** PATCH `/api/scadenzario/<id>/stato` body `{"stato":"SCADUTA"}` su scadenza
  senza pagamenti → riga con `dataPagamento` valorizzata; poi POST pagamento a saldo → la data
  fittizia resta. (Nota A4: non ho trovato consumer UI di questa route — resta invocabile via API.)
- **Correzione proposta:** eliminare il blocco (SCADUTA non implica alcuna data di pagamento);
  bonificare le righe con `stato=SCADUTA AND dataPagamento IS NOT NULL`.
- **Effort:** S (+ bonifica dati)

### [A5-API-019] Decimal serializzati come stringa ma tipizzati `number` nel contratto TS
- **Severità:** P2
- **Confidenza:** Certa
- **File:** src/app/api/scadenzario/route.ts:161-165 · src/types/schedule.ts:76 · src/app/(dashboard)/scadenzario/page.tsx:377,440 · src/app/(dashboard)/scadenzario/[id]/page.tsx:320,412
- **Evidenza:** la lista scadenze fa spread del record Prisma senza convertire i Decimal:
  ```ts
  // route.ts:162-164 — importoTotale/importoPagato restano Prisma.Decimal → stringa in JSON
  const schedulesWithResiduo = schedules.map(s => ({ ...s,
    importoResiduo: Number(s.importoTotale) - Number(s.importoPagato) }))
  ```
  ma il tipo condiviso dichiara `importoTotale: number` (types/schedule.ts:76). Sul filo viaggia
  `"importoTotale": "1234.56"` (stringa) accanto a `importoResiduo: 1234.56` (number) **nello
  stesso oggetto**. La UI compensa con `Number(...)` difensivi ovunque (page.tsx:377,440;
  [id]/page.tsx:320,412). Altre route invece convertono (prima-nota POST:429-434,
  bank-transactions GET:113-125): lo stesso concetto ha due tipi diversi a seconda dell'endpoint.
- **Perché è un problema:** il contratto TS mente; il primo componente che si fida del tipo e fa
  aritmetica senza `Number()` produce concatenazioni/`NaN` su importi, e TypeScript non lo segnala.
- **Come verificarlo:** `curl` autenticato su `/api/scadenzario` → `importoTotale` quotato come stringa.
- **Correzione proposta:** serializzatore unico dei Decimal a `number` (o a stringa dichiarata nel
  tipo) al confine API; allineare types/schedule.ts alla realtà scelta.
- **Effort:** M

---

## Cosa funziona bene

Il soft delete è coerente col design (deletedAt via `SOFT_DELETE_MODELS`, mai delete fisico sulle
scritture contabili). L'isolamento venue passa quasi ovunque da `getVenueId()`. Il pattern
`{ error: 'Dati non validi', details: error.issues }` con 400, pur artigianale, è ripetuto
fedelmente in ~90 route. invoices ha la whitelist di sort e prima-nota ha lo schema filtri con
cap: i modelli giusti esistono già in casa. Il polling react-query usa intervalli ragionevoli
(10s-5min) con `refetchOnWindowFocus: false`.

## Zone d'ombra / DA VERIFICARE

- Reachability UI di `PATCH /api/scadenzario/[id]/stato` (A5-API-018): nessun consumer trovato in
  `src/components`/`src/app` — incrociare con l'analisi orfani di A4 prima di declassare.
- L'impatto runtime dell'orderBy iniettabile (A5-API-009) l'ho dedotto dal comportamento noto di
  Prisma (ValidationError → 500), non riprodotto contro l'app viva (DB di produzione, vietato).
- I moduli a fetch manuale diversi da scadenzario (prima-nota, riconciliazione, cash-flow) hanno
  probabilmente gli stessi pattern di errore silenziato di A5-API-016: campionato solo scadenzario.
- Le divergenze float/Decimal di A5-API-017 producono differenze reali solo con importi che non
  quadrano al centesimo: non ho potuto costruire il caso su dati veri.
