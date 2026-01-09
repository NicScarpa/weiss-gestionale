# Fix: Generazione Turni - Rispetto Vincoli

## Problema Segnalato

La generazione automatica dei turni non rispettava:
1. Il fabbisogno staff impostato (es: Lunedì mattina = 0, ma assegnate 4 persone)
2. Le preferenze turno dei dipendenti (Vanessa è del mattino ma messa la sera)
3. I giorni di disponibilità dei dipendenti extra

## Bug Identificati

### BUG 1: MISMATCH TIMEZONE (CRITICO)

**Problema**: Le chiavi per `staffingRequirements` non corrispondevano tra frontend e backend.

| Componente | Formato Data | Timezone |
|------------|--------------|----------|
| Frontend (`StaffingConfiguration.tsx`) | `format(date, 'yyyy-MM-dd')` | **Locale (Italia)** |
| Backend (`greedy-solver.ts`) | `date.toISOString().split('T')[0]` | **UTC** |

**Esempio del bug**:
- Utente in Italia imposta fabbisogno per `2026-01-12_shiftId`
- Backend genera chiave `2026-01-11_shiftId` (UTC è -1 ora)
- **Chiavi diverse → Override ignorato → Usa default del turno**

### BUG 2: ALGORITMO RIEMPIE FINO A maxStaff

**Problema**: L'algoritmo assegnava sempre fino a `maxStaff` (minStaff + 2), non al numero esatto richiesto.

```typescript
// PRIMA
const maxStaff = shift.maxStaff || minStaff + 2
if (assigned >= maxStaff) break  // Si fermava a maxStaff, non minStaff
```

**Conseguenza**: Se l'utente impostava 2 persone, ne venivano assegnate 4.

### BUG 3: Campo `defaultShift` NON UTILIZZATO

Il campo `defaultShift` (MORNING/EVENING) nel profilo utente non veniva:
- Caricato nella query
- Mappato negli oggetti Employee
- Controllato nei vincoli

**Conseguenza**: Vanessa con `defaultShift=MORNING` veniva assegnata al turno SERA.

### BUG 4: Campo `availableDays` NON UTILIZZATO

Il campo `availableDays` (array di giorni 0-6) non veniva usato.

**Conseguenza**: Dipendenti extra venivano assegnati anche nei giorni non disponibili.

### BUG 5: Ferie/Permessi NON CONTROLLATI

Le `LeaveRequest` approvate non venivano verificate durante la generazione.

**Conseguenza**: Un dipendente in ferie poteva essere assegnato a un turno.

## Implementazione Fix

### FASE 1: Aggiornamento Types (`types.ts`)

Aggiunti campi a `Employee`:
```typescript
defaultShift: 'MORNING' | 'EVENING' | null
availableDays: number[]  // 0=LUN, 1=MAR, ..., 6=DOM
```

Aggiunta interfaccia `LeaveRequest`:
```typescript
export interface LeaveRequest {
  id: string
  userId: string
  startDate: Date
  endDate: Date
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
}
```

### FASE 2: Caricamento Dati (`index.ts`)

- Aggiunti `defaultShift` e `availableDays` alla query utenti
- Caricamento `LeaveRequest` approvate per il periodo
- Passaggio dati all'algoritmo

### FASE 3: Fix Timezone (`greedy-solver.ts`)

```typescript
// PRIMA (UTC)
const dateKey = date.toISOString().split('T')[0]

// DOPO (Locale)
function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
```

### FASE 4: Fix Logica targetStaff (`greedy-solver.ts`)

```typescript
// PRIMA
const minStaff = overrideMinStaff !== undefined ? overrideMinStaff : shift.minStaff
const maxStaff = shift.maxStaff || minStaff + 2
if (assigned >= maxStaff) break

// DOPO
const targetStaff = overrideStaff !== undefined ? overrideStaff : shift.minStaff
if (assigned >= targetStaff) break
```

### FASE 5: Controlli Vincoli (`constraints.ts`)

Aggiunti in `canEmployeeWorkShift()`:

1. **Controllo LeaveRequest**:
```typescript
if (leave.userId === employee.id && leave.status === 'APPROVED') {
  if (date >= leave.startDate && date <= leave.endDate) {
    return { canWork: false, reason: 'In ferie/permesso' }
  }
}
```

2. **Controllo defaultShift**:
```typescript
if (employee.defaultShift === 'MORNING' && isEveningShift) {
  return { canWork: false, reason: 'Turno preferito: mattina' }
}
```

3. **Controllo availableDays**:
```typescript
if (!employee.isFixedStaff && employee.availableDays.length > 0) {
  if (!employee.availableDays.includes(ourDayIndex)) {
    return { canWork: false, reason: 'Non disponibile questo giorno' }
  }
}
```

## File Modificati

| File | Modifica |
|------|----------|
| `src/lib/shift-generation/types.ts` | +`defaultShift`, +`availableDays`, +`LeaveRequest` |
| `src/lib/shift-generation/index.ts` | Caricamento campi aggiuntivi e ferie |
| `src/lib/shift-generation/greedy-solver.ts` | Fix timezone + fix logica targetStaff |
| `src/lib/shift-generation/constraints.ts` | Controlli defaultShift, availableDays, ferie |

## Test da Eseguire

1. **Test Fabbisogno**: Impostare Lunedì mattina = 0 → Verificare 0 assegnazioni
2. **Test Fabbisogno Esatto**: Impostare 2 → Verificare esattamente 2 assegnazioni
3. **Test defaultShift**: Dipendente MORNING → Non assegnato a turno Sera
4. **Test availableDays**: Extra disponibile LUN-MER → Non assegnato GIO-DOM
5. **Test Ferie**: Dipendente in ferie 12-14 Gen → Non assegnato quei giorni

## Compatibilità

- **Database**: Nessuna migrazione necessaria (campi già esistenti)
- **API**: Nessun breaking change
- **Frontend**: Nessuna modifica necessaria

## Data Implementazione

**Data**: 2026-01-09
