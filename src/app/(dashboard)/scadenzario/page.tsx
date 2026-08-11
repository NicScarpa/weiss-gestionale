"use client"

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScheduleSummaryCards } from '@/components/scadenzario/schedule-summary-cards'
import { ScheduleFilters } from '@/components/scadenzario/schedule-filters'
import { CreateScheduleDialog } from '@/components/scadenzario/create-schedule-sheet'
import { PaymentDialog, PaymentFormData } from '@/components/scadenzario/payment-dialog'
import { ScheduleStatusBadge } from '@/components/scadenzario/schedule-status-badge'
import { PriorityBadge } from '@/components/scadenzario/priority-badge'
import { RecurrencePreview } from '@/components/scadenzario/recurrence-preview'
import { ScheduleCalendar } from '@/components/scadenzario/schedule-calendar'
import { SaldoScalarePanel } from '@/components/scadenzario/saldo-scalare-panel'
import { ScheduleSourceBadge } from '@/components/scadenzario/schedule-source-badge'
import { Schedule, ScheduleSummary, ScheduleFilters as ScheduleFiltersType, CreateScheduleInput } from '@/types/schedule'
import { Switch } from '@/components/ui/switch'
import { CalendarClock, CalendarDays, Plus, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { format, isAfter, startOfDay } from 'date-fns'
import { it } from 'date-fns/locale'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/formatters'

/**
 * Il messaggio che il server ha dato, o un ripiego leggibile. Serve a farlo
 * arrivare fino al dialog, che lo mostra e resta aperto con i dati dentro:
 * prima l'errore finiva solo in console e l'utente riprovava, duplicando.
 */
async function erroreDalServer(resp: Response, ripiego: string): Promise<Error> {
  try {
    const corpo = await resp.json()
    return new Error(corpo?.error || ripiego)
  } catch {
    return new Error(ripiego)
  }
}

function SortIcon({ column, sortBy, sortOrder }: { column: string; sortBy: string; sortOrder: 'asc' | 'desc' }) {
  if (sortBy !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />
  return sortOrder === 'asc'
    ? <ArrowUp className="h-3 w-3 ml-1" />
    : <ArrowDown className="h-3 w-3 ml-1" />
}

export default function ScadenzarioPage() {
  const router = useRouter()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [summary, setSummary] = useState<ScheduleSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [filtri, setFiltri] = useState<ScheduleFiltersType>({})
  const [view, setView] = useState<'lista' | 'calendario'>('lista')

  // Sort
  const [sortBy, setSortBy] = useState<string>('dataScadenza')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Dialog pagamenti
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null)

  // Pagination
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  // Saldo scalare
  const [showSaldoScalare, setShowSaldoScalare] = useState(false)

  // Calendar
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1)
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [calendarEvents, setCalendarEvents] = useState<Record<string, any[]>>({})

  // Fetch schedules
  useEffect(() => {
    const fetchSchedules = async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams()
        if (filtri.stato) params.append('stato', filtri.stato as string)
        if (filtri.tipo) params.append('tipo', filtri.tipo as string)
        if (filtri.priorita) params.append('priorita', filtri.priorita as string)
        if (filtri.source) params.append('source', filtri.source)
        if (filtri.search) params.append('search', filtri.search)
        // Giorno civile, non istante: `toISOString()` di una mezzanotte
        // italiana è ancora il giorno prima, e il filtro perdeva un giorno
        if (filtri.dataInizio) params.append('dataInizio', format(filtri.dataInizio, 'yyyy-MM-dd'))
        if (filtri.dataFine) params.append('dataFine', format(filtri.dataFine, 'yyyy-MM-dd'))
        if (filtri.isRicorrente !== undefined) params.append('isRicorrente', String(filtri.isRicorrente))
        if (filtri.verificata !== undefined) params.append('verificata', String(filtri.verificata))
        if (filtri.pagateSenzaMovimento) params.append('pagateSenzaMovimento', 'true')
        params.append('page', String(page))
        params.append('sortBy', sortBy)
        params.append('sortOrder', sortOrder)

        const resp = await fetch(`/api/scadenzario?${params}`)
        const data = await resp.json()

        if (resp.ok) {
          setSchedules(data.data || [])
          setTotalPages(data.pagination?.totalPages || 1)
        }
      } catch (error) {
        console.error('Errore fetch schedules:', error)
      }
      setIsLoading(false)
    }

    fetchSchedules()
  }, [filtri, page, sortBy, sortOrder])

  // Fetch summary
  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const resp = await fetch('/api/scadenzario/summary')
        const data = await resp.json()
        if (resp.ok) {
          setSummary(data)
        }
      } catch (error) {
        console.error('Errore fetch summary:', error)
      }
    }

    fetchSummary()
  }, [])

  // Fetch calendar events
  useEffect(() => {
    if (view !== 'calendario') return
    const fetchCalendar = async () => {
      try {
        const resp = await fetch(`/api/scadenzario/calendar?year=${calYear}&month=${calMonth}`)
        const data = await resp.json()
        if (resp.ok) {
          setCalendarEvents(data.events || {})
        }
      } catch (error) {
        console.error('Errore fetch calendar:', error)
      }
    }
    fetchCalendar()
  }, [view, calMonth, calYear])

  const handleToggleVerifica = async (schedule: Schedule) => {
    try {
      const resp = await fetch(`/api/scadenzario/${schedule.id}/verifica`, { method: 'PATCH' })
      if (resp.ok) {
        const result = await resp.json()
        setSchedules(prev => prev.map(s =>
          s.id === schedule.id ? { ...s, verificata: result.verificata } : s
        ))
      }
    } catch (error) {
      console.error('Errore toggle verifica:', error)
    }
  }

  // Gli errori risalgono al dialog, che li mostra e resta aperto: qui non si
  // catturano, o il salvataggio fallito passerebbe di nuovo per riuscito.
  const handlePayment = async (data: PaymentFormData) => {
    if (!selectedSchedule) return

    const resp = await fetch(`/api/scadenzario/${selectedSchedule.id}/pagamenti`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!resp.ok) {
      throw await erroreDalServer(resp, 'Non è stato possibile registrare il pagamento')
    }

    const result = await resp.json()
    setSchedules(prev => prev.map(s =>
      s.id === selectedSchedule.id ? { ...s, ...result.schedule } : s
    ))
    setPaymentDialogOpen(false)
    setSelectedSchedule(null)
    toast.success('Pagamento registrato')
  }

  const handleCreateSchedule = async (data: CreateScheduleInput) => {
    const resp = await fetch('/api/scadenzario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!resp.ok) {
      throw await erroreDalServer(resp, 'Non è stato possibile creare la scadenza')
    }

    const result = await resp.json()
    setSchedules(prev => [result.schedule, ...prev])
    toast.success('Scadenza creata')
  }

  const toggleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('asc')
    }
    setPage(1)
  }

  const handleCalendarNavigate = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      if (calMonth === 1) {
        setCalMonth(12)
        setCalYear(prev => prev - 1)
      } else {
        setCalMonth(prev => prev - 1)
      }
    } else {
      if (calMonth === 12) {
        setCalMonth(1)
        setCalYear(prev => prev + 1)
      } else {
        setCalMonth(prev => prev + 1)
      }
    }
  }

  const today = startOfDay(new Date())

  return (
    <div className="flex-1 space-y-6">
      {/* Header: senza flex-wrap le quattro azioni stanno su una riga sola di
          538px e sono loro, non la tabella, a far scorrere l'intera pagina sul
          telefono */}
      <div className="flex flex-wrap items-start justify-between gap-3 sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Scadenzario
          </h1>
          <p className="text-muted-foreground">
            Gestione scadenze attive e passive
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="saldo-scalare"
            className="flex min-h-11 items-center gap-2 cursor-pointer sm:min-h-0"
          >
            <Switch
              id="saldo-scalare"
              checked={showSaldoScalare}
              onCheckedChange={setShowSaldoScalare}
              className="h-[22px] w-[42px] border border-neutral-300 data-[state=checked]:border-neutral-900 shadow-none data-[state=unchecked]:bg-neutral-300 data-[state=checked]:bg-neutral-900 [&>span]:size-[18px]"
            />
            <span className="text-sm font-medium select-none text-muted-foreground">
              Mostra saldo scalare
            </span>
          </label>
          {/* Il separatore ha senso solo finché le azioni stanno in linea */}
          <div className="hidden h-5 w-px bg-border sm:block" />
          <Button
            variant="outline"
            size="sm"
            className="h-11 sm:h-8"
            onClick={() => {
              const params = new URLSearchParams()
              if (filtri.stato) params.append('stato', filtri.stato as string)
              if (filtri.tipo) params.append('tipo', filtri.tipo as string)
              if (filtri.priorita) params.append('priorita', filtri.priorita as string)
              if (filtri.source) params.append('source', filtri.source)
              if (filtri.search) params.append('search', filtri.search)
              window.open(`/api/scadenzario/export?${params}`, '_blank')
            }}
          >
            Esporta CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-11 sm:h-8"
            onClick={() => router.push('/scadenzario/aging')}
          >
            Aging Analysis
          </Button>
          <CreateScheduleDialog onSubmit={handleCreateSchedule} />
        </div>
      </div>

      {/* Summary Cards */}
      {summary && !showSaldoScalare && (
        <ScheduleSummaryCards
          summary={summary}
          isLoading={isLoading}
          onPagateSenzaMovimentoClick={() => {
            setFiltri({ pagateSenzaMovimento: true })
            setPage(1)
          }}
        />
      )}

      {/* Saldo Scalare Panel */}
      <SaldoScalarePanel visible={showSaldoScalare} />

      {/* Filters */}
      <ScheduleFilters
        filtri={filtri}
        onFiltriChange={(f) => {
          setFiltri(f)
          setPage(1)
        }}
        onReset={() => {
          setFiltri({})
          setPage(1)
        }}
        isLoading={isLoading}
      />

      {/* Tabs: Lista / Calendario */}
      <Tabs value={view} onValueChange={(v) => setView(v as 'lista' | 'calendario')}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="lista">
              <CalendarDays className="mr-2 h-4 w-4" />
              Lista
            </TabsTrigger>
            <TabsTrigger value="calendario">
              <CalendarClock className="mr-2 h-4 w-4" />
              Calendario
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="lista" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stato</TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort('dataScadenza')}
                    >
                      <span className="flex items-center">
                        Scadenza
                        <SortIcon column="dataScadenza" sortBy={sortBy} sortOrder={sortOrder} />
                      </span>
                    </TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort('descrizione')}
                    >
                      <span className="flex items-center">
                        Descrizione
                        <SortIcon column="descrizione" sortBy={sortBy} sortOrder={sortOrder} />
                      </span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort('controparteNome')}
                    >
                      <span className="flex items-center">
                        Controparte
                        <SortIcon column="controparteNome" sortBy={sortBy} sortOrder={sortOrder} />
                      </span>
                    </TableHead>
                    <TableHead
                      className="text-right cursor-pointer select-none"
                      onClick={() => toggleSort('importoTotale')}
                    >
                      <span className="flex items-center justify-end">
                        Importo
                        <SortIcon column="importoTotale" sortBy={sortBy} sortOrder={sortOrder} />
                      </span>
                    </TableHead>
                    <TableHead className="text-right">Residuo</TableHead>
                    <TableHead>Priorità</TableHead>
                    <TableHead className="text-center">Verifica</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground">
                        Caricamento...
                      </TableCell>
                    </TableRow>
                  ) : schedules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-12">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <CalendarClock className="h-10 w-10 opacity-30" />
                          <p className="font-medium">Nessuna scadenza trovata</p>
                          <p className="text-sm">Crea la tua prima scadenza per iniziare a gestire pagamenti e incassi</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    schedules.map((schedule) => {
                      const isScaduta = isAfter(today, new Date(schedule.dataScadenza)) &&
                        schedule.stato !== 'pagata' && schedule.stato !== 'annullata'
                      const isPagata = schedule.stato === 'pagata'
                      const isAnnullata = schedule.stato === 'annullata'
                      const residuo = schedule.importoResiduo ?? (Number(schedule.importoTotale) - Number(schedule.importoPagato))

                      return (
                        <TableRow
                          key={schedule.id}
                          className={cn(
                            'cursor-pointer hover:bg-muted/50 transition-colors',
                            isScaduta && 'bg-red-50/50',
                            isPagata && 'opacity-60',
                          )}
                          onClick={() => router.push(`/scadenzario/${schedule.id}`)}
                        >
                          <TableCell>
                            <ScheduleStatusBadge stato={schedule.stato} />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className={cn(
                                "font-medium whitespace-nowrap",
                                isScaduta && "text-red-600 font-semibold"
                              )}>
                                {format(new Date(schedule.dataScadenza), 'PP', { locale: it })}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(schedule.dataScadenza), 'EEEE', { locale: it })}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className={cn(
                              "text-xs px-2 py-1 rounded-full whitespace-nowrap",
                              schedule.tipo === 'attiva'
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-rose-100 text-rose-700"
                            )}>
                              {schedule.tipo === 'attiva' ? 'Da incassare' : 'Da pagare'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="max-w-[200px] truncate font-medium" title={schedule.descrizione}>
                                {schedule.descrizione}
                              </div>
                              {schedule.riferimentoDocumento && (
                                <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {schedule.riferimentoDocumento}
                                </div>
                              )}
                              {schedule.source && (
                                <ScheduleSourceBadge source={schedule.source} compact />
                              )}
                              <RecurrencePreview
                                isRicorrente={schedule.isRicorrente}
                                ricorrenzaTipo={schedule.ricorrenzaTipo}
                                ricorrenzaAttiva={schedule.ricorrenzaAttiva}
                                ricorrenzaProssimaGenerazione={schedule.ricorrenzaProssimaGenerazione}
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            {schedule.controparteNome || schedule.supplier?.name || '—'}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(Number(schedule.importoTotale))}
                          </TableCell>
                          <TableCell className="text-right">
                            {residuo > 0 ? (
                              <span className="font-medium text-amber-600">
                                {formatCurrency(residuo)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <PriorityBadge priorita={schedule.priorita} showIcon />
                          </TableCell>
                          <TableCell className="text-center">
                            <button
                              type="button"
                              title={schedule.verificata ? 'Verificata: clicca per riportarla da verificare' : 'Da verificare: clicca per confermare'}
                              className={cn(
                                'text-base leading-none px-2 py-1 rounded hover:bg-muted',
                                schedule.verificata ? 'text-green-600' : 'text-muted-foreground'
                              )}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleToggleVerifica(schedule)
                              }}
                            >
                              {schedule.verificata ? '✓' : '○'}
                            </button>
                          </TableCell>
                          <TableCell>
                            {!isPagata && !isAnnullata && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedSchedule(schedule)
                                  setPaymentDialogOpen(true)
                                }}
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                Paga
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Pagina {page} di {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(p => p - 1)}
                    >
                      Precedente
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => p + 1)}
                    >
                      Successiva
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendario" className="mt-4">
          <ScheduleCalendar
            events={calendarEvents}
            month={calMonth}
            year={calYear}
            onNavigate={handleCalendarNavigate}
            onDayClick={(events) => {
              if (events.length === 1) {
                router.push(`/scadenzario/${events[0].id}`)
              }
            }}
          />
        </TabsContent>
      </Tabs>

      {selectedSchedule && (
        <PaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          onSubmit={handlePayment}
          importoResiduo={selectedSchedule.importoResiduo}
        />
      )}
    </div>
  )
}
