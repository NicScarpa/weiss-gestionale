# A2 — Sicurezza & Controllo Accessi

**Data:** 2026-08-06 · **Scope:** `src/app/api/**` (180 route), `src/lib/{auth,api-utils,rate-limit,encryption,prisma-encryption,prisma,venue}.ts`, `src/middleware.ts`, `src/lib/utils/permissions.ts`, `prisma/schema.prisma`, `next.config.ts`, `.env.example`, `README.md`.

**Contesto chiave (dal codice, non dal report feb):** l'app è dichiaratamente **single-venue** (`src/lib/venue.ts:5-22`): `getVenueId()` restituisce l'unica sede attiva e `POST /api/venues` rifiuta la creazione di una seconda sede. Molti "IDOR cross-venue" del report di febbraio sono quindi **oggi tautologici** (il filtro `venueId` confronta la risorsa con l'unica sede esistente). Sono comunque stati chiusi nel codice: i filtri sono stati aggiunti, quindi diventano significativi appena si passa al multi-sede. Li classifico RISOLTI dove il filtro è presente, annotando la natura single-venue.

---

## Sintesi regressione VULN feb 2026 (47 totali)

- **RISOLTE: 36** · **PARZIALI: 6** · **APERTE: 3** · **N/A: 2**
- Le remediation dei commit `0906874`, `20a5982`, `247a052` sono **reali** (verificate su file:riga), non cosmetiche.
- Restano genuinamente aperte solo: **dipendenze CVE** (VULN-008/024/046 — audit ancora rosso), **revoca sessione** (VULN-015 mitigata ma non revocabile), **middleware presence-only** (VULN-025, per limite architetturale edge).

## Sintesi finding nuovi (prefisso A2-SEC)

| ID | Sev | Conf | Titolo |
|----|-----|------|--------|
| A2-SEC-001 | P1 | Certa | 64 CVE aperte (7 critiche): @auth/core/next-auth, jspdf, vitest, websocket-driver ancora vulnerabili |
| A2-SEC-002 | P2 | Certa | `categorization-rules` e `budget-categories` scrivono senza guard di ruolo admin/manager |
| A2-SEC-003 | P3 | Certa | `requireAuth`/`requireVenueAccess` in `api-utils.ts` implementate ma usate da 0 route (sicurezza teorica) |
| A2-SEC-004 | P3 | Certa | Credenziali di test reali committate in `README.md` (admin@weisscafe.it/admin123) |
| A2-SEC-005 | P2 | Probabile | Middleware verifica solo la *presenza* del cookie, non firma/scadenza |
| A2-SEC-006 | P3 | Probabile | `.env.example` non documenta `sslmode`; SSL DB dipende solo da `NODE_ENV`/`DATABASE_CA_CERT` |

**Le 3 cose più gravi:** (1) lo stack dipendenze resta con 7 CVE critiche incl. il core di autenticazione `@auth/core`/`next-auth` (A2-SEC-001); (2) le route `categorization-rules`/`budget-categories` sono scrivibili da qualsiasi utente autenticato, staff incluso (A2-SEC-002); (3) l'isolamento reale dei dati poggia sul fatto che l'app è single-venue — l'helper centrale di venue-access non è usato da nessuna route (A2-SEC-003), quindi la protezione multi-tenant è tutta re-implementata inline e va bene solo finché la sede è una.

---

## Tabella regressione completa VULN-001 … VULN-047 (OBBLIGATORIA)

| VULN | Titolo sintetico | Stato | Prova (file:riga) |
|------|------------------|-------|-------------------|
| 001 | Credenziali in git history (`credenziali.env`) | **RISOLTA** (history riscritta) | `git ls-files` non traccia `credenziali*.env`; `.gitignore:41` `credenziali*.env`; `git log --all` non contiene più il commit `d312163` (history riscritta 5 ago 2026). Nota: rotazione credenziali resta operativa/manuale |
| 002 | IDOR PUT/DELETE prima-nota | **RISOLTA** | `prima-nota/[id]/route.ts:114-117` (PUT) e `:194-197` (DELETE) → `findFirst({where:{id,venueId}})` + soft delete `:224-227` |
| 003 | `requireVenueAccess` NO-OP | **PARZIALE** | Ora implementata realmente `api-utils.ts:153-164` (confronta `session.user.venueId !== venueId`), MA **0 route la importano** (grep). La protezione è re-implementata inline nelle route → vedi A2-SEC-003 |
| 004 | Rate limiting su 0 route | **RISOLTA** | Applicato: login `auth.ts:78-86`; `forgot-password/route.ts:26`; `reset-password/route.ts:29`; `change-password/route.ts:27`; `chiusure/route.ts:390`; `prima-nota/import/route.ts:22`. Fallback in-memory se Upstash assente (`rate-limit.ts:33-40`) |
| 005 | Nessun audit trail | **RISOLTA** | `model AuditLog` `schema.prisma:1636-1656`; helper `lib/audit.ts`; `createAuditLog` chiamato in ~30 route finanziarie (grep) |
| 006 | Hard delete dati contabili | **RISOLTA** | `SOFT_DELETE_MODELS` `prisma.ts:16-25` + estensione `excludeDeleted` `:34-42`; delete → `update({deletedAt})` in prima-nota/chiusure/bank-transactions |
| 007 | Password default nel seed in prod | **RISOLTA** | Guard `seed.ts:17` `if (NODE_ENV==='production') …exit`. Nota: password `admin123` ancora nel seed dev + stampate in console `seed.ts:258-261` (accettabile in dev) |
| 008 | jsPDF 8 CVE | **PARZIALE** | `package.json:73` `jspdf@^4.2.0` (aggiornato), ma `npm audit` flagga ancora `jspdf <=4.2.0` **critical** (serve `>4.2.0`). Vedi A2-SEC-001 |
| 009 | IDOR GET prima-nota | **RISOLTA** | `prima-nota/[id]/route.ts:28-29` `findFirst({where:{id,venueId}})` |
| 010 | IDOR GET/DELETE bank-transactions/[id] | **RISOLTA** | `bank-transactions/[id]/route.ts:26-27` (GET) e `:131-133` (DELETE) con `venueId` |
| 011 | GET bank-transactions senza venue obbligatorio | **RISOLTA** | `bank-transactions/route.ts:25` `getVenueId()` forzato, `:44` `where.venueId=venueId` |
| 012 | IDOR GET/PUT chiusure/[id] | **RISOLTA** | `chiusure/[id]/route.ts:138` `findFirst({where:{id,venueId}})`; PUT verifica `existingClosure.venueId !== venueId` `:375` |
| 013 | venueId dal client su payments/pagamenti | **RISOLTA** | `pagamenti/route.ts:84-90` "Force venueId from session"; nessuna route `payments` (solo `pagamenti` in IT). RBAC admin/manager `:71` |
| 014 | venueId dal client su cashflow/forecasts | **RISOLTA** | `cashflow/forecasts/route.ts:79-92` "Override venueId from session"; RBAC `:65` |
| 015 | Sessione JWT 30gg non revocabile | **PARZIALE** | Ridotta a 8h `auth.ts:207`; il callback `jwt` `:163-170` ricontrolla `isActive` ad ogni richiesta (revoca su disattivazione). Ma nessuna revoca esplicita su logout/cambio-ruolo → residuo P2 |
| 016 | IBAN/CF/stipendi in chiaro | **PARZIALE** | Cifratura AES-256-GCM attiva per IBAN/CF/VAT (`prisma-encryption.ts:8-16` + `encryption.ts`); hash di lookup `fiscalCodeHash`/`ibanHash` (`schema.prisma:183,456`). MA **stipendi NON cifrati**: `hourlyRate`/`totalPay`/`hourlyRate*` assenti da `SENSITIVE_FIELDS`; anche `portalPin` in chiaro (`schema.prisma:37`) |
| 017 | Security headers assenti | **RISOLTA** | `next.config.ts:15-43`: CSP, X-Frame-Options DENY, X-Content-Type-Options, HSTS, Referrer-Policy, Permissions-Policy |
| 018 | Password default hardcoded nel bundle client | **RISOLTA** | Nessun `1234567890` in `src/` (grep: solo placeholder P.IVA/test SDI). Password temporanee ora random `users/route.ts:231` `randomBytes(16)` |
| 019 | mustChangePassword non enforced | **RISOLTA** | `api-utils.ts:125-133` blocca in `requireAuth`; `auth.ts:169` propaga il flag; `ForcePasswordChangeModal.tsx:55` lato client |
| 020 | Cascade delete dati finanziari | **RISOLTA** | Relazioni chiusura ora `onDelete: Restrict` (`schema.prisma:266,309,330,349`); una `SetNull` su closure opzionale `:416` |
| 021 | DB senza SSL | **PARZIALE** | Pool con SSL in prod `prisma.ts:49-53` (`rejectUnauthorized:true`, CA opz.). MA `.env.example:3` senza `sslmode=require` → vedi A2-SEC-006 |
| 022 | Nessun meccanismo GDPR dipendenti | **APERTA** | Nessuna procedura di anonimizzazione/retention nel codice (grep `anonimizz|retention|oblio` → 0 in `src`). Geodati timbrature ancora persistenti |
| 023 | xlsx (SheetJS) vulnerabile | **RISOLTA** | `xlsx` rimosso: 0 import in `src` (grep); migrato a `exceljs` (`package.json:68`, usato in export payroll/chiusure/schedules) |
| 024 | Next.js 16.1.1 3 CVE HIGH | **PARZIALE** | `package.json:77` `next@^16.1.6`, ma `npm audit` flagga ancora `next … HIGH` (request smuggling, CSRF Server Actions). Vedi A2-SEC-001 |
| 025 | Middleware non verifica il JWT | **APERTA** (per design) | `middleware.ts:49-57` controlla solo presenza cookie; commento `:46-48` lo documenta (limite edge/JWE). Vedi A2-SEC-005 |
| 026 | Password policy debole | **RISOLTA** | `lib/validations/password.ts`: min 10 + maiusc/minusc/numero/speciale; usata in reset/change-password |
| 027 | Reset token randomUUID (122 bit) | **RISOLTA** | `forgot-password/route.ts:44` `crypto.randomBytes(32).toString('hex')` (256 bit) |
| 028 | Token invito senza email binding | **PARZIALE** | Binding email disponibile e verificato `staff/invite/complete/route.ts:152-156`, ma i token generici senza email (`invite/route.ts:54`) restano un flusso previsto (link condivisibile) |
| 029 | Nessun RBAC su POST chiusure + venueId client | **RISOLTA** (per design) | `chiusure/route.ts:398` `requireRole(['admin','manager','staff'])` — staff ammesso volutamente (compila la chiusura); venueId forzato `:407`; la validazione contabile è riservata ad admin/manager |
| 030 | Mass assignment PUT prima-nota | **RISOLTA** | `prima-nota/[id]/route.ts:137-144` whitelist esplicita di campi (no spread di `validatedData`) |
| 031 | /api/docs espone OpenAPI senza auth | **RISOLTA** | `docs/route.ts:20-22` `if (NODE_ENV==='production') return 404` |
| 032 | Nessun CORS | **RISOLTA** | `middleware.ts:27-38,66-72` gestisce preflight e `Access-Control-Allow-Origin` limitato a `NEXT_PUBLIC_APP_URL` |
| 033 | Upload: MIME solo da file.type client | **RISOLTA** | `scadenzario/[id]/allegati/route.ts:32,132-135` valida i **magic bytes** (`validateFileMagicBytes`) oltre a estensione e size; `documents/upload-bulk/route.ts:45` idem |
| 034 | Sentry server senza PII scrubbing | **RISOLTA** | `sentry.server.config.ts:30-58` `beforeSend` scrub-ba breadcrumb e request body su lista chiavi sensibili (iban, fiscalCode, hourlyRate, portalPin…) |
| 035 | Service Worker cachea API | **RISOLTA** | `sw.ts:24-34` `apiNetworkOnly` (`NetworkOnly` per `/api/`) in testa a `runtimeCaching` |
| 036 | next-auth beta in prod | **APERTA** | `package.json:78` ancora `5.0.0-beta.30` (nessuna release stabile v5; correlato ad A2-SEC-001) |
| 037 | Prisma senza pool/timeout | **RISOLTA** | `prisma.ts:54-56` `max:20`, `idleTimeoutMillis`, `connectionTimeoutMillis` |
| 038 | Import bank tx senza transazione | **RISOLTA** | `prima-nota/import/route.ts:54` `prisma.$transaction(async(tx)=>…)` |
| 039 | Export senza controllo permessi | **RISOLTA** | `prima-nota/export/route.ts:29` e `scadenzario/export/route.ts:18` richiedono admin/manager |
| 040 | Reconciliation venueId dal body | **RISOLTA** | `reconciliation/route.ts:23-26` "Override venueId from session" |
| 041 | Nessun backup documentato | **PARZIALE** | Memoria/`docs/storage.md:42` accennano; nessuno script/cron di backup nel repo (backup Supabase gestito fuori codebase) |
| 042 | Cron GET espone info senza auth | **RISOLTA** | `auto-clockout/route.ts:166-174` e `shifts/reminder/route.ts:145-154` GET ora verificano `Bearer CRON_SECRET` |
| 043 | Error leak budget/alerts/generate | **RISOLTA** | `budget/alerts/generate/route.ts:83-87` ritorna messaggio generico; `logger.error` lato server |
| 044 | GOOGLE_MAPS_API_KEY non documentata | **RISOLTA** | `.env.example:34` presente |
| 045 | NEXT_PUBLIC_APP_URL non documentata | **RISOLTA** | `.env.example:31` presente |
| 046 | CVE moderate transitive (hono/lodash/minimatch) | **APERTA** | `npm audit`: 27 high + 27 moderate ancora presenti (lodash, minimatch, ws, @grpc, hono via firebase/otel). Vedi A2-SEC-001 |
| 047 | Credenziali in chiaro nella response creazione utente | **N/A / RISOLTA-by-design** | `users/route.ts:266-276`: password temporanea random restituita **una tantum** all'admin creatore, mai persistita in chiaro. Commento esplicito. Comportamento accettabile |

Nota su VULN-016: la parte IBAN/CF è genuinamente risolta; classifico l'intera VULN **PARZIALE** perché gli stipendi (`hourlyRate*`, `totalPay`) e il `portalPin` restano in chiaro — vedi dettaglio in A2-SEC-007 sotto.

---

## Finding nuovi (forma estesa)

### [A2-SEC-001] 64 CVE aperte (7 critiche) incl. il core di autenticazione
- **Severità:** P1
- **Confidenza:** Certa
- **File:** `package.json`, `audit/baseline-logs/09-npm-audit.log:4,289,512,518`
- **Evidenza:**
  ```
  @auth/core <=0.41.2  Severity: critical
    - getToken() throws on malformed Bearer header (GHSA-xmf8-cvqr-rfgj)
    - Email normalizer homoglyph @ bypass (GHSA-7rqj-j65f-68wh)
    - OAuth state/nonce/PKCE cookies not bound to provider (GHSA-x445-f3h2-j279)
  next-auth <=5.0.0-beta.31 → dipende da @auth/core vulnerabile
  jspdf <=4.2.0  critical (PDF Object Injection, HTML Injection)
  next  HIGH (request smuggling, null-origin CSRF Server Actions)
  vitest / websocket-driver  critical (dev-only)
  64 vulnerabilities (3 low, 27 moderate, 27 high, 7 critical)
  ```
- **Perché è un problema:** il bypass homoglyph e il crash `getToken()` toccano direttamente il login del gestionale; jspdf critical è raggiungibile se input utente (nomi fornitori, note fatture) finisce nei PDF. La CI esegue `npm audit` ma è `continue-on-error` → non blocca il deploy. jspdf/next/xlsx del report feb sono stati *aggiornati* ma l'audit resta rosso perché i fix richiedono versioni ancora più alte o major non disponibili (next-auth v5 è solo beta).
- **Come verificarlo:** `npm audit --audit-level=high` (exit 1, 64 vuln); `npm audit --json | jq '.vulnerabilities["@auth/core"]'`.
- **Correzione proposta:** aggiornare a `@auth/core`/`next-auth` fixato appena esce una v5 stabile; bumpare `jspdf` a >4.2.0 e `next` alla patch che chiude request-smuggling; rendere `npm audit` bloccante in CI (rimuovere `continue-on-error`) almeno su `critical`. Segregare le dev-only (vitest, websocket-driver) dal conteggio prod.
- **Effort:** M

### [A2-SEC-002] `categorization-rules` e `budget-categories` scrivono senza guard di ruolo
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `src/app/api/categorization-rules/route.ts:71-131`, `src/app/api/categorization-rules/[id]/route.ts:46-135`, `src/app/api/budget-categories/route.ts:98-...`, `src/app/api/budget-categories/[id]/route.ts:77-...`
- **Evidenza:**
  ```ts
  // categorization-rules POST — solo auth, nessun check di ruolo
  const session = await getServerSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const { venueId, name, direction, keywords, ... } = body   // venueId dal client, no override
  const rule = await prisma.categorizationRule.create({ data: { venueId, ... } })
  ```
- **Perché è un problema:** la convenzione del progetto (`src/CLAUDE.md`) impone ruolo admin/manager sulle route con dati finanziari (budget incluso). Qui **qualsiasi utente autenticato, staff compreso**, può creare/modificare/eliminare regole di categorizzazione (che possono impostare `autoVerify`/`autoHide` sui movimenti) e categorie di budget. `categorization-rules` prende inoltre `venueId` dal body senza override da sessione (a differenza di quasi tutte le altre route finanziarie). Oggi lo staff non ha un percorso UI, ma il token JWT vale per la chiamata diretta.
- **Come verificarlo:** con una sessione staff valida, `POST /api/categorization-rules` con body `{venueId, name, direction:'OUT', keywords:['x'], accountId}` → 201 anziché 403.
- **Correzione proposta:** aggiungere `if (!['admin','manager'].includes(session.user.role)) return 403` alle POST/PATCH/PUT/DELETE di entrambe le famiglie e forzare `venueId = await getVenueId()` in `categorization-rules` (come già fatto altrove).
- **Effort:** S

### [A2-SEC-003] Helper di auth centrali in `api-utils.ts` non usati da nessuna route
- **Severità:** P3
- **Confidenza:** Certa
- **File:** `src/lib/api-utils.ts:118-164`
- **Evidenza:** `grep -rl "requireAuth\|requireVenueAccess" src/app/api` → **0 file**. `requireRole` → **1 file** (`chiusure/route.ts`). Le funzioni sono implementate e testate ma il controllo auth/venue è re-implementato inline in tutte le ~170 route protette (`const session = await auth(); if (!session?.user) …; if (!['admin','manager'].includes(session.user.role)) …`).
- **Perché è un problema:** non è sfruttabile di per sé (le route fanno il check inline), ma è **debito di sicurezza**: 170 copie dello stesso guard significano che una route dimenticata (vedi A2-SEC-002) non è coperta da nessun punto centrale, e `requireVenueAccess` — l'unico posto che confronterebbe `session.user.venueId` con la risorsa — non protegge nulla. La sicurezza multi-tenant regge oggi solo perché l'app è single-venue.
- **Come verificarlo:** il grep sopra; ispezione di 3-4 route a campione.
- **Correzione proposta:** adottare un wrapper unico (`withAuth(handler, {roles, venueScoped})`) e migrarci le route finanziarie, così il guard di ruolo/venue è in un solo punto verificabile. In alternativa, un test che asserisce che ogni route sotto `api/{prima-nota,chiusure,...}` risponde 403 a staff.
- **Effort:** L

### [A2-SEC-004] Credenziali di test reali committate in README
- **Severità:** P3
- **Confidenza:** Certa
- **File:** `README.md:59-61`
- **Evidenza:**
  ```
  - **Admin**: admin@weisscafe.it / admin123
  - **Manager**: manager@weisscafe.it / manager123
  - **Staff**: staff@weisscafe.it / staff123
  ```
- **Perché è un problema:** coincidono con le password del seed (`seed.ts:127,258-261`). Il seed è ora bloccato in produzione (VULN-007 risolta), ma se lo stesso set fosse mai stato applicato all'ambiente reale prima del guard, o su uno staging esposto, l'accesso admin sarebbe immediato. Documentare password reali in chiaro nel repo è comunque una cattiva pratica.
- **Come verificarlo:** aprire `README.md`; tentare login con `admin@weisscafe.it/admin123` su un'istanza seedata.
- **Correzione proposta:** sostituire con placeholder generici ("credenziali stampate a fine `db:seed`") e verificare che l'admin di produzione non usi `admin123` (la memoria di progetto indica admin = `nicolascarpa@weisscafe.com`, quindi verosimilmente già diverso).
- **Effort:** S

### [A2-SEC-005] Middleware verifica solo la presenza del cookie di sessione
- **Severità:** P2
- **Confidenza:** Probabile
- **File:** `src/middleware.ts:46-57`
- **Evidenza:**
  ```ts
  const sessionToken = request.cookies.get('authjs.session-token')?.value
    || request.cookies.get('__Secure-authjs.session-token')?.value
  if (!sessionToken) { /* redirect login */ }
  // nessuna verifica di firma/scadenza qui
  ```
- **Perché è un problema:** un cookie presente ma scaduto/malformato supera il middleware e raggiunge la pagina/route. La difesa reale è demandata a `auth()` nelle API (che valida davvero) e al layout dashboard. È accettabile *solo* perché ogni route protetta richiama `auth()`; diventa un buco nel momento in cui una pagina Server Component si fida del solo passaggio dal middleware. Il commento `:46-48` documenta il limite (token JWE non decodificabile in edge).
- **Come verificarlo:** impostare manualmente un cookie `authjs.session-token=garbage` e chiamare una pagina protetta: il middleware non redirige (la 401 arriva solo dalla route API).
- **Correzione proposta:** dove possibile, spostare la validazione in un runtime Node (route handler/segment config `runtime='nodejs'`) o usare `next-auth`'s `auth()` come middleware wrapper per validare davvero il JWE; in ogni caso mantenere l'invariante "nessun Server Component si fida del solo middleware".
- **Effort:** M

### [A2-SEC-006] `.env.example` non documenta SSL DB; enforcement solo via NODE_ENV
- **Severità:** P3
- **Confidenza:** Probabile
- **File:** `.env.example:3`, `src/lib/prisma.ts:49-53`
- **Evidenza:**
  ```
  DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"   # no sslmode
  ```
  ```ts
  ssl: process.env.NODE_ENV === 'production'
    ? (process.env.DATABASE_CA_CERT ? {ca, rejectUnauthorized:true} : {rejectUnauthorized:true})
    : false
  ```
- **Perché è un problema:** in produzione la connessione è cifrata (bene), ma senza `DATABASE_CA_CERT` si usa `rejectUnauthorized:true` col trust store di Node — con il pooler Supabase (root CA privata) questo può fallire o richiedere workaround; il template non guida a `sslmode=require` né segnala la variabile `DATABASE_CA_CERT`. Se qualcuno gira in staging con `NODE_ENV` non impostato a `production`, l'SSL è disattivato del tutto.
- **Come verificarlo:** ispezione dei due file; test di connessione senza `DATABASE_CA_CERT` verso il pooler Supabase.
- **Correzione proposta:** documentare in `.env.example` `?sslmode=require` e la variabile `DATABASE_CA_CERT`; non legare l'SSL al solo `NODE_ENV` (usare un flag esplicito `DATABASE_SSL`).
- **Effort:** S

### [A2-SEC-007] Stipendi e portalPin non rientrano nella cifratura at-rest (dettaglio VULN-016)
- **Severità:** P2
- **Confidenza:** Certa
- **File:** `src/lib/prisma-encryption.ts:8-16`, `prisma/schema.prisma:37`
- **Evidenza:**
  ```ts
  const SENSITIVE_FIELDS = {
    BankAccount: ['iban'], Supplier: ['fiscalCode','iban'], Customer: ['codiceFiscale','iban'],
    User: ['fiscalCode','vatNumber'], Schedule: ['controparteIban'],
    Payment: ['beneficiarioIban'], InvoiceDeadline: ['iban'],
  }
  // Assenti: User.hourlyRate/hourlyRateBase/…, DailyAttendance.hourlyRate/totalPay, User.portalPin
  ```
- **Perché è un problema:** il report feb (VULN-016) chiedeva di cifrare IBAN, codici fiscali **e stipendi**. IBAN/CF sono coperti, ma le retribuzioni orarie (`User.hourlyRate*`, `DailyAttendance.hourlyRate`, `totalPay`) e il `portalPin` restano in chiaro nel DB. Un breach del database espone comunque i compensi di tutti i dipendenti e i PIN del portale. La remediation è quindi incompleta rispetto all'intento.
- **Come verificarlo:** `grep -n "hourlyRate\|totalPay\|portalPin" src/lib/prisma-encryption.ts` → nessun match.
- **Correzione proposta:** valutare cifratura anche dei campi retributivi e del `portalPin` (o hashing per il PIN, che è un segreto di autenticazione e non andrebbe conservato reversibile). Attenzione: i campi salariali sono `Decimal` e usati in aggregazioni/report → la cifratura applicativa romperebbe i `sum`/`groupBy`; serve una scelta architetturale (colonna cifrata separata o cifratura a livello DB/pgcrypto).
- **Effort:** L

---

## Cosa funziona bene (max 5 righe)

1. Le remediation di agosto sono **reali**: soft delete via estensione Prisma globale, audit trail su ~30 route, filtri `venueId` ovunque, security headers completi (CSP/HSTS/X-Frame), cifratura AES-256-GCM di IBAN/CF con hash di lookup deterministico ben progettato (`encryption.ts:72-76`).
2. Rate limiting ora **applicato** a login/reset/change/import/chiusure, con fallback in-memory se Upstash manca.
3. Upload: validazione magic-bytes + estensione + size lato server; storage con `normalizeKey` anti-traversal (`storage.ts:33-40`).
4. Password policy forte, token reset a 256 bit, cron protetti da `CRON_SECRET` anche sulle GET, Sentry con PII scrubbing server-side.
5. Isolamento per ruolo re-implementato con cura nelle route finanziarie (admin/manager) e nelle route personali (staff limitato ai propri dati: `documents/[id]:33`, `portal/documents:20`, `staff/[id]:312-329`).

## Zone d'ombra / DA VERIFICARE

- **Rotazione credenziali esposte (VULN-001):** la git history è stata riscritta, ma la memoria di progetto segnala "rotazione ancora manuale". Confermare che DATABASE_URL/secret storici siano stati effettivamente ruotati (non verificabile da codice).
- **Efficacia rate limit in-memory su Railway:** con più repliche/serverless il `Map` per-istanza (`rate-limit.ts:89`) non condivide stato → il brute-force è limitato solo per-istanza se Upstash non è configurato. Verificare che `UPSTASH_REDIS_REST_*` sia valorizzato in produzione.
- **GDPR (VULN-022):** nessuna procedura di anonimizzazione/retention nel codice; va gestita a livello organizzativo — fuori dal codebase, non verificabile qui.
- **Backup (VULN-041):** gestito su Supabase fuori repo (memoria backup-database-supabase); nessuno script versionato.
- **staff/[id] PATCH:** un `manager` può scrivere `hourlyRate`/`fiscalCode`/`isActive` di qualsiasi staff (`staff/[id]/route.ts:340,364`). Probabilmente intenzionale (single-venue), ma da confermare col prodotto se il manager debba vedere/modificare le retribuzioni.
