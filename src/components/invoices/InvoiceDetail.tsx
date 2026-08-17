'use client'

/**
 * Invoice Detail - Complete invoice view with all XML parsed data
 * Displays: header, supplier/customer, causale, line items, VAT summary,
 * totals, payments with IBAN, categorization, SDI data, metadata
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, AlertCircle, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { AccountCombobox } from '@/components/prima-nota/shared/AccountCombobox'
import {
  CostCenterSelect,
  resolveCostCenterField,
  useCostCenters,
} from '@/components/prima-nota/shared/CostCenterSelect'
import { useAccountsForCombobox, buildCostCenterRuleMap } from '@/hooks/useImputableAccounts'
import { CONTO_PROPOSTO_BOLLO, LINEA_BOLLO } from '@/lib/sdi/righe-di-sistema'
import { SegnaComePagataDialog } from './SegnaComePagataDialog'

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
  AvvisoRiallineamento,
  type ParsedInvoiceData,
  type DivergenzaFattura,
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
    dataScadenza?: string
    descrizione?: string
  }>
  // Parsed XML data from API
  parsedData?: ParsedInvoiceData
  /** Task 10: movimenti collegati le cui fette raccontano un'imputazione superata (spec sez. 2). */
  divergenze?: DivergenzaFattura[]
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

interface RigheContiPayload {
  // numeroLinea accetta anche i numeri riservati delle righe di sistema
  // (LINEA_BOLLO = -1, LINEA_ARROTONDAMENTO = -2, in
  // src/lib/sdi/righe-di-sistema.ts): sono `number` come le righe vere,
  // nessuna forma diversa serve per salvarne il conto.
  // `progressivo` e `importo` sono opzionali: assenti per una riga a quota
  // singola (il server ricava tutto dal documento), presenti insieme per
  // ogni quota di una riga divisa (Task 9) — vedi RigaDivisibile.onSalva,
  // che li valorizza sempre entrambi o nessuno dei due.
  righe?: Array<{ numeroLinea: number; accountId: string; progressivo?: number; importo?: number }>
  confermaTutte?: boolean
}

/**
 * Il bollo da includere in "Accetta tutte", se ha ancora bisogno di un
 * conto. Pura e esportata per essere testata da sola (stesso schema di
 * `groupByMastro` in `AccountCombobox.tsx`): montare l'intero `InvoiceDetail`
 * per verificare questa sola decisione richiederebbe mock di tre fetch
 * (fattura, conti, centri di costo) per una logica che non ne fa uso diretto.
 *
 * `righeSistema` può essere `undefined` (fattura ancora in caricamento, o
 * senza XML leggibile): in quel caso non c'è nulla da proporre, non un
 * errore da sollevare.
 */
export function rigaBolloDaConfermare(
  righeSistema: ParsedInvoiceData['righeSistema'],
  contoBolloId: string | undefined
): Array<{ numeroLinea: number; accountId: string }> {
  const rigaBollo = righeSistema?.find((r) => r.numeroLinea === LINEA_BOLLO)
  if (!rigaBollo || rigaBollo.imputazioni.length > 0 || !contoBolloId) return []
  return [{ numeroLinea: LINEA_BOLLO, accountId: contoBolloId }]
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

/**
 * Task 10: chiama la rotta di riallineamento (Task 7) sul MOVIMENTO
 * divergente, non sulla fattura — `journalEntryId` viene da `divergenze`,
 * calcolato dal server in `/api/invoices/[id]`. Il 409 (già allineato, o
 * mai coperto per intero) e il 422 (fattura non rigenerabile: righe non
 * confermate, capienza superata, nota di credito non imputata per intero)
 * arrivano qui con lo stesso messaggio che la rotta scrive per l'utente:
 * non si riscrive un testo diverso, si inoltra il suo.
 */
async function riallineaMovimento(journalEntryId: string): Promise<{ fette: number; message: string }> {
  const res = await fetch(`/api/prima-nota/${journalEntryId}/riallinea`, { method: 'POST' })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || 'Errore nel riallineamento delle fette')
  }
  return data
}

export function InvoiceDetail({ invoiceId }: InvoiceDetailProps) {
  const queryClient = useQueryClient()
  // Finché l'utente non sceglie, vale il conto della fattura: è un valore
  // derivato dal dato caricato, non uno stato da riallineare con un effetto.
  // `null` significa «non ha ancora scelto»; `undefined` è una scelta vera —
  // «nessun conto» — perché è così che AccountCombobox esprime il vuoto.
  //
  // Le scelte viaggiano insieme all'id della fattura su cui sono state fatte.
  // Oggi il componente si rimonta a ogni cambio di `invoiceId` (unico punto
  // d'ingresso: /fatture/[id]) e la distinzione non è osservabile, ma la
  // garanzia «non sovrascrivere mai una scelta manuale, e non ereditarla dalla
  // fattura precedente» deve valere per il campo, non dipendere da come si
  // naviga oggi: se comparisse un link «fattura successiva» fra due pagine
  // /fatture/[id], il centro scelto per una resterebbe appiccicato all'altra.
  // Portare l'id dentro lo stato lo risolve durante il render, dove prima
  // serviva un effetto che azzerava tutto — e un render in più a ogni cambio.
  //
  // `conto: null` significa «non ha ancora scelto»; `undefined` è una scelta
  // vera — «nessun conto» — perché è così che AccountCombobox esprime il vuoto.
  // Il centro invece non è salvato sulla fattura: la scelta è effimera, fatta
  // qui subito prima della registrazione (non c'è un PUT che la persiste).
  const nessunaScelta = {
    invoiceId,
    conto: null as string | null | undefined,
    centro: undefined as string | undefined,
    centroToccato: false,
  }
  const [scelte, setScelte] = useState(nessunaScelta)
  const [segnaPagataAperto, setSegnaPagataAperto] = useState(false)
  const correnti = scelte.invoiceId === invoiceId ? scelte : nessunaScelta

  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => fetchInvoice(invoiceId),
    // La categorizzazione delle righe non è più attesa dall'import: la
    // fattura si salva subito e le imputazioni arrivano poco dopo. Finché non
    // ce n'è nemmeno una, si ricontrolla ogni pochi secondi così compaiono da
    // sole, senza che nessuno debba ricaricare la pagina.
    //
    // Il controllo si ferma da solo: se dopo un minuto non è arrivato niente,
    // vuol dire che non arriverà (nessun conto di costo configurato, chiave
    // assente, servizio giù) e continuare a interrogare il server non serve.
    refetchInterval: (query) => {
      const dati = query.state.data as Invoice | undefined
      const righe = dati?.parsedData?.dettaglioLinee
      if (!righe?.length) return false
      if (righe.some((r) => r.imputazioni.length > 0)) return false
      if (query.state.dataUpdateCount > 20) return false
      return 3000
    },
  })

  // Conto della fattura finché l'utente non ne sceglie un altro. Il confronto
  // è con `null` e non con `??`: `undefined` è una scelta («nessun conto») e
  // non deve far ricadere il campo sul conto salvato.
  const selectedAccountId =
    correnti.conto !== null ? correnti.conto : invoice?.account?.id

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
    currentValue: correnti.centro,
    hasManualSelection: correnti.centroToccato,
    costCenters,
  })

  // Il valore risolto *è* il valore del campo: prima veniva ricopiato nello
  // stato da un effetto, che a ogni cambio di conto faceva ridisegnare il
  // componente una seconda volta per arrivare allo stesso numero.
  const costCenterId = costCenterFieldState.value

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

  const righeContiMutation = useMutation({
    mutationFn: (data: RigheContiPayload) => updateRigheConti(invoiceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // Task 10: invalidare la fattura dopo un riallineamento riuscito rilegge
  // `divergenze` dal server — che con le fette appena rigenerate torna vuoto
  // per quel movimento — ed è così che l'avviso sparisce, non con uno stato
  // locale da tenere sincronizzato a mano.
  const riallineaMutation = useMutation({
    mutationFn: riallineaMovimento,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
      // "sul movimento", non "di questa fattura": il riallineamento è per
      // MOVIMENTO (Task 7). Su un bonifico cumulativo che salda anche
      // un'altra fattura divergente, `data.fette` conta anche le sue —
      // dire "di questa fattura" qui affermerebbe un ambito che il numero
      // non rispetta.
      const fetteLabel = data.fette === 1 ? '1 fetta rigenerata' : `${data.fette} fette rigenerate`
      toast.success(`${data.message} — ${fetteLabel} sul movimento`)
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  const handleAccountChange = (accountId: string | undefined) => {
    setScelte({ ...correnti, invoiceId, conto: accountId })
    updateMutation.mutate({ accountId: accountId ?? null })
  }

  const handleLineAccountChange = (numeroLinea: number, accountId: string) => {
    righeContiMutation.mutate({ righe: [{ numeroLinea, accountId }] })
  }

  // Task 9: RigaDivisibile passa SEMPRE l'insieme completo delle quote della
  // riga divisa (mai una alla volta) — è la stessa mutation di
  // handleLineAccountChange, il server distingue una riga a quota singola da
  // una divisa dal numero di elementi con lo stesso numeroLinea nella
  // richiesta (righe-conti/route.ts). Un rifiuto (400: somma che non
  // quadra) arriva qui come in ogni altro uso della mutation: onError già
  // lo mostra con toast.error, nessuna gestione dedicata da aggiungere.
  const handleSplitSave = (
    numeroLinea: number,
    quote: Array<{ progressivo: number; accountId: string; importo: number }>
  ) => {
    righeContiMutation.mutate({
      righe: quote.map((q) => ({
        numeroLinea,
        progressivo: q.progressivo,
        accountId: q.accountId,
        importo: q.importo,
      })),
    })
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

  const canEdit = invoice.status !== 'PAID'
  const scadenzeAperte = (invoice.schedules ?? []).filter(
    (s) => s.stato !== 'pagata' && s.stato !== 'annullata'
  )
  // Il conto scelto richiede un centro di costo esplicito e non ne è stato
  // scelto uno: si segnala sotto la tendina invece di lasciar salvare in
  // silenzio un'imputazione che il piano dei conti rifiuterebbe.
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

  // Stesso principio per il bollo: CONTO_PROPOSTO_BOLLO è un codice
  // (30.01), il conto stesso serve per mostrare "codice - nome" in
  // tendina. È di tipo COSTO (piano v4, famiglia E), quindi già dentro la
  // lista sopra: nessuna fetch dedicata.
  const contoBollo = accounts?.find((a) => a.code === CONTO_PROPOSTO_BOLLO)
  const defaultBolloAccountLabel = contoBollo
    ? `${contoBollo.code} - ${contoBollo.name}`
    : undefined

  // Il bollo non ha mai una vera imputazione 'proposta' salvata (Task 8: solo
  // un suggerimento in tendina, non una InvoiceLineAccount): "Accetta tutte",
  // che sul server aggiorna solo le righe già in stato 'proposta', altrimenti
  // non lo toccherebbe mai — l'utente dovrebbe aprire quella tendina a mano
  // su ogni fattura col bollo. La si include qui nella stessa richiesta.
  const bolloDaProporre = rigaBolloDaConfermare(parsedData?.righeSistema, contoBollo?.id)

  const handleConfirmAllLineAccounts = () => {
    righeContiMutation.mutate({
      confermaTutte: true,
      ...(bolloDaProporre.length > 0 && { righe: bolloDaProporre }),
    })
  }

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

        {/* Non compare senza rate aperte: nota di credito, documento di
            rettifica o fattura già saldata non hanno nulla da saldare. */}
        {scadenzeAperte.length > 0 && (
          <Button onClick={() => setSegnaPagataAperto(true)}>
            <Wallet className="mr-2 h-4 w-4" />
            Segna come pagata
          </Button>
        )}
      </div>

      <SegnaComePagataDialog
        invoiceId={invoiceId}
        schedules={invoice.schedules ?? []}
        open={segnaPagataAperto}
        onOpenChange={setSegnaPagataAperto}
      />

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

      {/* Task 10: avviso di divergenza e pulsante Riallinea, sopra la tabella
          che ha causato l'imputazione superata */}
      <AvvisoRiallineamento
        divergenze={invoice.divergenze ?? []}
        onRiallinea={(journalEntryId) => riallineaMutation.mutate(journalEntryId)}
        journalEntryIdInCorso={riallineaMutation.isPending ? riallineaMutation.variables : null}
      />

      {/* Line items table */}
      <LineItemsTable
        dettaglioLinee={parsedData?.dettaglioLinee}
        righeSistema={parsedData?.righeSistema}
        showAccountColumn={isPassiva}
        canEditAccounts={canEdit && !righeContiMutation.isPending}
        defaultAccountLabel={defaultAccountLabel}
        defaultBolloAccountLabel={defaultBolloAccountLabel}
        totaleDocumento={invoice.totalAmount}
        onAccountChange={handleLineAccountChange}
        onConfirmAllAccounts={handleConfirmAllLineAccounts}
        onSplitSave={handleSplitSave}
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
                  setScelte({ ...correnti, invoiceId, centro: value, centroToccato: true })
                }}
                required={isCostCenterRequired}
                disabled={!canEdit}
                hint={costCenterFieldState.hint}
              />
            </div>
            {costCenterMissingButRequired && (
              <p className="text-xs text-destructive">
                Il conto selezionato richiede un centro di costo: assegnalo per completare l&apos;imputazione.
              </p>
            )}
          </div>

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
      />
    </div>
  )
}
