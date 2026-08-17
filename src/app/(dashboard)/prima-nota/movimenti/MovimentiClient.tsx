'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { MovimentiFilters } from '@/components/prima-nota/movimenti/MovimentiFilters'
import { MovimentiTable } from '@/components/prima-nota/movimenti/MovimentiTable'
import { MovimentoFormDialog } from '@/components/prima-nota/movimenti/MovimentoFormDialog'
import { EditContoCentroDialog } from '@/components/prima-nota/movimenti/EditContoCentroDialog'
import { SplitEntryDialog } from '@/components/prima-nota/movimenti/SplitEntryDialog'
import { RiconciliazioniMovimentoDialog } from '@/components/prima-nota/movimenti/RiconciliazioniMovimentoDialog'
import {
  VistaBancaToggle,
  paramsPerVista,
  righeEstrattoConto,
  vistaDaSearchParams,
  type VistaBanca,
} from '@/components/prima-nota/movimenti/VistaBancaToggle'
import { MovimentiBancariInAttesa } from '@/components/banca/MovimentiBancariInAttesa'
import { EstrattoContoInPrimaNota } from '@/components/banca/estratto-conto/EstrattoContoInPrimaNota'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PlusIcon, PenLineIcon, DownloadIcon } from 'lucide-react'
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
  tipoDaMostrare,
  type MovimentiFiltersState,
} from '@/lib/prima-nota-utils'
import type { JournalEntry, RegisterType, EntryType } from '@/types/prima-nota'
import type { ConteggiEstrattoConto } from '@/types/reconciliation'

interface MovimentiClientProps {
  budgetCategories: Array<{ id: string; name: string; code: string; color?: string }>
}

// Il tipo del movimento non sta nel database e va ricostruito. La regola sta
// in `tipoDaMostrare` (src/lib/prima-nota-utils.ts), che a differenza di
// quella di prima guarda anche `transferId`: senza, la metà in uscita di un
// versamento si presentava come «Uscita», indistinguibile da una spesa in
// contanti — un'operazione che nessuno aveva fatto.

export function MovimentiClient({ budgetCategories }: MovimentiClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { venueId, isAdmin } = usePrimaNota()

  // Register from URL (set by AccountSelectorToggle)
  const registerFromUrl = searchParams.get('register') as RegisterType | null

  // La scheda Cassa/Banca è a tutti gli effetti un filtro sul registro: se
  // resta fuori dallo stato dei filtri non viene contata fra quelli attivi e
  // "Cancella filtri" non la tocca, così chi arriva dalla scheda Cassa preme
  // il pulsante e resta sulla cassa senza capire perché.
  const [filtriScelti, setFilters] = useState<MovimentiFiltersState>(DEFAULT_MOVIMENTI_FILTERS)

  // L'URL resta la fonte della navigazione: quando la scheda cambia, il filtro
  // la segue. È un valore *derivato* durante il render, non una copia
  // riallineata da un effetto: copiarlo dentro lo stato costava un secondo
  // render a ogni cambio di scheda, e per un istante la lista mostrava il
  // registro precedente. La precedenza dell'URL non è nuova — la richiesta
  // all'API la applicava già — ma ora vale anche per ciò che si vede nel
  // filtro, che prima poteva dichiarare un registro diverso da quello mostrato.
  const filters = useMemo<MovimentiFiltersState>(
    () =>
      registerFromUrl ? { ...filtriScelti, registerType: registerFromUrl } : filtriScelti,
    [filtriScelti, registerFromUrl]
  )

  // Sul Conto Bancario la pagina ha due sotto-schede: l'estratto conto — ciò
  // che la banca ha portato — e le scritture contabili. L'estratto conto è
  // quella che si apre per prima, perché è quello che si viene a cercare dopo
  // una sincronizzazione: fino al 16 agosto qui c'erano solo le scritture, e
  // una scheda Banca vuota accanto a 231 movimenti arrivati ha fatto concludere
  // che la banca non avesse portato nulla. Su «Tutti» e sulla Cassa non c'è
  // nessuna sotto-scheda: l'estratto conto è del solo registro Banca.
  const vista = vistaDaSearchParams(new URLSearchParams(searchParams.toString()))
  const estrattoConto = filters.registerType === 'BANK' && vista === 'estratto'

  const cambiaVista = (prossima: VistaBanca) => {
    // Ricliccare la sotto-scheda in cui si è già non è un cambio di vista.
    // Riscrivere l'URL da qui costava i filtri dell'estratto conto —
    // `paramsPerVista` riparte da `FILTRI_DEFAULT` e li cancella — mentre la
    // lista, che li tiene nel proprio stato, continuava a mostrarli: l'indirizzo
    // e ciò che si vede si dividevano, e ricaricando la pagina i filtri sparivano.
    if (prossima === vista) return
    const params = paramsPerVista(prossima, new URLSearchParams(searchParams.toString()))
    router.replace(params.toString() ? `?${params.toString()}` : '?', { scroll: false })
  }

  // Usato dal pulsante "Cancella filtri" di MovimentiFilters e per decidere
  // quando mostrarlo.
  const filterCount = countActiveMovimentiFilters(filters)
  const handleClearFilters = () => {
    setFilters(DEFAULT_MOVIMENTI_FILTERS)
    // ...e la scheda torna su "Tutti": lasciarla evidenziata mentre la lista
    // mostra ogni registro sarebbe una contraddizione a schermo.
    if (registerFromUrl) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('register')
      router.replace(params.toString() ? `?${params.toString()}` : '?')
    }
  }

  // Pagina corrente: totale e numero di pagine arrivano dalla risposta
  const [page, setPage] = useState(1)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [reclassifyEntry, setReclassifyEntry] = useState<JournalEntry | null>(null)

  // Ordinamento e categorizzazione
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [categorizeEntry, setCategorizeEntry] = useState<JournalEntry | null>(null)
  const [categorizeCategoryId, setCategorizeCategoryId] = useState<string>('')
  const [splitEntry, setSplitEntry] = useState<JournalEntry | null>(null)
  const [riconciliazioniEntry, setRiconciliazioniEntry] = useState<JournalEntry | null>(null)

  // Query string della richiesta: cambia esattamente quando cambia ciò che si chiede all'API
  const queryParams = new URLSearchParams()

  // Il registro dell'URL è già dentro `filters` (vedi sopra)
  if (filters.registerType) queryParams.set('registerType', filters.registerType)
  if (filters.dateFrom) queryParams.set('dateFrom', filters.dateFrom.toISOString())
  if (filters.dateTo) queryParams.set('dateTo', filters.dateTo.toISOString())
  if (filters.entryType) queryParams.set('movementType', filters.entryType)
  if (filters.accountId) queryParams.set('accountId', filters.accountId)
  if (filters.costCenterId) queryParams.set('costCenterId', filters.costCenterId)
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

  // Il numero accanto a «Estratto conto»: delle righe non serve nessuna,
  // quindi se ne chiede una sola e si guardano i `conteggi`, che la rotta
  // calcola sempre su tutte le schede. Il `pagination.total` no: quello conta
  // la scheda aperta — di norma Attivi — e ogni «Sposta in» faceva calare il
  // numero della sotto-scheda come se i movimenti fossero spariti. La chiave
  // condivide il prefisso `['estratto-conto']` con la lista vera, così le
  // invalidazioni che partono di lì — spostamenti, Cestino, nuovo movimento —
  // aggiornano anche questo.
  const { data: conteggioEstratto } = useQuery({
    queryKey: ['estratto-conto', 'conteggio', venueId],
    // Fuori dal Conto Bancario la sotto-scheda non c'è: non si chiede un
    // numero che nessuno mostra.
    enabled: filters.registerType === 'BANK',
    queryFn: async (): Promise<number> => {
      const res = await fetch('/api/bank-transactions?limit=1')
      if (!res.ok) throw new Error('Errore nel conteggio dei movimenti bancari')
      const corpo = (await res.json()) as { conteggi?: ConteggiEstrattoConto }
      return corpo.conteggi ? righeEstrattoConto(corpo.conteggi) : 0
    },
  })

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
      // Riconciliato: non è un errore da leggere e basta, è un passo mancante.
      // Il dialog delle scadenze collegate è il posto dove compierlo, quindi si
      // apre al posto del messaggio invece di lasciare l'utente davanti a
      // un'istruzione che non ha modo di eseguire.
      if (res.status === 409 && Array.isArray(err.scadenze) && err.scadenze.length > 0) {
        const bloccato = data.find((e) => e.id === deleteTargetId) ?? null
        setDeleteTargetId(null)
        if (bloccato) setRiconciliazioniEntry(bloccato)
        toast.error(err.error || 'Movimento riconciliato')
        return
      }
      throw new Error(err.error || 'Errore eliminazione')
    }
    toast.success('Movimento eliminato')
    setDeleteTargetId(null)
    refetch()
  }

  const handleVerify = async (id: string, verified: boolean) => {
    try {
      // La rotta espone PATCH: con POST Next risponde 405 e la verifica non
      // avveniva mai, con il solo toast «Impossibile verificare» a dirlo.
      const res = await fetch(`/api/prima-nota/${id}/verify`, {
        method: 'PATCH',
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
      // Come per `verify`: la rotta espone PATCH, non POST.
      const res = await fetch(`/api/prima-nota/${id}/hide`, {
        method: 'PATCH',
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
      // L'errore risale al modulo, che così NON si azzera: il dialogo resta
      // aperto dopo un rifiuto del server (il 409 sulla data che viene dalla
      // banca, per dirne uno) e deve mostrare ancora ciò che c'era. Inghiottito
      // qui, il modulo credeva di aver salvato e si riportava ai valori di
      // partenza — compreso il centro di costo, che tornava al default: un
      // secondo «Aggiorna», gesto naturale dopo un errore, ne salvava un altro
      // senza dirlo a nessuno.
      throw error
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
    if (filters.registerType) params.set('registerType', filters.registerType)
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
        method: 'PATCH',
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
        {/* Esporta e Nuovo agiscono sulle scritture contabili: sull'estratto
            conto non hanno un significato, e la lista porta già le sue azioni. */}
        {!estrattoConto && (
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
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {filters.registerType === 'BANK' && (
        <VistaBancaToggle
          vista={vista}
          conteggioEstratto={conteggioEstratto}
          // Il totale grezzo, non il `total` con lo zero di ripiego: finché la
          // prima lettura non torna l'etichetta non deve dire «(0)», che è un
          // conteggio vero e qui sarebbe falso.
          conteggioScritture={risposta?.pagination?.total}
          onCambia={cambiaVista}
        />
      )}

      {estrattoConto ? (
        <EstrattoContoInPrimaNota venueId={venueId} />
      ) : (
        <>
          <MovimentiFilters
            registerType={filters.registerType}
            onRegisterTypeChange={(v) => setFilters(f => ({ ...f, registerType: v }))}
            dateFrom={filters.dateFrom}
            dateTo={filters.dateTo}
            // Svuotare la selezione emette `undefined`: azzera entrambe le date
            // invece di lasciare il filtro precedente in vigore.
            onDateRangeChange={(range) =>
              setFilters(f => ({ ...f, dateFrom: range?.from, dateTo: range?.to }))
            }
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

          {/* Solo sulla scheda «Tutti»: sul Conto Bancario l'estratto conto è
              lì accanto, nella sua sotto-scheda, e un cartello che indica una
              scheda visibile a un dito di distanza è rumore. Sulla Cassa i
              movimenti bancari non c'entrano. */}
          {!filters.registerType && venueId && (
            <MovimentiBancariInAttesa venueId={venueId} />
          )}

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
            onRiconciliazioni={(entry) => setRiconciliazioniEntry(entry)}
            isAdmin={isAdmin}
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
        </>
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
          entryType: tipoDaMostrare(selectedEntry),
          amount: Math.abs(Number(selectedEntry.debitAmount || selectedEntry.creditAmount || 0)),
          description: selectedEntry.description,
          // Sul movimento questi campi sono nullable, nel form sono opzionali:
          // `null` significherebbe "valore scelto e vuoto" invece di "assente".
          documentRef: selectedEntry.documentRef ?? undefined,
          documentType: selectedEntry.documentType ?? undefined,
          accountId: selectedEntry.accountId ?? undefined,
          costCenterId: selectedEntry.costCenterId ?? undefined,
          vatAmount: selectedEntry.vatAmount ? Number(selectedEntry.vatAmount) : undefined,
          notes: selectedEntry.notes ?? undefined,
          // La data di una scrittura che viene dalla banca non si modifica da
          // qui: il modulo la mostra in sola lettura invece di far scegliere
          // una data che la route rifiuta con un 409.
          bankTransactionId: selectedEntry.bankTransactionId ?? undefined,
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
          refetch()
        }}
      />

      <DangerousDeleteDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null) }}
        title="Elimina Movimento"
        description="Stai per eliminare questo movimento. Questa azione è irreversibile."
        confirmLabel="Elimina Movimento"
        onConfirm={confirmDeleteMovimento}
      />

      <RiconciliazioniMovimentoDialog
        entry={riconciliazioniEntry}
        onOpenChange={(open) => { if (!open) setRiconciliazioniEntry(null) }}
        onAnnullata={() => refetch()}
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
