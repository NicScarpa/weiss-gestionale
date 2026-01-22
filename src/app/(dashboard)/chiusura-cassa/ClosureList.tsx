'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus,
  Filter,
  Pencil,
  CheckCircle2,
  Clock,
  FileText,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
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
import { formatCurrency } from '@/lib/constants'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { DeleteClosureDialog } from '@/components/chiusura/DeleteClosureDialog'
import { BulkDeleteClosuresDialog } from '@/components/chiusura/BulkDeleteClosuresDialog'

import { logger } from '@/lib/logger'
interface Station {
  id: string
  name: string
  totalAmount: number
}

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
  stations?: Station[]
}

// Formatta data in formato compatto: "SAB 03/01/26"
const formatDateCompact = (dateStr: string) => {
  const days = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB']
  const d = new Date(dateStr)
  const day = days[d.getDay()]
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)
  return `${day} ${dd}/${mm}/${yy}`
}

// Ottieni nomi postazioni movimentate
const getActiveStationNames = (stations?: Station[]) => {
  if (!stations || stations.length === 0) return '-'
  const active = stations.filter(s => s.totalAmount > 0)
  if (active.length === 0) return '-'
  return active.map(s => s.name).join(', ')
}

interface ClosureListProps {
  venueId?: string
  isAdmin: boolean
}

export function ClosureList({ venueId, isAdmin }: ClosureListProps) {
  const router = useRouter()
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

  // Selezione multipla
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  // Fetch closures - useCallback per evitare loop infiniti
  const fetchClosures = useCallback(async () => {
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
      // Reset selezioni quando cambiano i dati
      setSelectedIds(new Set())
    } catch (error) {
      logger.error('Errore fetch chiusure', error)
      toast.error('Errore nel caricamento delle chiusure')
    } finally {
      setLoading(false)
    }
  }, [venueId, filter.status, filter.dateFrom, filter.dateTo, pagination.page, pagination.limit])

  useEffect(() => {
    fetchClosures()
  }, [fetchClosures])

  // Gestione selezione
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === closures.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(closures.map((c) => c.id)))
    }
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  // Verifica se ci sono chiusure validate tra le selezionate
  const hasValidatedSelected = closures
    .filter((c) => selectedIds.has(c.id))
    .some((c) => c.status === 'VALIDATED')

  // Status icon (solo icona senza testo)
  const getStatusIcon = (status: Closure['status']) => {
    switch (status) {
      case 'DRAFT':
        return (
          <span title="Bozza">
            <FileText className="h-5 w-5 text-amber-500" />
          </span>
        )
      case 'SUBMITTED':
        return (
          <span title="In attesa di validazione">
            <Clock className="h-5 w-5 text-orange-500" />
          </span>
        )
      case 'VALIDATED':
        return (
          <span title="Validata">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </span>
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

      {/* Barra azioni selezione */}
      {selectedIds.size > 0 && isAdmin && (
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg border">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {selectedIds.size} {selectedIds.size === 1 ? 'chiusura selezionata' : 'chiusure selezionate'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="h-8"
            >
              <X className="h-4 w-4 mr-1" />
              Deseleziona
            </Button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Elimina selezionate
          </Button>
        </div>
      )}

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
                    {isAdmin && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedIds.size === closures.length && closures.length > 0}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Seleziona tutto"
                        />
                      </TableHead>
                    )}
                    <TableHead>Data</TableHead>
                    {isAdmin && <TableHead>Sede</TableHead>}
                    <TableHead className="text-right">Incasso</TableHead>
                    <TableHead>Postazioni</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="w-10"></TableHead>
                    {isAdmin && <TableHead className="w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closures.map((closure) => (
                    <TableRow
                      key={closure.id}
                      className={`cursor-pointer hover:bg-muted/50 ${
                        selectedIds.has(closure.id) ? 'bg-muted/30' : ''
                      }`}
                      onClick={() => router.push(`/chiusura-cassa/${closure.id}`)}
                    >
                      {isAdmin && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(closure.id)}
                            onCheckedChange={() => toggleSelection(closure.id)}
                            aria-label={`Seleziona chiusura ${formatDateCompact(closure.date)}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">
                        {formatDateCompact(closure.date)}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Badge variant="outline">{closure.venue.code}</Badge>
                        </TableCell>
                      )}
                      <TableCell className="text-right font-mono">
                        {formatCurrency(closure.grossTotal)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {getActiveStationNames(closure.stations)}
                      </TableCell>
                      <TableCell>
                        {closure.isEvent ? (
                          <Badge variant="secondary">{closure.eventName || 'Evento'}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {(closure.status === 'DRAFT' || isAdmin) && (
                          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                            <Link href={`/chiusura-cassa/${closure.id}/modifica`}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusIcon(closure.status)}
                      </TableCell>
                      {isAdmin && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DeleteClosureDialog
                            closureId={closure.id}
                            closureDate={closure.date}
                            closureStatus={closure.status}
                            onDeleted={() => {
                              toast.success('Chiusura eliminata')
                              fetchClosures()
                            }}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            }
                          />
                        </TableCell>
                      )}
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

      {/* Dialog eliminazione multipla */}
      <BulkDeleteClosuresDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        selectedIds={Array.from(selectedIds)}
        hasValidated={hasValidatedSelected}
        onDeleted={() => {
          toast.success(`${selectedIds.size} chiusure eliminate`)
          setSelectedIds(new Set())
          fetchClosures()
        }}
      />
    </>
  )
}
