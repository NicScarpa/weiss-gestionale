'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { PagamentiFilters } from '@/components/prima-nota/pagamenti/PagamentiFilters'
import { PagamentiTable } from '@/components/prima-nota/pagamenti/PagamentiTable'
import { PagamentoFormDialog } from '@/components/prima-nota/pagamenti/PagamentoFormDialog'
import { Button } from '@/components/ui/button'
import { PlusIcon } from 'lucide-react'
import { DangerousDeleteDialog } from '@/components/ui/dangerous-delete-dialog'
import { usePrimaNota } from '@/components/prima-nota/PrimaNotaContext'
import type { Payment, PaymentStatus, PaymentType, PaymentFormData } from '@/types/prima-nota'

export function PagamentiClient() {
  const { venueId } = usePrimaNota()

  // Filters state
  const [filters, setFilters] = useState({
    stato: undefined as PaymentStatus | undefined,
    tipo: undefined as PaymentType | undefined,
    dateFrom: undefined as Date | undefined,
    dateTo: undefined as Date | undefined,
    search: '',
  })

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Load data from API
  const {
    data: risposta,
    isFetching: isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    // Come prima del passaggio a TanStack Query: ogni montaggio ricarica.
    refetchOnMount: 'always',
    queryKey: [
      'pagamenti',
      filters.stato,
      filters.tipo,
      filters.dateFrom?.toISOString(),
      filters.dateTo?.toISOString(),
      venueId,
    ],
    queryFn: async (): Promise<Payment[] | { data?: Payment[] }> => {
      const params = new URLSearchParams()

      if (filters.stato) params.set('stato', filters.stato)
      if (filters.tipo) params.set('tipo', filters.tipo)
      if (filters.dateFrom) params.set('from', filters.dateFrom.toISOString())
      if (filters.dateTo) params.set('to', filters.dateTo.toISOString())
      if (venueId) params.set('venueId', venueId)

      const res = await fetch(`/api/pagamenti?${params.toString()}`)
      if (!res.ok) throw new Error('Errore nel caricamento')

      return res.json()
    },
  })

  useEffect(() => {
    if (isError) {
      console.error('Errore caricamento pagamenti:', error)
      toast.error('Impossibile caricare i pagamenti')
    }
  }, [isError, error])

  const data: Payment[] = Array.isArray(risposta) ? risposta : risposta?.data || []

  // --- Handlers ---

  const handleEdit = (payment: { id: string }) => {
    const found = data.find(p => p.id === payment.id)
    if (found) {
      setSelectedPayment(found)
      setDialogOpen(true)
    }
  }

  const handleDelete = (id: string) => {
    setDeleteTargetId(id)
  }

  const confirmDeletePagamento = async () => {
    if (!deleteTargetId) return
    const res = await fetch(`/api/pagamenti/${deleteTargetId}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Errore eliminazione')
    }
    toast.success('Pagamento eliminato')
    setDeleteTargetId(null)
    refetch()
  }

  const handleStatusChange = async (id: string, stato: PaymentStatus) => {
    try {
      const res = await fetch(`/api/pagamenti/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stato }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore aggiornamento stato')
      }
      toast.success(`Stato aggiornato: ${stato}`)
      refetch()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto'
      toast.error(message)
    }
  }

  const handleDispose = async (id: string) => {
    try {
      const res = await fetch(`/api/pagamenti/${id}/esegui`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore disposizione')
      }
      toast.success('Pagamento disposto e movimento bancario creato')
      refetch()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto'
      toast.error(message)
    }
  }

  const handleSave = async (formData: Record<string, unknown>) => {
    setIsSubmitting(true)
    try {
      const url = selectedPayment
        ? `/api/pagamenti/${selectedPayment.id}`
        : '/api/pagamenti'
      const method = selectedPayment ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore salvataggio')
      }

      toast.success(selectedPayment ? 'Pagamento aggiornato' : 'Pagamento creato')
      setDialogOpen(false)
      setSelectedPayment(null)
      refetch()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleNewPagamento = () => {
    setSelectedPayment(null)
    setDialogOpen(true)
  }

  // Active filter count for badge
  const filterCount = [filters.stato, filters.tipo, filters.dateFrom, filters.search].filter(Boolean).length

  // Filtro ricerca applicato lato client (l'API non supporta search e la lista non è paginata)
  const visibleData = filters.search
    ? data.filter(p => {
        const q = filters.search.toLowerCase()
        return (
          p.beneficiarioNome?.toLowerCase().includes(q) ||
          p.causale?.toLowerCase().includes(q)
        )
      })
    : data

  return (
    <div className="space-y-4">
      {/* Senza flex-wrap il bottone finisce incollato al bordo dello schermo
          sotto sm: titolo e azione ci stanno solo da ~640px in su */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Pagamenti</h1>
        <Button onClick={handleNewPagamento}>
          <PlusIcon aria-hidden="true" className="h-4 w-4 mr-2" />
          Nuovo Pagamento
        </Button>
      </div>

      <PagamentiFilters
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        onDateRangeChange={(range) => setFilters(f => ({ ...f, dateFrom: range.from, dateTo: range.to }))}
        tipo={filters.tipo}
        onTipoChange={(v) => setFilters(f => ({ ...f, tipo: v }))}
        stato={filters.stato}
        onStatoChange={(v) => setFilters(f => ({ ...f, stato: v as PaymentStatus | undefined }))}
        search={filters.search}
        onSearchChange={(v) => setFilters(f => ({ ...f, search: v }))}
        filterCount={filterCount}
        onClearFilters={() => setFilters({ stato: undefined, tipo: undefined, dateFrom: undefined, dateTo: undefined, search: '' })}
      />

      <PagamentiTable
        data={visibleData.map(p => ({
          id: p.id,
          dataEsecuzione: new Date(p.dataEsecuzione),
          tipo: p.tipo,
          importo: Number(p.importo),
          beneficiarioNome: p.beneficiarioNome,
          beneficiarioIban: p.beneficiarioIban || undefined,
          causale: p.causale || undefined,
          stato: p.stato,
        }))}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onApprove={(id) => handleStatusChange(id, 'DA_APPROVARE')}
        onDispose={handleDispose}
        onComplete={(id) => handleStatusChange(id, 'COMPLETATO')}
        onFail={(id) => handleStatusChange(id, 'FALLITO')}
        onAnnulla={(id) => handleStatusChange(id, 'ANNULLATO')}
        isLoading={isLoading}
      />

      <PagamentoFormDialog
        payment={selectedPayment ? {
          dataEsecuzione: new Date(selectedPayment.dataEsecuzione),
          tipo: selectedPayment.tipo,
          importo: Number(selectedPayment.importo),
          beneficiarioNome: selectedPayment.beneficiarioNome,
          beneficiarioIban: selectedPayment.beneficiarioIban || undefined,
          causale: selectedPayment.causale || undefined,
          note: selectedPayment.note || undefined,
          riferimentoInterno: selectedPayment.riferimentoInterno || undefined,
        } : undefined}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setSelectedPayment(null)
        }}
        onSave={handleSave}
        isSubmitting={isSubmitting}
      />

      <DangerousDeleteDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null) }}
        title="Elimina Pagamento"
        description="Stai per eliminare questo pagamento. Questa azione è irreversibile."
        confirmLabel="Elimina Pagamento"
        onConfirm={confirmDeletePagamento}
      />
    </div>
  )
}
