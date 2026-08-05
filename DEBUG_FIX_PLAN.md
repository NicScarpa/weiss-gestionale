# PIANO DI FIX — Weiss Gestionale

**Data**: 2026-02-14
**Basato su**: DEBUG_REPORT.md

---

## Riepilogo Fix per Round

| Round | Categoria | N. Fix | Severita |
|-------|-----------|--------|----------|
| 1 | API Routes (errori 400/500) | 3 | CRITICO/ALTO |
| 2 | Errori ESLint critici (React) | 4 | ALTO |
| 3 | Hydration + key prop | 2 | MEDIO |
| 4 | ESLint `any` type + `prefer-const` | 19 | MEDIO |
| 5 | Unescaped entities in JSX | 3 | BASSO |
| 6 | Unused imports/vars cleanup | ~35 file | BASSO |
| 7 | File duplicati + formatCurrency | 4 | BASSO |

**Totale stimato: ~65 fix in ~50 file**

---

## Round 1 — API Routes (CRITICO/ALTO)

Fix degli endpoint che causano errori runtime visibili agli utenti.

### Fix 1.1 — `/api/customers` restituisce 500 (R1)
- **File**: `src/app/api/customers/route.ts`
- **Problema**: Server error quando chiamato con `?full=true`
- **Azione**: Leggere il file, identificare l'errore (probabile query Prisma malformata o campo mancante), fixare
- **Verifica**: Navigare a /anagrafiche/clienti, verificare che la tabella carichi

### Fix 1.2 — `/api/scadenzario/summary` restituisce 400 (R2)
- **File**: `src/app/api/scadenzario/summary/route.ts`
- **Problema**: 400 Bad Request su TUTTE le pagine dashboard. Chiamato dal layout condiviso senza parametri obbligatori.
- **Azione**: Leggere file + identificare quale componente layout lo chiama. Rendere i parametri opzionali o fornire default.
- **Verifica**: Navigare a qualsiasi pagina dashboard, verificare 0 errori 400

### Fix 1.3 — `/api/scadenzario` restituisce 400 (R3)
- **File**: `src/app/api/scadenzario/route.ts`
- **Problema**: 400 con parametri `page=1&sortBy=dataScadenza&sortOrder=asc`
- **Azione**: Leggere file, identificare validazione troppo stretta o parametro mancante
- **Verifica**: Navigare a /scadenzario, verificare che carichi dati

**Dopo Round 1**: `npx tsc --noEmit` + test browser pagine interessate

---

## Round 2 — Errori ESLint Critici (React)

Errori che possono causare comportamenti anomali a runtime.

### Fix 2.1 — Component created during render
- **File**: `src/app/(dashboard)/fatture/page.tsx` (linee 19-24, 65, 123)
- **Problema**: `EmptyState` definito dentro il corpo del componente
- **Azione**: Estrarre `EmptyState` fuori dal componente (prima della funzione o in file separato)

### Fix 2.2 — Impure function during render
- **File**: `src/app/(dashboard)/scadenzario/page.tsx` (linea 207)
- **Problema**: `Date.now()` chiamato durante render
- **Azione**: Sostituire `new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)` con variabile calcolata prima del render (e.g. `addDays(new Date(), 7)` da date-fns gia importato)

### Fix 2.3 — setState in useEffect
- **File**: `src/components/layout/sidebar.tsx` (linea 183)
- **Problema**: `setActiveItem(findActiveItem())` direttamente nel body dell'effect
- **Azione**: Usare `useMemo` o calcolare `activeItem` direttamente da `pathname` senza state

### Fix 2.4 — PagamentoRowActions `any`
- **File**: `src/components/prima-nota/pagamenti/PagamentoRowActions.tsx` (linea 38)
- **Problema**: `icon: any` nel Record type
- **Azione**: Sostituire `any` con `React.ComponentType<{ className?: string }>` o `LucideIcon`

**Dopo Round 2**: `npx tsc --noEmit` + `npx next lint` per verificare eliminazione errori

---

## Round 3 — Hydration + Key Prop

### Fix 3.1 — Hydration mismatch
- **File**: `src/app/(dashboard)/prima-nota/movimenti/MovimentiClient.tsx` (o componenti Radix UI usati)
- **Problema**: `aria-controls` mismatch server/client per Popover e Select
- **Azione**: Aggiungere `suppressHydrationWarning` dove appropriato O wrappare i componenti con client-side rendering condizionale

### Fix 3.2 — Missing key prop
- **File**: `src/components/staff/RelationshipConstraintEditor.tsx` (o simile in vincoli-relazionali)
- **Problema**: Lista senza prop `key`
- **Azione**: Aggiungere `key` univoca agli elementi della lista

**Dopo Round 3**: Test browser su /prima-nota/movimenti e /staff/vincoli-relazionali

---

## Round 4 — `any` Type + `prefer-const`

### Fix 4.1-4.15 — Sostituire `any` con tipi Prisma

Per ogni file, sostituire `const where: any = {}` con `Prisma.ModelNameWhereInput` e `const data: any = {}` con `Prisma.ModelNameUpdateInput`:

| # | File | Sostituzione |
|---|------|-------------|
| 4.1 | `src/app/api/cashflow/alerts/bulk/route.ts:75` | `Prisma.CashFlowAlertWhereInput` |
| 4.2 | `src/app/api/cashflow/forecasts/route.ts:30` | `Prisma.CashFlowForecastWhereInput` |
| 4.3 | `src/app/api/cashflow/forecasts/[id]/route.ts:124` | `Prisma.CashFlowForecastUpdateInput` |
| 4.4 | `src/app/api/cashflow/forecasts/[id]/lines/[lineId]/route.ts:33` | `Prisma.CashFlowForecastLineUpdateInput` |
| 4.5 | `src/app/api/cashflow/forecasts/[id]/summary/route.ts:103-104` | Tipo specifico per `groupByMonth` |
| 4.6 | `src/app/api/categorization-rules/route.ts:26` | `Prisma.CategorizationRuleWhereInput` |
| 4.7 | `src/app/api/categorization-rules/[id]/route.ts:77` | `Prisma.CategorizationRuleUpdateInput` |
| 4.8 | `src/app/api/categorization-rules/test/route.ts:67` | Tipo specifico per `calculateConfidence` |
| 4.9 | `src/app/api/pagamenti/route.ts:28` | `Prisma.PaymentWhereInput` |
| 4.10 | `src/app/api/payments/route.ts:32` | `Prisma.PaymentWhereInput` |
| 4.11 | `src/app/api/payments/[id]/route.ts:84` | `Prisma.PaymentUpdateInput` |
| 4.12 | `src/app/api/regole-categorizzazione/route.ts:18` | `Prisma.CategorizationRuleWhereInput` |
| 4.13 | `src/app/api/scadenzario/[id]/route.ts:139` | `Prisma.ScheduleUpdateInput` + `const` |
| 4.14 | `src/app/api/scadenzario/[id]/pagamenti/route.ts:106` | Cast corretto per `metodo` |

### Fix 4.15 — prefer-const
| File | Linea |
|------|-------|
| `src/app/api/scadenzario/[id]/route.ts` | 139: `let` → `const` |
| `src/app/api/scadenzario/[id]/stato/route.ts` | 44: `let` → `const` |

**Dopo Round 4**: `npx tsc --noEmit`

---

## Round 5 — Unescaped Entities

### Fix 5.1-5.3

| File | Linea | Fix |
|------|-------|-----|
| `src/app/(dashboard)/anagrafiche/clienti/page.tsx` | 130 | `'` → `&apos;` |
| `src/components/prima-nota/regole/RegolaFormDialog.tsx` | 359 | `"` → `&quot;` (x2) |
| `src/components/settings/BulkDeleteSuppliersDialog.tsx` | 194 | `'` → `&apos;` |

---

## Round 6 — Unused Imports/Vars Cleanup

Rimuovere import e variabili non utilizzate. I file principali (~35):

| File | N. import da rimuovere |
|------|----------------------|
| `src/components/layout/sidebar.tsx` | 12 |
| `src/components/prima-nota/pagamenti/PagamentoFormDialog.tsx` | 13 |
| `src/components/prima-nota/shared/FiltersToolbar.tsx` | 6 |
| `src/app/(dashboard)/fatture/layout.tsx` | 6 |
| `src/app/(dashboard)/fatture/page.tsx` | 4 |
| `src/components/prima-nota/regole/RegolaFormDialog.tsx` | 6 |
| `src/components/prima-nota/movimenti/MovimentiTable.tsx` | 4 |
| `src/components/prima-nota/movimenti/MovimentiFilters.tsx` | 5 |
| `src/components/prima-nota/pagamenti/PagamentiFilters.tsx` | 5 |
| `src/components/prima-nota/pagamenti/PagamentiTable.tsx` | 3 |
| `src/components/prima-nota/movimenti/MovimentoFormDialog.tsx` | 2 |
| `src/components/prima-nota/movimenti/MovimentoRowActions.tsx` | 2 |
| `src/components/prima-nota/regole/CategorizationRulesManager.tsx` | 4 |
| `src/components/prima-nota/pagamenti/PagamentoRowActions.tsx` | 2 |
| + ~20 file con 1-2 import ciascuno |

**Nota**: Usare `npx next lint --fix` per fixare automaticamente dove possibile (2 errori auto-fixabili).

---

## Round 7 — Duplicati e Cleanup (Opzionale)

### Fix 7.1 — Rimuovere file tipi morti

| File da rimuovere | Motivo |
|-------------------|--------|
| `src/types/payment.ts` | Duplicato di `payments.ts`, non importato da nessuno |
| `src/types/cash-flow.ts` | Duplicato di `cashflow.ts`, non importato da nessuno |
| `src/types/categorization-rule.ts` | Duplicato di `categorization.ts`, non importato da nessuno |

### Fix 7.2 — Consolidare `formatCurrency`

Rimuovere la definizione duplicata in `src/lib/utils.ts` e aggiornare i 2 file che la importano da li per importare da `src/lib/constants.ts`.

---

## Esclusi dal Piano (non sono errori da fixare)

| Elemento | Motivo |
|----------|--------|
| `console.log` in stub handlers | Sono placeholder per funzionalita non ancora implementata (feature, non bug) |
| `console.error` in catch blocks | Funzionale ma non ideale. Migrazione a `logger` e un refactoring separato |
| `react-hooks/incompatible-library` | Warning causato da incompatibilita React Compiler + React Hook Form `watch()`. Non fixabile senza cambiare libreria. |
| API routes duplicate (pagamenti/payments, etc.) | Richiedono analisi approfondita per determinare quale gruppo eliminare. E un refactoring, non un bugfix. |
| `UNSAFE_componentWillReceiveProps` in /api-docs | Warning da libreria Swagger UI di terze parti |

---

## Verifica Finale

Dopo tutti i round:
1. `npx tsc --noEmit` — zero errori
2. `npx next lint` — zero errori (solo warning accettabili)
3. `npm run build` — build pulita
4. Test browser su tutte le pagine con errori precedenti
5. Aggiornare `DEBUG_REPORT.md` con stato RISOLTO
