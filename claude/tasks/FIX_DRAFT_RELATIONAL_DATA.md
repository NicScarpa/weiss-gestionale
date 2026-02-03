# Fix: Salvataggio dati relazionali nelle bozze di chiusura cassa

## Stato: COMPLETATO

## Problema

Quando si modifica una chiusura salvata in bozza, solo i metadati venivano aggiornati. I dati relazionali erano silenziosamente ignorati:
- Postazioni cassa (con conteggi banconote/monete)
- Parziali orari
- Uscite
- Presenze

## Modifiche implementate

### Step 1: Utilita condivisa per calcoli stazione
**Nuovo file**: `src/lib/closure-calculations.ts`
- `calculateTotalCounted(cashCount)` - somma pesata banconote/monete
- `buildStationCreateData(station, index)` - prepara dati Prisma per stazione con campi calcolati

### Step 2: PUT endpoint espanso
**File**: `src/app/api/chiusure/[id]/route.ts`
- Schema Zod espanso con stations, partials, expenses, attendance (tutti opzionali)
- PUT handler riscritto con `prisma.$transaction()` - pattern delete + recreate per relazioni
- Import di `buildStationCreateData` dalla utilita condivisa

### Step 3: Mutation hook aggiornato
**File**: `src/hooks/useClosureMutation.ts`
- `updateClosure()` ora usa `buildClosurePayload(data, venueId)` invece di `buildClosureUpdatePayload(data)`
- Rimosso import di `buildClosureUpdatePayload`
- Aggiunto `venueId` alle dipendenze del `useCallback`

### Step 4: Pulizia
- `src/lib/closure-form-utils.ts`: rimossa funzione `buildClosureUpdatePayload()`
- `src/app/api/chiusure/route.ts`: POST handler usa `buildStationCreateData` dalla utilita condivisa
- `src/lib/__tests__/closure-form-utils.test.ts`: rimossi test per `buildClosureUpdatePayload`, 18 test rimasti passano

## Verifica
- TypeScript: 0 errori (`tsc --noEmit`)
- Test: 18/18 passati
