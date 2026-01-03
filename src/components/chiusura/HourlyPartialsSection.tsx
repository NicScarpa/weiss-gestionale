'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DEFAULT_PARTIAL_HOURS } from '@/lib/constants'

// Tipo per parziale orario
export interface HourlyPartialData {
  id?: string
  timeSlot: string
  receiptProgressive: number
  posProgressive: number
  coffeeCounter?: number
  coffeeDelta?: number // Calcolato automaticamente rispetto al giorno precedente
}

interface HourlyPartialsSectionProps {
  partials: HourlyPartialData[]
  onChange: (partials: HourlyPartialData[]) => void
  previousCoffeeCount?: number | null // Contatore caffè del giorno precedente
  disabled?: boolean
  className?: string
}

export function HourlyPartialsSection({
  partials,
  onChange,
  previousCoffeeCount,
  disabled = false,
  className,
}: HourlyPartialsSectionProps) {
  // Calcola il delta caffè per ogni parziale
  // Il delta è rispetto al valore precedente (parziale precedente o giorno precedente)
  const calculateCoffeeDelta = (index: number, currentCount?: number): number | null => {
    if (currentCount === undefined || currentCount === null) return null

    if (index === 0) {
      // Primo parziale: delta rispetto al giorno precedente
      if (previousCoffeeCount === undefined || previousCoffeeCount === null) return null
      return currentCount - previousCoffeeCount
    } else {
      // Parziali successivi: delta rispetto al parziale precedente
      const prevPartial = partials[index - 1]
      if (prevPartial.coffeeCounter === undefined || prevPartial.coffeeCounter === null) return null
      return currentCount - prevPartial.coffeeCounter
    }
  }
  // Aggiungi nuovo parziale
  const handleAdd = () => {
    // Trova il prossimo orario disponibile
    const usedSlots = partials.map((p) => p.timeSlot)
    const nextSlot =
      DEFAULT_PARTIAL_HOURS.find((h) => !usedSlots.includes(h)) || '12:00'

    onChange([
      ...partials,
      {
        timeSlot: nextSlot,
        receiptProgressive: 0,
        posProgressive: 0,
      },
    ])
  }

  // Rimuovi parziale
  const handleRemove = (index: number) => {
    onChange(partials.filter((_, i) => i !== index))
  }

  // Aggiorna campo parziale
  const handleFieldChange = (
    index: number,
    field: keyof HourlyPartialData,
    value: string | number
  ) => {
    const updated = [...partials]
    updated[index] = {
      ...updated[index],
      [field]: typeof value === 'string' && field !== 'timeSlot'
        ? parseFloat(value) || 0
        : value,
    }
    onChange(updated)
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Parziali Orari
        </CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={disabled}
          className="gap-1"
        >
          <Plus className="h-4 w-4" />
          Aggiungi
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {partials.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nessun parziale registrato. Clicca &quot;Aggiungi&quot; per inserire i progressivi.
          </p>
        ) : (
          partials.map((partial, index) => (
            <div
              key={index}
              className="grid grid-cols-[100px_1fr_1fr_1fr_40px] gap-2 items-end border-b pb-3 last:border-0"
            >
              {/* Orario */}
              <div className="space-y-1">
                <Label className="text-xs">Ora</Label>
                <Input
                  type="time"
                  value={partial.timeSlot}
                  onChange={(e) =>
                    handleFieldChange(index, 'timeSlot', e.target.value)
                  }
                  disabled={disabled}
                  className="font-mono"
                />
              </div>

              {/* Totale (ex Progressivo Corrispettivo) */}
              <div className="space-y-1">
                <Label className="text-xs">Totale</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={partial.receiptProgressive || ''}
                  onChange={(e) =>
                    handleFieldChange(index, 'receiptProgressive', e.target.value)
                  }
                  disabled={disabled}
                  className="font-mono"
                  placeholder="0,00"
                />
              </div>

              {/* POS (ex Progressivo POS) */}
              <div className="space-y-1">
                <Label className="text-xs">POS</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={partial.posProgressive || ''}
                  onChange={(e) =>
                    handleFieldChange(index, 'posProgressive', e.target.value)
                  }
                  disabled={disabled}
                  className="font-mono"
                  placeholder="0,00"
                />
              </div>

              {/* Contatore Caffè (totale, delta calcolato automaticamente) */}
              <div className="space-y-1">
                <Label className="text-xs">Caffè</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    value={partial.coffeeCounter ?? ''}
                    onChange={(e) =>
                      handleFieldChange(index, 'coffeeCounter', e.target.value)
                    }
                    disabled={disabled}
                    className="font-mono flex-1"
                    placeholder="0"
                  />
                  {(() => {
                    const delta = calculateCoffeeDelta(index, partial.coffeeCounter)
                    if (delta !== null) {
                      return (
                        <span
                          className={`text-xs font-mono whitespace-nowrap ${
                            delta >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {delta >= 0 ? '+' : ''}{delta}
                        </span>
                      )
                    }
                    return null
                  })()}
                </div>
              </div>

              {/* Rimuovi */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemove(index)}
                disabled={disabled}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
