'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, addDays, subDays } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  CalendarIcon,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Plus,
  AlertTriangle,
  Settings,
  FileText,
  Clock,
  MapPin,
} from 'lucide-react'
import {
  SFUMATURA_SCORRIMENTO,
  useStrisciaScorrevole,
} from '@/hooks/useStrisciaScorrevole'
import { cn } from '@/lib/utils'
import { AttendanceTable } from '@/components/attendance/AttendanceTable'
import { AttendanceStats } from '@/components/attendance/AttendanceStats'
import { ManualEntryDialog } from '@/components/attendance/ManualEntryDialog'
import Link from 'next/link'

interface DailySummaryResponse {
  date: string
  data: Array<{
    assignment: {
      id: string
      user: {
        id: string
        firstName: string
        lastName: string
      }
      venue: {
        id: string
        name: string
        code: string
      }
      shiftDefinition: {
        name: string
        code: string
        color: string | null
      } | null
      scheduledStart: string
      scheduledEnd: string
      scheduledMinutes: number
    }
    attendance: {
      status: 'SCHEDULED' | 'CLOCKED_IN' | 'ON_BREAK' | 'CLOCKED_OUT' | 'ABSENT'
      clockIn: string | null
      clockOut: string | null
      breakStart: string | null
      breakEnd: string | null
      minutesWorked: number
      hoursWorked: number
      punchCount: number
    }
    hasAnomalies: boolean
    actualVsScheduled: {
      differenceMinutes: number
      percentageWorked: number
    }
  }>
  stats: {
    totalScheduled: number
    clockedIn: number
    onBreak: number
    clockedOut: number
    absent: number
    notYetStarted: number
    withAnomalies: number
    totalScheduledHours: number
    totalWorkedHours: number
  }
}

export default function PresenzePage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [manualEntryOpen, setManualEntryOpen] = useState(false)
  const [selectedUserIdForEntry, setSelectedUserIdForEntry] = useState<string | undefined>()
  const { rifStriscia, restaDaScorrere } = useStrisciaScorrevole<HTMLDivElement>()

  // Fetch daily summary
  const { data: summary, isLoading } = useQuery<DailySummaryResponse>({
    queryKey: ['attendance-summary', format(selectedDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      const params = new URLSearchParams({
        date: format(selectedDate, 'yyyy-MM-dd'),
      })
      const response = await fetch(`/api/attendance/daily-summary?${params}`)
      if (!response.ok) throw new Error('Errore caricamento presenze')
      return response.json()
    },
    refetchInterval: 30000, // Refresh ogni 30 secondi
  })

  // Fetch anomalies count
  const { data: anomaliesData } = useQuery({
    queryKey: ['anomalies-pending-count'],
    queryFn: async () => {
      const response = await fetch('/api/attendance/anomalies?status=PENDING&limit=1')
      if (!response.ok) throw new Error('Errore')
      return response.json()
    },
  })

  const pendingAnomalies = anomaliesData?.pagination?.total || 0

  // Contatore delle richieste di correzione in attesa
  const { data: richiesteData } = useQuery({
    queryKey: ['richieste-correzione-pending-count'],
    queryFn: async () => {
      const response = await fetch('/api/richieste-correzione?status=PENDING')
      if (!response.ok) throw new Error('Errore')
      return response.json()
    },
  })

  const pendingRichieste = richiesteData?.data?.length || 0

  const goToPreviousDay = () => setSelectedDate((d) => subDays(d, 1))
  const goToNextDay = () => setSelectedDate((d) => addDays(d, 1))
  const goToToday = () => setSelectedDate(new Date())

  const isToday =
    format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')

  const handleManualEntry = (userId?: string) => {
    setSelectedUserIdForEntry(userId)
    setManualEntryOpen(true)
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Presenze</h1>
          <p className="text-muted-foreground">
            Monitora le presenze e le timbrature dei dipendenti
          </p>
        </div>

        {/* Le otto voci occupano 950 px: sotto md non ci stanno, e senza il
            tetto `max-w-full` la striscia si allarga quanto loro e a scorrere
            finisce la pagina intera. La sfumatura a destra dice che c'è
            dell'altro, visto che gli scrollbar dei telefoni non si vedono. */}
        <div
          ref={rifStriscia}
          className={cn(
            'flex items-center gap-1 p-1 bg-muted/50 rounded-lg max-w-full overflow-x-auto',
            restaDaScorrere && SFUMATURA_SCORRIMENTO
          )}
        >
          {/* Anomalie Button */}
          <Link
            href="/presenze/anomalie"
            className="flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground relative"
          >
            <AlertTriangle className="h-4 w-4" />
            Anomalie
            {pendingAnomalies > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center font-bold border-2 border-white">
                {pendingAnomalies}
              </span>
            )}
          </Link>

          {/* Richieste di correzione Button */}
          <Link
            href="/presenze/richieste"
            className="flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground relative"
          >
            <ClipboardCheck className="h-4 w-4" />
            Richieste
            {pendingRichieste > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center font-bold border-2 border-white">
                {pendingRichieste}
              </span>
            )}
          </Link>

          {/* Policy Button */}
          <Link
            href="/presenze/policy"
            className="flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            Policy
          </Link>

          {/* Luoghi Button */}
          <Link
            href="/presenze/luoghi"
            className="flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MapPin className="h-4 w-4" />
            Luoghi
          </Link>

          {/* Regole orario Button */}
          <Link
            href="/presenze/regole-orario"
            className="flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Clock className="h-4 w-4" />
            Regole orario
          </Link>

          {/* Cartellino Button */}
          <Link
            href="/presenze/cartellino"
            className="flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <CalendarCheck className="h-4 w-4" />
            Cartellino
          </Link>

          {/* Export Button */}
          <Link
            href="/presenze/export"
            className="flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <FileText className="h-4 w-4" />
            Export
          </Link>

          <div className="w-px h-4 shrink-0 bg-muted-foreground/20 mx-1" />

          {/* Manual Entry Button */}
          <button
            onClick={() => handleManualEntry()}
            className="flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Inserimento Manuale
          </button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center gap-4">
            {/* Date Navigation */}
            <div className="flex w-full items-center gap-2 md:w-auto">
              <Button variant="outline" size="icon" className="shrink-0" onClick={goToPreviousDay}>
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  {/* I 240 px fissi più le due frecce non stanno in un telefono:
                      sotto md il bottone prende lo spazio che avanza */}
                  <Button
                    variant="outline"
                    className={cn(
                      'min-w-0 flex-1 justify-start text-left font-normal md:w-[240px] md:flex-none',
                      !selectedDate && 'text-muted-foreground'
                    )}
                  >
                    {/* Sotto sm i 24 px dell'icona sono la differenza fra
                        vedere la data e vederla troncata: il calendario si
                        apre lo stesso toccando il bottone */}
                    <CalendarIcon className="mr-2 hidden h-4 w-4 shrink-0 sm:block" />
                    <span className="truncate sm:hidden">
                      {format(selectedDate, 'EEE d MMM yyyy', { locale: it })}
                    </span>
                    <span className="hidden truncate sm:inline">
                      {format(selectedDate, 'EEEE d MMMM yyyy', { locale: it })}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Button variant="outline" size="icon" className="shrink-0" onClick={goToNextDay}>
                <ChevronRight className="h-4 w-4" />
              </Button>

              {!isToday && (
                <Button variant="ghost" size="sm" className="shrink-0" onClick={goToToday}>
                  Oggi
                </Button>
              )}
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      {summary && <AttendanceStats stats={summary.stats} />}

      {/* Attendance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Riepilogo Presenze</CardTitle>
          <CardDescription>
            {isToday ? 'Situazione in tempo reale' : `Presenze del ${format(selectedDate, 'd MMMM yyyy', { locale: it })}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <AttendanceTable
              data={summary?.data || []}
              onManualEntry={handleManualEntry}
            />
          )}
        </CardContent>
      </Card>

      {/* Manual Entry Dialog */}
      <ManualEntryDialog
        open={manualEntryOpen}
        onOpenChange={setManualEntryOpen}
        preselectedUserId={selectedUserIdForEntry}
        date={selectedDate}
      />
    </div>
  )
}
