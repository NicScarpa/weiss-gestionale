'use client'

/**
 * Invoice Detail - Complete invoice view with all XML parsed data
 * Displays: header, supplier/customer, causale, line items, VAT summary,
 * totals, payments with IBAN, categorization, SDI data, metadata
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, BookOpen, Loader2, AlertCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { AccountCombobox } from '@/components/prima-nota/shared/AccountCombobox'
import {
  CostCenterSelect,
  resolveCostCenterField,
  useCostCenters,
} from '@/components/prima-nota/shared/CostCenterSelect'
import { useAccountsForCombobox, buildCostCenterRuleMap } from '@/hooks/useImputableAccounts'

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
  /** Scadenze generate nello scadenzario: fonte di verità sui pagamenti */
  schedules?: Array<{
    id: string
    invoiceDeadlineId: string | null
    stato: string
    importoTotale: string | number
    importoPagato: string | number
  }>
  // Parsed XML data from API
  parsedData?: ParsedInvoiceData
}

async function fetchInvoice(id: string): Promise<Invoice> {
  const res = await fetch(`/api/invoices/${id}`)
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Errore caricamento')
  }
  return res.json()
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

async function recordInvoice(id: string, costCenterId?: string): Promise<unknown> {
  const res = await fetch(`/api/invoices/${id}/record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // costCenterId assente/undefined -> null esplicito: nessun centro
    // scelto qui, il server decide (default o errore se il conto lo richiede).
    body: JSON.stringify({ costCenterId: costCenterId ?? null }),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error || 'Errore registrazione')
  }
  return res.json()
}

interface RigheContiPayload {
  righe?: Array<{ numeroLinea: number; accountId: string }>
  confermaTutte?: boolean
}

async function updateRigheConti(id: string, data: RigheContiPayload): Promise<unknown> {
  const res = await fetch(`/api/invoices/${id}/righe-conti`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const errBody = await res.json()
    throw new Error(errBody.error || "Errore nell'imputazione della riga")
  }
  return res.json()
}

export function InvoiceDetail({ invoiceId }: InvoiceDetailProps) {
  const queryClient = useQueryClient()
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined)
  // Nessun costCenterId salvato sulla fattura: la scelta è effimera, fatta
  // qui subito prima della registrazione (non c'è un PUT che la persiste).
  const [costCenterId, setCostCenterId] = useState<string | undefined>(undefined)
  const [costCenterTouched, setCostCenterTouched] = useState(false)

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => fetchInvoice(invoiceId),
  })

  // Stessa chiave di query usata internamente da AccountCombobox
  // (types=['COSTO']): nessuna fetch duplicata, i dati servono qui sia per
  // calcolare il suggerimento del conto di default del fornitore sia (Task
  // 13) per sapere se il conto scelto richiede un centro di costo.
  const { data: accounts } = useAccountsForCombobox(['COSTO'])
  const costCenterRuleByAccountId = useMemo(
    () => buildCostCenterRuleMap(accounts ?? []),
    [accounts]
  )
  const costCenterRule = selectedAccountId
    ? costCenterRuleByAccountId.get(selectedAccountId)
    : undefined
  const isCostCenterRequired = costCenterRule === 'OBBLIGATORIO'

  const { data: costCenters = [] } = useCostCenters()
  const costCenterFieldState = resolveCostCenterField({
    rule: costCenterRule,
    currentValue: costCenterId,
    hasManualSelection: costCenterTouched,
    costCenters,
  })

  useEffect(() => {
    if (costCenterFieldState.value !== costCenterId) {
      setCostCenterId(costCenterFieldState.value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costCenterFieldState.value])

  // Il componente oggi viene sempre rimontato quando cambia invoiceId (unico
  // punto d'ingresso: /fatture/[id]), quindi questo reset non è ancora
  // osservabile. Lo aggiungiamo comunque perché la garanzia "non sovrascrivere
  // mai una scelta manuale" deve valere per il campo, non dipendere dalla
  // navigazione attuale: se in futuro comparisse un link "fattura successiva"
  // tra due pagine /fatture/[id], senza questo reset il centro scelto per una
  // fattura resterebbe preselezionato/bloccato su quella successiva.
  useEffect(() => {
    setCostCenterId(undefined)
    setCostCenterTouched(false)
  }, [invoiceId])

  // Set initial account when invoice loads
  useEffect(() => {
    if (invoice?.account) {
      queueMicrotask(() => setSelectedAccountId(invoice.account!.id))
    } else if (invoice) {
      queueMicrotask(() => setSelectedAccountId(undefined))
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
    mutationFn: () => recordInvoice(invoiceId, costCenterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
      toast.success('Fattura registrata in prima nota')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const righeContiMutation = useMutation({
    mutationFn: (data: RigheContiPayload) => updateRigheConti(invoiceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const handleAccountChange = (accountId: string | undefined) => {
    setSelectedAccountId(accountId)
    updateMutation.mutate({ accountId: accountId ?? null })
  }

  const handleLineAccountChange = (numeroLinea: number, accountId: string) => {
    righeContiMutation.mutate({ righe: [{ numeroLinea, accountId }] })
  }

  const handleConfirmAllLineAccounts = () => {
    righeContiMutation.mutate({ confermaTutte: true })
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
  const isCategorizedWithAccount = invoice.status === 'CATEGORIZED' && !!invoice.account
  // Il conto scelto richiede un centro di costo esplicito e non ne è stato
  // scelto uno: il bottone Registra resta visibile ma disabilitato, con un
  // tooltip che spiega perché (non lo si nasconde: l'utente deve capire cosa
  // manca, non chiedersi perché è sparito).
  const costCenterMissingButRequired = isCostCenterRequired && !costCenterId
  const parsedData = invoice.parsedData

  // ElectronicInvoice modella solo fatture ricevute (campi supplierId/
  // supplierVat/supplierName, nessun dato cliente): l'import da SDI mappa
  // sempre il cedentePrestatore sul fornitore. "Fatture Emesse" è un
  // placeholder non collegato al DB (src/app/(dashboard)/fatture/emesse),
  // quindi ogni fattura vista qui è passiva/ricevuta.
  const isPassiva = true

  // Suggerimento non salvato per le righe senza imputazione: usa la lista
  // conti già caricata per la Categorizzazione, nessuna fetch aggiuntiva.
  const defaultAccount = accounts?.find((a) => a.id === invoice.supplier?.defaultAccountId)
  const defaultAccountLabel = defaultAccount
    ? `${defaultAccount.code} - ${defaultAccount.name}`
    : undefined

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

        {isCategorizedWithAccount && (
          costCenterMissingButRequired ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Button disabled>
                    <BookOpen className="mr-2 h-4 w-4" />
                    Registra in Prima Nota
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Il conto di spesa selezionato richiede un centro di costo: assegnalo prima di registrare.
              </TooltipContent>
            </Tooltip>
          ) : (
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
          )
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
      <LineItemsTable
        dettaglioLinee={parsedData?.dettaglioLinee}
        showAccountColumn={isPassiva}
        canEditAccounts={canEdit && !righeContiMutation.isPending}
        defaultAccountLabel={defaultAccountLabel}
        onAccountChange={handleLineAccountChange}
        onConfirmAllAccounts={handleConfirmAllLineAccounts}
      />

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
        schedules={invoice.schedules}
      />

      {/* Categorization card */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-base">Categorizzazione</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Conto di spesa</label>
            <div className="max-w-md">
              <AccountCombobox
                value={selectedAccountId}
                onChange={handleAccountChange}
                types={['COSTO']}
                allowNone
                disabled={!canEdit || updateMutation.isPending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Centro di costo{isCostCenterRequired ? ' *' : ''}
            </label>
            <div className="max-w-md">
              <CostCenterSelect
                value={costCenterId}
                onChange={(value) => {
                  setCostCenterTouched(true)
                  setCostCenterId(value)
                }}
                required={isCostCenterRequired}
                disabled={!canEdit}
                hint={costCenterFieldState.hint}
              />
            </div>
            {costCenterMissingButRequired && (
              <p className="text-xs text-destructive">
                Il conto selezionato richiede un centro di costo per poter registrare la fattura.
              </p>
            )}
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
