'use client'

/**
 * Invoice Detail - Complete invoice view with all XML parsed data
 * Displays: header, supplier/customer, causale, line items, VAT summary,
 * totals, payments with IBAN, categorization, SDI data, metadata
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { ArrowLeft, BookOpen, Loader2, AlertCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

import {
  DocumentInfoSection,
  SupplierSection,
  CustomerSection,
  CausaleSection,
  LineItemsTable,
  VATSummaryTable,
  DocumentTotalsSection,
  BolloSection,
  PaymentSection,
  TransmissionDataSection,
  MetadataSection,
  type ParsedInvoiceData,
} from './InvoiceDetailSections'

interface InvoiceDetailProps {
  invoiceId: string
}

interface Invoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
  documentType?: string
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
    province?: string
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
    iban?: string
  }>
  // Parsed XML data from API
  parsedData?: ParsedInvoiceData
}

interface Account {
  id: string
  code: string
  name: string
  type: string
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
      queueMicrotask(() => setSelectedAccountId(invoice.account!.id))
    } else if (invoice) {
      queueMicrotask(() => setSelectedAccountId('_none'))
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

  // Loading state
  if (isLoading) {
    return (
      <div className="container py-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  // Error state
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
  const parsedData = invoice.parsedData

  return (
    <div className="container py-6 space-y-6">
      {/* Header with back button and actions */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" className="mt-1" asChild>
          <Link href="/fatture">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>

        <div className="flex-1">
          <DocumentInfoSection
            invoiceNumber={invoice.invoiceNumber}
            invoiceDate={invoice.invoiceDate}
            documentType={invoice.documentType || parsedData?.tipoDocumento}
            status={invoice.status}
          />
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

      {/* Supplier and Customer cards - side by side on desktop */}
      <div className="grid gap-6 md:grid-cols-2">
        <SupplierSection
          supplierName={invoice.supplierName}
          supplierVat={invoice.supplierVat}
          cedentePrestatore={parsedData?.cedentePrestatore}
          isRegistered={!!invoice.supplier}
        />

        <CustomerSection
          cessionarioCommittente={parsedData?.cessionarioCommittente}
          codiceDestinatario={parsedData?.codiceDestinatario}
        />
      </div>

      {/* Causale (if present) */}
      <CausaleSection causale={parsedData?.causale} />

      {/* Line items table */}
      <LineItemsTable dettaglioLinee={parsedData?.dettaglioLinee} />

      {/* VAT Summary and Totals - side by side */}
      <div className="grid gap-6 md:grid-cols-2">
        <VATSummaryTable datiRiepilogo={parsedData?.datiRiepilogo} />

        <div className="space-y-6">
          <DocumentTotalsSection
            netAmount={invoice.netAmount}
            vatAmount={invoice.vatAmount}
            totalAmount={invoice.totalAmount}
            datiBollo={parsedData?.datiBollo}
            arrotondamento={parsedData?.arrotondamento}
          />

          <BolloSection datiBollo={parsedData?.datiBollo} />
        </div>
      </div>

      {/* Payment section with IBAN */}
      <PaymentSection
        datiPagamento={parsedData?.datiPagamento}
        deadlines={invoice.deadlines}
      />

      {/* Categorization card */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-base">Categorizzazione</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Conto di spesa</label>
            <Select
              value={selectedAccountId}
              onValueChange={handleAccountChange}
              disabled={!canEdit || updateMutation.isPending}
            >
              <SelectTrigger className="max-w-md">
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
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg max-w-md">
              <p className="text-sm font-medium text-green-800">
                ✓ Registrata in Prima Nota
              </p>
              <p className="text-xs text-green-600">
                {invoice.journalEntry.description}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SDI Transmission Data */}
      <TransmissionDataSection
        progressivoInvio={parsedData?.progressivoInvio}
        formatoTrasmissione={parsedData?.formatoTrasmissione}
        pecDestinatario={parsedData?.pecDestinatario}
        codiceDestinatario={parsedData?.codiceDestinatario}
      />

      {/* Metadata */}
      <MetadataSection
        venueName={invoice.venue?.name}
        importedAt={invoice.importedAt}
        fileName={invoice.fileName}
        recordedAt={invoice.recordedAt}
        journalEntryDescription={invoice.journalEntry?.description}
      />
    </div>
  )
}
