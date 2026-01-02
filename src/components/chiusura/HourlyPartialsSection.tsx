'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Clock, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DEFAULT_PARTIAL_HOURS } from '@/lib/constants'

// Tipo per parziale orario
export interface HourlyPartialData {
  id?: string
  timeSlot: string
  receiptProgressive: number
  posProgressive: number
  coffeeCounter?: number
  coffeeDelta?: number
  weather?: string
}

// Opzioni meteo
const WEATHER_OPTIONS = [
  { value: 'sunny', label: '☀️ Sole' },
  { value: 'cloudy', label: '☁️ Nuvoloso' },
  { value: 'rainy', label: '🌧️ Pioggia' },
  { value: 'stormy', label: '⛈️ Temporale' },
  { value: 'snowy', label: '❄️ Neve' },
  { value: 'foggy', label: '🌫️ Nebbia' },
]

interface HourlyPartialsSectionProps {
  partials: HourlyPartialData[]
  onChange: (partials: HourlyPartialData[]) => void
  disabled?: boolean
  className?: string
}

export function HourlyPartialsSection({
  partials,
  onChange,
  disabled = false,
  className,
}: HourlyPartialsSectionProps) {
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
      [field]: typeof value === 'string' && field !== 'timeSlot' && field !== 'weather'
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
              className="grid grid-cols-[100px_1fr_1fr_1fr_1fr_40px] gap-2 items-end border-b pb-3 last:border-0"
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

              {/* Progressivo Scontrini */}
              <div className="space-y-1">
                <Label className="text-xs">Progr. Scontrini</Label>
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

              {/* Progressivo POS */}
              <div className="space-y-1">
                <Label className="text-xs">Progr. POS</Label>
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

              {/* Contatore Caffè */}
              <div className="space-y-1">
                <Label className="text-xs">Caffè (delta)</Label>
                <Input
                  type="number"
                  min="0"
                  value={partial.coffeeDelta ?? ''}
                  onChange={(e) =>
                    handleFieldChange(index, 'coffeeDelta', e.target.value)
                  }
                  disabled={disabled}
                  className="font-mono"
                  placeholder="0"
                />
              </div>

              {/* Meteo */}
              <div className="space-y-1">
                <Label className="text-xs">Meteo</Label>
                <Select
                  value={partial.weather || ''}
                  onValueChange={(value) =>
                    handleFieldChange(index, 'weather', value)
                  }
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="--" />
                  </SelectTrigger>
                  <SelectContent>
                    {WEATHER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
