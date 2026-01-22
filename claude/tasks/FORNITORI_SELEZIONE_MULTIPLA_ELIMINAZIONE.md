# Piano: Selezione Multipla e Eliminazione Fornitori

## Problema Identificato

### 1. Bug "Mostra inattivi"
**File**: `src/app/api/suppliers/route.ts` (righe 36-39)

Logica attuale:
```typescript
if (!includeInactive) {
  where.isActive = true
}
```

Quando `includeInactive=true`, il filtro `isActive` non viene applicato, quindi mostra TUTTI i fornitori (attivi + inattivi). L'utente si aspetta di vedere SOLO gli inattivi.

### 2. Mancanza selezione multipla
Il componente `SupplierManagement.tsx` non ha checkbox per selezionare più fornitori.

### 3. Mancanza eliminazione bulk
- Non esiste API per eliminazione multipla
- Non esiste dialog per confermare eliminazione multipla

---

## Piano di Implementazione

### Task 1: Correggere bug "Mostra inattivi"
**File**: `src/app/api/suppliers/route.ts`

Cambiare la logica del filtro:
- Default (showInactive=false): mostra SOLO fornitori attivi (`isActive: true`)
- showInactive=true: mostra SOLO fornitori inattivi (`isActive: false`)

Rinominare il parametro da `includeInactive` a `showOnlyInactive` per chiarezza.

### Task 2: Aggiungere selezione multipla nel componente
**File**: `src/components/settings/SupplierManagement.tsx`

- Aggiungere stato `selectedSuppliers: Set<string>` per tracciare ID selezionati
- Aggiungere checkbox "Seleziona tutti" nell'header della lista
- Aggiungere checkbox per ogni riga fornitore
- Mostrare barra azioni quando ci sono elementi selezionati (count + pulsante elimina)

### Task 3: Aggiungere API eliminazione multipla
**File**: `src/app/api/suppliers/route.ts`

Modificare il metodo DELETE per accettare:
- Singolo ID (comportamento esistente): `?id=xxx`
- Lista di ID nel body: `{ ids: ['id1', 'id2', ...] }`

### Task 4: Creare dialog eliminazione multipla
**File**: `src/components/settings/BulkDeleteSuppliersDialog.tsx` (nuovo)

Dialog con:
- Step 1: Conferma con lista fornitori da eliminare
- Step 2: Inserimento password per conferma
- Mostrare riepilogo (es. "Stai per eliminare 5 fornitori")

### Task 5: Integrare il dialog nel componente principale
**File**: `src/components/settings/SupplierManagement.tsx`

- Importare il nuovo dialog
- Gestire apertura dialog quando si clicca "Elimina selezionati"
- Resettare selezione dopo eliminazione completata

---

## Dettagli Tecnici

### Modifica API (Task 3)

```typescript
// DELETE /api/suppliers - Supporta singolo ID o bulk
export async function DELETE(request: NextRequest) {
  // ...auth checks...

  const { searchParams } = new URL(request.url)
  const singleId = searchParams.get('id')

  let ids: string[] = []

  if (singleId) {
    ids = [singleId]
  } else {
    const body = await request.json()
    ids = body.ids || []
  }

  if (ids.length === 0) {
    return NextResponse.json({ error: 'ID fornitore obbligatorio' }, { status: 400 })
  }

  // Soft delete multiplo
  const result = await prisma.supplier.updateMany({
    where: { id: { in: ids } },
    data: { isActive: false }
  })

  return NextResponse.json({
    message: `${result.count} fornitor${result.count === 1 ? 'e' : 'i'} disattivat${result.count === 1 ? 'o' : 'i'}`
  })
}
```

### Componente Selezione (Task 2)

Stato aggiuntivo:
```typescript
const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set())
const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false)
```

Funzioni helper:
```typescript
const toggleSelectAll = () => {
  if (selectedSuppliers.size === filteredSuppliers.length) {
    setSelectedSuppliers(new Set())
  } else {
    setSelectedSuppliers(new Set(filteredSuppliers.map(s => s.id)))
  }
}

const toggleSelect = (id: string) => {
  const newSet = new Set(selectedSuppliers)
  if (newSet.has(id)) {
    newSet.delete(id)
  } else {
    newSet.add(id)
  }
  setSelectedSuppliers(newSet)
}
```

---

## Ordine di Esecuzione

1. **Task 1** - Fix bug filtro (5 min)
2. **Task 3** - API bulk delete (10 min)
3. **Task 4** - Dialog eliminazione multipla (15 min)
4. **Task 2 + 5** - UI selezione multipla + integrazione (20 min)

---

## File Modificati

- `src/app/api/suppliers/route.ts` - Task 1, 3
- `src/components/settings/SupplierManagement.tsx` - Task 2, 5
- `src/components/settings/BulkDeleteSuppliersDialog.tsx` - Task 4 (nuovo)

---

## Stato Avanzamento

- [x] Task 1: Correggere bug "Mostra inattivi"
- [x] Task 2: Aggiungere selezione multipla
- [x] Task 3: API eliminazione multipla
- [x] Task 4: Dialog eliminazione multipla
- [x] Task 5: Integrazione componenti

---

## Modifiche Effettuate (2026-01-21)

### Task 1: Fix bug filtro "Mostra inattivi"
**File**: `src/app/api/suppliers/route.ts`

Aggiunto nuovo parametro `showOnlyInactive`:
- `showOnlyInactive=true`: filtra per `isActive: false` (mostra SOLO inattivi)
- `includeInactive=true`: mostra TUTTI (compatibilità retroattiva)
- Default: mostra SOLO attivi (`isActive: true`)

**File**: `src/components/settings/SupplierManagement.tsx`
Cambiato parametro API da `includeInactive` a `showOnlyInactive`.

### Task 2-5: Selezione multipla e eliminazione bulk

**Nuovo file**: `src/components/settings/BulkDeleteSuppliersDialog.tsx`
Dialog per eliminazione multipla con:
- Step 1: Conferma con lista fornitori
- Step 2: Verifica password
- ScrollArea per liste lunghe

**API modificata**: `src/app/api/suppliers/route.ts` (DELETE)
Supporta ora:
- Singolo ID via query param: `?id=xxx`
- Multipli ID via body: `{ ids: [...] }`
- Usa `updateMany` per soft delete multiplo

**Componente modificato**: `src/components/settings/SupplierManagement.tsx`
- Nuovo stato `selectedSuppliers: Set<string>`
- Checkbox su ogni riga fornitore
- Checkbox "Seleziona tutti" nell'header
- Barra azioni con conteggio e pulsante "Elimina selezionati"
- Integrazione con `BulkDeleteSuppliersDialog`

---

## Note

- L'eliminazione è sempre soft delete (disattivazione) per mantenere lo storico
- La password viene richiesta per confermare eliminazioni bulk come misura di sicurezza
- Il conteggio fornitori nell'header si aggiorna dinamicamente
