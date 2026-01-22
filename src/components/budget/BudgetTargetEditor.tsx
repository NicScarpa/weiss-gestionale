'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/constants'
import { toast } from 'sonner'
import { MONTH_LABELS_FULL, MONTH_KEYS, type MonthKey } from '@/types/budget'

import { logger } from '@/lib/logger'
interface BudgetTargetEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  venueId: string
  year: number
  onSaved?: () => void
}

type MonthlyTargets = Record<MonthKey, number>

export function BudgetTargetEditor({
  open,
  onOpenChange,
  venueId,
  year,
  onSaved,
}: BudgetTargetEditorProps) {
  const [targets, setTargets] = useState<MonthlyTargets>(() => {
    const initial: Record<string, number> = {}
    MONTH_KEYS.forEach((k) => (initial[k] = 0))
    return initial as MonthlyTargets
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Fetch existing targets
  useEffect(() => {
    if (!open) return

    const fetchTargets = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/budget/targets?venueId=${venueId}&year=${year}`)
        if (res.ok) {
          const data = await res.json()
          if (data.targets) {
            setTargets(data.targets)
          }
        }
      } catch (error) {
        logger.error('Errore fetch targets', error)
      } finally {
        setLoading(false)
      }
    }

    fetchTargets()
  }, [open, venueId, year])

  const handleChange = (month: MonthKey, value: string) => {
    const numValue = parseFloat(value) || 0
    setTargets((prev) => ({ ...prev, [month]: numValue }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/budget/targets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, year, targets }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore nel salvataggio')
      }

      toast.success('Target salvati con successo')
      onOpenChange(false)
      onSaved?.()
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message)
      } else {
        toast.error('Errore sconosciuto')
      }
    } finally {
      setSaving(false)
    }
  }

  // Distribuzione uniforme
  const handleDistributeEqually = () => {
    const total = Object.values(targets).reduce((sum, v) => sum + v, 0)
    if (total === 0) {
      toast.error('Inserisci almeno un valore prima di distribuire')
      return
    }

    const monthly = total / 12
    const newTargets: Record<string, number> = {}
    MONTH_KEYS.forEach((k) => (newTargets[k] = monthly))
    setTargets(newTargets as MonthlyTargets)
    toast.success('Target distribuiti uniformemente')
  }

  const totalAnnual = Object.values(targets).reduce((sum, v) => sum + v, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configura Target Ricavi {year}</DialogTitle>
          <DialogDescription>
            Imposta i target di ricavo mensili per monitorare le performance
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {MONTH_KEYS.map((month) => (
                <div key={month} className="space-y-1">
                  <Label className="text-xs">{MONTH_LABELS_FULL[month]}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    value={targets[month] || ''}
                    onChange={(e) => handleChange(month, e.target.value)}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                <p className="text-sm text-muted-foreground">Totale Annuale</p>
                <p className="text-xl font-bold">{formatCurrency(totalAnnual)}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleDistributeEqually}>
                Distribuisci uniformemente
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Salvataggio...' : 'Salva Target'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
