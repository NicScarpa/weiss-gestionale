# Security Audit Report — Weiss Cafè Gestionale

**Data:** 2026-02-21
**Auditor:** Claude Code Agent Team (4 agenti specializzati + leader)
**Progetto:** weiss-gestionale v0.1.0
**Stack:** Next.js 16.1.1, React 19, Prisma 7.2, PostgreSQL, NextAuth v5-beta.30
**Scope:** Analisi statica completa del codice sorgente — 150+ API routes, 63 modelli DB, 1858 righe schema

---

## Executive Summary

Il gestionale Weiss Cafè presenta un'architettura di sicurezza **con lacune significative** che richiedono intervento immediato, soprattutto nell'area del controllo accessi multi-tenant e della protezione dei dati finanziari. Sebbene alcune best practice siano correttamente implementate (bcrypt salt 12, messaggi login generici, validazione Zod su molti endpoint, CRON_SECRET sui cron), l'audit ha identificato **8 vulnerabilità critiche P0** e **16 vulnerabilità alte P1**.

Le problematiche più gravi riguardano: (1) **IDOR diffuso** — numerosi endpoint finanziari (prima-nota, bank-transactions, chiusure, pagamenti) non filtrano per `venueId`, permettendo accesso cross-tenant ai dati contabili; (2) **credenziali reali committate nella git history** (`credenziali.env`); (3) **dati finanziari sensibili in chiaro** (IBAN, stipendi, codici fiscali) senza crittografia applicativa; (4) **assenza totale di audit trail** sulle modifiche contabili; (5) **rate limiting implementato ma mai applicato** a nessun endpoint; (6) **hard delete** su dati finanziari che dovrebbero essere inalterabili; (7) **jsPDF con 8 CVE critiche**; (8) **requireVenueAccess è un NO-OP** che non verifica nulla.

Si raccomanda di affrontare immediatamente le vulnerabilità P0 (soprattutto la rotazione delle credenziali esposte nella git history), poi le P1 entro una settimana, e pianificare P2/P3 nel backlog.

---

## Vulnerabilità Critiche (P0 — Azione Immediata)

### [VULN-001] Credenziali Reali Committate nella Git History
- **Severità:** Critica (P0)
- **Area:** Infra / Secrets
- **Descrizione:** Il file `credenziali.env` è stato committato nel commit `d312163` (backup: pre-unificazione-anagrafiche). Anche se rimosso dal tracking nel commit `3d29d55`, i secrets rimangono nella git history e sono recuperabili con `git show d312163:credenziali.env`.
- **File coinvolti:** Git history, commit `d312163`
- **Impatto:** Chiunque abbia accesso al repository può estrarre le credenziali dalla history. Se il repo è stato pubblico anche solo temporaneamente, tutte le credenziali devono essere considerate compromesse.
- **Remediation:**
  1. **Ruotare IMMEDIATAMENTE** tutte le credenziali contenute in quel file (DATABASE_URL, API keys, secrets)
  2. Purificare la git history:
```bash
# Con BFG Repo-Cleaner
bfg --delete-files 'credenziali*.env' .
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force
```

---

### [VULN-002] IDOR su PUT/DELETE /api/prima-nota/[id] — Modifica/Cancellazione Contabilità Cross-Venue
- **Severità:** Critica (P0)
- **Area:** API
- **Descrizione:** Sia PUT che DELETE trovano il journal entry per ID senza filtro `venueId`. Un utente autenticato può **modificare o eliminare movimenti contabili di qualsiasi venue** conoscendo l'UUID.
- **File coinvolti:** `src/app/api/prima-nota/[id]/route.ts:103-106` (PUT), `:162-165` (DELETE)
- **Impatto:** Manipolazione e distruzione di dati contabili cross-tenant. Un dipendente di una sede può alterare la contabilità di un'altra sede.
- **Remediation:**
```typescript
const venueId = await getVenueId()
const entry = await prisma.journalEntry.findFirst({
  where: { id, venueId }, // Aggiungere filtro venue
})
if (!entry) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })
```

---

### [VULN-003] requireVenueAccess è un NO-OP — Falso Isolamento Multi-Tenant
- **Severità:** Critica (P0)
- **Area:** API
- **Descrizione:** La funzione `requireVenueAccess` in `src/lib/api-utils.ts:144-149` è implementata come un semplice pass-through che chiama solo `requireAuth()`. Il parametro `_venueId` è prefissato con underscore e **completamente ignorato**. Qualsiasi codice che usa questa funzione per verificare l'accesso alla venue non sta verificando nulla.
- **File coinvolti:** `src/lib/api-utils.ts:144-149`
- **Impatto:** Falso senso di sicurezza sull'isolamento multi-tenant. Qualsiasi sviluppatore che usa questa funzione crede di star proteggendo l'accesso alla venue ma non lo sta facendo.
- **Remediation:**
```typescript
export function requireVenueAccess(
  session: Session | null,
  venueId?: string
): AuthCheckResult {
  const authCheck = requireAuth(session)
  if (!authCheck.authorized) return authCheck
  if (venueId && session!.user.venueId && session!.user.venueId !== venueId) {
    return {
      authorized: false,
      response: forbidden('Accesso negato a questa sede'),
    }
  }
  return { authorized: true, session: session! }
}
```

---

### [VULN-004] Nessun Rate Limiting Applicato a NESSUN Endpoint
- **Severità:** Critica (P0)
- **Area:** Auth / API
- **Descrizione:** L'infrastruttura di rate limiting esiste (`src/lib/rate-limit.ts` con `authRateLimit`, `importRateLimit`, `criticalRateLimit` e configurazioni), ma **nessun endpoint chiama effettivamente `checkRateLimitAsync` o `checkRequestRateLimit`**. Grep conferma 0 utilizzi negli endpoint API. Il login, il reset password, l'import, e tutte le operazioni critiche sono senza protezione.
- **File coinvolti:** `src/lib/rate-limit.ts:46-79` (definiti), `src/lib/auth.ts:56-119` (login senza rate limit), `src/app/api/auth/forgot-password/route.ts:23` (senza rate limit)
- **Impatto:** Brute force illimitato sul login, email bombing su forgot-password, DoS sugli endpoint di import/calcolo, nessuna protezione da abusi.
- **Remediation:** Applicare rate limiting almeno su:
```typescript
// Login - nell'authorize() di auth.ts
const ip = request?.headers?.get('x-forwarded-for')?.split(',')[0] || 'unknown'
const { success } = await checkRateLimitAsync(`auth:login:${ip}`, authRateLimit, RATE_LIMIT_CONFIGS.AUTH)
if (!success) throw new Error('Troppi tentativi. Riprova tra un minuto.')

// Forgot-password, Reset-password, Import, Chiusure...
```

---

### [VULN-005] Assenza Completa di Audit Trail sui Dati Finanziari
- **Severità:** Critica (P0)
- **Area:** Data
- **Descrizione:** Non esiste alcun modello `AuditLog` nello schema Prisma. Nessuna traccia di chi ha creato, modificato o cancellato movimenti contabili (JournalEntry), chiusure cassa (DailyClosure), transazioni bancarie (BankTransaction), fatture (ElectronicInvoice) o pagamenti (Payment).
- **File coinvolti:** `prisma/schema.prisma` (assente)
- **Impatto:** Impossibile tracciare modifiche fraudolente ai dati contabili. Nessuna accountability. Non conforme ai requisiti di tenuta dei registri contabili italiani. Combinato con VULN-002 (IDOR), un attaccante può modificare la contabilità senza lasciare traccia.
- **Remediation:**
```prisma
model AuditLog {
  id          String   @id @default(cuid())
  userId      String   @map("user_id")
  action      String   // CREATE, UPDATE, DELETE
  entityType  String   @map("entity_type")
  entityId    String   @map("entity_id")
  changes     Json?
  ipAddress   String?  @map("ip_address")
  createdAt   DateTime @default(now()) @map("created_at")
  user        User     @relation(fields: [userId], references: [id])
  @@index([entityType, entityId])
  @@index([userId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

---

### [VULN-006] Nessun Soft Delete sui Modelli Finanziari — Hard Delete di Dati Contabili
- **Severità:** Critica (P0)
- **Area:** Data
- **Descrizione:** Nessun modello finanziario ha un campo `deletedAt` o `isDeleted`. Le cancellazioni sono hard delete irreversibili. Confermato: `prisma.journalEntry.delete` in `prima-nota/[id]/route.ts:191`, `prisma.dailyClosure.delete` in `chiusure/[id]/route.ts:540`, `prisma.dailyClosure.deleteMany` in `chiusure/bulk-delete/route.ts:100`.
- **File coinvolti:** `prisma/schema.prisma`, `src/app/api/prima-nota/[id]/route.ts:191`, `src/app/api/chiusure/[id]/route.ts:540`, `src/app/api/chiusure/bulk-delete/route.ts:100`
- **Impatto:** Viola il principio di inalterabilità delle scritture contabili. Un admin può cancellare permanentemente movimenti contabili senza possibilità di recovery. Combinato con VULN-002 (IDOR), qualsiasi utente può cancellare contabilità di qualsiasi sede.
- **Remediation:** Aggiungere `deletedAt`/`deletedById` a tutti i modelli finanziari e convertire delete in soft delete via Prisma middleware.

---

### [VULN-007] Password di Default Note nel Seed — Eseguibile in Produzione
- **Severità:** Critica (P0)
- **Area:** Data / Auth
- **Descrizione:** Il seed crea utenti con password note: `admin123`, `manager123`, `staff123`, `extra123` con `mustChangePassword: false`. Nessun guard impedisce l'esecuzione in produzione. Le credenziali sono stampate in console. La password di default per nuovi utenti (`1234567890`) è hardcoded in 4 file e restituita in plaintext nella response JSON.
- **File coinvolti:** `prisma/seed.ts:122-196,253-256`, `src/app/api/users/route.ts:22,264-270`, `src/app/api/auth/reset-password/route.ts:8`, `src/app/(auth)/reset-password/page.tsx:70`
- **Impatto:** Se il seed è eseguito in produzione, accesso admin immediato. La password di default è visibile nel bundle JavaScript client-side.
- **Remediation:**
```typescript
// prisma/seed.ts
if (process.env.NODE_ENV === 'production') {
  console.error('❌ SEED NON CONSENTITO IN PRODUZIONE')
  process.exit(1)
}
// Usare password random: crypto.randomBytes(16).toString('hex')
```

---

### [VULN-008] jsPDF con 8 CVE Critiche — Path Traversal e Code Execution
- **Severità:** Critica (P0)
- **Area:** Infra / Supply Chain
- **Descrizione:** `jspdf@^3.0.4` ha 8 vulnerabilità: Local File Inclusion/Path Traversal (critica), PDF Injection con esecuzione JavaScript arbitraria (2 CVE), PDF Object Injection, DoS via BMP/GIF, XMP Metadata Injection, Race Condition.
- **File coinvolti:** `package.json:74`
- **Impatto:** Se input utente finisce nei PDF (nomi fornitori, descrizioni fatture, note), un attaccante può iniettare JavaScript, leggere file dal server, o causare DoS.
- **Remediation:**
```bash
npm install jspdf@latest  # Aggiornare a >=4.2.0
```

---

## Vulnerabilità Alte (P1 — Entro 1 settimana)

### [VULN-009] IDOR su GET /api/prima-nota/[id] — Lettura Contabilità Cross-Venue
- **Severità:** Alta (P1)
- **Area:** API
- **Descrizione:** `findUnique({ where: { id } })` senza filtro `venueId`. Qualsiasi utente autenticato può leggere qualsiasi movimento contabile di qualsiasi venue.
- **File coinvolti:** `src/app/api/prima-nota/[id]/route.ts:22-24`
- **Impatto:** Data leakage cross-tenant di dati finanziari (importi, descrizioni, conti, controparti).
- **Remediation:** Aggiungere `venueId` alla query `findFirst`.

---

### [VULN-010] IDOR su GET/DELETE /api/bank-transactions/[id] — Nessun Filtro Venue
- **Severità:** Alta (P1)
- **Area:** API
- **Descrizione:** GET e DELETE su transazioni bancarie singole non filtrano per `venueId`.
- **File coinvolti:** `src/app/api/bank-transactions/[id]/route.ts:20-48` e `:120-141`
- **Impatto:** Lettura e cancellazione dati bancari cross-tenant.

---

### [VULN-011] Data Leakage Completo — GET /api/bank-transactions Senza Filtro Venue Obbligatorio
- **Severità:** Alta (P1)
- **Area:** API
- **Descrizione:** Il `venueId` è opzionale dal query param. Se non fornito, **nessun filtro venue applicato** — vengono restituite TUTTE le transazioni bancarie di TUTTE le venue.
- **File coinvolti:** `src/app/api/bank-transactions/route.ts:36-38`
- **Impatto:** Data leakage completo di tutte le transazioni bancarie dell'intero sistema.
- **Remediation:** Forzare `const venueId = await getVenueId()`.

---

### [VULN-012] IDOR su GET/PUT /api/chiusure/[id] — Nessun Filtro Venue
- **Severità:** Alta (P1)
- **Area:** API
- **Descrizione:** GET e PUT cercano la chiusura per ID senza filtro `venueId`.
- **File coinvolti:** `src/app/api/chiusure/[id]/route.ts:134` e `:358-360`
- **Impatto:** Lettura e modifica di chiusure cassa cross-tenant.

---

### [VULN-013] venueId dal Client su POST /api/payments e /api/pagamenti — Nessun RBAC
- **Severità:** Alta (P1)
- **Area:** API
- **Descrizione:** POST accetta `venueId` dal body senza sovrascriverlo con `getVenueId()`. Nessuna validazione Zod su `/api/pagamenti`. Nessun check RBAC — staff può creare pagamenti.
- **File coinvolti:** `src/app/api/payments/route.ts:101-146`, `src/app/api/pagamenti/route.ts:56-72`
- **Impatto:** Creazione pagamenti per qualsiasi venue. Mass assignment senza validazione.

---

### [VULN-014] venueId dal Client su POST /api/cashflow/forecasts — Nessun RBAC
- **Severità:** Alta (P1)
- **Area:** API
- **Descrizione:** Stessa problematica di VULN-013. VenueId dal body, nessun Zod, nessun RBAC.
- **File coinvolti:** `src/app/api/cashflow/forecasts/route.ts:54-129`
- **Impatto:** Creazione dati finanziari arbitrari cross-tenant.

---

### [VULN-015] Sessione JWT 30 Giorni Non Revocabile
- **Severità:** Alta (P1)
- **Area:** Auth
- **Descrizione:** `maxAge: 30 * 24 * 60 * 60` (30 giorni) con `strategy: 'jwt'` puro. Nessun meccanismo di revoca server-side. Dopo logout, il JWT resta tecnicamente valido.
- **File coinvolti:** `src/lib/auth.ts:171-174`
- **Impatto:** Session hijacking con finestra di 30 giorni. Cambio password, disattivazione, cambio ruolo non invalidano sessioni esistenti.
- **Remediation:** Ridurre a 8 ore + aggiungere verifica DB periodica nel jwt callback.

---

### [VULN-016] Dati Finanziari Sensibili in Chiaro nel Database
- **Severità:** Alta (P1)
- **Area:** Data
- **Descrizione:** IBAN (6 campi: `BankAccount.iban:171`, `Supplier.iban:432`, `Customer.iban:453`, `Schedule.controparteIban:480`, `InvoiceDeadline.iban:1143`, `Payment.beneficiarioIban:1334`), tariffe orarie (5 campi User), paga dipendenti (`DailyAttendance.hourlyRate:324`, `totalPay:325`), codice fiscale (`User.fiscalCode:43`), P.IVA (`User.vatNumber:45`), portalPin — tutto in chiaro.
- **File coinvolti:** `prisma/schema.prisma`
- **Impatto:** Un data breach espone immediatamente IBAN, stipendi, codici fiscali di tutti i dipendenti e dell'azienda.
- **Remediation:** Column-level encryption con Prisma extension o pgcrypto.

---

### [VULN-017] Security Headers Completamente Assenti
- **Severità:** Alta (P1)
- **Area:** Infra
- **Descrizione:** Nessun security header HTTP configurato. Mancano: CSP, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, Permissions-Policy.
- **File coinvolti:** `next.config.ts:11-13`
- **Impatto:** Clickjacking, MIME sniffing, downgrade attacks, nessuna mitigazione XSS.
- **Remediation:** Aggiungere `async headers()` in `nextConfig`.

---

### [VULN-018] Password Default Hardcoded nel Client-Side Bundle
- **Severità:** Alta (P1)
- **Area:** Auth / Infra
- **Descrizione:** La password `1234567890` è hardcoded anche in `src/app/(auth)/reset-password/page.tsx:70`, visibile nel bundle JavaScript del browser.
- **File coinvolti:** `src/app/(auth)/reset-password/page.tsx:70`, `src/app/api/users/route.ts:22`
- **Impatto:** Chiunque esamini il bundle JS conosce la password di default dei nuovi utenti.
- **Remediation:** Spostare il check server-side, usare il flag `mustChangePassword`.

---

### [VULN-019] mustChangePassword Non Enforced nelle API
- **Severità:** Alta (P1)
- **Area:** Auth
- **Descrizione:** Il flag `mustChangePassword` è nel JWT ma non c'è enforcement nel middleware né nelle API routes.
- **File coinvolti:** `src/lib/auth.ts:135`, `src/middleware.ts` (assente check)
- **Impatto:** Utenti con password `1234567890` possono operare sul gestionale senza restrizioni.

---

### [VULN-020] Cascade Delete Elimina Dati Finanziari a Catena
- **Severità:** Alta (P1)
- **Area:** Data
- **Descrizione:** CashStation, CashCount, HourlyPartial, DailyExpense, DailyAttendance hanno `onDelete: Cascade` dalla DailyClosure. Eliminando una chiusura si perdono tutte le presenze (con ore e paghe), spese e conteggi cassa.
- **File coinvolti:** `prisma/schema.prisma:249,276,291,312,329`
- **Impatto:** Cancellazione a catena di dati HR/payroll critici.
- **Remediation:** Usare `onDelete: Restrict` sui modelli finanziari.

---

### [VULN-021] Connessione Database Senza SSL Obbligatorio
- **Severità:** Alta (P1)
- **Area:** Data
- **Descrizione:** DATABASE_URL senza `sslmode=require`. Pool creato senza opzioni SSL.
- **File coinvolti:** `.env.example:3`, `src/lib/prisma.ts:11`
- **Impatto:** Dati finanziari trasmessi in chiaro sulla rete.
- **Remediation:** Aggiungere `sslmode=require` + `ssl: { rejectUnauthorized: true }` in produzione.

---

### [VULN-022] Nessun Meccanismo GDPR per Dati Dipendenti
- **Severità:** Alta (P1)
- **Area:** Data
- **Descrizione:** Dati personali (codice fiscale, data nascita, indirizzo, telefono) e geolocalizzazione timbrature (`AttendanceRecord.latitude/longitude:956-957`, `ipAddress:962`) conservati indefinitamente. Nessuna procedura di anonimizzazione o diritto all'oblio.
- **File coinvolti:** `prisma/schema.prisma` — User, DailyAttendance, AttendanceRecord
- **Impatto:** Violazione GDPR art. 17 e 5.1.e. La geolocalizzazione dei dipendenti richiede particolare attenzione normativa.

---

### [VULN-023] xlsx (SheetJS) con Vulnerabilità HIGH — Nessun Fix Disponibile
- **Severità:** Alta (P1)
- **Area:** Infra / Supply Chain
- **Descrizione:** `xlsx@^0.18.5` ha Prototype Pollution e ReDoS. Nessun fix disponibile per la versione community.
- **File coinvolti:** `package.json:96`
- **Impatto:** Prototype Pollution può portare a RCE server-side. ReDoS con file Excel crafted.
- **Remediation:** Migrare a `exceljs` (già presente nelle dipendenze).

---

### [VULN-024] Next.js 16.1.1 con 3 Vulnerabilità HIGH
- **Severità:** Alta (P1)
- **Area:** Infra / Supply Chain
- **Descrizione:** Next.js 16.1.1 vulnerabile a: DoS via Image Optimizer, DoS via HTTP request deserialization con RSC, Unbounded Memory Consumption via PPR.
- **File coinvolti:** `package.json:77`
- **Impatto:** DoS dell'applicazione in produzione.
- **Remediation:** `npm install next@16.1.6`

---

## Vulnerabilità Medie (P2 — Entro 1 mese)

### [VULN-025] Middleware Edge Non Verifica il Contenuto JWT
- **Severità:** Media (P2)
- **Area:** Auth
- **Descrizione:** Il middleware controlla solo la **presenza** del cookie, non ne verifica firma o contenuto. Il commento a riga 53-55 lo ammette.
- **File coinvolti:** `src/middleware.ts:42-51`
- **Impatto:** Cookie scaduto o malformato supera il middleware.

---

### [VULN-026] Password Policy Debole — Solo 8 Caratteri Minimi
- **Severità:** Media (P2)
- **Area:** Auth
- **Descrizione:** Solo `min(8)` senza requisiti complessità. `aaaaaaaa` è valida.
- **File coinvolti:** `src/app/api/auth/reset-password/route.ts:14`
- **Remediation:** Minimo 10 caratteri + maiuscola + minuscola + numero + speciale.

---

### [VULN-027] Reset Token Usa crypto.randomUUID() (122 bit) invece di crypto.randomBytes() (256 bit)
- **Severità:** Media (P2)
- **Area:** Auth
- **File coinvolti:** `src/app/api/auth/forgot-password/route.ts:42`

---

### [VULN-028] Token Invito Generico Senza Email Binding
- **Severità:** Media (P2)
- **Area:** Auth
- **Descrizione:** Link condivisibili per registrazione staff senza binding email.
- **File coinvolti:** `src/app/api/staff/invite/route.ts`

---

### [VULN-029] Nessun RBAC su Creazione Chiusure + venueId dal Client
- **Severità:** Media (P2)
- **Area:** API
- **Descrizione:** POST /api/chiusure non verifica ruolo. VenueId dal body senza override.
- **File coinvolti:** `src/app/api/chiusure/route.ts` (POST)

---

### [VULN-030] Mass Assignment su PUT /api/prima-nota/[id]
- **Severità:** Media (P2)
- **Area:** API
- **Descrizione:** `validatedData` passato direttamente a Prisma senza whitelist campi.
- **File coinvolti:** `src/app/api/prima-nota/[id]/route.ts:124-127`

---

### [VULN-031] /api/docs Espone OpenAPI Spec Senza Autenticazione
- **Severità:** Media (P2)
- **Area:** API
- **Descrizione:** L'intera specifica OpenAPI è accessibile senza auth, rivelando tutti gli endpoint.
- **File coinvolti:** `src/app/api/docs/route.ts:20-23`
- **Remediation:** Disabilitare in produzione: `if (process.env.NODE_ENV === 'production') return 404`.

---

### [VULN-032] Nessuna Configurazione CORS
- **Severità:** Media (P2)
- **Area:** API
- **Descrizione:** Nessuna configurazione CORS in next.config.ts o middleware.
- **File coinvolti:** `next.config.ts`

---

### [VULN-033] File Upload — Validazione MIME Basata Solo su file.type Client
- **Severità:** Media (P2)
- **Area:** API
- **Descrizione:** `file.type` è fornito dal client ed è facilmente falsificabile. Non vengono verificati i magic bytes.
- **File coinvolti:** `src/app/api/scadenzario/[id]/allegati/route.ts:90`

---

### [VULN-034] Sentry Server-Side Senza PII Scrubbing
- **Severità:** Media (P2)
- **Area:** Infra
- **Descrizione:** Il `beforeSend` server-side non filtra PII. Client-side ha `maskAllText: true`, ma server-side no.
- **File coinvolti:** `sentry.server.config.ts:21-28`

---

### [VULN-035] Service Worker Cachea API Responses Potenzialmente Sensibili
- **Severità:** Media (P2)
- **Area:** Infra
- **Descrizione:** `defaultCache` di Serwist senza esclusione esplicita delle API routes.
- **File coinvolti:** `src/app/sw.ts:27`

---

### [VULN-036] next-auth v5.0.0-beta.30 — Beta in Produzione
- **Severità:** Media (P2)
- **Area:** Infra / Supply Chain
- **File coinvolti:** `package.json:78`

---

### [VULN-037] Prisma Client Senza Pool Config, Timeout e Logging
- **Severità:** Media (P2)
- **Area:** Data
- **Descrizione:** Pool creato senza `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`. Nessun logging.
- **File coinvolti:** `src/lib/prisma.ts:10-14`

---

### [VULN-038] Import Bank Transactions Senza Transazione Atomica
- **Severità:** Media (P2)
- **Area:** Data
- **Descrizione:** Loop `for...of` crea JournalEntry + aggiorna BankTransaction senza `prisma.$transaction`.
- **File coinvolti:** `src/app/api/prima-nota/import/route.ts:49-86`
- **Impatto:** Import parziale lascia dati inconsistenti.

---

### [VULN-039] Export Dati Senza Controllo Permessi Granulare
- **Severità:** Media (P2)
- **Area:** Data
- **Descrizione:** Qualsiasi utente autenticato (anche staff) può esportare tutta la prima nota e le scadenze.
- **File coinvolti:** `src/app/api/prima-nota/export/route.ts:21-42`, `src/app/api/scadenzario/export/route.ts:10-20`

---

### [VULN-040] Reconciliation POST Accetta venueId dal Body Senza Verifica
- **Severità:** Media (P2)
- **Area:** Data
- **Descrizione:** `venueId` dal body senza confronto con la venue dell'utente.
- **File coinvolti:** `src/app/api/reconciliation/route.ts:16-21`

---

### [VULN-041] Nessuna Configurazione Backup Documentata
- **Severità:** Media (P2)
- **Area:** Data
- **Descrizione:** Nessun script, cron job o documentazione backup.
- **Impatto:** Nessun recovery possibile in caso di data loss.

---

## Vulnerabilità Basse (P3 — Backlog)

### [VULN-042] Cron GET Endpoints Espongono Info Senza Auth
- **Severità:** Bassa (P3)
- **Area:** API
- **File coinvolti:** `src/app/api/shifts/reminder/route.ts:145-154`, `src/app/api/attendance/auto-clockout/route.ts:166-174`

---

### [VULN-043] Error Leak in /api/budget/alerts/generate
- **Severità:** Bassa (P3)
- **Area:** API
- **File coinvolti:** `src/app/api/budget/alerts/generate/route.ts:80`
- **Descrizione:** `error.message` restituito direttamente al client.

---

### [VULN-044] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY Non Documentata
- **Severità:** Bassa (P3)
- **Area:** Infra
- **File coinvolti:** `src/components/ui/address-autocomplete.tsx:108`

---

### [VULN-045] NEXT_PUBLIC_APP_URL Non Documentata
- **Severità:** Bassa (P3)
- **Area:** Infra
- **File coinvolti:** `src/lib/swagger.ts:71`, `src/app/api/staff/invite/route.ts:11`

---

### [VULN-046] Vulnerabilità Moderate in Dipendenze Transitive (hono, lodash, minimatch)
- **Severità:** Bassa (P3)
- **Area:** Infra
- **File coinvolti:** `package.json` (dipendenze transitive via prisma, eslint)

---

### [VULN-047] Credenziali Restituite in Chiaro nella Response Creazione Utente
- **Severità:** Bassa (P3) — coperta anche da VULN-007/VULN-018
- **Area:** API
- **File coinvolti:** `src/app/api/users/route.ts:264-270`, `src/app/api/users/[id]/reset-password/route.ts:66-73`

---

## Raccomandazioni Generali

1. **Centralizzare l'isolamento venue** — Creare un middleware/wrapper che forzi SEMPRE `venueId = session.user.venueId` su ogni query. Il pattern attuale (`getVenueId()` che restituisce la prima sede attiva) è fragile e non legato all'utente.

2. **Implementare Content Security Policy (CSP)** rigorosa come primo header di sicurezza.

3. **Adottare database sessions** invece di JWT puri — Per revocare sessioni immediatamente alla disattivazione account o cambio ruolo.

4. **Creare un wrapper API standardizzato** che applichi automaticamente: auth check → venueId enforcement → mustChangePassword check → rate limiting → RBAC → Zod validation.

5. **Implementare audit logging** come Prisma middleware globale per tutti i modelli finanziari.

6. **Pianificare penetration test** — L'analisi statica ha limiti. Un pen test è necessario per un gestionale finanziario.

7. **GDPR compliance** — Procedura di anonimizzazione per dati dipendenti, data retention policy, registro dei trattamenti.

8. **Backup automatici** — Documentare e testare backup con point-in-time recovery.

---

## Hardening Checklist

### Azione Immediata (P0)
- [ ] Ruotare credenziali esposte nella git history (VULN-001)
- [ ] Purificare git history da `credenziali.env` (VULN-001)
- [ ] Aggiungere filtro `venueId` a PUT/DELETE prima-nota (VULN-002)
- [ ] Implementare `requireVenueAccess` correttamente (VULN-003)
- [ ] Applicare rate limiting almeno su login e forgot-password (VULN-004)
- [ ] Implementare audit trail per dati finanziari (VULN-005)
- [ ] Implementare soft delete per modelli finanziari (VULN-006)
- [ ] Proteggere seed da esecuzione in produzione (VULN-007)
- [ ] Aggiornare jsPDF a >=4.2.0 (VULN-008)

### Entro 1 Settimana (P1)
- [ ] Aggiungere filtro venueId a TUTTI gli endpoint con IDOR (VULN-009/010/011/012)
- [ ] Forzare venueId da sessione su payments/cashflow/chiusure (VULN-013/014)
- [ ] Ridurre durata sessione JWT a 8h (VULN-015)
- [ ] Crittografare IBAN, codici fiscali, stipendi at-rest (VULN-016)
- [ ] Configurare security headers HTTP (VULN-017)
- [ ] Rimuovere password hardcoded dal client-side bundle (VULN-018)
- [ ] Enforare mustChangePassword nelle API (VULN-019)
- [ ] Usare onDelete: Restrict sui modelli finanziari (VULN-020)
- [ ] Aggiungere SSL alla connessione database (VULN-021)
- [ ] Implementare anonimizzazione GDPR per dipendenti (VULN-022)
- [ ] Migrare da xlsx a exceljs (VULN-023)
- [ ] Aggiornare Next.js a >=16.1.6 (VULN-024)

### Entro 1 Mese (P2)
- [ ] Migliorare verifica JWT nel middleware (VULN-025)
- [ ] Rafforzare password policy (VULN-026)
- [ ] Usare crypto.randomBytes per token (VULN-027)
- [ ] Binding email obbligatorio per inviti (VULN-028)
- [ ] RBAC su creazione chiusure (VULN-029)
- [ ] Whitelist campi su Prisma update (VULN-030)
- [ ] Disabilitare /api/docs in produzione (VULN-031)
- [ ] Configurare CORS esplicito (VULN-032)
- [ ] Verificare magic bytes file upload (VULN-033)
- [ ] PII scrubbing Sentry server-side (VULN-034)
- [ ] Escludere API dal SW cache (VULN-035)
- [ ] Configurare pool/timeout Prisma (VULN-037)
- [ ] Wrappare import in $transaction (VULN-038)
- [ ] Controllo ruoli su export (VULN-039)
- [ ] Validare venueId su reconciliation (VULN-040)
- [ ] Documentare strategia backup (VULN-041)

---

## Allegati

### Output npm audit (riepilogo)

| Package | Severità | CVE | Fix |
|---------|----------|-----|-----|
| jspdf <=4.1.0 | **Critica** (8 CVE) | Path traversal, PDF injection, DoS | jspdf@4.2.0 |
| next 16.1.1 | **Alta** (3 CVE) | DoS Image Optimizer, RSC deser, PPR memory | next@16.1.6 |
| xlsx 0.18.5 | **Alta** (2 CVE) | Prototype Pollution, ReDoS | Nessun fix — migrare a exceljs |
| hono <=4.11.9 | Moderata (5 CVE) | XSS, cache deception, IP spoofing | Via prisma update |
| lodash 4.x | Moderata | Prototype pollution | Via prisma update |
| minimatch <10.2.1 | Alta | ReDoS | exceljs@4.1.1 |
| **Totale** | **41 vulnerabilità** | 1 critical, 32 high, 8 moderate | |

### Statistiche Audit

| Metrica | Valore |
|---------|--------|
| File analizzati | 50+ |
| API routes nel progetto | 150+ |
| Modelli database | 63 |
| Righe schema Prisma | 1858 |
| Agenti impiegati | 4 (auth, api, data, infra) |
| **Vulnerabilità P0 (Critiche)** | **8** |
| **Vulnerabilità P1 (Alte)** | **16** |
| **Vulnerabilità P2 (Medie)** | **17** |
| **Vulnerabilità P3 (Basse)** | **6** |
| **Totale vulnerabilità** | **47** |

### Note Positive

- **bcryptjs salt round 12** — Corretto in tutti gli endpoint di hashing
- **Messaggi login generici** — "Credenziali non valide" per user non trovato e password errata
- **Forgot-password non enumera email** — Risposta sempre positiva
- **Token reset invalidato dopo uso** — `resetToken: null` dopo reset
- **Token invito invalidato dopo uso** — `usedAt: new Date()` dopo registrazione
- **Verifica isActive al login** — Utenti disattivati bloccati
- **Validazione Zod diffusa** — Presente sulla maggior parte degli endpoint
- **RBAC implementato** — Sistema Role → Permission funzionante
- **Source map nascoste** — `hideSourceMaps: true` in produzione
- **Nessun dangerouslySetInnerHTML** — Zero risultati
- **Nessun dato in localStorage/sessionStorage** — Zero risultati
- **Logger strutturato Pino** — Nessun console.log nel codice
- **CRON_SECRET verificato** — Endpoint cron POST protetti
- **.env nel .gitignore** — Correttamente escluso
- **.env.example senza valori reali** — Solo placeholder
- **$queryRaw con tagged template literals** — Parametrizzato, non vulnerabile a SQL injection
- **Invoice bulk-delete richiede password di conferma** — Buona pratica
- **Sentry client con maskAllText e blockAllMedia** — Privacy replay OK
