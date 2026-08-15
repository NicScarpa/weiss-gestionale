'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ReconciliationSummaryCards,
  BankTransactionTable,
  ImportDialog,
  MatchDialog,
  TransactionDetailsDialog,
} from '@/components/reconciliation'
import { toast } from 'sonner'
import { Upload, RefreshCw, Play } from 'lucide-react'
import type {
  ReconciliationSummary,
  BankTransactionWithMatch,
  ReconciliationStatus,
} from '@/types/reconciliation'

import { logger } from '@/lib/logger'
import { FreschezzaMovimenti } from '@/components/banca/FreschezzaMovimenti'

type StatusFilter = 'all' | ReconciliationStatus

export function RiconciliazioneClient() {
  // Sede unica dell'installazione: l'API ne restituisce una sola
  // (architettura single-venue, vedi src/lib/venue.ts)
  const { data: sedi, isError: erroreSedi, error: erroreSediDettaglio } = useQuery({
    // Come prima del passaggio a TanStack Query: ogni montaggio ricarica.
    refetchOnMount: 'always',
    staleTime: 0,
    queryKey: ['venues'],
    queryFn: async (): Promise<{ venues?: Array<{ id: string; isActive?: boolean }>; data?: Array<{ id: string; isActive?: boolean }> }> => {
      const res = await fetch('/api/venues')
      return res.json()
    },
  })

  useEffect(() => {
    if (erroreSedi) logger.error('Impossibile caricare la sede', erroreSediDettaglio)
  }, [erroreSedi, erroreSediDettaglio])

  const venues = sedi?.venues ?? sedi?.data ?? []
  const venueId = (venues.find(v => v.isActive !== false) ?? venues[0])?.id ?? ''

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [importOpen, setImportOpen] = useState(false)
  const [matchTransactionId, setMatchTransactionId] = useState<string | null>(null)
  const [detailsTransactionId, setDetailsTransactionId] = useState<string | null>(null)
  const [reconciling, setReconciling] = useState(false)

  const {
    data: dati,
    isPending,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    // Come prima del passaggio a TanStack Query: ogni montaggio ricarica.
    refetchOnMount: 'always',
    staleTime: 0,
    queryKey: ['riconciliazione', venueId, statusFilter],
    enabled: !!venueId,
    queryFn: async (): Promise<{
      summary: ReconciliationSummary
      transactions: BankTransactionWithMatch[]
    }> => {
      // Load summary and transactions in parallel
      const [summaryRes, transactionsRes] = await Promise.all([
        fetch(`/api/reconciliation/summary?venueId=${venueId}`),
        fetch(
          `/api/bank-transactions?venueId=${venueId}${statusFilter !== 'all' ? `&status=${statusFilter}` : ''
          }&limit=100`
        ),
      ])

      if (!summaryRes.ok || !transactionsRes.ok) {
        throw new Error('Errore nel caricamento dati')
      }

      const [summaryData, transactionsData] = await Promise.all([
        summaryRes.json(),
        transactionsRes.json(),
      ])

      return { summary: summaryData, transactions: transactionsData.data || [] }
    },
  })

  useEffect(() => {
    if (isError) {
      logger.error('Load error', error)
      toast.error('Errore nel caricamento dati')
    }
  }, [isError, error])

  const summary = dati?.summary ?? null
  const transactions = dati?.transactions ?? []
  // Finché la sede non è nota la query resta ferma: la pagina deve restare in caricamento
  const loading = isPending || isFetching

  const handleReconcile = async () => {
    if (!venueId) return

    setReconciling(true)
    try {
      const res = await fetch('/api/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId: venueId }),
      })

      if (!res.ok) {
        throw new Error('Errore nella riconciliazione')
      }

      const result = await res.json()
      toast.success(
        `Riconciliazione completata: ${result.matched} matchati, ${result.toReview} da verificare`
      )
      refetch()
    } catch (error) {
      logger.error('Reconcile error', error)
      toast.error('Errore nella riconciliazione automatica')
    } finally {
      setReconciling(false)
    }
  }

  const handleConfirm = async (id: string) => {
    const res = await fetch(`/api/bank-transactions/${id}/confirm`, {
      method: 'POST',
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Errore nella conferma')
    }
    toast.success('Match confermato')
    refetch()
  }

  const handleIgnore = async (id: string) => {
    const res = await fetch(`/api/bank-transactions/${id}/ignore`, {
      method: 'POST',
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Errore nell\'ignorare')
    }
    toast.success('Transazione ignorata')
    refetch()
  }

  const handleUnmatch = async (id: string) => {
    const res = await fetch(`/api/bank-transactions/${id}/unmatch`, {
      method: 'POST',
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Errore nell\'annullamento')
    }
    toast.success('Match annullato')
    refetch()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Riconciliazione Bancaria
          </h1>
          <p className="text-muted-foreground">
            Importa e riconcilia i movimenti bancari con la prima nota
          </p>
          <FreschezzaMovimenti />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Importa CSV
          </Button>
          <Button
            onClick={handleReconcile}
            disabled={reconciling || !venueId}
          >
            {reconciling ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Riconcilia
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          className="w-full sm:w-auto"
        >
          <TabsList className="flex gap-1 p-1 bg-muted/50 rounded-lg h-auto w-fit border-none">
            <TabsTrigger
              value="all"
              className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium"
            >
              Tutti
            </TabsTrigger>
            <TabsTrigger
              value="TO_REVIEW"
              className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium"
            >
              Da Verificare
            </TabsTrigger>
            <TabsTrigger
              value="UNMATCHED"
              className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium"
            >
              Non Matchati
            </TabsTrigger>
            <TabsTrigger
              value="MATCHED"
              className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium"
            >
              Riconciliati
            </TabsTrigger>
            <TabsTrigger
              value="IGNORED"
              className="px-4 py-2 rounded-full data-[state=active]:bg-black data-[state=active]:text-white transition-all shadow-none border-none text-sm font-medium"
            >
              Ignorati
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => refetch()}
          disabled={loading}
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {/* Summary Cards */}
      <ReconciliationSummaryCards summary={summary} loading={loading} />

      {/* Transactions Table */}
      <BankTransactionTable
        transactions={transactions}
        loading={loading}
        onConfirm={handleConfirm}
        onIgnore={handleIgnore}
        onUnmatch={handleUnmatch}
        onMatch={(id) => setMatchTransactionId(id)}
        onViewDetails={(id) => setDetailsTransactionId(id)}
      />

      {/* Dialogs */}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => refetch()}
      />

      <MatchDialog
        open={matchTransactionId !== null}
        onOpenChange={(open) => !open && setMatchTransactionId(null)}
        transactionId={matchTransactionId}
        onSuccess={() => refetch()}
      />

      <TransactionDetailsDialog
        open={detailsTransactionId !== null}
        onOpenChange={(open) => !open && setDetailsTransactionId(null)}
        transactionId={detailsTransactionId}
      />
    </div>
  )
}
