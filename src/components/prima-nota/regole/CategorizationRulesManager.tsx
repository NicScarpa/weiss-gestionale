'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus,
  Lightbulb,
  Search,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { usePrimaNota } from '@/components/prima-nota/PrimaNotaContext'
import { RulesTable } from './RulesTable'
import { RegolaFormDialog } from './RegolaFormDialog'
import { CategorizationProposalsDialog } from './CategorizationProposalsDialog'
import type { CategorizationRule, RuleDirection } from '@/types/prima-nota'

interface CategorizationRulesManagerProps {
  venueId: string
  accounts: Array<{ id: string; name: string; code: string }>
  budgetCategories: Array<{ id: string; name: string; code: string; color?: string }>
}

export function CategorizationRulesManager({
  venueId: venueIdProp,
  accounts,
  budgetCategories,
}: CategorizationRulesManagerProps) {
  const { venueId: contextVenueId } = usePrimaNota()
  const venueId = contextVenueId || venueIdProp

  // State
  const [rules, setRules] = useState<CategorizationRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeDirection, setActiveDirection] = useState<RuleDirection>('OUTFLOW')
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedRule, setSelectedRule] = useState<CategorizationRule | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [proposalsDialogOpen, setProposalsDialogOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<CategorizationRule | null>(null)

  // Fetch rules
  const loadRules = useCallback(async () => {
    if (!venueId) return
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        venueId,
        direction: activeDirection,
      })
      const res = await fetch(`/api/categorization-rules?${params.toString()}`)
      if (!res.ok) throw new Error('Errore nel caricamento regole')
      const json = await res.json()
      setRules(json.data || [])
    } catch (error) {
      console.error('Errore caricamento regole:', error)
      toast.error('Impossibile caricare le regole')
    } finally {
      setIsLoading(false)
    }
  }, [venueId, activeDirection])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  // Client-side filtering
  const filteredRules = useMemo(() => {
    let result = rules
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(rule =>
        rule.keywords?.some(kw => kw.toLowerCase().includes(query)) ||
        rule.name?.toLowerCase().includes(query)
      )
    }
    if (categoryFilter) {
      result = result.filter(rule => rule.budgetCategoryId === categoryFilter)
    }
    return result
  }, [rules, searchQuery, categoryFilter])

  // --- CRUD Handlers ---

  const handleCreate = async (data: Record<string, unknown>) => {
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/categorization-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, venueId }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore creazione regola')
      }
      toast.success('Regola creata con successo')
      setDialogOpen(false)
      setSelectedRule(null)
      loadRules()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdate = async (data: Record<string, unknown>) => {
    if (!selectedRule) return
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/categorization-rules/${selectedRule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore aggiornamento regola')
      }
      toast.success('Regola aggiornata con successo')
      setDialogOpen(false)
      setSelectedRule(null)
      loadRules()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      const res = await fetch(`/api/categorization-rules/${deleteConfirm.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Errore eliminazione regola')
      toast.success('Regola eliminata')
      setDeleteConfirm(null)
      loadRules()
    } catch {
      toast.error('Impossibile eliminare la regola')
    }
  }

  const handleReorder = async (reorderedRules: CategorizationRule[]) => {
    // Aggiorna ottimisticamente l'ordine locale
    setRules(reorderedRules)

    // Aggiorna le priority in base al nuovo ordine (priority decrescente: primo = piu alta)
    try {
      const updates = reorderedRules.map((rule, index) => ({
        id: rule.id,
        priority: reorderedRules.length - index,
      }))

      await Promise.all(
        updates.map(({ id, priority }) =>
          fetch(`/api/categorization-rules/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority }),
          })
        )
      )
      toast.success('Ordine regole aggiornato')
    } catch {
      toast.error('Errore aggiornamento ordine')
      loadRules() // Rollback
    }
  }

  const handleMoveToTop = async (rule: CategorizationRule) => {
    const maxPriority = Math.max(...rules.map(r => r.priority), 0)
    try {
      await fetch(`/api/categorization-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: maxPriority + 1 }),
      })
      toast.success('Regola spostata in testa')
      loadRules()
    } catch {
      toast.error('Errore spostamento regola')
    }
  }

  const handleMoveToBottom = async (rule: CategorizationRule) => {
    const minPriority = Math.min(...rules.map(r => r.priority), 1)
    try {
      await fetch(`/api/categorization-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: Math.max(minPriority - 1, 1) }),
      })
      toast.success('Regola spostata in coda')
      loadRules()
    } catch {
      toast.error('Errore spostamento regola')
    }
  }

  const handleEdit = (rule: CategorizationRule) => {
    setSelectedRule(rule)
    setDialogOpen(true)
  }

  const handleNewRule = () => {
    setSelectedRule(null)
    setDialogOpen(true)
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header con sub-tabs e azioni */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveDirection('INFLOW')}
            className={`
              flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors
              ${activeDirection === 'INFLOW'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'text-muted-foreground hover:bg-muted/50'
              }
            `}
          >
            <TrendingUp className="h-4 w-4" />
            Regole in entrata
          </button>
          <button
            onClick={() => setActiveDirection('OUTFLOW')}
            className={`
              flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors
              ${activeDirection === 'OUTFLOW'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'text-muted-foreground hover:bg-muted/50'
              }
            `}
          >
            <TrendingDown className="h-4 w-4" />
            Regole in uscita
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setProposalsDialogOpen(true)}
          >
            <Lightbulb className="h-4 w-4 mr-2" />
            Proposte di categorizzazione
          </Button>
          <Button size="sm" onClick={handleNewRule}>
            <Plus className="h-4 w-4 mr-2" />
            Aggiungi una nuova regola
          </Button>
        </div>
      </div>

      {/* Filtri */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ricerca keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select
          value={categoryFilter}
          onValueChange={(value) => setCategoryFilter(value === '__all__' ? '' : value)}
        >
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="Tutte le categorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tutte le categorie</SelectItem>
            {budgetCategories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                <div className="flex items-center gap-2">
                  {cat.color && (
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color }}
                    />
                  )}
                  <span>{cat.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Info text */}
      <p className="text-xs text-muted-foreground">
        Le regole sono applicate nell&apos;ordine visualizzato. Trascina le righe per riordinare.
      </p>

      {/* Tabella regole */}
      <RulesTable
        rules={filteredRules}
        onEdit={handleEdit}
        onDelete={(rule) => setDeleteConfirm(rule)}
        onMoveToTop={handleMoveToTop}
        onMoveToBottom={handleMoveToBottom}
        onReorder={handleReorder}
        onCreate={handleNewRule}
        isLoading={isLoading}
      />

      {/* Dialog creazione/modifica regola */}
      {dialogOpen && (
        <RegolaFormDialog
          rule={selectedRule ? {
            name: selectedRule.name,
            direction: selectedRule.direction,
            keywords: selectedRule.keywords || [],
            priority: selectedRule.priority,
            isActive: selectedRule.isActive,
            budgetCategoryId: selectedRule.budgetCategoryId,
            accountId: selectedRule.accountId,
            autoVerify: selectedRule.autoVerify,
            autoHide: selectedRule.autoHide,
          } : undefined}
          accounts={accounts}
          budgetCategories={budgetCategories}
          onSave={selectedRule ? handleUpdate : handleCreate}
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) setSelectedRule(null)
          }}
          isSubmitting={isSubmitting}
          defaultDirection={activeDirection}
        />
      )}

      {/* Dialog conferma eliminazione */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => { if (!open) setDeleteConfirm(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa regola?</AlertDialogTitle>
            <AlertDialogDescription>
              La regola &ldquo;{deleteConfirm?.name}&rdquo; verra eliminata permanentemente.
              I movimenti gia categorizzati non verranno modificati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog proposte categorizzazione */}
      <CategorizationProposalsDialog
        open={proposalsDialogOpen}
        onOpenChange={setProposalsDialogOpen}
        venueId={venueId}
        budgetCategories={budgetCategories}
        onProposalApplied={loadRules}
      />
    </div>
  )
}
