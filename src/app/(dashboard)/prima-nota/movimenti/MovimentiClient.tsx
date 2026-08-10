'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { MovimentiFilters } from '@/components/prima-nota/movimenti/MovimentiFilters'
import { MovimentiTable } from '@/components/prima-nota/movimenti/MovimentiTable'
import { MovimentoFormDialog } from '@/components/prima-nota/movimenti/MovimentoFormDialog'
import { CaricaMovimentiDialog } from '@/components/prima-nota/movimenti/CaricaMovimentiDialog'
import { SplitEntryDialog } from '@/components/prima-nota/movimenti/SplitEntryDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PlusIcon, PenLineIcon, UploadIcon, DownloadIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DangerousDeleteDialog } from '@/components/ui/dangerous-delete-dialog'
import { usePrimaNota } from '@/components/prima-nota/PrimaNotaContext'
import { tipoDaMostrare } from '@/lib/prima-nota-utils'
import type { JournalEntry, RegisterType } from '@/types/prima-nota'

interface MovimentiClientProps {
  accounts: Array<{ id: string; name: string; code: string }>
  budgetCategories: Array<{ id: string; name: string; code: string; color?: string }>
}

// Il tipo del movimento non sta nel database e va ricostruito. La regola sta
// in `tipoDaMostrare` (src/lib/prima-nota-utils.ts), che a differenza di
// quella di prima guarda anche `transferId`: senza, la metà in uscita di un
// versamento si presentava come «Uscita», indistinguibile da una spesa in
// contanti — un'operazione che nessuno aveva fatto.

export function MovimentiClient({ accounts, budgetCategories }: MovimentiClientProps) {
  const searchParams = useSearchParams()
  const { venueId } = usePrimaNota()

  // Register from URL (set by AccountSelectorToggle)
  const registerFromUrl = searchParams.get('register') as RegisterType | null

  // Filters state
  const [filters, setFilters] = useState({
    registerType: undefined as RegisterType | undefined,
    dateFrom: undefined as Date | undefined,
    dateTo: undefined as Date | undefined,
    entryType: undefined as string | undefined,
    accountId: undefined as string | undefined,
    budgetCategoryId: undefined as string | undefined,
    verified: undefined as boolean | undefined,
    search: '',
  })

  // Pagina corrente: totale e numero di pagine arrivano dalla risposta
  const [page, setPage] = useState(1)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  // Ordinamento e categorizzazione
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [categorizeEntry, setCategorizeEntry] = useState<JournalEntry | null>(null)
  const [categorizeCategoryId, setCategorizeCategoryId] = useState<string>('')
  const [splitEntry, setSplitEntry] = useState<JournalEntry | null>(null)

  // Query string della richiesta: cambia esattamente quando cambia ciò che si chiede all'API
  const queryParams = new URLSearchParams()

  // Use registerType from URL (AccountSelectorToggle) or filters
  const activeRegister = registerFromUrl || filters.registerType
  if (activeRegister) queryParams.set('registerType', activeRegister)
  if (filters.dateFrom) queryParams.set('dateFrom', filters.dateFrom.toISOString())
  if (filters.dateTo) queryParams.set('dateTo', filters.dateTo.toISOString())
  if (filters.entryType) queryParams.set('movementType', filters.entryType)
  if (filters.accountId) queryParams.set('accountId', filters.accountId)
  if (filters.budgetCategoryId) queryParams.set('budgetCategoryId', filters.budgetCategoryId)
  if (filters.verified !== undefined) queryParams.set('verified', String(filters.verified))
  if (filters.search) queryParams.set('search', filters.search)
  if (venueId) queryParams.set('venueId', venueId)
  queryParams.set('sortOrder', sortOrder)
  queryParams.set('page', String(page))
  queryParams.set('limit', '50')
  const queryString = queryParams.toString()

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
    staleTime: 0,
    queryKey: ['prima-nota', 'movimenti', queryString],
    queryFn: async (): Promise<{
      data: JournalEntry[]
      pagination: { total: number; totalPages: number }
    }> => {
      const res = await fetch(`/api/prima-nota?${queryString}`)
      if (!res.ok) throw new Error('Errore nel caricamento')
      return res.json()
    },
    // Il conteggio dei movimenti resta visibile mentre si carica la pagina successiva
    placeholderData: (precedente) => precedente,
  })

  useEffect(() => {
    if (isError) {
      console.error('Errore caricamento movimenti:', error)
      toast.error('Impossibile caricare i movimenti')
    }
  }, [isError, error])

  // Derive entryType for each entry (not stored in DB)
  const data = useMemo(
    () =>
      (risposta?.data ?? []).map((entry) => ({
        ...entry,
        entryType: tipoDaMostrare(entry),
      })),
    [risposta]
  )
  const total = risposta?.pagination?.total ?? 0
  const totalPages = risposta?.pagination?.totalPages ?? 0

  // --- Handlers ---

  const handleEdit = (entry: JournalEntry) => {
    setSelectedEntry(entry)
    setDialogOpen(true)
  }

  const handleDelete = (id: string) => {
    setDeleteTargetId(id)
  }

  const confirmDeleteMovimento = async () => {
    if (!deleteTargetId) return
    const res = await fetch(`/api/prima-nota/${deleteTargetId}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Errore eliminazione')
    }
    toast.success('Movimento eliminato')
    setDeleteTargetId(null)
    refetch()
  }

  const handleVerify = async (id: string, verified: boolean) => {
    try {
      const res = await fetch(`/api/prima-nota/${id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified }),
      })
      if (!res.ok) throw new Error('Errore verifica')
      toast.success(verified ? 'Movimento verificato' : 'Verifica rimossa')
      refetch()
    } catch {
      toast.error('Impossibile verificare il movimento')
    }
  }

  const handleHide = async (id: string, currentlyHidden: boolean) => {
    try {
      const res = await fetch(`/api/prima-nota/${id}/hide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: !currentlyHidden }),
      })
      if (!res.ok) throw new Error('Errore nascondere')
      toast.success(!currentlyHidden ? 'Movimento nascosto' : 'Movimento visibile')
      refetch()
    } catch {
      toast.error('Impossibile nascondere/mostrare il movimento')
    }
  }

  const handleSave = async (formData: Record<string, unknown>) => {
    setIsSubmitting(true)
    try {
      const url = selectedEntry
        ? `/api/prima-nota/${selectedEntry.id}`
        : '/api/prima-nota'
      const method = selectedEntry ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore salvataggio')
      }

      toast.success(selectedEntry ? 'Movimento aggiornato' : 'Movimento creato')
      setDialogOpen(false)
      setSelectedEntry(null)
      refetch()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleNewMovimento = () => {
    setSelectedEntry(null)
    setDialogOpen(true)
  }

  const handleExport = (format: 'pdf' | 'xlsx' | 'csv') => {
    const params = new URLSearchParams()
    const activeRegister = registerFromUrl || filters.registerType
    if (activeRegister) params.set('registerType', activeRegister)
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom.toISOString())
    if (filters.dateTo) params.set('dateTo', filters.dateTo.toISOString())
    if (venueId) params.set('venueId', venueId)
    params.set('format', format)
    window.open(`/api/prima-nota/export?${params.toString()}`, '_blank')
  }

  const handleCategorize = async () => {
    if (!categorizeEntry) return
    try {
      const res = await fetch(`/api/prima-nota/${categorizeEntry.id}/categorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budgetCategoryId: categorizeCategoryId || undefined }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore categorizzazione')
      }
      toast.success('Movimento categorizzato')
      setCategorizeEntry(null)
      setCategorizeCategoryId('')
      refetch()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto'
      toast.error(message)
    }
  }

  return (
    <div className="space-y-4">
      {/* Senza flex-wrap titolo e azioni stanno su una riga sola più larga
          dello schermo, e a scorrere lateralmente è la pagina intera */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Movimenti</h1>
        <div className="flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <DownloadIcon aria-hidden="true" className="h-4 w-4 mr-2" />
                Esporta
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => handleExport('pdf')}>PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('xlsx')}>Excel</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('csv')}>CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <PlusIcon aria-hidden="true" className="h-4 w-4 mr-2" />
                Nuovo
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleNewMovimento}>
                <PenLineIcon className="h-4 w-4 mr-2" />
                Crea movimento
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportDialogOpen(true)}>
                <UploadIcon className="h-4 w-4 mr-2" />
                Carica movimenti
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <MovimentiFilters
        registerType={registerFromUrl || filters.registerType}
        onRegisterTypeChange={(v) => setFilters(f => ({ ...f, registerType: v }))}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        onDateRangeChange={(range) => setFilters(f => ({ ...f, dateFrom: range.from, dateTo: range.to }))}
        entryType={filters.entryType}
        onEntryTypeChange={(v) => setFilters(f => ({ ...f, entryType: v }))}
        accountId={filters.accountId}
        onAccountIdChange={(v) => setFilters(f => ({ ...f, accountId: v }))}
        budgetCategoryId={filters.budgetCategoryId}
        onBudgetCategoryIdChange={(v) => setFilters(f => ({ ...f, budgetCategoryId: v }))}
        verified={filters.verified}
        onVerifiedChange={(v) => setFilters(f => ({ ...f, verified: v }))}
        search={filters.search}
        onSearchChange={(v) => setFilters(f => ({ ...f, search: v }))}
        accountOptions={accounts}
        budgetCategoryOptions={budgetCategories}
      />

      <MovimentiTable
        data={data}
        sortDirection={sortOrder}
        onSort={(_field, direction) => setSortOrder(direction)}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onVerify={handleVerify}
        onHide={handleHide}
        onCategorize={(entry) => {
          setCategorizeEntry(entry)
          setCategorizeCategoryId(entry.budgetCategoryId || '')
        }}
        onSplit={(entry) => setSplitEntry(entry)}
        isLoading={isLoading}
      />

      {/* Paginazione */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} movimenti totali
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
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
              onClick={() => setPage(p => p + 1)}
            >
              Successiva
            </Button>
          </div>
        </div>
      )}

      <MovimentoFormDialog
        accounts={accounts}
        entry={selectedEntry ? {
          date: new Date(selectedEntry.date),
          registerType: selectedEntry.registerType,
          entryType: tipoDaMostrare(selectedEntry),
          amount: Math.abs(Number(selectedEntry.debitAmount || selectedEntry.creditAmount || 0)),
          description: selectedEntry.description,
          documentRef: selectedEntry.documentRef,
          documentType: selectedEntry.documentType,
          accountId: selectedEntry.accountId,
          vatAmount: selectedEntry.vatAmount ? Number(selectedEntry.vatAmount) : undefined,
          notes: selectedEntry.notes,
        } : undefined}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setSelectedEntry(null)
        }}
        onSave={handleSave}
        isSubmitting={isSubmitting}
      />

      <CaricaMovimentiDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        accounts={accounts}
        venueId={venueId}
        onImportComplete={() => refetch()}
      />

      <DangerousDeleteDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null) }}
        title="Elimina Movimento"
        description="Stai per eliminare questo movimento. Questa azione è irreversibile."
        confirmLabel="Elimina Movimento"
        onConfirm={confirmDeleteMovimento}
      />

      {/* Dialog categorizzazione */}
      <Dialog
        open={!!categorizeEntry}
        onOpenChange={(open) => {
          if (!open) {
            setCategorizeEntry(null)
            setCategorizeCategoryId('')
          }
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Categorizza movimento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground truncate">
              {categorizeEntry?.description}
            </p>
            <Select value={categorizeCategoryId} onValueChange={setCategorizeCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Scegli una categoria budget" />
              </SelectTrigger>
              <SelectContent>
                {budgetCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCategorizeEntry(null)
                  setCategorizeCategoryId('')
                }}
              >
                Annulla
              </Button>
              <Button onClick={handleCategorize} disabled={!categorizeCategoryId}>
                Salva
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SplitEntryDialog
        entry={splitEntry}
        open={!!splitEntry}
        onOpenChange={(open) => {
          if (!open) setSplitEntry(null)
        }}
        onSaved={() => {
          setSplitEntry(null)
          refetch()
        }}
      />
    </div>
  )
}
