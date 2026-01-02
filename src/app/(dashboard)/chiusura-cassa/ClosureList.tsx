'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Plus,
  Search,
  Filter,
  Eye,
  Pencil,
  Trash2,
  Send,
  CheckCircle,
  Clock,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatCurrency } from '@/lib/constants'
import { toast } from 'sonner'

interface Closure {
  id: string
  date: string
  status: 'DRAFT' | 'SUBMITTED' | 'VALIDATED'
  venue: {
    id: string
    name: string
    code: string
  }
  grossTotal: number
  isEvent: boolean
  eventName?: string
  submittedBy?: string
  submittedAt?: string
  validatedBy?: string
  validatedAt?: string
  createdAt: string
  stationsCount: number
  expensesCount: number
}

interface ClosureListProps {
  venueId?: string
  isAdmin: boolean
}

export function ClosureList({ venueId, isAdmin }: ClosureListProps) {
  const [closures, setClosures] = useState<Closure[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({
    status: '',
    dateFrom: '',
    dateTo: '',
  })
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  })

  // Fetch closures
  const fetchClosures = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (venueId) params.set('venueId', venueId)
      if (filter.status) params.set('status', filter.status)
      if (filter.dateFrom) params.set('dateFrom', filter.dateFrom)
      if (filter.dateTo) params.set('dateTo', filter.dateTo)
      params.set('page', pagination.page.toString())
      params.set('limit', pagination.limit.toString())

      const res = await fetch(`/api/chiusure?${params.toString()}`)
      if (!res.ok) throw new Error('Errore nel caricamento')

      const data = await res.json()
      setClosures(data.data)
      setPagination((prev) => ({
        ...prev,
        total: data.pagination.total,
        totalPages: data.pagination.totalPages,
      }))
    } catch (error) {
      console.error('Errore fetch chiusure:', error)
      toast.error('Errore nel caricamento delle chiusure')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClosures()
  }, [venueId, filter.status, filter.dateFrom, filter.dateTo, pagination.page])

  // Delete closure
  const handleDelete = async (id: string) => {
    if (!confirm('Sei sicuro di voler eliminare questa chiusura?')) return

    try {
      const res = await fetch(`/api/chiusure/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore eliminazione')
      }
      toast.success('Chiusura eliminata')
      fetchClosures()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  // Submit for validation
  const handleSubmit = async (id: string) => {
    try {
      const res = await fetch(`/api/chiusure/${id}/submit`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore invio')
      }
      toast.success('Chiusura inviata per validazione')
      fetchClosures()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  // Status badge
  const getStatusBadge = (status: Closure['status']) => {
    switch (status) {
      case 'DRAFT':
        return (
          <Badge variant="outline" className="gap-1">
            <FileText className="h-3 w-3" />
            Bozza
          </Badge>
        )
      case 'SUBMITTED':
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            In attesa
          </Badge>
        )
      case 'VALIDATED':
        return (
          <Badge variant="default" className="gap-1 bg-green-600">
            <CheckCircle className="h-3 w-3" />
            Validata
          </Badge>
        )
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chiusura Cassa</h1>
          <p className="text-muted-foreground">
            Gestione delle chiusure cassa giornaliere
          </p>
        </div>
        <Button asChild>
          <Link href="/chiusura-cassa/nuova">
            <Plus className="mr-2 h-4 w-4" />
            Nuova Chiusura
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Select
              value={filter.status || 'all'}
              onValueChange={(v) =>
                setFilter((prev) => ({ ...prev, status: v === 'all' ? '' : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Tutti gli stati" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli stati</SelectItem>
                <SelectItem value="DRAFT">Bozza</SelectItem>
                <SelectItem value="SUBMITTED">In attesa</SelectItem>
                <SelectItem value="VALIDATED">Validata</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={filter.dateFrom}
              onChange={(e) =>
                setFilter((prev) => ({ ...prev, dateFrom: e.target.value }))
              }
              placeholder="Da data"
            />

            <Input
              type="date"
              value={filter.dateTo}
              onChange={(e) =>
                setFilter((prev) => ({ ...prev, dateTo: e.target.value }))
              }
              placeholder="A data"
            />

            <Button
              variant="outline"
              onClick={() => setFilter({ status: '', dateFrom: '', dateTo: '' })}
            >
              Pulisci filtri
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Storico Chiusure</CardTitle>
          <CardDescription>
            {pagination.total} chiusure trovate
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              Caricamento...
            </div>
          ) : closures.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <FileText className="h-12 w-12 mb-4 opacity-50" />
              <p>Nessuna chiusura trovata</p>
              <Button asChild className="mt-4" variant="outline">
                <Link href="/chiusura-cassa/nuova">
                  <Plus className="mr-2 h-4 w-4" />
                  Crea la prima chiusura
                </Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    {isAdmin && <TableHead>Sede</TableHead>}
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Totale Lordo</TableHead>
                    <TableHead className="text-center">Postazioni</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closures.map((closure) => (
                    <TableRow key={closure.id}>
                      <TableCell className="font-medium">
                        {format(new Date(closure.date), 'EEEE d MMMM yyyy', {
                          locale: it,
                        })}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Badge variant="outline">{closure.venue.code}</Badge>
                        </TableCell>
                      )}
                      <TableCell>{getStatusBadge(closure.status)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(closure.grossTotal)}
                      </TableCell>
                      <TableCell className="text-center">
                        {closure.stationsCount}
                      </TableCell>
                      <TableCell>
                        {closure.isEvent ? (
                          <Badge variant="secondary">{closure.eventName || 'Evento'}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              Azioni
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/chiusura-cassa/${closure.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                Visualizza
                              </Link>
                            </DropdownMenuItem>
                            {closure.status === 'DRAFT' && (
                              <>
                                <DropdownMenuItem asChild>
                                  <Link
                                    href={`/chiusura-cassa/${closure.id}/modifica`}
                                  >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Modifica
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleSubmit(closure.id)}
                                >
                                  <Send className="mr-2 h-4 w-4" />
                                  Invia per validazione
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDelete(closure.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Elimina
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Pagina {pagination.page} di {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                  }
                  disabled={pagination.page === 1}
                >
                  Precedente
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
                  disabled={pagination.page === pagination.totalPages}
                >
                  Successiva
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
