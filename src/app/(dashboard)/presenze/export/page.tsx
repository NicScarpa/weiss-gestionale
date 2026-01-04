'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CalendarIcon, ChevronLeft, Download, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'

interface Venue {
  id: string
  name: string
  code: string
}

interface AttendanceRecord {
  id: string
  user: {
    id: string
    firstName: string
    lastName: string
    email: string
  }
  venue: {
    id: string
    name: string
    code: string
  }
  punchType: string
  punchMethod: string
  punchedAt: string
  isWithinRadius: boolean
  isManual: boolean
}

export default function ExportPage() {
  const lastMonth = subMonths(new Date(), 1)
  const [dateFrom, setDateFrom] = useState<Date>(startOfMonth(lastMonth))
  const [dateTo, setDateTo] = useState<Date>(endOfMonth(lastMonth))
  const [selectedVenueId, setSelectedVenueId] = useState<string>('all')

  // Fetch venues
  const { data: venues } = useQuery<Venue[]>({
    queryKey: ['venues-list'],
    queryFn: async () => {
      const response = await fetch('/api/venues')
      if (!response.ok) throw new Error('Errore caricamento sedi')
      const data = await response.json()
      return data.data || []
    },
  })

  // Fetch records for preview
  const { data: recordsData, isLoading } = useQuery<{
    data: AttendanceRecord[]
    pagination: { total: number }
  }>({
    queryKey: ['attendance-export-preview', dateFrom, dateTo, selectedVenueId],
    queryFn: async () => {
      const params = new URLSearchParams({
        from: format(dateFrom, 'yyyy-MM-dd'),
        to: format(dateTo, 'yyyy-MM-dd'),
        limit: '20',
      })
      if (selectedVenueId !== 'all') {
        params.append('venueId', selectedVenueId)
      }
      const response = await fetch(`/api/attendance/records?${params}`)
      if (!response.ok) throw new Error('Errore caricamento')
      return response.json()
    },
    enabled: !!dateFrom && !!dateTo,
  })

  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams({
        from: format(dateFrom, 'yyyy-MM-dd'),
        to: format(dateTo, 'yyyy-MM-dd'),
        limit: '10000',
      })
      if (selectedVenueId !== 'all') {
        params.append('venueId', selectedVenueId)
      }

      const response = await fetch(`/api/attendance/records?${params}`)
      if (!response.ok) throw new Error('Errore export')

      const data = await response.json()
      const records: AttendanceRecord[] = data.data || []

      // Generate CSV
      const headers = [
        'Data',
        'Ora',
        'Dipendente',
        'Email',
        'Sede',
        'Tipo',
        'Metodo',
        'Valida GPS',
        'Manuale',
      ]
      const rows = records.map((r) => [
        format(new Date(r.punchedAt), 'dd/MM/yyyy'),
        format(new Date(r.punchedAt), 'HH:mm:ss'),
        `${r.user.firstName} ${r.user.lastName}`,
        r.user.email,
        r.venue.name,
        r.punchType,
        r.punchMethod,
        r.isWithinRadius ? 'Sì' : 'No',
        r.isManual ? 'Sì' : 'No',
      ])

      const csvContent = [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell}"`).join(','))
        .join('\n')

      // Download
      const blob = new Blob(['\ufeff' + csvContent], {
        type: 'text/csv;charset=utf-8;',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `timbrature_${format(dateFrom, 'yyyyMMdd')}_${format(dateTo, 'yyyyMMdd')}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success(`Esportate ${records.length} timbrature`)
    } catch {
      toast.error('Errore durante l\'export')
    }
  }

  const handleExportPayroll = async () => {
    try {
      const params = new URLSearchParams({
        from: format(dateFrom, 'yyyy-MM-dd'),
        to: format(dateTo, 'yyyy-MM-dd'),
        limit: '10000',
      })
      if (selectedVenueId !== 'all') {
        params.append('venueId', selectedVenueId)
      }

      const response = await fetch(`/api/attendance/records?${params}`)
      if (!response.ok) throw new Error('Errore export')

      const data = await response.json()
      const records: AttendanceRecord[] = data.data || []

      // Group by user and calculate hours
      const userHours: Record<
        string,
        {
          user: AttendanceRecord['user']
          venue: AttendanceRecord['venue']
          entries: { date: string; in: Date | null; out: Date | null }[]
        }
      > = {}

      records.forEach((r) => {
        if (!userHours[r.user.id]) {
          userHours[r.user.id] = {
            user: r.user,
            venue: r.venue,
            entries: [],
          }
        }

        const date = format(new Date(r.punchedAt), 'yyyy-MM-dd')
        let entry = userHours[r.user.id].entries.find((e) => e.date === date)
        if (!entry) {
          entry = { date, in: null, out: null }
          userHours[r.user.id].entries.push(entry)
        }

        if (r.punchType === 'IN' && !entry.in) {
          entry.in = new Date(r.punchedAt)
        } else if (r.punchType === 'OUT') {
          entry.out = new Date(r.punchedAt)
        }
      })

      // Calculate totals
      const payrollData = Object.values(userHours).map((uh) => {
        let totalMinutes = 0
        uh.entries.forEach((e) => {
          if (e.in && e.out) {
            totalMinutes += Math.round(
              (e.out.getTime() - e.in.getTime()) / (1000 * 60)
            )
          }
        })
        return {
          ...uh,
          totalHours: Math.round((totalMinutes / 60) * 100) / 100,
          daysWorked: uh.entries.filter((e) => e.in && e.out).length,
        }
      })

      // Generate CSV
      const headers = [
        'Cognome',
        'Nome',
        'Email',
        'Sede',
        'Giorni Lavorati',
        'Ore Totali',
      ]
      const rows = payrollData.map((p) => [
        p.user.lastName,
        p.user.firstName,
        p.user.email,
        p.venue.name,
        p.daysWorked.toString(),
        p.totalHours.toString().replace('.', ','),
      ])

      const csvContent = [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell}"`).join(','))
        .join('\n')

      // Download
      const blob = new Blob(['\ufeff' + csvContent], {
        type: 'text/csv;charset=utf-8;',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `riepilogo_paghe_${format(dateFrom, 'yyyyMMdd')}_${format(dateTo, 'yyyyMMdd')}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success('Riepilogo paghe esportato')
    } catch {
      toast.error('Errore durante l\'export')
    }
  }

  const quickDateRanges = [
    {
      label: 'Mese scorso',
      from: startOfMonth(subMonths(new Date(), 1)),
      to: endOfMonth(subMonths(new Date(), 1)),
    },
    {
      label: 'Mese corrente',
      from: startOfMonth(new Date()),
      to: new Date(),
    },
    {
      label: 'Ultimi 2 mesi',
      from: startOfMonth(subMonths(new Date(), 2)),
      to: new Date(),
    },
  ]

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/presenze">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Export Presenze</h1>
          <p className="text-muted-foreground">
            Esporta le timbrature per l'elaborazione paghe
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Seleziona Periodo</CardTitle>
          <CardDescription>
            Scegli l'intervallo di date per l'export
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick Ranges */}
          <div className="flex flex-wrap gap-2">
            {quickDateRanges.map((range) => (
              <Button
                key={range.label}
                variant="outline"
                size="sm"
                onClick={() => {
                  setDateFrom(range.from)
                  setDateTo(range.to)
                }}
              >
                {range.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            {/* Date From */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Da:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-[180px] justify-start text-left font-normal',
                      !dateFrom && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom
                      ? format(dateFrom, 'dd/MM/yyyy')
                      : 'Seleziona'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={(date) => date && setDateFrom(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Date To */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">A:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-[180px] justify-start text-left font-normal',
                      !dateTo && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, 'dd/MM/yyyy') : 'Seleziona'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={(date) => date && setDateTo(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Venue Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sede:</span>
              <Select value={selectedVenueId} onValueChange={setSelectedVenueId}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tutte le sedi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le sedi</SelectItem>
                  {venues?.map((venue) => (
                    <SelectItem key={venue.id} value={venue.id}>
                      {venue.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Actions */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Timbrature
            </CardTitle>
            <CardDescription>
              Esporta tutte le timbrature del periodo selezionato in formato CSV
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExportCSV} className="w-full">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Scarica CSV Timbrature
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Riepilogo Paghe
            </CardTitle>
            <CardDescription>
              Esporta un riepilogo delle ore lavorate per dipendente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleExportPayroll} variant="outline" className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Scarica Riepilogo Paghe
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Anteprima Dati</CardTitle>
          <CardDescription>
            {recordsData?.pagination?.total || 0} timbrature nel periodo selezionato
            (visualizzate le prime 20)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Ora</TableHead>
                    <TableHead>Dipendente</TableHead>
                    <TableHead>Sede</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Metodo</TableHead>
                    <TableHead>GPS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recordsData?.data?.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        {format(new Date(record.punchedAt), 'dd/MM/yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        {record.user.firstName} {record.user.lastName}
                      </TableCell>
                      <TableCell>{record.venue.name}</TableCell>
                      <TableCell>{record.punchType}</TableCell>
                      <TableCell>
                        {record.isManual ? 'Manuale' : record.punchMethod}
                      </TableCell>
                      <TableCell>
                        {record.isWithinRadius ? '✓' : '✗'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!recordsData?.data || recordsData.data.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nessuna timbratura nel periodo selezionato
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
