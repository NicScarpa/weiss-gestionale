'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  FileText,
  Upload,
  Search,
  Filter,
  MoreVertical,
  BookOpen,
  Trash2,
  Eye,
  ChevronUp,
  ChevronDown,
  Calendar,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { InvoiceImportDialog } from './InvoiceImportDialog'
import {
  getDocumentTypeAbbrev,
  getDocumentTypeColor,
  getSimpleStatus,
  formatCurrency,
  generateYearOptions,
  ITALIAN_MONTHS,
} from '@/lib/invoice-utils'

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useState(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  })

  // Use useCallback for proper debounce
  const [, setTimer] = useState<NodeJS.Timeout | null>(null)

  if (debouncedValue !== value) {
    setTimer((prevTimer) => {
      if (prevTimer) clearTimeout(prevTimer)
      const newTimer = setTimeout(() => setDebouncedValue(value), delay)
      return newTimer
    })
  }

  return debouncedValue
}

interface Invoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
  documentType: string | null
  supplierVat: string
  supplierName: string
  totalAmount: string
  vatAmount: string
  netAmount: string
  status: 'IMPORTED' | 'MATCHED' | 'CATEGORIZED' | 'RECORDED' | 'PAID'
  supplier?: {
    id: string
    name: string
    vatNumber: string
  } | null
  account?: {
    id: string
    code: string
    name: string
  } | null
  venue?: {
    id: string
    name: string
    code: string
  } | null
}

interface InvoicesResponse {
  data: Invoice[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

type SortField = 'documentType' | 'invoiceDate' | 'invoiceNumber' | 'supplierName' | 'totalAmount' | 'status'

async function fetchInvoices(params: URLSearchParams): Promise<InvoicesResponse> {
  const res = await fetch(`/api/invoices?${params.toString()}`)
  if (!res.ok) throw new Error('Errore nel caricamento fatture')
  return res.json()
}

async function deleteInvoice(id: string): Promise<void> {
  const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Errore eliminazione')
  }
}

async function recordInvoice(id: string): Promise<unknown> {
  const res = await fetch(`/api/invoices/${id}/record`, { method: 'POST' })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Errore registrazione')
  }
  return res.json()
}

export function InvoiceList() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  // Filtri
  const [searchInput, setSearchInput] = useState('')
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [monthFilter, setMonthFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Ordinamento
  const [sortBy, setSortBy] = useState<SortField>('invoiceDate')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Paginazione
  const [page, setPage] = useState(1)

  // Debounce search
  const debouncedSearch = useDebounce(searchInput, 300)

  // Costruisci parametri query
  const params = new URLSearchParams()
  params.set('page', page.toString())
  params.set('limit', '25')
  params.set('sortBy', sortBy)
  params.set('sortOrder', sortOrder)

  if (debouncedSearch.length >= 2) {
    params.set('search', debouncedSearch)
  }
  if (yearFilter !== 'all') {
    params.set('year', yearFilter)
  }
  if (monthFilter !== 'all') {
    params.set('month', monthFilter)
  }
  if (statusFilter !== 'all') {
    params.set('status', statusFilter)
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['invoices', debouncedSearch, yearFilter, monthFilter, statusFilter, sortBy, sortOrder, page],
    queryFn: () => fetchInvoices(params),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Fattura eliminata')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const recordMutation = useMutation({
    mutationFn: recordInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      toast.success('Fattura registrata in prima nota')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const handleImportSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
    setImportDialogOpen(false)
  }

  // Handler ordinamento colonne
  const handleSort = useCallback((field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
    setPage(1) // Reset pagina quando cambia ordinamento
  }, [sortBy])

  // Genera opzioni anni
  const yearOptions = generateYearOptions(5)

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold">Errore nel caricamento</h3>
        <p className="text-slate-500">
          {error instanceof Error ? error.message : 'Errore sconosciuto'}
        </p>
      </div>
    )
  }

  // Componente header ordinabile
  const SortableHeader = ({ field, label, className = '' }: { field: SortField; label: string; className?: string }) => {
    const isActive = sortBy === field
    return (
      <button
        className={`flex items-center gap-1 hover:text-slate-900 transition-colors ${className}`}
        onClick={() => handleSort(field)}
      >
        {label}
        {isActive && (
          sortOrder === 'asc'
            ? <ChevronUp className="h-4 w-4" />
            : <ChevronDown className="h-4 w-4" />
        )}
      </button>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fatture Elettroniche</h1>
          <p className="text-slate-500">Gestione fatture SDI</p>
        </div>
        <Button onClick={() => setImportDialogOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Importa Fattura
        </Button>
      </div>

      {/* Filtri */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center p-4 bg-slate-50 rounded-lg border">
        {/* Ricerca */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Cerca fornitore, numero..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value)
              setPage(1)
            }}
            className="pl-9 bg-white"
          />
        </div>

        {/* Filtro Anno */}
        <Select
          value={yearFilter}
          onValueChange={(v) => {
            setYearFilter(v)
            if (v === 'all') setMonthFilter('all')
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[140px] bg-white">
            <Calendar className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Anno" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli anni</SelectItem>
            {yearOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtro Mese */}
        <Select
          value={monthFilter}
          onValueChange={(v) => {
            setMonthFilter(v)
            setPage(1)
          }}
          disabled={yearFilter === 'all'}
        >
          <SelectTrigger className="w-[150px] bg-white">
            <SelectValue placeholder="Mese" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i mesi</SelectItem>
            {ITALIAN_MONTHS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Filtro Stato */}
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-[160px] bg-white">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="RECORDED">Registrate</SelectItem>
            <SelectItem value="not_recorded">Non registrate</SelectItem>
          </SelectContent>
        </Select>

        {/* Conteggio */}
        {data?.pagination && (
          <p className="text-sm text-slate-500 ml-auto">
            {data.pagination.total} fatture
          </p>
        )}
      </div>

      {/* Tabella */}
      <div className="rounded-lg border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-[80px]">
                <SortableHeader field="documentType" label="Doc" />
              </TableHead>
              <TableHead className="w-[110px]">
                <SortableHeader field="invoiceDate" label="Data" />
              </TableHead>
              <TableHead>
                <SortableHeader field="invoiceNumber" label="Numero" />
              </TableHead>
              <TableHead>
                <SortableHeader field="supplierName" label="Fornitore" />
              </TableHead>
              <TableHead className="text-right w-[130px]">
                <SortableHeader field="totalAmount" label="Importo" className="justify-end" />
              </TableHead>
              <TableHead className="w-[130px]">
                <SortableHeader field="status" label="Stato" />
              </TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <FileText className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">Nessuna fattura trovata</p>
                  <Button
                    variant="link"
                    onClick={() => setImportDialogOpen(true)}
                    className="mt-2"
                  >
                    Importa la prima fattura
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((invoice) => {
                const docType = invoice.documentType
                const simpleStatus = getSimpleStatus(invoice.status)

                return (
                  <TableRow key={invoice.id} className="hover:bg-slate-50">
                    {/* Tipo Documento */}
                    <TableCell>
                      <Badge className={getDocumentTypeColor(docType)}>
                        {getDocumentTypeAbbrev(docType)}
                      </Badge>
                    </TableCell>

                    {/* Data */}
                    <TableCell className="text-slate-600">
                      {format(new Date(invoice.invoiceDate), 'dd/MM/yyyy', { locale: it })}
                    </TableCell>

                    {/* Numero */}
                    <TableCell className="font-medium">
                      {invoice.invoiceNumber}
                    </TableCell>

                    {/* Fornitore - SOLO NOME */}
                    <TableCell>
                      {invoice.supplierName}
                    </TableCell>

                    {/* Importo */}
                    <TableCell className="text-right font-medium">
                      {formatCurrency(invoice.totalAmount)}
                    </TableCell>

                    {/* Stato Semplificato */}
                    <TableCell>
                      <Badge className={simpleStatus.color}>
                        {simpleStatus.label}
                      </Badge>
                    </TableCell>

                    {/* Azioni */}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/fatture/${invoice.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              Visualizza
                            </Link>
                          </DropdownMenuItem>
                          {invoice.status === 'CATEGORIZED' && (
                            <DropdownMenuItem
                              onClick={() => recordMutation.mutate(invoice.id)}
                              disabled={recordMutation.isPending}
                            >
                              <BookOpen className="mr-2 h-4 w-4" />
                              Registra in Prima Nota
                            </DropdownMenuItem>
                          )}
                          {invoice.status !== 'RECORDED' &&
                            invoice.status !== 'PAID' &&
                            session?.user?.role === 'admin' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        'Sei sicuro di voler eliminare questa fattura?'
                                      )
                                    ) {
                                      deleteMutation.mutate(invoice.id)
                                    }
                                  }}
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
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Paginazione */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Precedente
          </Button>
          <span className="text-sm text-slate-500">
            Pagina {page} di {data.pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setPage((p) => Math.min(data.pagination.totalPages, p + 1))
            }
            disabled={page === data.pagination.totalPages}
          >
            Successiva
          </Button>
        </div>
      )}

      {/* Dialog import */}
      <InvoiceImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={handleImportSuccess}
      />
    </div>
  )
}
