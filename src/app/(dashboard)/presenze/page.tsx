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
  ChevronLeft,
  ChevronRight,
  Plus,
  AlertTriangle,
  Settings,
  FileText,
} from 'lucide-react'
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

        <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg">
          {/* Anomalie Button */}
          <Link
            href="/presenze/anomalie"
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground relative"
          >
            <AlertTriangle className="h-4 w-4" />
            Anomalie
            {pendingAnomalies > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center font-bold border-2 border-white">
                {pendingAnomalies}
              </span>
            )}
          </Link>

          {/* Policy Button */}
          <Link
            href="/presenze/policy"
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            Policy
          </Link>

          {/* Export Button */}
          <Link
            href="/presenze/export"
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <FileText className="h-4 w-4" />
            Export
          </Link>

          <div className="w-px h-4 bg-muted-foreground/20 mx-1" />

          {/* Manual Entry Button */}
          <button
            onClick={() => handleManualEntry()}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95"
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
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={goToPreviousDay}>
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-[240px] justify-start text-left font-normal',
                      !selectedDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(selectedDate, 'EEEE d MMMM yyyy', { locale: it })}
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

              <Button variant="outline" size="icon" onClick={goToNextDay}>
                <ChevronRight className="h-4 w-4" />
              </Button>

              {!isToday && (
                <Button variant="ghost" size="sm" onClick={goToToday}>
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
