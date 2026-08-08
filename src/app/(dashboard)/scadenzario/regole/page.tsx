"use client"

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RuleTable } from '@/components/scadenzario/rule-table'
import {
  ScheduleRule,
  ScheduleRuleDirection,
  SCHEDULE_RULE_DIRECTION_LABELS,
} from '@/types/schedule'
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
import { Plus, ArrowUpCircle, ArrowDownCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type SubTab = 'emessi' | 'ricevuti'

type RispostaRegole = { data?: ScheduleRule[] }

export default function RegolePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [subTab, setSubTab] = useState<SubTab>('emessi')
  const [deleteRule, setDeleteRule] = useState<ScheduleRule | null>(null)

  const chiaveRegole = ['scadenzario-regole', subTab]

  const {
    data: risposta,
    isPending,
    isFetching,
    refetch: fetchRules,
  } = useQuery({
    // Come prima: ricarica a ogni montaggio e a ogni cambio di sotto-scheda.
    refetchOnMount: 'always',
    staleTime: 0,
    queryKey: chiaveRegole,
    queryFn: async (): Promise<RispostaRegole> => {
      const params = new URLSearchParams()
      params.append('direzione', subTab)

      const resp = await fetch(`/api/scadenzario/regole?${params}`)
      if (!resp.ok) throw new Error('Errore nel caricamento delle regole')
      return resp.json()
    },
  })

  const rules = risposta?.data ?? []
  const isLoading = isPending || isFetching

  const reorderRules = async (orderedIds: string[]) => {
    try {
      const resp = await fetch('/api/scadenzario/regole/riordina', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      })

      if (resp.ok) {
        const data: RispostaRegole = await resp.json()
        queryClient.setQueryData<RispostaRegole>(chiaveRegole, data)
      }
    } catch {
      toast.error('Errore nel riordino')
    }
  }

  const handleMoveToTop = (rule: ScheduleRule) => {
    const ids = rules.map(r => r.id)
    const filtered = ids.filter(id => id !== rule.id)
    reorderRules([rule.id, ...filtered])
  }

  const handleMoveToBottom = (rule: ScheduleRule) => {
    const ids = rules.map(r => r.id)
    const filtered = ids.filter(id => id !== rule.id)
    reorderRules([...filtered, rule.id])
  }

  const handleDelete = async () => {
    if (!deleteRule) return

    try {
      const resp = await fetch(`/api/scadenzario/regole/${deleteRule.id}`, {
        method: 'DELETE',
      })

      if (resp.ok) {
        toast.success('Regola eliminata')
        fetchRules()
      } else {
        toast.error("Errore nell'eliminazione")
      }
    } catch {
      toast.error("Errore nell'eliminazione della regola")
    }
    setDeleteRule(null)
  }

  const handleEdit = (rule: ScheduleRule) => {
    router.push(`/scadenzario/regole/${rule.id}/modifica`)
  }

  const subTabs: { value: SubTab; label: string; icon: typeof ArrowUpCircle }[] = [
    { value: 'emessi', label: SCHEDULE_RULE_DIRECTION_LABELS[ScheduleRuleDirection.EMESSI], icon: ArrowUpCircle },
    { value: 'ricevuti', label: SCHEDULE_RULE_DIRECTION_LABELS[ScheduleRuleDirection.RICEVUTI], icon: ArrowDownCircle },
  ]

  return (
    <div className="flex-1 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Regole
          </h1>
          <p className="text-muted-foreground">
            Assegnazione automatica del conto contabile ai documenti importati
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => router.push(`/scadenzario/regole/nuova?direzione=${subTab}`)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Aggiungi una nuova regola +
        </Button>
      </div>

      {/* Sub-tabs emessi / ricevuti */}
      <div className="flex flex-wrap items-center gap-2">
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
                isActive && tab.value === 'emessi' && 'bg-emerald-600 hover:bg-emerald-700',
                isActive && tab.value === 'ricevuti' && 'bg-rose-600 hover:bg-rose-700',
              )}
              onClick={() => setSubTab(tab.value)}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Button>
          )
        })}
      </div>

      {/* Nota ordine */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />
        <span>
          Le regole sono valutate nell&apos;ordine visualizzato e la prima che corrisponde
          vince. Quando una scadenza le soddisfa, il sistema crea il movimento sul conto
          bancario indicato e lo riconcilia, saldandola: serve per ciò che non arriva
          dall&apos;estratto conto, come contanti, POS o addebiti automatici. La voce contabile
          del movimento viene dal fornitore, non dalla regola.
        </span>
      </div>

      {/* Tabella */}
      <Card>
        <CardContent className="p-0">
          <RuleTable
            rules={rules}
            isLoading={isLoading}
            onEdit={handleEdit}
            onDelete={(rule) => setDeleteRule(rule)}
            onMoveToTop={handleMoveToTop}
            onMoveToBottom={handleMoveToBottom}
          />
        </CardContent>
      </Card>

      {/* Dialog conferma eliminazione */}
      <AlertDialog open={!!deleteRule} onOpenChange={(open) => !open && setDeleteRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa regola?</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione non può essere annullata. La regola verrà eliminata permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
