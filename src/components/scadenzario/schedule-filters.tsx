import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScheduleStatus, ScheduleType, SchedulePriority, SCHEDULE_STATUS_LABELS, SCHEDULE_TYPE_LABELS, SCHEDULE_PRIORITY_LABELS } from '@/types/schedule'
import { CalendarIcon, Filter, X } from 'lucide-react'
import { format } from 'date-fns'
import { useState } from 'react'

interface ScheduleFiltersProps {
  filtri: {
    stato?: ScheduleStatus | ScheduleStatus[]
    tipo?: ScheduleType | ScheduleType[]
    priorita?: SchedulePriority | SchedulePriority[]
    search?: string
    dataInizio?: Date
    dataFine?: Date
    isRicorrente?: boolean
  }
  onFiltriChange: (filtri: ScheduleFiltersProps['filtri']) => void
  onReset: () => void
  isLoading?: boolean
}

export function ScheduleFilters({
  filtri,
  onFiltriChange,
  onReset,
  isLoading = false,
}: ScheduleFiltersProps) {
  const [calendarOpen, setCalendarOpen] = useState(false)

  const haFiltriAttivi = () => {
    return !!filtri.stato || !!filtri.tipo || !!filtri.priorita ||
           !!filtri.search || !!filtri.dataInizio || !!filtri.dataFine ||
           filtri.isRicorrente !== undefined
  }

  const handleReset = () => {
    onFiltriChange({})
    onReset()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Ricerca testuale */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground opacity-50" />
        <Input
          placeholder="Cerca scadenze..."
          value={filtri.search || ''}
          onChange={(e) => onFiltriChange({ ...filtri, search: e.target.value || undefined })}
          className="pl-8"
          disabled={isLoading}
        />
      </div>

      {/* Filtro Stato */}
      <Select
        value={filtri.stato as string ?? '__all__'}
        onValueChange={(v) => onFiltriChange({ ...filtri, stato: v === '__all__' ? undefined : v as ScheduleStatus })}
        disabled={isLoading}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Stato" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Tutti gli stati</SelectItem>
          {Object.values(ScheduleStatus).map((stato) => (
            <SelectItem key={stato} value={stato}>
              {SCHEDULE_STATUS_LABELS[stato]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Filtro Tipo */}
      <Select
        value={filtri.tipo as string ?? '__all__'}
        onValueChange={(v) => onFiltriChange({ ...filtri, tipo: v === '__all__' ? undefined : v as ScheduleType })}
        disabled={isLoading}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Tutti i tipi</SelectItem>
          {Object.values(ScheduleType).map((tipo) => (
            <SelectItem key={tipo} value={tipo}>
              {SCHEDULE_TYPE_LABELS[tipo]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Filtro Priorità */}
      <Select
        value={filtri.priorita as string ?? '__all__'}
        onValueChange={(v) => onFiltriChange({ ...filtri, priorita: v === '__all__' ? undefined : v as SchedulePriority })}
        disabled={isLoading}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Priorità" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Tutte le priorità</SelectItem>
          {Object.values(SchedulePriority).map((priorita) => (
            <SelectItem key={priorita} value={priorita}>
              {SCHEDULE_PRIORITY_LABELS[priorita]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Filro Date */}
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="justify-start text-normal"
            disabled={isLoading}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {filtri.dataInizio ? `${format(filtri.dataInizio, 'dd/MM')} - ` : ''}
            {filtri.dataFine ? format(filtri.dataFine, 'dd/MM') : 'Range date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={{
              from: filtri.dataInizio,
              to: filtri.dataFine,
            }}
            onSelect={(range) => {
              setCalendarOpen(false)
              onFiltriChange({
                ...filtri,
                dataInizio: range?.from,
                dataFine: range?.to,
              })
            }}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>

      {/* Toggle Ricorrenze */}
      <Button
        variant={filtri.isRicorrente === true ? 'default' : filtri.isRicorrente === false ? 'outline' : 'ghost'}
        size="sm"
        onClick={() => onFiltriChange({
          ...filtri,
          isRicorrente: filtri.isRicorrente === undefined ? true : filtri.isRicorrente === true ? false : undefined,
        })}
        disabled={isLoading}
      >
        Ricorrenze
      </Button>

      {/* Reset */}
      {haFiltriAttivi() && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={isLoading}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
