# Fix Commit Blockers - Piano di Risoluzione

## Stato: COMPLETATO

Tutti gli errori bloccanti sono stati risolti con successo.
- `npx eslint . --quiet` → 0 errori
- `npx tsc --noEmit` → 0 errori

### Riepilogo esecuzione
- **6 subagenti** eseguiti in parallelo (4 iniziali + 2 aggiuntivi per errori residui)
- **Totale file modificati**: ~25
- **Errori risolti**: 18 ESLint + 3 TypeScript (extra) + 53 originali = tutti

Le 192 warning ESLint NON bloccano il commit (solo gli errori causano exit code != 0).

---

## Strategia: 4 Gruppi Paralleli

I fix sono organizzati in 4 gruppi indipendenti che possono essere eseguiti in parallelo da subagenti separati, dato che operano su file diversi senza dipendenze incrociate.

---

### GRUPPO A - Fix Lib/Hooks (`no-explicit-any`)
**8 errori ESLint** in 6 file

| File | Errore | Fix previsto |
|------|--------|-------------|
| `src/hooks/useOffline.ts` | 2x `@typescript-eslint/no-explicit-any` | Tipizzare con tipi specifici dal contesto |
| `src/lib/api-utils.ts` | 1x `@typescript-eslint/no-explicit-any` | Usare `unknown` o tipo specifico |
| `src/lib/attendance/payroll-calculator.ts` | 1x `@typescript-eslint/no-explicit-any` | Tipizzare con tipo Prisma appropriato |
| `src/lib/calculations.ts` | 2x `@typescript-eslint/no-explicit-any` | Tipizzare parametri con tipi dominio |
| `src/lib/closure-journal-entries.ts` | 1x `@typescript-eslint/no-explicit-any` | Usare tipo Prisma/dominio |
| `src/lib/offline/sync.ts` | 1x `@typescript-eslint/no-explicit-any` | Tipizzare con tipo sync appropriato |

---

### GRUPPO B - Fix API Routes (TypeScript + ESLint)
**~15 errori** in 5 file

| File | Errore | Fix previsto |
|------|--------|-------------|
| `src/app/api/budget/confronto/route.ts` | Decimal vs number mismatch | Convertire Decimal con `.toNumber()` |
| `src/app/api/budget/route.ts` | Prisma `BudgetLineCreateWithoutBudgetInput` manca `account` + StringFilter null | Aggiungere campo account + usare `undefined` al posto di `null` |
| `src/app/api/budget/alerts/route.ts` | StringFilter null | Sostituire `null` con `undefined` |
| `src/app/api/invoices/route.ts` | 3x InputJsonValue casting con Array | Cast esplicito `as Prisma.InputJsonValue` |
| `src/app/api/prima-nota/export/route.ts` | 2x StringFilter null | Sostituire `null` con `undefined` |

---

### GRUPPO C - Fix Componenti/UI
**~5 errori** in 4 file

| File | Errore | Fix previsto |
|------|--------|-------------|
| `src/components/ui/command.tsx:25` | Empty interface extends supertype (`no-empty-object-type`) | Sostituire con type alias |
| `src/components/portal/PunchButton.tsx` | `ServiceWorkerRegistrationWithSync` manca `getTags()` | Estendere interface correttamente |
| `src/lib/geolocation/index.ts:147` | `setState` sincrono in useEffect (`set-state-in-effect`) | Ristrutturare per evitare setState sincrono |
| `src/lib/notifications/fcm.ts` | Firebase Messaging type incompatibility | Aggiustare tipo con cast o generic corretto |

---

### GRUPPO D - Fix Dashboard/Pagine + Lib budget
**~6 errori** in 2 file

| File | Errore | Fix previsto |
|------|--------|-------------|
| `src/app/(dashboard)/chiusura-cassa/[id]/page.tsx` | 2x Decimal vs number (closure difference) | Convertire Decimal con `.toNumber()` prima di passare |
| `src/lib/budget/category-aggregator.ts` | Decimal vs number mismatch | Convertire con `.toNumber()` nei calcoli |

---

## Ordine di Esecuzione

```
Parallelo:
  ├── Subagente 1 → GRUPPO A (lib/hooks - 6 file)
  ├── Subagente 2 → GRUPPO B (API routes - 5 file)
  ├── Subagente 3 → GRUPPO C (componenti/UI - 4 file)
  └── Subagente 4 → GRUPPO D (dashboard + budget lib - 2 file)
```

Tutti i gruppi sono **indipendenti** - nessun file compare in piu di un gruppo.

## Verifica Finale

Dopo il completamento di tutti i gruppi:
1. Eseguire `npx eslint .` e verificare 0 errori
2. Eseguire `npx tsc --noEmit` e verificare 0 errori
3. Tentare un commit di test per verificare che il pre-commit hook passi

## Note

- Le 192 **warning** ESLint (unused vars, exhaustive-deps, alt-text) NON bloccano il commit e possono essere risolte in un secondo momento
- I fix devono essere minimali e mirati: sostituire `any` con tipi appropriati, non refactoring aggressivi
- Per i tipi Prisma Decimal: usare `.toNumber()` dove serve un `number`
- Per StringFilter: sostituire `null` con `undefined` nei filtri Prisma opzionali
