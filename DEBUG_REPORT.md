# DEBUG REPORT — Weiss Gestionale

**Data**: 2026-02-14
**Branch**: main
**Stack**: Next.js 16.1.1 / React 19 / TypeScript 5 / Prisma 7.2.0 / PostgreSQL (Supabase)

---

## Riepilogo Generale

| Categoria | Conteggio |
|-----------|-----------|
| Errori TypeScript (tsc) | 0 |
| Errori ESLint | 26 |
| Warning ESLint | 132 |
| Next.js Build | SUCCESSO (152 pagine) |
| Errori Runtime (Browser) - Critici | 1 |
| Errori Runtime (Browser) - Alti | 2 |
| Errori Runtime (Browser) - Medi | 2 |
| Import rotti | 0 |
| Riferimenti Prisma invalidi | 0 |
| Uso di `any` in produzione | 15 |
| `console.log` stub | 13 |
| `console.error` (dovrebbe essere logger) | 44 |
| File tipi duplicati | 3 coppie |
| `formatCurrency` duplicata | 4 definizioni |
| API routes duplicate | 3 gruppi |

---

## 1. Errori Runtime (Browser)

### CRITICO (P0)

| # | Errore | URL | Dettaglio |
|---|--------|-----|-----------|
| R1 | `/api/customers?full=true` restituisce **500** | /anagrafiche/clienti | Server error — la tabella clienti non carica dati |

### ALTO (P1)

| # | Errore | URL | Dettaglio |
|---|--------|-----|-----------|
| R2 | `/api/scadenzario/summary` restituisce **400** | TUTTE le pagine dashboard (42+) | Chiamato da componente nel layout condiviso, errore globale |
| R3 | `/api/scadenzario?page=1&sortBy=dataScadenza&sortOrder=asc` restituisce **400** | /scadenzario | Pagina scadenzario inutilizzabile |

### MEDIO (P2)

| # | Errore | URL | Dettaglio |
|---|--------|-----|-----------|
| R4 | Hydration mismatch `aria-controls` | /prima-nota/movimenti | Differenze server/client per Radix UI (Popover, Select) |
| R5 | Missing `key` prop in lista | /staff/vincoli-relazionali | Componente `RelationshipConstraintEditor` |

### BASSO (P3)

| # | Errore | URL | Dettaglio |
|---|--------|-----|-----------|
| R6 | `UNSAFE_componentWillReceiveProps` | /api-docs | Warning da libreria Swagger UI (terze parti) |

---

## 2. Errori ESLint (26 errori)

### react-hooks/static-components (2 errori)

| File | Linea | Problema |
|------|-------|----------|
| `src/app/(dashboard)/fatture/page.tsx` | 19, 65, 123 | `EmptyState` definito come componente dentro il render. Deve essere estratto fuori dal componente. |

### react-hooks/purity (1 errore)

| File | Linea | Problema |
|------|-------|----------|
| `src/app/(dashboard)/scadenzario/page.tsx` | 207 | `Date.now()` chiamato durante il render. Funzione impura. |

### react-hooks/set-state-in-effect (1 errore)

| File | Linea | Problema |
|------|-------|----------|
| `src/components/layout/sidebar.tsx` | 183 | `setActiveItem()` chiamato direttamente dentro `useEffect`. Causa cascading renders. |

### @typescript-eslint/no-explicit-any (17 errori)

| File | Linea |
|------|-------|
| `src/app/api/cashflow/alerts/bulk/route.ts` | 75 |
| `src/app/api/cashflow/forecasts/[id]/lines/[lineId]/route.ts` | 33 |
| `src/app/api/cashflow/forecasts/[id]/route.ts` | 124 |
| `src/app/api/cashflow/forecasts/[id]/summary/route.ts` | 103, 104 |
| `src/app/api/cashflow/forecasts/route.ts` | 30 |
| `src/app/api/categorization-rules/[id]/route.ts` | 77 |
| `src/app/api/categorization-rules/route.ts` | 26 |
| `src/app/api/categorization-rules/test/route.ts` | 67 |
| `src/app/api/pagamenti/route.ts` | 28 |
| `src/app/api/payments/[id]/route.ts` | 84 |
| `src/app/api/payments/route.ts` | 32 |
| `src/app/api/regole-categorizzazione/route.ts` | 18 |
| `src/app/api/scadenzario/[id]/pagamenti/route.ts` | 106 |
| `src/app/api/scadenzario/[id]/route.ts` | 139 |
| `src/components/prima-nota/pagamenti/PagamentoRowActions.tsx` | 38 |

### react/no-unescaped-entities (3 errori)

| File | Linea | Carattere |
|------|-------|-----------|
| `src/app/(dashboard)/anagrafiche/clienti/page.tsx` | 130 | `'` → `&apos;` |
| `src/components/prima-nota/regole/RegolaFormDialog.tsx` | 359 | `"` → `&quot;` (x2) |
| `src/components/settings/BulkDeleteSuppliersDialog.tsx` | 194 | `'` → `&apos;` |

### prefer-const (2 errori)

| File | Linea |
|------|-------|
| `src/app/api/scadenzario/[id]/route.ts` | 139 |
| `src/app/api/scadenzario/[id]/stato/route.ts` | 44 |

---

## 3. Warning ESLint Significativi (132 warning)

### @typescript-eslint/no-unused-vars (120+ warning)

Import e variabili non utilizzate in ~35 file. I piu notevoli:

| File | Variabili non usate |
|------|---------------------|
| `src/components/layout/sidebar.tsx` | Calculator, ChevronLeft/Right/Down, Calendar, Palmtree, Package, ClipboardCheck, Truck, Building2, UserPlus, Button (12 import!) |
| `src/app/(dashboard)/fatture/layout.tsx` | FileText, Receipt, Users, Lock, Plus, Button (6 import) |
| `src/app/(dashboard)/fatture/page.tsx` | RechartsTooltip, cn, TrendingUp, TrendingDown (4 import) |
| `src/components/prima-nota/pagamenti/PagamentoFormDialog.tsx` | CalendarIcon, Label, FormControl, PAYMENT_STATUS_COLORS/LABELS, PaymentStatus, cn + 6x field (13!) |
| `src/components/prima-nota/shared/FiltersToolbar.tsx` | Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue (6 import) |

### react-hooks/incompatible-library (4 warning)

React Hook Form `watch()` incompatibile con React Compiler:
- `src/components/portal/LeaveRequestForm.tsx:235`
- `src/components/prima-nota/movimenti/MovimentoFormDialog.tsx:105`
- `src/components/prima-nota/pagamenti/PagamentoFormDialog.tsx:285`
- `src/components/prima-nota/regole/RegolaFormDialog.tsx:101`

---

## 4. Analisi Statica — Pattern Problematici

### 4a. File Tipi Duplicati

| File 1 (usato) | File 2 (morto) | Tipi duplicati |
|-----------------|----------------|----------------|
| `src/types/payments.ts` | `src/types/payment.ts` | Payment, PaymentType, PaymentStatus, labels, colors |
| `src/types/cashflow.ts` | `src/types/cash-flow.ts` | CashFlowForecast, CashFlowForecastLine, CashFlowAlert, enums |
| `src/types/categorization.ts` | `src/types/categorization-rule.ts` | CategorizationRule, RuleDirection, labels |

### 4b. `formatCurrency` definita in 4 posti

| File | Usata da |
|------|----------|
| `src/lib/constants.ts:58` | 26 file (principale) |
| `src/lib/utils.ts:8` | 2 file (scadenzario) |
| `src/lib/invoice-utils.ts:114` | 0 file |
| `src/lib/pdf/PrimaNotaPdfTemplate.tsx:171` | Solo interna |

### 4c. API Routes Duplicate

| Gruppo | Route 1 | Route 2 | Route 3 |
|--------|---------|---------|---------|
| Pagamenti | `/api/pagamenti/` | `/api/payments/` | — |
| Categorizzazione | `/api/categorizzazione/` | `/api/categorization-rules/` | `/api/regole-categorizzazione/` |

### 4d. Handler Stub (console.log)

| File | N. handler stub |
|------|----------------|
| `src/app/(dashboard)/prima-nota/pagamenti/PagamentiClient.tsx` | 7 (onEdit, onDelete, onApprove, onDispose, onComplete, onFail, onAnnulla) |
| `src/app/(dashboard)/prima-nota/movimenti/MovimentiClient.tsx` | 6 (onEdit, onDelete, onVerify, onHide, onCategorize, onSave) |

### 4e. console.error invece di logger

44 occorrenze di `console.error` in file di produzione dove dovrebbe essere usato `src/lib/logger.ts`. Prevalentemente in catch block di API routes.

---

## 5. Pagine Testate (55/57)

| Stato | Conteggio | Pagine |
|-------|-----------|--------|
| OK | 47 | Tutte le pagine dashboard (con solo errore globale R2), tutte le pagine portale |
| Errori specifici | 6 | /anagrafiche/clienti, /prima-nota/movimenti, /staff/vincoli-relazionali, /scadenzario, /chiusura-cassa/[id], /api-docs |
| Non testate | 2 | — |
