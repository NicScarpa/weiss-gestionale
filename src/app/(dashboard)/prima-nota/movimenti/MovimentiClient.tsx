'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { MovimentiFilters } from '@/components/prima-nota/movimenti/MovimentiFilters'
import { MovimentiTable } from '@/components/prima-nota/movimenti/MovimentiTable'
import { MovimentoFormDialog } from '@/components/prima-nota/movimenti/MovimentoFormDialog'
import { EditContoCentroDialog } from '@/components/prima-nota/movimenti/EditContoCentroDialog'
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
import {
  resolveMovimentoEditAction,
  countActiveMovimentiFilters,
  DEFAULT_MOVIMENTI_FILTERS,
} from '@/lib/prima-nota-utils'
import type { JournalEntry, RegisterType, EntryType } from '@/types/prima-nota'

interface MovimentiClientProps {
  budgetCategories: Array<{ id: string; name: string; code: string; color?: string }>
}

/**
 * Derive entryType from registerType + debitAmount/creditAmount
 * since entryType is not stored in the database.
 */
function deriveEntryType(entry: { registerType: string; debitAmount?: number | null; creditAmount?: number | null }): EntryType {
  if (entry.registerType === 'CASH') {
    return (entry.debitAmount && entry.debitAmount > 0) ? 'INCASSO' : 'USCITA'
  }
  return (entry.debitAmount && entry.debitAmount > 0) ? 'VERSAMENTO' : 'PRELIEVO'
}

export function MovimentiClient({ budgetCategories }: MovimentiClientProps) {
  const searchParams = useSearchParams()
  const { venueId, isAdmin } = usePrimaNota()

  // Register from URL (set by AccountSelectorToggle)
  const registerFromUrl = searchParams.get('register') as RegisterType | null

  // Filters state
  const [filters, setFilters] = useState(DEFAULT_MOVIMENTI_FILTERS)

  // Usato dal pulsante "Cancella filtri" di MovimentiFilters e per decidere
  // quando mostrarlo.
  const filterCount = countActiveMovimentiFilters(filters)
  const handleClearFilters = () => setFilters(DEFAULT_MOVIMENTI_FILTERS)

  // Data state
  const [data, setData] = useState<JournalEntry[]>([])
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 })
  const [isLoading, setIsLoading] = useState(true)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [reclassifyEntry, setReclassifyEntry] = useState<JournalEntry | null>(null)

  // Ordinamento e categorizzazione
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [categorizeEntry, setCategorizeEntry] = useState<JournalEntry | null>(null)
  const [categorizeCategoryId, setCategorizeCategoryId] = useState<string>('')
  const [splitEntry, setSplitEntry] = useState<JournalEntry | null>(null)

  // Load data from API
  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()

      // Use registerType from URL (AccountSelectorToggle) or filters
      const activeRegister = registerFromUrl || filters.registerType
      if (activeRegister) params.set('registerType', activeRegister)
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom.toISOString())
      if (filters.dateTo) params.set('dateTo', filters.dateTo.toISOString())
      if (filters.entryType) params.set('movementType', filters.entryType)
      if (filters.accountId) params.set('accountId', filters.accountId)
      if (filters.costCenterId) params.set('costCenterId', filters.costCenterId)
      if (filters.budgetCategoryId) params.set('budgetCategoryId', filters.budgetCategoryId)
      if (filters.verified !== undefined) params.set('verified', String(filters.verified))
      if (filters.search) params.set('search', filters.search)
      if (venueId) params.set('venueId', venueId)
      params.set('sortOrder', sortOrder)
      params.set('page', String(pagination.page))
      params.set('limit', '50')

      const res = await fetch(`/api/prima-nota?${params.toString()}`)
      if (!res.ok) throw new Error('Errore nel caricamento')

      const json = await res.json()

      // Derive entryType for each entry (not stored in DB)
      const entries = json.data.map((entry: JournalEntry) => ({
        ...entry,
        entryType: deriveEntryType(entry),
      }))

      setData(entries)
      setPagination(prev => ({
        ...prev,
        total: json.pagination.total,
        totalPages: json.pagination.totalPages,
      }))
    } catch (error) {
      console.error('Errore caricamento movimenti:', error)
      toast.error('Impossibile caricare i movimenti')
    } finally {
      setIsLoading(false)
    }
  }, [filters, registerFromUrl, venueId, pagination.page, sortOrder])

  // Reload on filter/register change
  useEffect(() => {
    loadData()
  }, [loadData])

  // --- Handlers ---

  const handleEdit = (entry: JournalEntry) => {
    // Il movimento da chiusura non passa mai dal form completo: la route
    // (Task 8) rifiuterebbe con 400 qualunque campo diverso da conto/centro.
    // 'nessuna' non dovrebbe arrivare qui (MovimentiTable non espone
    // l'azione in quel caso), ma resta una difesa in profondità.
    const action = resolveMovimentoEditAction(entry, isAdmin)
    if (action === 'nessuna') return
    if (action === 'riclassifica') {
      setReclassifyEntry(entry)
      return
    }
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
    loadData()
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
      loadData()
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
      loadData()
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
      loadData()
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
      loadData()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto'
      toast.error(message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Movimenti</h1>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <DownloadIcon className="h-4 w-4 mr-2" />
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
                <PlusIcon className="h-4 w-4 mr-2" />
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
        costCenterId={filters.costCenterId}
        onCostCenterIdChange={(v) => setFilters(f => ({ ...f, costCenterId: v }))}
        budgetCategoryId={filters.budgetCategoryId}
        onBudgetCategoryIdChange={(v) => setFilters(f => ({ ...f, budgetCategoryId: v }))}
        verified={filters.verified}
        onVerifiedChange={(v) => setFilters(f => ({ ...f, verified: v }))}
        search={filters.search}
        onSearchChange={(v) => setFilters(f => ({ ...f, search: v }))}
        budgetCategoryOptions={budgetCategories}
        filterCount={filterCount}
        onClearFilters={handleClearFilters}
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
        isAdmin={isAdmin}
        isLoading={isLoading}
      />

      {/* Paginazione */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {pagination.total} movimenti totali
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
            >
              Precedente
            </Button>
            <span className="flex items-center px-2">
              Pagina {pagination.page} di {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
            >
              Successiva
            </Button>
          </div>
        </div>
      )}

      <MovimentoFormDialog
        // key forza il remount quando cambia il movimento target (o si passa
        // a "Nuovo movimento"): senza, lo stato interno del dialog — es. il
        // flag "centro di costo toccato manualmente" del Task 13 — resterebbe
        // quello dell'apertura precedente invece di ripartire pulito.
        key={selectedEntry?.id ?? 'new'}
        entry={selectedEntry ? {
          date: new Date(selectedEntry.date),
          registerType: selectedEntry.registerType,
          entryType: deriveEntryType(selectedEntry),
          amount: Math.abs(Number(selectedEntry.debitAmount || selectedEntry.creditAmount || 0)),
          description: selectedEntry.description,
          documentRef: selectedEntry.documentRef,
          documentType: selectedEntry.documentType,
          accountId: selectedEntry.accountId,
          costCenterId: selectedEntry.costCenterId,
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

      <EditContoCentroDialog
        entry={reclassifyEntry}
        open={!!reclassifyEntry}
        onOpenChange={(open) => {
          if (!open) setReclassifyEntry(null)
        }}
        onSaved={() => {
          setReclassifyEntry(null)
          loadData()
        }}
      />

      <CaricaMovimentiDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={loadData}
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
          loadData()
        }}
      />
    </div>
  )
}
