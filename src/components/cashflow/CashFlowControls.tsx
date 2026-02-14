'use client'

import { useState } from 'react'
import { Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface CashFlowControlsProps {
  dateFrom: Date
  dateTo: Date
  onDateFromChange: (date: Date) => void
  onDateToChange: (date: Date) => void
  onPreset: (days: number) => void
  onGrouping: (grouping: 'daily' | 'weekly' | 'monthly') => void
}

export function CashFlowControls({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onPreset,
  onGrouping,
}: CashFlowControlsProps) {
  const [grouping, setGrouping] = useState<'daily' | 'weekly' | 'monthly'>('monthly')

  const handleGroupingChange = (value: 'daily' | 'weekly' | 'monthly') => {
    setGrouping(value)
    onGrouping(value)
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Selettore date */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 border rounded-md px-3 py-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={dateFrom.toISOString().split('T')[0]}
            onChange={(e) => onDateFromChange(new Date(e.target.value))}
            className="border-0 bg-transparent text-sm"
          />
        </div>
        <span className="text-muted-foreground">→</span>
        <div className="flex items-center gap-1 border rounded-md px-3 py-2">
          <input
            type="date"
            value={dateTo.toISOString().split('T')[0]}
            onChange={(e) => onDateToChange(new Date(e.target.value))}
            className="border-0 bg-transparent text-sm"
          />
        </div>
      </div>

      {/* Preset */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onPreset(30)}>
          30gg
        </Button>
        <Button variant="outline" size="sm" onClick={() => onPreset(90)}>
          90gg
        </Button>
        <Button variant="outline" size="sm" onClick={() => onPreset(180)}>
          6 mesi
        </Button>
        <Button variant="outline" size="sm" onClick={() => onPreset(365)}>
          1 anno
        </Button>
      </div>

      {/* Raggruppamento */}
      <Select value={grouping} onValueChange={handleGroupingChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Raggruppamento" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="daily">Giornaliero</SelectItem>
          <SelectItem value="weekly">Settimanale</SelectItem>
          <SelectItem value="monthly">Mensile</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
