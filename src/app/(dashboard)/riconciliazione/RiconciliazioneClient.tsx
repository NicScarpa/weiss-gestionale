'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ReconciliationSummaryCards,
  BankTransactionTable,
  MatchDialog,
  TransactionDetailsDialog,
} from '@/components/reconciliation'
import { toast } from 'sonner'
import { RefreshCw, Play } from 'lucide-react'
import type {
  ReconciliationSummary,
  BankTransactionWithMatch,
  ReconciliationStatus,
} from '@/types/reconciliation'

import { logger } from '@/lib/logger'

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
  // Pagina corrente: totale e numero di pagine arrivano dalla risposta. Senza,
  // la pagina mostrava le prime 100 righe e basta: dei 231 movimenti della
  // prima sincronizzazione, 131 non si potevano raggiungere da nessuna parte.
  const [page, setPage] = useState(1)
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
    queryKey: ['riconciliazione', venueId, statusFilter, page],
    enabled: !!venueId,
    queryFn: async (): Promise<{
      summary: ReconciliationSummary
      transactions: BankTransactionWithMatch[]
      pagination: { total: number; totalPages: number }
    }> => {
      // Load summary and transactions in parallel
      const [summaryRes, transactionsRes] = await Promise.all([
        fetch(`/api/reconciliation/summary?venueId=${venueId}`),
        fetch(
          `/api/bank-transactions?venueId=${venueId}${statusFilter !== 'all' ? `&status=${statusFilter}` : ''
          }&limit=100&page=${page}`
        ),
      ])

      if (!summaryRes.ok || !transactionsRes.ok) {
        throw new Error('Errore nel caricamento dati')
      }

      const [summaryData, transactionsData] = await Promise.all([
        summaryRes.json(),
        transactionsRes.json(),
      ])

      return {
        summary: summaryData,
        transactions: transactionsData.data || [],
        pagination: transactionsData.pagination ?? { total: 0, totalPages: 0 },
      }
    },
    // Il conteggio resta visibile mentre si carica la pagina successiva
    placeholderData: (precedente) => precedente,
  })

  useEffect(() => {
    if (isError) {
      logger.error('Load error', error)
      toast.error('Errore nel caricamento dati')
    }
  }, [isError, error])

  const summary = dati?.summary ?? null
  const transactions = dati?.transactions ?? []
  const total = dati?.pagination?.total ?? 0
  const totalPages = dati?.pagination?.totalPages ?? 0
  // Finché la sede non è nota la query resta ferma: la pagina deve restare in caricamento
  const loading = isPending || isFetching

  // Cambiare scheda cambia l'insieme: la pagina 3 di «Tutti» non esiste in
  // «Riconciliati», e restarci mostrerebbe il vuoto di una pagina che non c'è.
  const cambiaFiltro = (v: StatusFilter) => {
    setStatusFilter(v)
    setPage(1)
  }

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

  const handleUnmatch = async (id: string) => {
    const res = await fetch(`/api/bank-transactions/${id}/scollega`, {
      method: 'POST',
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Errore nell\'annullamento')
    }
    toast.success('Movimento scollegato')
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
          {/* Importare un CSV e sapere quanto sono freschi i movimenti sono
              gesti dell'estratto conto, che ora vive nella prima nota: qui
              restano solo l'abbinamento e la sua verifica. */}
          <p className="text-muted-foreground">
            Riconcilia i movimenti bancari con la prima nota
          </p>
        </div>
        <div className="flex gap-2">
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
          onValueChange={(v) => cambiaFiltro(v as StatusFilter)}
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
        onUnmatch={handleUnmatch}
        onMatch={(id) => setMatchTransactionId(id)}
        onViewDetails={(id) => setDetailsTransactionId(id)}
      />

      {/* Paginazione: stessa forma di quella dei movimenti di prima nota */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} movimenti totali</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Precedente
            </Button>
            <span className="flex items-center px-2">
              Pagina {page} di {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Successiva
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
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
