'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import {
  Plus,
  Filter,
  Download,
  Search,
  RefreshCw,
  Wallet,
  Building2,
  ArrowRightLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  JournalEntryForm,
  JournalEntryTable,
  RegisterBalanceCards,
  SingleRegisterCard,
  type JournalEntryFormData,
} from '@/components/prima-nota'
import type { JournalEntry, RegisterType } from '@/types/prima-nota'
import { toast } from 'sonner'

interface Account {
  id: string
  code: string
  name: string
}

interface PrimaNotaClientProps {
  venueId?: string
  isAdmin: boolean
  accounts: Account[]
}

interface RegisterBalance {
  openingBalance: number
  totalDebits: number
  totalCredits: number
  closingBalance: number
  lastUpdated?: string
}

interface Balances {
  cashBalance: number
  bankBalance: number
  totalAvailable: number
  registers: {
    CASH?: RegisterBalance
    BANK?: RegisterBalance
  }
}

export function PrimaNotaClient({
  venueId,
  isAdmin,
  accounts,
}: PrimaNotaClientProps) {
  const [activeTab, setActiveTab] = useState<'cassa' | 'banca'>('cassa')
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [balances, setBalances] = useState<Balances | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null)

  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    search: '',
    accountId: '',
  })

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  })

  const [summary, setSummary] = useState({
    totalDebits: 0,
    totalCredits: 0,
    netMovement: 0,
  })

  // Determina il registro in base al tab
  const currentRegister: RegisterType = activeTab === 'cassa' ? 'CASH' : 'BANK'

  // Fetch entries
  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('registerType', currentRegister)
      if (venueId) params.set('venueId', venueId)
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.set('dateTo', filters.dateTo)
      if (filters.search) params.set('search', filters.search)
      if (filters.accountId) params.set('accountId', filters.accountId)
      params.set('page', pagination.page.toString())
      params.set('limit', pagination.limit.toString())

      const res = await fetch(`/api/prima-nota?${params.toString()}`)
      if (!res.ok) throw new Error('Errore nel caricamento')

      const data = await res.json()
      setEntries(data.data)
      setPagination((prev) => ({
        ...prev,
        total: data.pagination.total,
        totalPages: data.pagination.totalPages,
      }))
      setSummary(data.summary)
    } catch (error) {
      console.error('Errore fetch movimenti:', error)
      toast.error('Errore nel caricamento dei movimenti')
    } finally {
      setLoading(false)
    }
  }, [currentRegister, venueId, filters, pagination.page, pagination.limit])

  // Fetch balances
  const fetchBalances = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (venueId) params.set('venueId', venueId)

      const res = await fetch(`/api/prima-nota/saldi?${params.toString()}`)
      if (!res.ok) throw new Error('Errore nel caricamento saldi')

      const data = await res.json()
      if (data.data && data.data.length > 0) {
        setBalances(data.data[0])
      }
    } catch (error) {
      console.error('Errore fetch saldi:', error)
    }
  }, [venueId])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  useEffect(() => {
    fetchBalances()
  }, [fetchBalances])

  // Refresh quando cambia tab
  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }))
  }, [activeTab])

  // Create entry
  const handleCreate = async (data: JournalEntryFormData) => {
    const res = await fetch('/api/prima-nota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Errore nella creazione')
    }

    setIsFormOpen(false)
    fetchEntries()
    fetchBalances()
  }

  // Update entry
  const handleUpdate = async (data: JournalEntryFormData) => {
    if (!editingEntry) return

    const res = await fetch(`/api/prima-nota/${editingEntry.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Errore nell\'aggiornamento')
    }

    setEditingEntry(null)
    fetchEntries()
    fetchBalances()
  }

  // Delete entry
  const handleDelete = async (entry: JournalEntry) => {
    const res = await fetch(`/api/prima-nota/${entry.id}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Errore nell\'eliminazione')
    }

    toast.success('Movimento eliminato')
    fetchEntries()
    fetchBalances()
  }

  // Bank deposit (versamento)
  const handleBankDeposit = async (data: JournalEntryFormData) => {
    const res = await fetch('/api/prima-nota/versamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: data.date,
        amount: data.amount,
        description: data.description,
        documentRef: data.documentRef,
      }),
    })

    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Errore nel versamento')
    }

    setIsFormOpen(false)
    fetchEntries()
    fetchBalances()
    toast.success('Versamento registrato')
  }

  const handleEdit = (entry: JournalEntry) => {
    setEditingEntry(entry)
  }

  const handlePageChange = (page: number) => {
    setPagination((prev) => ({ ...prev, page }))
  }

  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      search: '',
      accountId: '',
    })
    setPagination((prev) => ({ ...prev, page: 1 }))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prima Nota</h1>
          <p className="text-muted-foreground">
            Registro dei movimenti contabili
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const params = new URLSearchParams()
              params.set('registerType', currentRegister)
              if (venueId) params.set('venueId', venueId)
              if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
              if (filters.dateTo) params.set('dateTo', filters.dateTo)
              params.set('format', 'pdf')
              window.open(`/api/prima-nota/export?${params.toString()}`, '_blank')
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const params = new URLSearchParams()
              params.set('registerType', currentRegister)
              if (venueId) params.set('venueId', venueId)
              if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
              if (filters.dateTo) params.set('dateTo', filters.dateTo)
              params.set('format', 'csv')
              window.open(`/api/prima-nota/export?${params.toString()}`, '_blank')
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button variant="outline" onClick={() => {
            fetchEntries()
            fetchBalances()
          }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Aggiorna
          </Button>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nuovo Movimento
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Nuovo Movimento</DialogTitle>
              </DialogHeader>
              <JournalEntryForm
                accounts={accounts}
                defaultRegisterType={currentRegister}
                onSubmit={handleCreate}
                onCancel={() => setIsFormOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Saldi */}
      <RegisterBalanceCards
        cashRegister={balances?.registers?.CASH}
        bankRegister={balances?.registers?.BANK}
        isLoading={!balances}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'cassa' | 'banca')}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="cassa" className="gap-2">
            <Wallet className="h-4 w-4" />
            Prima Nota Cassa
          </TabsTrigger>
          <TabsTrigger value="banca" className="gap-2">
            <Building2 className="h-4 w-4" />
            Prima Nota Banca
          </TabsTrigger>
        </TabsList>

        {/* Filtri (comune per entrambi i tab) */}
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtri
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
                }
                placeholder="Da data"
              />
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
                }
                placeholder="A data"
              />
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, search: e.target.value }))
                  }
                  placeholder="Cerca..."
                  className="pl-10"
                />
              </div>
              {accounts.length > 0 && (
                <Select
                  value={filters.accountId || 'all'}
                  onValueChange={(v) =>
                    setFilters((prev) => ({ ...prev, accountId: v === 'all' ? '' : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tutti i conti" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti i conti</SelectItem>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" onClick={clearFilters}>
                Pulisci
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Contenuto Tab Cassa */}
        <TabsContent value="cassa" className="space-y-4">
          <SingleRegisterCard
            registerType="CASH"
            data={balances?.registers?.CASH}
          />
          <JournalEntryTable
            entries={entries}
            pagination={pagination}
            summary={summary}
            onPageChange={handlePageChange}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isLoading={loading}
            showVenue={isAdmin}
          />
        </TabsContent>

        {/* Contenuto Tab Banca */}
        <TabsContent value="banca" className="space-y-4">
          <SingleRegisterCard
            registerType="BANK"
            data={balances?.registers?.BANK}
          />
          <JournalEntryTable
            entries={entries}
            pagination={pagination}
            summary={summary}
            onPageChange={handlePageChange}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isLoading={loading}
            showVenue={isAdmin}
          />
        </TabsContent>
      </Tabs>

      {/* Dialog modifica */}
      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Modifica Movimento</DialogTitle>
          </DialogHeader>
          {editingEntry && (
            <JournalEntryForm
              initialData={{
                date: format(new Date(editingEntry.date), 'yyyy-MM-dd'),
                registerType: editingEntry.registerType as RegisterType,
                entryType: 'INCASSO', // Non modificabile
                amount: editingEntry.debitAmount || editingEntry.creditAmount || 0,
                description: editingEntry.description,
                documentRef: editingEntry.documentRef || '',
                documentType: editingEntry.documentType || '',
                accountId: editingEntry.accountId || '',
                vatAmount: editingEntry.vatAmount || undefined,
              }}
              accounts={accounts}
              onSubmit={handleUpdate}
              onCancel={() => setEditingEntry(null)}
              submitLabel="Aggiorna"
              isEditing
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
