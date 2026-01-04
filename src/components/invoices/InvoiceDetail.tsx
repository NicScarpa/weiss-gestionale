'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ArrowLeft,
  Building2,
  FileText,
  CreditCard,
  BookOpen,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useState, useEffect } from 'react'

interface InvoiceDetailProps {
  invoiceId: string
}

interface Invoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
  supplierVat: string
  supplierName: string
  totalAmount: string
  vatAmount: string
  netAmount: string
  status: string
  fileName?: string
  notes?: string
  importedAt: string
  processedAt?: string
  recordedAt?: string
  supplier?: {
    id: string
    name: string
    vatNumber: string
    fiscalCode?: string
    address?: string
    city?: string
    defaultAccountId?: string
  } | null
  account?: {
    id: string
    code: string
    name: string
    type: string
  } | null
  venue?: {
    id: string
    name: string
    code: string
  } | null
  journalEntry?: {
    id: string
    date: string
    description: string
    creditAmount?: string
  } | null
  deadlines: Array<{
    id: string
    dueDate: string
    amount: string
    isPaid: boolean
    paymentMethod?: string
  }>
}

interface Account {
  id: string
  code: string
  name: string
  type: string
}

const STATUS_LABELS: Record<string, string> = {
  IMPORTED: 'Importata',
  MATCHED: 'Con Fornitore',
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

async function fetchInvoice(id: string): Promise<Invoice> {
  const res = await fetch(`/api/invoices/${id}`)
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Errore caricamento')
  }
  return res.json()
}

async function fetchAccounts(): Promise<Account[]> {
  const res = await fetch('/api/accounts?type=COSTO')
  if (!res.ok) throw new Error('Errore caricamento conti')
  const data = await res.json()
  return data.accounts || []
}

async function updateInvoice(id: string, data: Record<string, unknown>): Promise<Invoice> {
  const res = await fetch(`/api/invoices/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Errore aggiornamento')
  }
  return res.json()
}

async function recordInvoice(id: string): Promise<unknown> {
  const res = await fetch(`/api/invoices/${id}/record`, { method: 'POST' })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Errore registrazione')
  }
  return res.json()
}

export function InvoiceDetail({ invoiceId }: InvoiceDetailProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => fetchInvoice(invoiceId),
  })

  const { data: accounts } = useQuery({
    queryKey: ['accounts-cost'],
    queryFn: fetchAccounts,
  })

  // Set initial account when invoice loads
  useEffect(() => {
    if (invoice?.account) {
      setSelectedAccountId(invoice.account.id)
    } else if (invoice) {
      setSelectedAccountId('_none')
    }
  }, [invoice])

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => updateInvoice(invoiceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
      toast.success('Fattura aggiornata')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const recordMutation = useMutation({
    mutationFn: () => recordInvoice(invoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
      toast.success('Fattura registrata in prima nota')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId)
    updateMutation.mutate({ accountId: accountId === '_none' ? null : accountId || null })
  }

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(num)
  }

  if (isLoading) {
    return (
      <div className="container py-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="container py-6">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h3 className="text-lg font-semibold">Errore</h3>
          <p className="text-slate-500">
            {error instanceof Error ? error.message : 'Fattura non trovata'}
          </p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/fatture">Torna alla lista</Link>
          </Button>
        </div>
      </div>
    )
  }

  const canEdit = invoice.status !== 'RECORDED' && invoice.status !== 'PAID'
  const canRecord = invoice.status === 'CATEGORIZED' && invoice.account

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/fatture">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">
              Fattura {invoice.invoiceNumber}
            </h1>
            <Badge className={STATUS_COLORS[invoice.status]}>
              {STATUS_LABELS[invoice.status]}
            </Badge>
          </div>
          <p className="text-slate-500">
            {format(new Date(invoice.invoiceDate), 'dd MMMM yyyy', {
              locale: it,
            })}
          </p>
        </div>
        {canRecord && (
          <Button
            onClick={() => recordMutation.mutate()}
            disabled={recordMutation.isPending}
          >
            {recordMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Registrazione...
              </>
            ) : (
              <>
                <BookOpen className="mr-2 h-4 w-4" />
                Registra in Prima Nota
              </>
            )}
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Fornitore */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Fornitore
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="font-medium text-lg">{invoice.supplierName}</p>
              <p className="text-slate-500">P.IVA: {invoice.supplierVat}</p>
            </div>
            {invoice.supplier && (
              <>
                {invoice.supplier.address && (
                  <p className="text-sm text-slate-500">
                    {invoice.supplier.address}
                    {invoice.supplier.city && `, ${invoice.supplier.city}`}
                  </p>
                )}
                <Badge variant="outline" className="mt-2">
                  <Check className="h-3 w-3 mr-1" />
                  Fornitore registrato
                </Badge>
              </>
            )}
          </CardContent>
        </Card>

        {/* Importi */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Importi
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-slate-500">Imponibile</span>
              <span>{formatCurrency(invoice.netAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">IVA</span>
              <span>{formatCurrency(invoice.vatAmount)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-medium">
              <span>Totale</span>
              <span>{formatCurrency(invoice.totalAmount)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Categorizzazione */}
        <Card>
          <CardHeader>
            <CardTitle>Categorizzazione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Conto di spesa</label>
              <Select
                value={selectedAccountId}
                onValueChange={handleAccountChange}
                disabled={!canEdit || updateMutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona conto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Nessun conto</SelectItem>
                  {accounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {invoice.journalEntry && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-800">
                  Registrata in Prima Nota
                </p>
                <p className="text-xs text-green-600">
                  {format(new Date(invoice.journalEntry.date), 'dd/MM/yyyy', {
                    locale: it,
                  })}{' '}
                  - {invoice.journalEntry.description}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scadenze */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Scadenze
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invoice.deadlines.length === 0 ? (
              <p className="text-slate-500 text-sm">Nessuna scadenza</p>
            ) : (
              <div className="space-y-2">
                {invoice.deadlines.map((deadline) => (
                  <div
                    key={deadline.id}
                    className="flex justify-between items-center p-2 bg-slate-50 rounded"
                  >
                    <div>
                      <p className="font-medium">
                        {format(new Date(deadline.dueDate), 'dd/MM/yyyy', {
                          locale: it,
                        })}
                      </p>
                      {deadline.paymentMethod && (
                        <p className="text-xs text-slate-500">
                          {deadline.paymentMethod}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {formatCurrency(deadline.amount)}
                      </p>
                      {deadline.isPaid ? (
                        <Badge className="bg-green-100 text-green-700">
                          Pagato
                        </Badge>
                      ) : (
                        <Badge variant="outline">Da pagare</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Informazioni</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 text-sm">
            <div>
              <p className="text-slate-500">Sede</p>
              <p className="font-medium">{invoice.venue?.name}</p>
            </div>
            <div>
              <p className="text-slate-500">Importata il</p>
              <p className="font-medium">
                {format(new Date(invoice.importedAt), 'dd/MM/yyyy HH:mm', {
                  locale: it,
                })}
              </p>
            </div>
            {invoice.fileName && (
              <div>
                <p className="text-slate-500">File originale</p>
                <p className="font-medium">{invoice.fileName}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
