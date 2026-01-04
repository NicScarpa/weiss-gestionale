'use client'

import { useState } from 'react'
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
  Check,
  AlertCircle,
  BookOpen,
  Trash2,
  Eye,
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

interface Invoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
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

const STATUS_LABELS: Record<string, string> = {
  IMPORTED: 'Importata',
  MATCHED: 'Fornitore',
  CATEGORIZED: 'Categorizzata',
  RECORDED: 'Registrata',
  PAID: 'Pagata',
}

const STATUS_COLORS: Record<string, string> = {
  IMPORTED: 'bg-slate-100 text-slate-700',
  MATCHED: 'bg-amber-100 text-amber-700',
  CATEGORIZED: 'bg-blue-100 text-blue-700',
  RECORDED: 'bg-green-100 text-green-700',
  PAID: 'bg-purple-100 text-purple-700',
}

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
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)

  const params = new URLSearchParams()
  params.set('page', page.toString())
  params.set('limit', '25')
  if (statusFilter !== 'all') {
    params.set('status', statusFilter)
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['invoices', statusFilter, page],
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

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(num)
  }

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="IMPORTED">Importate</SelectItem>
            <SelectItem value="MATCHED">Con fornitore</SelectItem>
            <SelectItem value="CATEGORIZED">Categorizzate</SelectItem>
            <SelectItem value="RECORDED">Registrate</SelectItem>
            <SelectItem value="PAID">Pagate</SelectItem>
          </SelectContent>
        </Select>

        {data?.pagination && (
          <p className="text-sm text-slate-500 ml-auto">
            {data.pagination.total} fatture totali
          </p>
        )}
      </div>

      {/* Tabella */}
      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Numero</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Fornitore</TableHead>
              <TableHead className="text-right">Importo</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Conto</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8" />
                  </TableCell>
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
              data?.data.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">
                    {invoice.invoiceNumber}
                  </TableCell>
                  <TableCell>
                    {format(new Date(invoice.invoiceDate), 'dd/MM/yyyy', {
                      locale: it,
                    })}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{invoice.supplierName}</div>
                      <div className="text-xs text-slate-500">
                        P.IVA: {invoice.supplierVat}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(invoice.totalAmount)}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[invoice.status]}>
                      {STATUS_LABELS[invoice.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {invoice.account ? (
                      <span className="text-sm">
                        {invoice.account.code} - {invoice.account.name}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400">
                        Non assegnato
                      </span>
                    )}
                  </TableCell>
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
              ))
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
