'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatHoursMinutes } from '@/lib/attendance/format-hours'
import { cn } from '@/lib/utils'

/**
 * Il cartellino mensile, condiviso fra la pagina admin, la scheda dipendente
 * e il portale: un solo componente, così i tre posti non possono raccontare
 * tre storie diverse sulle stesse ore.
 */

interface DailyHours {
  ordinary: number
  overtime: number
  night: number
  holiday: number
  total: number
  breakMinutes: number
}

interface TimesheetDay {
  date: string
  weekdayLabel: string
  clockIn: string | null
  clockOut: string | null
  hours: DailyHours
  leaveCode: string | null
  workLocationName: string | null
  policyName: string | null
  notes: string[]
}

interface MonthlyTimesheetData {
  userId: string
  firstName: string
  lastName: string
  month: number
  year: number
  days: TimesheetDay[]
  totals: {
    ordinary: number
    overtime: number
    night: number
    holiday: number
    total: number
    leaveDays: number
    leaveSummary: Record<string, number>
  }
  contractHoursWeek: number | null
  policyNames: string[]
}

const MESI_IT = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
]

interface MonthlyTimesheetProps {
  /** Senza userId il server restituisce il cartellino di chi è collegato. */
  userId?: string
  /** Il nome è già visibile nella scheda dipendente: lì non si ripete. */
  showName?: boolean
}

export function MonthlyTimesheet({ userId, showName = true }: MonthlyTimesheetProps) {
  const oggi = new Date()
  const [month, setMonth] = useState(oggi.getMonth() + 1)
  const [year, setYear] = useState(oggi.getFullYear())

  const parametri = new URLSearchParams({
    month: String(month),
    year: String(year),
    ...(userId ? { userId } : {}),
  })

  const { data, isLoading, isError } = useQuery<MonthlyTimesheetData>({
    queryKey: ['cartellino', userId ?? 'me', month, year],
    queryFn: async () => {
      const res = await fetch(`/api/cartellino?${parametri.toString()}`)
      if (!res.ok) {
        const corpo = await res.json().catch(() => null)
        throw new Error(corpo?.error ?? 'Errore nel caricamento del cartellino')
      }
      const corpo = await res.json()
      return corpo.data
    },
  })

  const mesePrecedente = () => {
    if (month === 1) {
      setMonth(12)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
  }

  const meseSuccessivo = () => {
    if (month === 12) {
      setMonth(1)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
  }

  // I giorni senza nulla da dire (né ore né assenze né note) si attenuano:
  // il mese ha trenta righe, e l'occhio deve cadere su quelle che contano.
  const giornoVuoto = (giorno: TimesheetDay) =>
    giorno.hours.total === 0 && !giorno.leaveCode && giorno.notes.length === 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={mesePrecedente}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[140px] text-center font-medium">
            {MESI_IT[month - 1]} {year}
          </div>
          <Button variant="outline" size="icon" onClick={meseSuccessivo}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button variant="outline" size="sm" asChild>
          <a href={`/api/cartellino/export?${parametri.toString()}`}>
            <Download className="mr-2 h-4 w-4" />
            Esporta XLSX
          </a>
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Non è stato possibile caricare il cartellino. Riprova.
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="text-sm text-muted-foreground">
            {showName && (
              <span className="mr-3 font-medium text-foreground">
                {data.lastName} {data.firstName}
              </span>
            )}
            {data.contractHoursWeek !== null && (
              <span className="mr-3">
                Contratto: {data.contractHoursWeek} h/settimana
              </span>
            )}
            <span>
              Regola oraria:{' '}
              {data.policyNames.length > 0
                ? data.policyNames.join(', ')
                : 'nessuna (ore come timbrate)'}
            </span>
          </div>

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Giorno</TableHead>
                    <TableHead>Luogo</TableHead>
                    <TableHead>Entrata</TableHead>
                    <TableHead>Uscita</TableHead>
                    <TableHead className="text-right">Ord.</TableHead>
                    <TableHead className="text-right">Str.</TableHead>
                    <TableHead className="text-right">Nott.</TableHead>
                    <TableHead className="text-right">Fest.</TableHead>
                    <TableHead className="text-right">Totale</TableHead>
                    <TableHead>Assenza</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.days.map((giorno) => (
                    <TableRow
                      key={giorno.date}
                      className={cn(
                        giornoVuoto(giorno) && 'text-muted-foreground/60',
                        giorno.notes.length > 0 && 'bg-amber-50'
                      )}
                    >
                      <TableCell className="whitespace-nowrap">
                        <span className="font-medium">
                          {giorno.date.slice(8, 10)}
                        </span>{' '}
                        <span className="text-xs text-muted-foreground">
                          {giorno.weekdayLabel.slice(0, 3)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {giorno.workLocationName ?? ''}
                      </TableCell>
                      <TableCell>{giorno.clockIn ?? ''}</TableCell>
                      <TableCell>{giorno.clockOut ?? ''}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {giorno.hours.ordinary > 0
                          ? formatHoursMinutes(giorno.hours.ordinary)
                          : ''}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {giorno.hours.overtime > 0
                          ? formatHoursMinutes(giorno.hours.overtime)
                          : ''}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {giorno.hours.night > 0
                          ? formatHoursMinutes(giorno.hours.night)
                          : ''}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {giorno.hours.holiday > 0
                          ? formatHoursMinutes(giorno.hours.holiday)
                          : ''}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {giorno.hours.total > 0
                          ? formatHoursMinutes(giorno.hours.total)
                          : ''}
                      </TableCell>
                      <TableCell>
                        {giorno.leaveCode && (
                          <Badge variant="secondary">{giorno.leaveCode}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[220px] text-xs">
                        {giorno.notes.length > 0 && (
                          <span className="flex items-start gap-1 text-amber-700">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                            {giorno.notes.join(' · ')}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
            <div>
              <span className="text-muted-foreground">Totale: </span>
              <span className="font-semibold">
                {formatHoursMinutes(data.totals.total)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Ordinarie: </span>
              {formatHoursMinutes(data.totals.ordinary)}
            </div>
            <div>
              <span className="text-muted-foreground">Straordinario: </span>
              {formatHoursMinutes(data.totals.overtime)}
            </div>
            <div>
              <span className="text-muted-foreground">Notturne: </span>
              {formatHoursMinutes(data.totals.night)}
            </div>
            <div>
              <span className="text-muted-foreground">Festive: </span>
              {formatHoursMinutes(data.totals.holiday)}
            </div>
            {data.totals.leaveDays > 0 && (
              <div>
                <span className="text-muted-foreground">Assenze: </span>
                {data.totals.leaveDays} gg (
                {Object.entries(data.totals.leaveSummary)
                  .map(([codice, giorni]) => `${codice}: ${giorni}`)
                  .join(', ')}
                )
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
