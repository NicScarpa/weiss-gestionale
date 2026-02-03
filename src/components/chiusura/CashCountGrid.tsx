'use client'

import { useCallback, useMemo, memo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { BILL_DENOMINATIONS, COIN_DENOMINATIONS, formatCurrency } from '@/lib/constants'

// Tipo per il conteggio
export interface CashCountValues {
  bills500: number
  bills200: number
  bills100: number
  bills50: number
  bills20: number
  bills10: number
  bills5: number
  coins2: number
  coins1: number
  coins050: number
  coins020: number
  coins010: number
  coins005: number
  coins002: number
  coins001: number
}

// Valori iniziali
export const emptyCashCount: CashCountValues = {
  bills500: 0,
  bills200: 0,
  bills100: 0,
  bills50: 0,
  bills20: 0,
  bills10: 0,
  bills5: 0,
  coins2: 0,
  coins1: 0,
  coins050: 0,
  coins020: 0,
  coins010: 0,
  coins005: 0,
  coins002: 0,
  coins001: 0,
}

// Mapping denominazione -> chiave
const denominationToKey: Record<number, keyof CashCountValues> = {
  500: 'bills500',
  200: 'bills200',
  100: 'bills100',
  50: 'bills50',
  20: 'bills20',
  10: 'bills10',
  5: 'bills5',
  2: 'coins2',
  1: 'coins1',
  0.5: 'coins050',
  0.2: 'coins020',
  0.1: 'coins010',
  0.05: 'coins005',
  0.02: 'coins002',
  0.01: 'coins001',
}

interface CashCountGridProps {
  values: CashCountValues
  onChange: (values: CashCountValues) => void
  disabled?: boolean
  className?: string
}

// Formatta etichetta denominazione con spazio dopo €
const formatDenomination = (denom: number) => {
  if (denom >= 1) return `€ ${denom}`
  return `€ ${denom.toFixed(2).replace('.', ',')}`
}

// Componente riga singola - DEVE essere fuori dal componente principale
// per evitare che venga ricreato ad ogni render (causa perdita focus)
interface DenominationRowProps {
  denomination: number
  count: number
  disabled?: boolean
  onIncrement: (denomination: number, delta: number) => void
  onChange: (denomination: number, value: string) => void
}

const DenominationRow = memo(function DenominationRow({
  denomination,
  count,
  disabled = false,
  onIncrement,
  onChange,
}: DenominationRowProps) {
  const total = denomination * count

  return (
    <div className="grid grid-cols-[80px_1fr_100px] items-center gap-2 py-1">
      {/* Etichetta denominazione */}
      <Label className="font-bold text-sm text-foreground">
        {formatDenomination(denomination)}
      </Label>

      {/* Input con bottoni +/- */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onIncrement(denomination, -1)}
          disabled={disabled || count === 0}
          className={cn(
            'w-11 h-11 rounded-lg font-bold text-lg',
            'bg-gray-100 hover:bg-gray-200 active:bg-gray-300',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'touch-manipulation select-none'
          )}
        >
          −
        </button>
        <Input
          type="number"
          min="0"
          value={count}
          onChange={(e) => onChange(denomination, e.target.value)}
          disabled={disabled}
          className="w-16 h-11 text-center font-mono text-lg"
        />
        <button
          type="button"
          onClick={() => onIncrement(denomination, 1)}
          disabled={disabled}
          className={cn(
            'w-11 h-11 rounded-lg font-bold text-lg',
            'bg-gray-100 hover:bg-gray-200 active:bg-gray-300',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'touch-manipulation select-none'
          )}
        >
          +
        </button>
      </div>

      {/* Totale riga */}
      <span className="text-right font-mono text-sm text-muted-foreground">
        {formatCurrency(total)}
      </span>
    </div>
  )
})

export function CashCountGrid({
  values,
  onChange,
  disabled = false,
  className,
}: CashCountGridProps) {
  // Calcola totale banconote
  const billsTotal = useMemo(() => {
    return BILL_DENOMINATIONS.reduce((sum, denom) => {
      const key = denominationToKey[denom]
      return sum + denom * (values[key] || 0)
    }, 0)
  }, [values])

  // Calcola totale monete
  const coinsTotal = useMemo(() => {
    return COIN_DENOMINATIONS.reduce((sum, denom) => {
      const key = denominationToKey[denom]
      return sum + denom * (values[key] || 0)
    }, 0)
  }, [values])

  // Totale generale
  const grandTotal = billsTotal + coinsTotal

  // Handler cambio valore
  const handleChange = useCallback(
    (denomination: number, value: string) => {
      const key = denominationToKey[denomination]
      const numValue = Math.max(0, parseInt(value) || 0)
      onChange({
        ...values,
        [key]: numValue,
      })
    },
    [values, onChange]
  )

  // Incrementa/decrementa rapido
  const handleIncrement = useCallback(
    (denomination: number, delta: number) => {
      const key = denominationToKey[denomination]
      const newValue = Math.max(0, (values[key] || 0) + delta)
      onChange({
        ...values,
        [key]: newValue,
      })
    },
    [values, onChange]
  )

  // Tutte le denominazioni ordinate dal più grande al più piccolo
  const allDenominations = [...BILL_DENOMINATIONS, ...COIN_DENOMINATIONS]

  return (
    <div className={cn('space-y-4', className)}>
      {/* Sezione unica conteggio */}
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="space-y-1">
          {allDenominations.map((denom) => (
            <DenominationRow
              key={`denom-${denom}`}
              denomination={denom}
              count={values[denominationToKey[denom]] || 0}
              disabled={disabled}
              onIncrement={handleIncrement}
              onChange={handleChange}
            />
          ))}
        </div>
      </div>

      {/* Totale Generale */}
      <div className="rounded-lg bg-primary/10 border-2 border-primary p-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-lg">Totale Contato</span>
          <span className="font-mono font-bold text-2xl text-primary">
            {formatCurrency(grandTotal)}
          </span>
        </div>
      </div>
    </div>
  )
}

// Hook per calcolare il totale da CashCountValues
export function calculateCashCountTotal(values: CashCountValues): number {
  const billsTotal = BILL_DENOMINATIONS.reduce((sum, denom) => {
    const key = denominationToKey[denom]
    return sum + denom * (values[key] || 0)
  }, 0)

  const coinsTotal = COIN_DENOMINATIONS.reduce((sum, denom) => {
    const key = denominationToKey[denom]
    return sum + denom * (values[key] || 0)
  }, 0)

  return billsTotal + coinsTotal
}
