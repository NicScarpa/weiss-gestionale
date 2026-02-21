"use client"

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RecurrenceTable } from '@/components/scadenzario/recurrence-table'
import { CreateRecurrenceDialog } from '@/components/scadenzario/create-recurrence-dialog'
import { Recurrence, CreateRecurrenceInput } from '@/types/schedule'
import { Plus, Search, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type SubTab = 'passiva' | 'attiva'

export default function RicorrenzePage() {
  const [recurrences, setRecurrences] = useState<Recurrence[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [subTab, setSubTab] = useState<SubTab>('passiva')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecurrence, setEditingRecurrence] = useState<Recurrence | null>(null)

  const fetchRecurrences = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('tipo', subTab)
      params.append('isActive', 'true')
      if (search) params.append('search', search)

      const resp = await fetch(`/api/scadenzario/ricorrenze?${params}`)
      const data = await resp.json()

      if (resp.ok) {
        setRecurrences(data.data || [])
      }
    } catch (error) {
      console.error('Errore fetch ricorrenze:', error)
    }
    setIsLoading(false)
  }, [subTab, search])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount/dependency change is intentional
    fetchRecurrences()
  }, [fetchRecurrences])

  const handleCreate = async (data: CreateRecurrenceInput) => {
    try {
      const resp = await fetch('/api/scadenzario/ricorrenze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (resp.ok) {
        toast.success('Ricorrenza creata')
        fetchRecurrences()
      } else {
        const err = await resp.json()
        toast.error(err.error || 'Errore nella creazione')
      }
    } catch {
      toast.error('Errore nella creazione della ricorrenza')
    }
  }

  const handleEdit = async (data: CreateRecurrenceInput) => {
    if (!editingRecurrence) return

    try {
      const resp = await fetch(`/api/scadenzario/ricorrenze/${editingRecurrence.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (resp.ok) {
        toast.success('Ricorrenza aggiornata')
        setEditingRecurrence(null)
        fetchRecurrences()
      } else {
        const err = await resp.json()
        toast.error(err.error || 'Errore nell\'aggiornamento')
      }
    } catch {
      toast.error('Errore nell\'aggiornamento della ricorrenza')
    }
  }

  const handleGenerate = async (id: string) => {
    try {
      const resp = await fetch(`/api/scadenzario/ricorrenze/${id}/genera`, {
        method: 'POST',
      })

      if (resp.ok) {
        const result = await resp.json()
        toast.success('Scadenza generata con successo')
        if (result.ricorrenzaDisattivata) {
          toast.info('La ricorrenza è stata disattivata (termine raggiunto)')
        }
        fetchRecurrences()
      } else {
        const err = await resp.json()
        toast.error(err.error || 'Errore nella generazione')
      }
    } catch {
      toast.error('Errore nella generazione della scadenza')
    }
  }

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const resp = await fetch(`/api/scadenzario/ricorrenze/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })

      if (resp.ok) {
        toast.success(isActive ? 'Ricorrenza attivata' : 'Ricorrenza disattivata')
        fetchRecurrences()
      }
    } catch {
      toast.error('Errore nell\'aggiornamento')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const resp = await fetch(`/api/scadenzario/ricorrenze/${id}`, {
        method: 'DELETE',
      })

      if (resp.ok) {
        toast.success('Ricorrenza eliminata')
        fetchRecurrences()
      }
    } catch {
      toast.error('Errore nell\'eliminazione')
    }
  }

  const subTabs: { value: SubTab; label: string; icon: typeof ArrowDownCircle }[] = [
    { value: 'passiva', label: 'Pagamenti', icon: ArrowUpCircle },
    { value: 'attiva', label: 'Incassi', icon: ArrowDownCircle },
  ]

  return (
    <div className="flex-1 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Ricorrenze
          </h1>
          <p className="text-muted-foreground">
            Gestione pagamenti e incassi ricorrenti
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditingRecurrence(null); setDialogOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          Aggiungi nuovo
        </Button>
      </div>

      {/* Sub-tabs Pagamenti / Incassi */}
      <div className="flex items-center gap-2">
        {subTabs.map((tab) => {
          const Icon = tab.icon
          const isActive = subTab === tab.value
          return (
            <Button
              key={tab.value}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'gap-2',
                isActive && tab.value === 'passiva' && 'bg-rose-600 hover:bg-rose-700',
                isActive && tab.value === 'attiva' && 'bg-emerald-600 hover:bg-emerald-700',
              )}
              onClick={() => setSubTab(tab.value)}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Button>
          )
        })}
      </div>

      {/* Barra ricerca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Ricerca ricorrenza..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Tabella */}
      <Card>
        <CardContent className="p-0">
          <RecurrenceTable
            recurrences={recurrences}
            isLoading={isLoading}
            onEdit={(rec) => { setEditingRecurrence(rec); setDialogOpen(true) }}
            onGenerate={handleGenerate}
            onToggleActive={handleToggleActive}
            onDelete={handleDelete}
          />
        </CardContent>
      </Card>

      {/* Dialog Crea / Modifica */}
      <CreateRecurrenceDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingRecurrence(null)
        }}
        onSubmit={editingRecurrence ? handleEdit : handleCreate}
        initialData={editingRecurrence}
        tipo={subTab}
      />
    </div>
  )
}
