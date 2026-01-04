'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CalendarIcon, ChevronLeft, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AnomalyCard } from '@/components/attendance/AnomalyCard'
import Link from 'next/link'

interface Anomaly {
  id: string
  anomalyType: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_FIXED'
  date: string
  description: string | null
  expectedValue: string | null
  actualValue: string | null
  differenceMinutes: number | null
  hoursAffected: number | null
  costImpact: number | null
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
  assignment: {
    id: string
    startTime: string
    endTime: string
    shiftDefinition: {
      name: string
      code: string
    } | null
  } | null
  resolvedBy: string | null
  resolvedAt: string | null
  resolutionNotes: string | null
}

interface Venue {
  id: string
  name: string
  code: string
}

export default function AnomaliePage() {
  const [statusFilter, setStatusFilter] = useState<string>('PENDING')
  const [selectedVenueId, setSelectedVenueId] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState<Date | undefined>()
  const [dateTo, setDateTo] = useState<Date | undefined>()

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

  // Fetch anomalies
  const { data: anomaliesData, isLoading } = useQuery<{
    data: Anomaly[]
    pagination: { total: number; hasMore: boolean }
  }>({
    queryKey: ['anomalies', statusFilter, selectedVenueId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.append('status', statusFilter)
      if (selectedVenueId !== 'all') params.append('venueId', selectedVenueId)
      if (dateFrom) params.append('from', format(dateFrom, 'yyyy-MM-dd'))
      if (dateTo) params.append('to', format(dateTo, 'yyyy-MM-dd'))
      params.append('limit', '100')

      const response = await fetch(`/api/attendance/anomalies?${params}`)
      if (!response.ok) throw new Error('Errore caricamento anomalie')
      return response.json()
    },
  })

  const anomalies = anomaliesData?.data || []
  const totalCount = anomaliesData?.pagination?.total || 0

  // Count by status
  const pendingCount = anomalies.filter((a) => a.status === 'PENDING').length
  const approvedCount = anomalies.filter((a) => a.status === 'APPROVED').length
  const rejectedCount = anomalies.filter((a) => a.status === 'REJECTED').length

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
          <h1 className="text-3xl font-bold tracking-tight">Anomalie Presenze</h1>
          <p className="text-muted-foreground">
            Gestisci le anomalie rilevate nelle timbrature
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
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

            {/* Date From */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Da:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-[150px] justify-start text-left font-normal',
                      !dateFrom && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, 'dd/MM/yyyy') : 'Seleziona'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
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
                      'w-[150px] justify-start text-left font-normal',
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
                    onSelect={setDateTo}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Clear Filters */}
            {(dateFrom || dateTo || selectedVenueId !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDateFrom(undefined)
                  setDateTo(undefined)
                  setSelectedVenueId('all')
                }}
              >
                Cancella filtri
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs by Status */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="PENDING" className="gap-2">
            Da verificare
            {pendingCount > 0 && (
              <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="APPROVED">Approvate</TabsTrigger>
          <TabsTrigger value="REJECTED">Rifiutate</TabsTrigger>
          <TabsTrigger value="all">Tutte</TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter} className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : anomalies.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Nessuna anomalia trovata con i filtri selezionati
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {anomalies.map((anomaly) => (
                <AnomalyCard key={anomaly.id} anomaly={anomaly} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
