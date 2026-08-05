'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { MonthlyTimesheet } from '@/components/attendance/MonthlyTimesheet'
import { formatHoursMinutes } from '@/lib/attendance/format-hours'

/**
 * Cartellino mensile, lato amministrazione: le ore del mese di tutto il team,
 * e da ogni riga il cartellino della singola persona.
 */

interface RiepilogoPersona {
  userId: string
  employeeCode: string
  firstName: string
  lastName: string
  totalOrdinary: number
  totalOvertime: number
  totalNight: number
  totalHoliday: number
  totalHours: number
  totalLeaveDays: number
  leaveSummary: Record<string, number>
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

export default function CartellinoPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const selectedUserId = searchParams.get('userId')

  const oggi = new Date()
  const [month, setMonth] = useState(oggi.getMonth() + 1)
  const [year, setYear] = useState(oggi.getFullYear())

  const { data, isLoading, isError } = useQuery<{
    summaries: RiepilogoPersona[]
    warnings: string[]
  }>({
    queryKey: ['cartellino-riepilogo', month, year],
    queryFn: async () => {
      const res = await fetch(`/api/cartellino/riepilogo?month=${month}&year=${year}`)
      if (!res.ok) throw new Error('Errore nel caricamento del riepilogo')
      const corpo = await res.json()
      return corpo.data
    },
    enabled: !selectedUserId,
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

  // Vista della singola persona: il componente condiviso, con il ritorno
  // all'elenco del team.
  if (selectedUserId) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/presenze/cartellino')}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cartellino</h1>
            <p className="text-muted-foreground">
              Ore riconosciute della persona, giorno per giorno
            </p>
          </div>
        </div>

        <MonthlyTimesheet userId={selectedUserId} />
      </div>
    )
  }

  const summaries = data?.summaries ?? []
  const attivi = summaries.filter(
    (s) => s.totalHours > 0 || s.totalLeaveDays > 0
  )

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/presenze">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cartellino</h1>
          <p className="text-muted-foreground">
            Le ore del mese di tutto il team, calcolate con le regole orario
          </p>
        </div>
      </div>

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

      {isLoading && <Skeleton className="h-64 w-full" />}

      {isError && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Non è stato possibile caricare il riepilogo. Riprova.
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {data.warnings.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                {data.warnings.slice(0, 5).map((avviso) => (
                  <div key={avviso}>{avviso}</div>
                ))}
                {data.warnings.length > 5 && (
                  <div>… e altri {data.warnings.length - 5} avvisi</div>
                )}
              </div>
            </div>
          )}

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dipendente</TableHead>
                    <TableHead className="text-right">Ordinarie</TableHead>
                    <TableHead className="text-right">Straordinario</TableHead>
                    <TableHead className="text-right">Notturne</TableHead>
                    <TableHead className="text-right">Festive</TableHead>
                    <TableHead className="text-right">Totale</TableHead>
                    <TableHead className="text-right">Assenze</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attivi.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-muted-foreground"
                      >
                        Nessuna ora registrata in questo mese
                      </TableCell>
                    </TableRow>
                  )}
                  {attivi.map((persona) => (
                    <TableRow
                      key={persona.userId}
                      className="cursor-pointer"
                      onClick={() =>
                        router.push(`/presenze/cartellino?userId=${persona.userId}`)
                      }
                    >
                      <TableCell className="font-medium">
                        {persona.lastName} {persona.firstName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatHoursMinutes(persona.totalOrdinary)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatHoursMinutes(persona.totalOvertime)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatHoursMinutes(persona.totalNight)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatHoursMinutes(persona.totalHoliday)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatHoursMinutes(persona.totalHours)}
                      </TableCell>
                      <TableCell className="text-right">
                        {persona.totalLeaveDays > 0
                          ? `${persona.totalLeaveDays} gg`
                          : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
