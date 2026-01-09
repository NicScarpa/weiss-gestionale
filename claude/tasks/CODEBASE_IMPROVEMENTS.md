# Piano di Miglioramento Codebase
## Sistema Gestionale Weiss Cafè

**Data Creazione**: 2026-01-09
**Stato**: In attesa di approvazione
**Stima Totale**: 24-32 ore di sviluppo

---

## Indice

1. [Panoramica](#panoramica)
2. [Fase 1: Alta Priorità - Sicurezza e Test](#fase-1-alta-priorità)
3. [Fase 2: Media Priorità - Refactoring](#fase-2-media-priorità)
4. [Fase 3: Bassa Priorità - Documentazione](#fase-3-bassa-priorità)
5. [Cronologia Implementazione](#cronologia-implementazione)
6. [Progresso](#progresso)

---

## Panoramica

Questo piano implementa le raccomandazioni emerse dall'analisi del codebase del 9 gennaio 2026.

### Metriche Obiettivo

| Metrica | Attuale | Obiettivo |
|---------|---------|-----------|
| Test Coverage (unit) | 0% | 80% su lib/ |
| Vulnerabilità Sicurezza | 1 | 0 |
| Duplicazione Codice | 3 istanze | 0 |
| Componenti >500 righe | 2 | 0 |

---

## Fase 1: Alta Priorità

### 1.1 Unit Test per Calcoli Finanziari

**File Target**: `src/lib/calculations.ts`
**Stima**: 4-6 ore
**Priorità**: 🔴 CRITICA

#### Razionale
I calcoli finanziari sono il cuore del sistema. Un errore di arrotondamento o calcolo IVA potrebbe causare discrepanze contabili significative.

#### Attività

- [ ] **1.1.1** Configurare Jest/Vitest per unit testing
  ```bash
  # Dipendenze da installare
  npm install -D vitest @testing-library/react @testing-library/jest-dom
  ```

- [ ] **1.1.2** Creare file test `src/lib/__tests__/calculations.test.ts`

  **Test Cases da implementare**:

  | Funzione | Test Case | Input | Output Atteso |
  |----------|-----------|-------|---------------|
  | `calculateCashStationTotal` | Conteggio vuoto | `{}` | `0` |
  | `calculateCashStationTotal` | Singolo taglio | `{"50": 2}` | `100` |
  | `calculateCashStationTotal` | Tutti i tagli | Mix completo | Somma corretta |
  | `calculateVat` | IVA 10% standard | `110` | `10` |
  | `calculateVat` | IVA con decimali | `115.50` | `10.50` |
  | `calculateVat` | Edge case zero | `0` | `0` |
  | `calculateNetTotal` | Netto da lordo | `110, 0.10` | `100` |
  | `calculateExpectedCash` | Formula completa | Vari scenari | Verifica formula |
  | `calculateCashDifference` | Differenza positiva | `100, 95` | `5` |
  | `calculateCashDifference` | Differenza negativa | `95, 100` | `-5` |
  | `isWithinThreshold` | Entro soglia | `4.99` | `true` |
  | `isWithinThreshold` | Oltre soglia | `5.01` | `false` |

- [ ] **1.1.3** Creare file test `src/lib/__tests__/closure-journal-entries.test.ts`

  **Test Cases da implementare**:

  | Scenario | Descrizione |
  |----------|-------------|
  | Chiusura semplice | Solo incasso contanti, nessuna uscita |
  | Chiusura con uscite | Incasso + spese fornitori |
  | Chiusura con versamento | Incasso + deposito banca |
  | Chiusura completa | Tutti i movimenti |
  | Chiusura evento | Postazioni extra attive |

- [ ] **1.1.4** Configurare script npm per test
  ```json
  {
    "scripts": {
      "test": "vitest",
      "test:coverage": "vitest --coverage",
      "test:watch": "vitest --watch"
    }
  }
  ```

- [ ] **1.1.5** Aggiungere CI check per test (GitHub Actions)

#### File da Creare

```
src/
├── lib/
│   └── __tests__/
│       ├── calculations.test.ts      # ~200 righe
│       ├── closure-journal-entries.test.ts  # ~150 righe
│       └── budget-utils.test.ts      # ~100 righe
├── vitest.config.ts                  # Configurazione
└── vitest.setup.ts                   # Setup globale
```

---

### 1.2 Fix Vulnerabilità CRON Secret

**File Target**: `src/app/api/shifts/reminder/route.ts`, `src/app/api/attendance/auto-clockout/route.ts`
**Stima**: 30 minuti
**Priorità**: 🔴 CRITICA

#### Problema Attuale

```typescript
// VULNERABILE - Default secret espone l'endpoint
const CRON_SECRET = process.env.CRON_SECRET || 'default-cron-secret'
```

#### Soluzione

- [ ] **1.2.1** Rimuovere fallback default
  ```typescript
  // SICURO - Fallisce se non configurato
  const CRON_SECRET = process.env.CRON_SECRET

  if (!CRON_SECRET) {
    console.error('CRON_SECRET environment variable is not set')
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    )
  }
  ```

- [ ] **1.2.2** Aggiungere validazione all'inizio del handler

- [ ] **1.2.3** Aggiornare `.env.example` con documentazione
  ```env
  # REQUIRED: Secret per autenticazione endpoint CRON
  # Generare con: openssl rand -hex 32
  CRON_SECRET=
  ```

- [ ] **1.2.4** Verificare configurazione Vercel/deployment

#### File da Modificare

| File | Modifica |
|------|----------|
| `src/app/api/shifts/reminder/route.ts` | Rimuovere default, aggiungere validazione |
| `src/app/api/attendance/auto-clockout/route.ts` | Rimuovere default, aggiungere validazione |
| `.env.example` | Documentare CRON_SECRET |

---

### 1.3 Integration Test per API Critiche

**Stima**: 6-8 ore
**Priorità**: 🔴 ALTA

#### API da Testare

| Endpoint | Metodo | Priorità |
|----------|--------|----------|
| `/api/chiusure` | POST | Alta |
| `/api/chiusure/[id]/validate` | POST | Alta |
| `/api/prima-nota` | POST | Alta |
| `/api/auth/verify-password` | POST | Media |

- [ ] **1.3.1** Configurare test database (SQLite o PostgreSQL test)

- [ ] **1.3.2** Creare factory per dati di test
  ```typescript
  // src/test/factories/closure.factory.ts
  export function createTestClosure(overrides?: Partial<ClosureData>) {
    return {
      date: new Date(),
      venueId: 'test-venue-id',
      stations: [createTestStation()],
      ...overrides
    }
  }
  ```

- [ ] **1.3.3** Implementare test per `/api/chiusure`
  - Test creazione chiusura valida
  - Test validazione Zod (dati mancanti)
  - Test conflitto data duplicata (409)
  - Test autorizzazione (401, 403)

- [ ] **1.3.4** Implementare test per `/api/chiusure/[id]/validate`
  - Test validazione con differenza cassa entro soglia
  - Test validazione con differenza oltre soglia
  - Test generazione automatica prima nota

---

## Fase 2: Media Priorità

### 2.1 Refactoring NuovaChiusuraClient

**File Target**: `src/app/(dashboard)/chiusura-cassa/nuova/NuovaChiusuraClient.tsx`
**Stima**: 2-3 ore
**Priorità**: 🟡 MEDIA

#### Problema Attuale

Le funzioni `handleSave` e `handleSubmit` contengono ~70% di codice duplicato per costruire il body della richiesta.

#### Soluzione

- [ ] **2.1.1** Estrarre funzione per costruire payload
  ```typescript
  // src/lib/closure-form-utils.ts
  export function buildClosurePayload(
    data: ClosureFormData,
    venueId: string
  ): ClosureApiPayload {
    return {
      date: data.date.toISOString(),
      venueId,
      isEvent: data.isEvent,
      eventName: data.eventName,
      weatherMorning: data.weatherMorning,
      weatherAfternoon: data.weatherAfternoon,
      weatherEvening: data.weatherEvening,
      notes: data.notes,
      stations: data.stations.map(mapStationToPayload),
      partials: data.partials.map(mapPartialToPayload),
      expenses: data.expenses.map(mapExpenseToPayload),
      attendance: data.attendance.map(mapAttendanceToPayload),
    }
  }
  ```

- [ ] **2.1.2** Creare custom hook `useClosureMutation`
  ```typescript
  // src/hooks/useClosureMutation.ts
  export function useClosureMutation(venueId: string) {
    const router = useRouter()

    const saveDraft = async (data: ClosureFormData) => {
      const payload = buildClosurePayload(data, venueId)
      const res = await fetch('/api/chiusure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      // ... gestione risposta
    }

    const submitForValidation = async (data: ClosureFormData) => {
      const result = await saveDraft(data)
      if (result.id) {
        await fetch(`/api/chiusure/${result.id}/submit`, { method: 'POST' })
      }
    }

    return { saveDraft, submitForValidation, isLoading, error }
  }
  ```

- [ ] **2.1.3** Semplificare componente
  ```typescript
  // NuovaChiusuraClient.tsx - DOPO
  export function NuovaChiusuraClient({ venue, ...props }) {
    const { saveDraft, submitForValidation } = useClosureMutation(venue.id)

    return (
      <ClosureForm
        onSave={saveDraft}
        onSubmit={submitForValidation}
        {...props}
      />
    )
  }
  ```

- [ ] **2.1.4** Applicare stesso pattern a `ModificaChiusuraClient.tsx`

#### File da Creare/Modificare

| Azione | File |
|--------|------|
| Creare | `src/lib/closure-form-utils.ts` |
| Creare | `src/hooks/useClosureMutation.ts` |
| Modificare | `src/app/(dashboard)/chiusura-cassa/nuova/NuovaChiusuraClient.tsx` |
| Modificare | `src/app/(dashboard)/chiusura-cassa/[id]/modifica/ModificaChiusuraClient.tsx` |

---

### 2.2 Split ClosureForm Component

**File Target**: `src/components/chiusura/ClosureForm.tsx` (691 righe)
**Stima**: 3-4 ore
**Priorità**: 🟡 MEDIA

#### Struttura Proposta

```
src/components/chiusura/
├── ClosureForm.tsx              # ~150 righe (container)
├── ClosureMetadataSection.tsx   # ~100 righe (data, evento, meteo)
├── ClosureSummaryCard.tsx       # ~120 righe (riepilogo totali)
├── ClosureActions.tsx           # ~50 righe (bottoni salva/invia)
├── hooks/
│   └── useClosureCalculations.ts  # ~80 righe (useMemo logic)
└── index.ts                     # Export barrel
```

#### Attività

- [ ] **2.2.1** Estrarre `ClosureMetadataSection`
  - Data picker
  - Checkbox evento + nome
  - Selettori meteo (mattina/pomeriggio/sera)

- [ ] **2.2.2** Estrarre `ClosureSummaryCard`
  - Griglia totali (vendite, POS, uscite)
  - Sezione quadratura cassa
  - Badge differenza

- [ ] **2.2.3** Estrarre `useClosureCalculations` hook
  ```typescript
  export function useClosureCalculations(
    stations: CashStationData[],
    expenses: ExpenseData[],
    vatRate: number
  ) {
    return useMemo(() => {
      // Logica calcoli attualmente inline
    }, [stations, expenses, vatRate])
  }
  ```

- [ ] **2.2.4** Estrarre `ClosureActions`
  - Bottone "Salva Bozza"
  - Bottone "Invia per Validazione"
  - Sticky footer con blur

- [ ] **2.2.5** Aggiornare import/export

---

### 2.3 Centralizzare Error Handling API

**Stima**: 2-3 ore
**Priorità**: 🟡 MEDIA

#### Implementazione

- [ ] **2.3.1** Creare utility per errori
  ```typescript
  // src/lib/api-errors.ts
  export class ApiError extends Error {
    constructor(
      public statusCode: number,
      message: string,
      public details?: unknown
    ) {
      super(message)
    }
  }

  export function handleApiError(error: unknown): NextResponse {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    if (error instanceof ApiError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.statusCode }
      )
    }

    console.error('Unhandled error:', error)
    return NextResponse.json(
      { error: 'Errore interno del server' },
      { status: 500 }
    )
  }
  ```

- [ ] **2.3.2** Creare wrapper per route handlers
  ```typescript
  // src/lib/api-handler.ts
  export function apiHandler<T>(
    handler: (req: NextRequest) => Promise<T>
  ) {
    return async (req: NextRequest) => {
      try {
        return await handler(req)
      } catch (error) {
        return handleApiError(error)
      }
    }
  }
  ```

- [ ] **2.3.3** Applicare a 3-5 route come pilot
  - `/api/chiusure/route.ts`
  - `/api/prima-nota/route.ts`
  - `/api/budget/route.ts`

- [ ] **2.3.4** Documentare pattern per future implementazioni

---

## Fase 3: Bassa Priorità

### 3.1 Documentazione API

**Stima**: 4 ore
**Priorità**: 🟢 BASSA

- [ ] **3.1.1** Installare e configurare OpenAPI/Swagger
  ```bash
  npm install next-swagger-doc swagger-ui-react
  ```

- [ ] **3.1.2** Creare schema OpenAPI per endpoint principali
  - `/api/chiusure` (GET, POST)
  - `/api/prima-nota` (GET, POST)
  - `/api/budget` (GET, POST)

- [ ] **3.1.3** Creare pagina `/api-docs` per visualizzazione

- [ ] **3.1.4** Aggiungere JSDoc ai route handler principali

---

### 3.2 Rate Limiting

**Stima**: 2 ore
**Priorità**: 🟢 BASSA

- [ ] **3.2.1** Valutare libreria (upstash/ratelimit o custom)

- [ ] **3.2.2** Implementare su endpoint pubblici
  - `/api/auth/*`
  - `/api/portal/*`

- [ ] **3.2.3** Configurare limiti
  | Endpoint | Limite |
  |----------|--------|
  | Login | 5 req/min per IP |
  | API generiche | 100 req/min per user |

---

### 3.3 Performance Monitoring

**Stima**: 2 ore
**Priorità**: 🟢 BASSA

- [ ] **3.3.1** Configurare Vercel Analytics (se non già attivo)

- [ ] **3.3.2** Aggiungere logging strutturato per query lente
  ```typescript
  // Middleware Prisma per logging
  prisma.$use(async (params, next) => {
    const before = Date.now()
    const result = await next(params)
    const after = Date.now()

    if (after - before > 100) {
      console.warn(`Slow query: ${params.model}.${params.action} took ${after - before}ms`)
    }

    return result
  })
  ```

- [ ] **3.3.3** Valutare Sentry per error tracking

---

## Cronologia Implementazione

### Sprint 1 (Settimana 1-2): Fondamentali

| Giorno | Attività | Ore |
|--------|----------|-----|
| 1-2 | 1.1 Setup test + test calculations.ts | 6 |
| 3 | 1.2 Fix CRON secret | 0.5 |
| 3-4 | 1.3 Integration test setup | 4 |
| 5 | 1.3 Test /api/chiusure | 4 |

**Totale Sprint 1**: ~14.5 ore

### Sprint 2 (Settimana 3): Refactoring

| Giorno | Attività | Ore |
|--------|----------|-----|
| 1 | 2.1 Refactor NuovaChiusuraClient | 3 |
| 2-3 | 2.2 Split ClosureForm | 4 |
| 4 | 2.3 API error handling | 3 |

**Totale Sprint 2**: ~10 ore

### Sprint 3 (Settimana 4): Polish

| Giorno | Attività | Ore |
|--------|----------|-----|
| 1-2 | 3.1 API Documentation | 4 |
| 3 | 3.2 Rate Limiting | 2 |
| 4 | 3.3 Monitoring | 2 |

**Totale Sprint 3**: ~8 ore

---

## Progresso

### Fase 1: Alta Priorità ✅ COMPLETATA
- [x] 1.1 Unit Test Calcoli Finanziari ✅ **COMPLETATO 2026-01-09**
- [x] 1.2 Fix CRON Secret ✅ **COMPLETATO 2026-01-09**
- [x] 1.3 Integration Test API ✅ **COMPLETATO 2026-01-09**

### Fase 2: Media Priorità ✅ COMPLETATA
- [x] 2.1 Refactoring NuovaChiusuraClient ✅ **COMPLETATO 2026-01-09**
- [x] 2.2 Split ClosureForm ✅ **COMPLETATO 2026-01-09**
- [x] 2.3 Centralizzare Error Handling ✅ **COMPLETATO 2026-01-09**

### Fase 3: Bassa Priorità ✅ COMPLETATA
- [x] 3.1 Documentazione API ✅ **COMPLETATO 2026-01-09**
- [x] 3.2 Rate Limiting ✅ **COMPLETATO 2026-01-09**
- [x] 3.3 Performance Monitoring ✅ **COMPLETATO 2026-01-09**

---

## Log Implementazione

### 2026-01-09 - Unit Test e Fix Sicurezza

#### 1.1 Unit Test Calcoli Finanziari - COMPLETATO

**File creati:**
- `vitest.config.ts` - Configurazione Vitest con path alias
- `vitest.setup.ts` - Setup ambiente test con mock env vars
- `src/lib/__tests__/calculations.test.ts` - 67 test per funzioni di calcolo
- `src/lib/__tests__/prima-nota-utils.test.ts` - 48 test per utility prima nota
- `src/lib/__tests__/closure-journal-entries.test.ts` - 16 test con mock Prisma

**Script npm aggiunti:**
```json
"test": "vitest",
"test:run": "vitest run",
"test:coverage": "vitest run --coverage",
"test:watch": "vitest --watch",
"test:ui": "vitest --ui"
```

**Risultati test:**
```
✓ src/lib/__tests__/calculations.test.ts (67 tests)
✓ src/lib/__tests__/prima-nota-utils.test.ts (48 tests)
✓ src/lib/__tests__/closure-journal-entries.test.ts (16 tests)

Test Files  3 passed (3)
Tests  131 passed (131)
```

**Copertura funzioni testate:**
- `calculateCashStationTotal` - calcolo totale postazione
- `calculateGrossTotal` - calcolo lordo
- `calculateVat` - calcolo IVA con precisione Decimal.js
- `calculateNetTotal` - calcolo netto
- `calculateExpensesTotal` - totale uscite
- `calculateExpectedCash` - contante atteso
- `calculateCashDifference` - differenza cassa
- `isWithinThreshold` - verifica soglia tolleranza
- `calculateClosureTotals` - riepilogo chiusura completo
- `generateJournalEntriesFromClosure` - generazione prima nota automatica
- Tutte le utility di `prima-nota-utils.ts`

#### 1.2 Fix CRON Secret - COMPLETATO

**File modificati:**
- `src/app/api/shifts/reminder/route.ts`
- `src/app/api/attendance/auto-clockout/route.ts`

**Modifica applicata:**
Rimosso fallback `'default-cron-secret'` e aggiunta validazione:
```typescript
const cronSecret = process.env.CRON_SECRET
if (!cronSecret) {
  console.error('CRON_SECRET environment variable is not set')
  return NextResponse.json(
    { error: 'Errore di configurazione server' },
    { status: 500 }
  )
}
```

**Verifica:**
- Build completato con successo
- Tutti i 131 test passano

#### 1.3 Integration Test API Chiusure - COMPLETATO

**File creati:**
- `src/test/factories/closure.factory.ts` - Factory functions per dati di test
- `src/app/api/chiusure/__tests__/route.test.ts` - 25 test per API chiusure

**Factory functions create:**
- `createTestStation()` - Postazione con valori default
- `createTestStationWithCashCount()` - Postazione con conteggio cassa
- `createTestExpense()` - Spesa test
- `createTestAttendance()` - Presenza test
- `createTestClosure()` - Chiusura completa
- `createMinimalClosure()` - Solo campi obbligatori
- `createEventClosure()` - Chiusura evento
- `createCompleteClosure()` - Chiusura con tutti i componenti
- `createMockDbClosure()` - Mock risultato DB
- `createMockSession()` - Mock sessione utente

**Test coverage API /api/chiusure:**

| Categoria | Test |
|-----------|------|
| GET - Authentication | 401 se non autenticato |
| GET - Responses | Lista vuota, paginazione, filtri |
| POST - Authentication | 401 se non autenticato |
| POST - Authorization | 403 se utente non ha accesso venue |
| POST - Validation | 400 per dati invalidi, enum, campi mancanti |
| POST - Conflict | 409 se chiusura già esiste per data/venue |
| POST - Success | Creazione minimale, con stazioni, completa |
| Edge Cases | Errori DB, JSON malformato, parsing date |

**Risultati finali:**
```
Test Files  4 passed (4)
Tests  156 passed (156)
```

### 2026-01-09 - Fase 2: Refactoring

#### 2.1 Refactoring NuovaChiusuraClient - COMPLETATO

**File creati:**
- `src/lib/closure-form-utils.ts` - Utility per costruzione payload chiusure
- `src/hooks/useClosureMutation.ts` - Custom hook per operazioni CRUD chiusure
- `src/lib/__tests__/closure-form-utils.test.ts` - 21 test

**Risultati:**
- NuovaChiusuraClient ridotto da 183 → 53 righe
- ModificaChiusuraClient ridotto da 112 → 95 righe
- Eliminata duplicazione codice payload building

#### 2.2 Split ClosureForm Component - COMPLETATO

**File creati:**
- `src/components/chiusura/hooks/useClosureCalculations.ts` - Hook per calcoli totali
- `src/components/chiusura/ClosureMetadataSection.tsx` - Sezione metadati (data, evento, meteo)
- `src/components/chiusura/ClosureSummaryCard.tsx` - Card riepilogo totali
- `src/components/chiusura/ClosureActions.tsx` - Bottoni azioni

**Risultati:**
- ClosureForm ridotto da 691 → 376 righe
- Componenti riutilizzabili estratti
- Export aggiunti a index.ts

#### 2.3 Centralizzare Error Handling - COMPLETATO

**File creati:**
- `src/lib/api-utils.ts` - Utility centralizzate per API

**Funzionalità:**
- Error response builders: `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `internalError`
- Success response builders: `ok`, `created`
- Auth helpers: `requireAuth`, `requireRole`, `requireVenueAccess`
- Pagination helpers: `parsePagination`, `paginatedResponse`
- `handleApiError` - Gestione errori unificata
- 38 test

### 2026-01-09 - Fase 3: Documentazione e Monitoring

#### 3.1 Documentazione API (OpenAPI/Swagger) - COMPLETATO

**File creati:**
- `src/lib/swagger.ts` - Configurazione OpenAPI spec
- `src/app/api/docs/route.ts` - Endpoint per spec JSON
- `src/app/(public)/api-docs/page.tsx` - Pagina Swagger UI

**Pacchetti installati:**
- `next-swagger-doc`
- `swagger-ui-react`
- `@types/swagger-ui-react`

**API documentate con JSDoc:**
- `/api/chiusure` (GET, POST)
- `/api/prima-nota` (GET, POST)

**Accesso:** `/api-docs`

#### 3.2 Rate Limiting - COMPLETATO

**File creati:**
- `src/lib/rate-limit.ts` - Rate limiter in-memory con sliding window
- `src/lib/__tests__/rate-limit.test.ts` - 20 test

**Funzionalità:**
- Configurazioni predefinite: AUTH (5/min), API (100/min), STRICT (10/min), GENEROUS (200/min)
- `checkRateLimit` - Verifica rate limit
- `getClientIp` - Estrazione IP da headers (Vercel, Cloudflare, nginx)
- `getRateLimitKey` - Generazione chiavi per IP/user
- Helpers integrati in api-utils.ts: `checkRequestRateLimit`, `withRateLimitHeaders`

#### 3.3 Performance Monitoring - COMPLETATO

**File creati:**
- `src/lib/performance.ts` - Utility per monitoraggio performance
- `src/lib/__tests__/performance.test.ts` - 24 test

**Funzionalità:**
- `PERFORMANCE_THRESHOLDS` - Soglie per operazioni lente
- `logSlowOperation` - Logging operazioni lente
- `measureAsync` / `measureSync` - Misurazione tempo esecuzione
- `createTimer` - Timer manuale
- `getStoredMetrics` / `clearStoredMetrics` - Gestione metriche
- `getPerformanceSummary` - Riepilogo performance
- `createPrismaQueryLogger` - Middleware logging query Prisma

**Risultati finali Fase 3:**
```
Test Files  8 passed (8)
Tests  259 passed (259)
```

---

## Note Tecniche

### Dipendenze da Aggiungere

```json
{
  "devDependencies": {
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "@testing-library/react": "^15.0.0",
    "@testing-library/jest-dom": "^6.0.0"
  },
  "dependencies": {
    "next-swagger-doc": "^0.4.0",
    "swagger-ui-react": "^5.0.0"
  }
}
```

### Configurazione Vitest

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './vitest.setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
```

---

**Piano creato da**: Claude Code Analysis
**Ultima modifica**: 2026-01-09
**Prossima review**: Dopo approvazione utente
