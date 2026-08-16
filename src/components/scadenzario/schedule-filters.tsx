import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScheduleStatus, ScheduleType, SchedulePriority, ScheduleSource, SCHEDULE_STATUS_LABELS, SCHEDULE_TYPE_LABELS, SCHEDULE_PRIORITY_LABELS, SCHEDULE_SOURCE_LABELS } from '@/types/schedule'
import { CalendarIcon, Filter, X } from 'lucide-react'
import { format } from 'date-fns'
import { useEffect, useRef, useState } from 'react'
import { useDebounce } from '@/hooks/useDebounce'

interface ScheduleFiltersProps {
  filtri: {
    stato?: ScheduleStatus | ScheduleStatus[]
    tipo?: ScheduleType | ScheduleType[]
    priorita?: SchedulePriority | SchedulePriority[]
    source?: ScheduleSource
    search?: string
    dataInizio?: Date
    dataFine?: Date
    isRicorrente?: boolean
    verificata?: boolean
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

  // La casella di ricerca tiene il proprio testo e filtra quando la digitazione
  // si ferma. Prima ogni tasto faceva ripartire la query, e la query metteva
  // l'input in `disabled`: il browser toglie il focus a un campo disabilitato,
  // quindi si riusciva a scrivere una lettera per volta. Il `disabled` qui
  // sotto non va rimesso.
  const [ricerca, setRicerca] = useState(filtri.search ?? '')
  const ricercaDifferita = useDebounce(ricerca, 300)
  // Ultimo testo consegnato al padre: distingue "l'ho scritto io" da "i filtri
  // sono cambiati da fuori", che è ciò che rende innocua la sincronizzazione
  // nei due versi.
  const ultimaInviata = useRef(filtri.search ?? '')

  useEffect(() => {
    if (ricercaDifferita === ultimaInviata.current) return
    ultimaInviata.current = ricercaDifferita
    onFiltriChange({ ...filtri, search: ricercaDifferita || undefined })
    // `filtri` e `onFiltriChange` cambiano identità a ogni render del padre:
    // metterli fra le dipendenze rifarebbe partire il timer a ogni giro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ricercaDifferita])

  // Verso opposto: se i filtri vengono azzerati altrove, la casella si svuota.
  useEffect(() => {
    const esterna = filtri.search ?? ''
    if (esterna === ultimaInviata.current) return
    ultimaInviata.current = esterna
    setRicerca(esterna)
  }, [filtri.search])

  const haFiltriAttivi = () => {
    return !!filtri.stato || !!filtri.tipo || !!filtri.priorita || !!filtri.source ||
           !!filtri.search || !!ricerca || !!filtri.dataInizio || !!filtri.dataFine ||
           filtri.isRicorrente !== undefined || filtri.verificata !== undefined
  }

  const handleReset = () => {
    ultimaInviata.current = ''
    setRicerca('')
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
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          className="pl-8"
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

      {/* Filtro Origine */}
      <Select
        value={filtri.source ?? '__all__'}
        onValueChange={(v) => onFiltriChange({ ...filtri, source: v === '__all__' ? undefined : v as ScheduleSource })}
        disabled={isLoading}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Origine" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Tutte le origini</SelectItem>
          {Object.values(ScheduleSource).map((source) => (
            <SelectItem key={source} value={source}>
              {SCHEDULE_SOURCE_LABELS[source]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Filtro Verifica: "un umano ha guardato", ortogonale allo stato */}
      <Select
        value={filtri.verificata === undefined ? '__all__' : String(filtri.verificata)}
        onValueChange={(v) => onFiltriChange({ ...filtri, verificata: v === '__all__' ? undefined : v === 'true' })}
        disabled={isLoading}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Verifica" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Tutte</SelectItem>
          <SelectItem value="false">Da verificare</SelectItem>
          <SelectItem value="true">Verificate</SelectItem>
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
