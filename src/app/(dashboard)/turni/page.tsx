'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
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
  Trash2,
  Loader2,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
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
  const queryClient = useQueryClient()
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [scheduleToDelete, setScheduleToDelete] = useState<Schedule | null>(null)

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

  // Mutation per eliminare pianificazione
  const deleteMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      const res = await fetch(`/api/schedules/${scheduleId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nell\'eliminazione')
      }
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      if (data.archived) {
        toast.success('Pianificazione archiviata')
      } else {
        toast.success('Pianificazione eliminata')
      }
      setScheduleToDelete(null)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

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
      <Tabs value={filterStatus} onValueChange={setFilterStatus}>
        <TabsList className="flex gap-1 p-1 bg-muted/50 rounded-lg h-auto w-fit border-none">
          <TabsTrigger
            value="all"
            className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium"
          >
            Tutti gli stati
          </TabsTrigger>
          <TabsTrigger
            value="DRAFT"
            className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium"
          >
            Bozza
          </TabsTrigger>
          <TabsTrigger
            value="GENERATED"
            className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium"
          >
            Generato
          </TabsTrigger>
          <TabsTrigger
            value="REVIEW"
            className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium"
          >
            In revisione
          </TabsTrigger>
          <TabsTrigger
            value="PUBLISHED"
            className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium"
          >
            Pubblicato
          </TabsTrigger>
        </TabsList>
      </Tabs>

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
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/turni/${schedule.id}`}>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setScheduleToDelete(schedule)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog conferma eliminazione */}
      <AlertDialog open={!!scheduleToDelete} onOpenChange={(open) => !open && setScheduleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              {scheduleToDelete?.status === 'PUBLISHED' ? (
                <>
                  La pianificazione <strong>{scheduleToDelete?.name}</strong> è pubblicata e verrà <strong>archiviata</strong>.
                  <br />
                  I turni assegnati rimarranno nel sistema.
                </>
              ) : (
                <>
                  Sei sicuro di voler eliminare la pianificazione <strong>{scheduleToDelete?.name}</strong>?
                  <br />
                  Verranno eliminati anche tutti i {scheduleToDelete?._count.assignments || 0} turni assegnati.
                  <br />
                  <span className="text-destructive font-medium">Questa operazione non può essere annullata.</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => scheduleToDelete && deleteMutation.mutate(scheduleToDelete.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {scheduleToDelete?.status === 'PUBLISHED' ? 'Archiviazione...' : 'Eliminazione...'}
                </>
              ) : (
                scheduleToDelete?.status === 'PUBLISHED' ? 'Archivia' : 'Elimina'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
