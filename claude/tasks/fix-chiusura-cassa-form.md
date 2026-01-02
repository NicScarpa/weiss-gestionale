# Task: Fix Chiusura Cassa Form

## Obiettivo
Correggere il form di chiusura cassa per allinearlo alla specifica `/Users/nicolascarpa/Downloads/Specifica_Form_Chiusura_Cassa.md`.

## Modifiche Implementate

### 1. Formula Quadratura Cassa (CRITICO)
**File**: `src/components/chiusura/ClosureForm.tsx`

**Prima**: `cashDifference = countedTotal - cashTotal`

**Dopo**:
```typescript
// Uscite pagate in contanti dalla cassa (isPaid=true E paidBy vuoto)
const cashExpensesTotal = formData.expenses
  .filter(e => e.isPaid && (!e.paidBy || e.paidBy.trim() === ''))
  .reduce((sum, e) => sum + (e.amount || 0), 0)

// QUADRATURA CASSA:
// CASSA ATTESA = Fondo cassa + Incassi contanti - Uscite pagate in contanti
const expectedCash = floatsTotal + cashTotal - cashExpensesTotal

// DIFFERENZA = Cassa contata - Cassa attesa
const cashDifference = countedTotal - expectedCash
```

### 2. Logica paidBy per Uscite
**File**: `src/components/chiusura/ClosureForm.tsx`

Le uscite con `paidBy` valorizzato (anticipate) NON impattano la quadratura cassa. Solo le uscite con `isPaid=true` E `paidBy` vuoto vengono sottratte dalla cassa attesa.

### 3. Postazioni Evento Condizionali
**File**: `prisma/schema.prisma`, `src/components/chiusura/ClosureForm.tsx`

Aggiunto campo `isEventOnly` a `CashStationTemplate`. Le postazioni marcate come "solo evento" vengono mostrate solo quando la checkbox "Evento speciale" è attiva.

### 4. Separazione Presenze Staff Fisso vs Extra
**File**: `src/components/chiusura/AttendanceSection.tsx`

Riscritto completamente per mostrare due sezioni separate:
- **Dipendenti Fissi**: con codici presenza (P, FE, R, Z, C)
- **Personale Extra/Occasionale**: con tariffa oraria, totale compenso e checkbox "Pagato"

### 5. Auto-calcolo IVA
**File**: `src/components/chiusura/CashStationCard.tsx`

Quando viene inserito il corrispettivo (scontrini/fatture), l'IVA viene calcolata automaticamente:
```typescript
IVA = corrispettivo - (corrispettivo / (1 + aliquota))
// Per IVA 10%: IVA = corrispettivo * 0.0909...
```

I campi IVA mostrano "(auto)" e hanno sfondo grigio per indicare che sono calcolati.

### 6. Calcolo "Non Battuto"
**File**: `src/components/chiusura/CashStationCard.tsx`

Aggiunto calcolo e visualizzazione del "non battuto":
```
NON BATTUTO = Totale Postazione - Corrispettivo Scontrini
```
Rappresenta incassi (fatture, sospesi, etc.) non registrati nei corrispettivi.

### 7. Auto-generazione Uscite per Extra Pagati
**File**: `src/components/chiusura/ClosureForm.tsx`

Quando un membro dello staff extra viene marcato come "Pagato", viene automaticamente generata un'uscita con:
- Payee: `[EXTRA] Nome Collaboratore`
- Descrizione: `Compenso mattina/sera - Xh x €Y/h`
- Tipo documento: PERSONALE
- isPaid: true (impatta quadratura cassa)

## File Modificati

1. `prisma/schema.prisma` - Aggiunto `isEventOnly` a CashStationTemplate
2. `src/components/chiusura/ClosureForm.tsx` - Formula quadratura, handler presenze
3. `src/components/chiusura/CashStationCard.tsx` - Auto-calcolo IVA, non battuto
4. `src/components/chiusura/AttendanceSection.tsx` - Separazione fissi/extra
5. `src/app/(dashboard)/chiusura-cassa/nuova/page.tsx` - Query con nuovi campi
6. `src/app/(dashboard)/chiusura-cassa/nuova/NuovaChiusuraClient.tsx` - Interfaccia aggiornata

## Test Eseguiti (2 Gennaio 2026)

### Test nel Browser - TUTTI SUPERATI ✅

| Test | Risultato | Dettagli |
|------|-----------|----------|
| Formula quadratura cassa | ✅ | `Cassa Attesa = 798 + 1000 - 60 = 1738` |
| IVA auto-calcolata | ✅ | Scontrini 1000 → IVA 90.91 |
| IVA Fatture auto | ✅ | Fatture 200 → IVA 18.18 |
| "Non battuto" | ✅ | Totale 1200 - Scontrini 1000 = +200 (evidenziato) |
| Sezioni Fissi/Extra | ✅ | Due card separate con campi appropriati |
| Auto-uscita extra pagato | ✅ | 5h × €12 = €60 → uscita `[EXTRA] Personale Extra` |
| Checkbox evento | ✅ | Mostra campo "Nome evento" |
| 3 slot meteo | ✅ | Mattina, Pomeriggio, Sera |

### Valori Test Utilizzati
- Postazione BAR:
  - Scontrini: €1000 (IVA auto: €90.91)
  - Fatture: €200 (IVA auto: €18.18)
  - Contanti: €1000
  - POS: €200
  - Fondo cassa: €114
- Personale Extra:
  - Ore: 5
  - Tariffa: €12/h
  - Totale: €60
  - Pagato: ✓ → genera uscita automatica

### Quadratura Finale Verificata
```
Fondi Cassa:        798,00 €  (114 × 7 postazioni)
+ Incassi Contanti: 1000,00 €
- Uscite Contanti:    60,00 €  (pagamento extra)
= Cassa Attesa:    1738,00 €  ✓
```

## Status
**COMPLETATO** - Build OK + Test Browser Superati
