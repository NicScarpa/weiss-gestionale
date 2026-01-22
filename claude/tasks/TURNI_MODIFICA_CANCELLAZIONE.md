# Piano: Modifica e Cancellazione Turni su Pianificazioni Pubblicate

## Problema Identificato

La funzionalità di modifica e cancellazione dei turni è **già implementata** nel codice:
- API `PUT /api/assignments/[id]` per aggiornare
- API `DELETE /api/assignments/[id]` per eliminare
- `AssignmentDialog` con mutations per update/delete
- `ShiftCalendar` con handler `onAssignmentClick`

**Ma** le pianificazioni pubblicate bloccano queste operazioni:
1. L'API DELETE restituisce errore 400 per pianificazioni pubblicate (linea 321-325)
2. L'API PUT permette modifiche solo ad admin per pianificazioni pubblicate (linea 163-171)
3. Il frontend passa `isReadOnly={schedule.status === 'PUBLISHED'}` (linea 388)

## Soluzione Proposta

Permettere la modifica e cancellazione dei turni anche su pianificazioni pubblicate per admin e manager.

## Step di Implementazione

### 1. Modificare API DELETE `/api/assignments/[id]`
**File**: `src/app/api/assignments/[id]/route.ts`

Rimuovere/modificare il blocco che impedisce l'eliminazione su pianificazioni pubblicate:
```typescript
// PRIMA (linea 320-325)
if (assignment.schedule.status === 'PUBLISHED') {
  return NextResponse.json(
    { error: 'Non puoi eliminare assegnazioni da una pianificazione pubblicata' },
    { status: 400 }
  )
}

// DOPO - Permettere sempre (o solo per admin/manager)
// Rimuovere questo controllo
```

### 2. Modificare API PUT `/api/assignments/[id]`
**File**: `src/app/api/assignments/[id]/route.ts`

Rimuovere la restrizione che limita le modifiche solo ad admin:
```typescript
// PRIMA (linea 162-171)
if (
  assignment.schedule.status === 'PUBLISHED' &&
  session.user.role !== 'admin'
) {
  return NextResponse.json(...)
}

// DOPO - Permettere a admin e manager
// Rimuovere questo controllo (admin e manager sono già verificati sopra)
```

### 3. Aggiornare Frontend pagina turni
**File**: `src/app/(dashboard)/turni/[id]/page.tsx`

Rimuovere `isReadOnly` dal dialog:
```typescript
// PRIMA (linea 388)
isReadOnly={schedule.status === 'PUBLISHED'}

// DOPO
isReadOnly={false}
// oppure rimuovere completamente la prop
```

### 4. Aggiornare messaggio descrizione calendario
**File**: `src/app/(dashboard)/turni/[id]/page.tsx`

Aggiornare il messaggio per indicare che i turni sono sempre modificabili:
```typescript
// PRIMA (linea 334-336)
{schedule.status === 'PUBLISHED'
  ? 'Visualizza i turni assegnati'
  : 'Clicca sulle celle per aggiungere o modificare turni'}

// DOPO
'Clicca sulle celle per aggiungere o modificare turni'
```

## Ragionamento

1. **Flessibilità operativa**: I manager devono poter correggere errori o gestire cambiamenti last-minute anche dopo la pubblicazione
2. **Sicurezza mantenuta**: Solo admin e manager possono modificare (staff non ha accesso)
3. **Impatto minimo**: Modifica di poche righe di codice senza cambiare l'architettura

## Task Checklist

- [x] Modificare API DELETE per permettere eliminazione su pubblicati
- [x] Modificare API PUT per permettere modifiche a manager su pubblicati
- [x] Modificare API POST per permettere aggiunta turni su pubblicati
- [x] Rimuovere isReadOnly dal frontend
- [x] Aggiornare messaggio descrizione calendario
- [x] Rimuovere blocco onSlotClick per pianificazioni pubblicate
- [ ] Testare in produzione

## Note

Le modifiche mantengono la logica di autorizzazione esistente (solo admin/manager), rimuovendo solo la restrizione sullo stato "PUBLISHED".

## Implementazione Completata

**Commit**: `d9888a8` - feat: Permetti modifica e cancellazione turni su pianificazioni pubblicate

**File modificati**:
1. `src/app/api/assignments/[id]/route.ts` - Rimossi blocchi PUT e DELETE per PUBLISHED
2. `src/app/api/schedules/[id]/assignments/route.ts` - Rimosso blocco POST per PUBLISHED
3. `src/app/(dashboard)/turni/[id]/page.tsx` - Rimosso isReadOnly e blocco onSlotClick

**Data**: 2026-01-09

## Fix Bug: Skills Undefined

**Problema**: Cliccando su un turno assegnato, la pagina crashava con errore:
`TypeError: Cannot read properties of undefined (reading 'length')`

**Causa**: Il campo `skills` su alcuni staff members era `undefined` invece di un array vuoto.

**Fix commit 1** (`2890bca`): `selectedStaff?.skills?.length > 0` - Non funzionava perché TypeScript non permetteva il confronto `undefined > 0`

**Fix commit 2** (`114fb56`): `selectedStaff?.skills && selectedStaff.skills.length > 0` - Corretto, prima verifica che skills esista, poi controlla la lunghezza

**File**: `src/components/shifts/AssignmentDialog.tsx` linea 324

## Eliminazione Pianificazione dalla Lista

**Richiesta**: Aggiungere possibilità di eliminare un'intera pianificazione dalla pagina `/turni`

**Commit**: `a0e8e4b` - feat: Aggiungi eliminazione pianificazione turni dalla lista

**Implementazione**:
1. `src/app/(dashboard)/turni/page.tsx`:
   - Aggiunto pulsante elimina (icona cestino rosso) in ogni riga della tabella
   - Aggiunto AlertDialog per conferma eliminazione
   - Messaggi differenziati in base allo stato:
     - PUBLISHED: "verrà archiviata" (i turni rimangono)
     - Altri stati: "verrà eliminata con tutti i turni"
   - Aggiunta mutation `deleteMutation` con toast feedback

2. `src/app/api/schedules/[id]/route.ts`:
   - Esteso permesso DELETE da solo admin a admin+manager

**Comportamento API DELETE**:
- Se stato = PUBLISHED → archivia (imposta status = ARCHIVED)
- Se stato != PUBLISHED → elimina pianificazione e tutti i turni associati

**Data**: 2026-01-09

## Fix Persistenza Fabbisogno Staff

**Problema**: Il fabbisogno staff configurato si perdeva al refresh della pagina.

**Causa Root**: La colonna `staffing_requirements` era definita nello schema Prisma ma **non esisteva nel database**. La risposta API restituiva `staffingRequirements: undefined` invece di `null` o il valore salvato.

**Diagnosi con Playwright**:
1. Console log mostrava `staffingRequirements: undefined` al caricamento
2. API GET non includeva il campo nella risposta JSON
3. API PUT falliva con `Unknown argument staffingRequirements`

**Soluzione**:
1. `npx prisma db push` - sincronizza schema con database
2. `npx prisma generate` - rigenera client Prisma
3. Riavvio server Next.js per usare il nuovo client

**Commit**: `e119ba0` - fix: Risolve persistenza fabbisogno staff

**Data**: 2026-01-10
