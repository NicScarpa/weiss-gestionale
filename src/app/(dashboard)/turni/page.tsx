'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import {
  Calendar,
  Plus,
  Eye,
  Settings,
  Users,
  CalendarDays,
} from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

interface Schedule {
  id: string
  name: string
  venueId: string
  startDate: string
  endDate: string
  status: 'DRAFT' | 'GENERATED' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED'
  publishedAt: string | null
  venue: {
    id: string
    name: string
    code: string
  }
  createdByUser?: {
    firstName: string
    lastName: string
  }
  _count: {
    assignments: number
  }
}

export default function TurniPage() {
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const { data: schedulesData, isLoading } = useQuery({
    queryKey: ['schedules', filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filterStatus !== 'all') {
        params.append('status', filterStatus)
      }
      params.append('includeArchived', 'false')
      const res = await fetch(`/api/schedules?${params}`)
      if (!res.ok) throw new Error('Errore nel caricamento')
      return res.json()
    },
  })

  const schedules: Schedule[] = schedulesData?.data || []

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <Badge variant="secondary">Bozza</Badge>
      case 'GENERATED':
        return <Badge className="bg-blue-100 text-blue-700">Generato</Badge>
      case 'REVIEW':
        return <Badge className="bg-amber-100 text-amber-700">In revisione</Badge>
      case 'PUBLISHED':
        return <Badge className="bg-green-100 text-green-700">Pubblicato</Badge>
      case 'ARCHIVED':
        return <Badge variant="outline">Archiviato</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            Pianificazione Turni
          </h1>
          <p className="text-muted-foreground">
            Gestisci le pianificazioni settimanali dei turni
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/turni/definizioni">
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Definizioni Turni
            </Button>
          </Link>
          <Link href="/turni/nuovo">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nuova Pianificazione
            </Button>
          </Link>
        </div>
      </div>

      {/* Filtri */}
      <div className="flex items-center gap-4">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtra per stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="DRAFT">Bozza</SelectItem>
            <SelectItem value="GENERATED">Generato</SelectItem>
            <SelectItem value="REVIEW">In revisione</SelectItem>
            <SelectItem value="PUBLISHED">Pubblicato</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista pianificazioni */}
      <Card>
        <CardHeader>
          <CardTitle>
            Pianificazioni
            <Badge variant="secondary" className="ml-2">
              {schedules.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            Clicca su una pianificazione per visualizzare o modificare il calendario
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Caricamento...
            </div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nessuna pianificazione trovata</p>
              <Link href="/turni/nuovo">
                <Button className="mt-4">
                  <Plus className="h-4 w-4 mr-2" />
                  Crea la prima pianificazione
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Sede</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Assegnazioni</TableHead>
                  <TableHead>Creato da</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map(schedule => (
                  <TableRow key={schedule.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{schedule.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(schedule.startDate), 'd MMM', { locale: it })} -{' '}
                          {format(new Date(schedule.endDate), 'd MMM yyyy', { locale: it })}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{schedule.venue.code}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(schedule.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {schedule._count.assignments}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {schedule.createdByUser
                        ? `${schedule.createdByUser.firstName} ${schedule.createdByUser.lastName}`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/turni/${schedule.id}`}>
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
