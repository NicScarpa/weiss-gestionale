# Aggiunta riga totale nel breakdown fasce orarie

## Obiettivo
Aggiungere una riga di totale in grassetto sotto le card delle fasce orarie (AM, APE, PM) quando si espande una riga del report incassi giornalieri.

## File coinvolto
- `src/app/(dashboard)/report/incassi-giornalieri/DailyRevenueClient.tsx`

## Analisi attuale

Il componente `TimeSlotBreakdownView` (righe 170-204) mostra una griglia con le card per ogni fascia oraria:
```tsx
<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-2">
  {slots.map((slot) => (
    <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
      // Label (AM/APE/PM) + Weather
      // Cash + POS + Coffee delta
    </div>
  ))}
</div>
```

## Piano di implementazione

### Task 1: Calcolare i totali degli slot
Nella funzione `TimeSlotBreakdownView`, calcolare la somma di:
- `totalCash`: somma di tutti `slot.cash`
- `totalPos`: somma di tutti `slot.pos`
- `totalReceipt`: somma di tutti `slot.receipt` (= totalCash + totalPos)

### Task 2: Aggiungere riga totale dopo la griglia
Dopo la griglia delle card, aggiungere un `div` con:
- Sfondo leggermente diverso (`bg-muted/50`)
- Bordo superiore per separazione visiva
- Layout flex con "TOTALE" a sinistra
- Valori in grassetto (`font-semibold` o `font-bold`) a destra
- Icone coerenti (Banknote verde, CreditCard blu, Receipt per totale)

### Task 3: Stile coerente
- Usare `font-mono` per i numeri (coerente con la tabella)
- Usare `font-bold` per evidenziare i valori
- Separatore visivo tra card e totale

## Codice proposto

```tsx
function TimeSlotBreakdownView({ slots }: { slots: TimeSlotBreakdown[] }) {
  // Calcola totali
  const totalCash = slots.reduce((sum, s) => sum + s.cash, 0)
  const totalPos = slots.reduce((sum, s) => sum + s.pos, 0)
  const totalReceipt = totalCash + totalPos

  return (
    <div className="space-y-3">
      {/* Griglia slot esistente */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {slots.map((slot) => (
          // ... card esistenti invariate
        ))}
      </div>

      {/* Riga totale in grassetto */}
      <div className="flex items-center justify-between rounded-lg border-t bg-muted/50 px-3 py-2">
        <span className="font-bold text-sm">TOTALE</span>
        <div className="flex gap-4 text-sm">
          <span className="flex items-center gap-1">
            <Banknote className="h-3 w-3 text-green-600" />
            <span className="font-mono font-bold">{formatCurrency(totalCash)}</span>
          </span>
          <span className="flex items-center gap-1">
            <CreditCard className="h-3 w-3 text-blue-600" />
            <span className="font-mono font-bold">{formatCurrency(totalPos)}</span>
          </span>
          <span className="flex items-center gap-1">
            <Receipt className="h-3 w-3 text-primary" />
            <span className="font-mono font-bold">{formatCurrency(totalReceipt)}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
```

## Verifica
- [ ] La riga totale appare sotto le card AM/APE/PM
- [ ] I valori sono in grassetto
- [ ] Le icone sono coerenti (Banknote, CreditCard, Receipt)
- [ ] Il layout è responsive (funziona su mobile)
- [ ] I totali corrispondono ai valori nella riga principale della tabella

## Stima
Modifica minima: ~20 righe di codice in un singolo file.
