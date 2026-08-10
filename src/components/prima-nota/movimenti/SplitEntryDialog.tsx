'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AccountCombobox } from '@/components/prima-nota/shared/AccountCombobox'
import { useAccountsForCombobox, buildCostCenterRuleMap } from '@/hooks/useImputableAccounts'
import type { JournalEntry } from '@/types/prima-nota'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/formatters'

interface SplitRow {
  key: string
  accountId: string
  importo: string
  note: string
}

interface SplitEntryDialogProps {
  entry: JournalEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}


function round2(n: number) {
  return Math.round(n * 100) / 100
}

let rowIdCounter = 0
function nextRowKey() {
  rowIdCounter += 1
  return `riga-${rowIdCounter}`
}

function emptyRow(): SplitRow {
  return { key: nextRowKey(), accountId: '', importo: '', note: '' }
}

/**
 * Stato di validità di una riga: 'empty' = non ancora compilata (ignorata al
 * submit), 'valid' = pronta per essere inviata, 'invalid' = compilata solo
 * in parte (blocca il submit finché non viene completata o rimossa).
 */
function rowStatus(row: SplitRow): 'empty' | 'valid' | 'invalid' {
  const hasAccount = !!row.accountId
  const importoNum = parseFloat(row.importo)
  const hasImporto = row.importo.trim() !== '' && !isNaN(importoNum) && importoNum > 0
  if (!hasAccount && !hasImporto) return 'empty'
  if (hasAccount && hasImporto) return 'valid'
  return 'invalid'
}

/** Le fette manuali già salvate sul movimento, o una riga vuota da compilare. */
function righeIniziali(entry: JournalEntry | null): SplitRow[] {
  if (!entry) return []
  const manuali = (entry.allocations ?? []).filter((a) => a.origine === 'manuale')
  return manuali.length > 0
    ? manuali.map((a) => ({
        key: nextRowKey(),
        accountId: a.accountId,
        importo: a.importo.toFixed(2),
        note: a.note ?? '',
      }))
    : [emptyRow()]
}

/**
 * Dialog "Suddividi importo": editor delle fette manuali di un movimento
 * (PUT/DELETE /api/prima-nota/[id]/suddivisione, Task 7). Rispecchia lato
 * client le stesse regole di setEntryAllocations: ogni fetta > 0, somma <=
 * importo del movimento (con tolleranza di arrotondamento).
 */
export function SplitEntryDialog({ entry, open, onOpenChange, onSaved }: SplitEntryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Suddividi importo</DialogTitle>
          <DialogDescription className="truncate">
            {entry?.description}
          </DialogDescription>
        </DialogHeader>

        {/* Radix smonta il contenuto alla chiusura e la `key` lo rifà da capo
            quando si passa da un movimento all'altro senza chiudere: le righe
            nascono già dalle fette salvate, senza un effetto che le riallinei. */}
        <ModuloSuddivisione
          key={entry?.id ?? 'nessuno'}
          entry={entry}
          onChiudi={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  )
}

function ModuloSuddivisione({
  entry,
  onChiudi,
  onSaved,
}: {
  entry: JournalEntry | null
  onChiudi: () => void
  onSaved: () => void
}) {
  const [rows, setRows] = React.useState<SplitRow[]>(() => righeIniziali(entry))
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isRemoving, setIsRemoving] = React.useState(false)

  // Fette ereditate dalla riconciliazione (Fase 3): sola lettura, non entrano
  // mai nelle righe editabili né nel payload del PUT, ma pesano sul residuo.
  const ereditate = React.useMemo(
    () => (entry?.allocations ?? []).filter((a) => a.origine === 'ereditata'),
    [entry]
  )
  const sommaEreditate = round2(ereditate.reduce((sum, a) => sum + a.importo, 0))

  // Stessa chiave di query usata internamente da AccountCombobox in questo
  // dialog (nessun filtro types): nessuna fetch aggiuntiva, serve solo a
  // capire se una fetta imputa un conto OBBLIGATORIO (Task 13).
  // Nessun campo centro qui: le fette ereditano quello del movimento.
  const { data: accountsForRule = [] } = useAccountsForCombobox()
  const costCenterRuleByAccountId = React.useMemo(
    () => buildCostCenterRuleMap(accountsForRule),
    [accountsForRule]
  )

  const importoMovimento = entry ? Math.abs(entry.debitAmount || entry.creditAmount || 0) : 0
  const statuses = rows.map(rowStatus)
  const hasObbligatorioSenzaCentro =
    !entry?.costCenterId &&
    rows.some(
      (row, i) => statuses[i] === 'valid' && costCenterRuleByAccountId.get(row.accountId) === 'OBBLIGATORIO'
    )
  const hasInvalidRow = statuses.includes('invalid')
  const sommaFette = rows.reduce(
    (sum, row, i) => (statuses[i] === 'valid' ? sum + parseFloat(row.importo) : sum),
    0
  )
  const residuo = round2(importoMovimento - sommaFette - sommaEreditate)
  const sommaSupera = sommaFette + sommaEreditate > importoMovimento + 0.01
  const hasExistingSplit = (entry?.allocations ?? []).some((a) => a.origine === 'manuale')
  const isBusy = isSubmitting || isRemoving

  const updateRow = (key: string, patch: Partial<SplitRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow()])
  }

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  const handleQuadra = (key: string) => {
    setRows((prev) => {
      const sumOthers = prev.reduce((sum, r) => {
        if (r.key === key) return sum
        const n = parseFloat(r.importo)
        return sum + (isNaN(n) ? 0 : n)
      }, 0)
      const target = Math.max(0, round2(importoMovimento - sumOthers - sommaEreditate))
      return prev.map((r) => (r.key === key ? { ...r, importo: target.toFixed(2) } : r))
    })
  }

  const handleSubmit = async () => {
    if (!entry) return
    setIsSubmitting(true)
    try {
      const fette = rows
        .filter((_, i) => statuses[i] === 'valid')
        .map((r) => ({
          accountId: r.accountId,
          importo: round2(parseFloat(r.importo)),
          note: r.note.trim() || undefined,
        }))

      const res = await fetch(`/api/prima-nota/${entry.id}/suddivisione`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fette }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Errore nella suddivisione del movimento')

      toast.success('Movimento suddiviso')
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Errore sconosciuto')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveSplit = async () => {
    if (!entry) return
    setIsRemoving(true)
    try {
      const res = await fetch(`/api/prima-nota/${entry.id}/suddivisione`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Errore nella rimozione della suddivisione')

      toast.success('Suddivisione rimossa')
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Errore sconosciuto')
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <>
      <div className="space-y-3 py-2">
        {rows.map((row, index) => {
          const isLast = index === rows.length - 1
          return (
            <div key={row.key} className="flex items-start gap-2">
              <div className="flex-1">
                <AccountCombobox
                  value={row.accountId}
                  onChange={(accountId) => updateRow(row.key, { accountId: accountId ?? '' })}
                  disabled={isBusy}
                />
              </div>
              <div className="w-28 shrink-0">
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={row.importo}
                    onChange={(e) => updateRow(row.key, { importo: e.target.value })}
                    disabled={isBusy}
                    className="pl-6"
                  />
                  <span className="absolute left-2 top-2.5 text-xs text-muted-foreground">€</span>
                </div>
              </div>
              <div className="w-32 shrink-0">
                <Input
                  placeholder="Nota"
                  value={row.note}
                  onChange={(e) => updateRow(row.key, { note: e.target.value })}
                  disabled={isBusy}
                />
              </div>
              <div className="flex items-center gap-1 pt-1 shrink-0">
                {isLast && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleQuadra(row.key)}
                    disabled={isBusy || importoMovimento <= 0}
                    title="Porta questa fetta a coprire il residuo"
                  >
                    Quadra
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRow(row.key)}
                  disabled={isBusy}
                  title="Rimuovi fetta"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )
        })}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={isBusy}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Aggiungi fetta
        </Button>
      </div>

      {ereditate.length > 0 && (
        <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
          Fette ereditate dalla riconciliazione: {ereditate.length}, totale{' '}
          {formatCurrency(sommaEreditate)}
        </div>
      )}

      {hasObbligatorioSenzaCentro && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Una fetta imputa un conto che richiede un centro di costo, ma il movimento non ne ha
          uno assegnato. Le fette ereditano il centro del movimento: assegnalo prima dal form di
          modifica, altrimenti il salvataggio verrà rifiutato.
        </div>
      )}

      <div className="bg-muted/50 rounded-lg p-4 space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span>Importo movimento:</span>
          <span className="font-medium">{formatCurrency(importoMovimento)}</span>
        </div>
        {ereditate.length > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span>Fette ereditate:</span>
            <span className="font-medium">{formatCurrency(sommaEreditate)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span>{ereditate.length > 0 ? 'Somma fette manuali:' : 'Somma fette:'}</span>
          <span className="font-medium">{formatCurrency(sommaFette)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>Residuo:</span>
          <span
            className={cn(
              'font-semibold',
              sommaSupera ? 'text-red-600' : residuo === 0 ? 'text-green-600' : 'text-muted-foreground'
            )}
          >
            {formatCurrency(residuo)}
          </span>
        </div>
        {sommaSupera && (
          <p className="text-xs text-red-600">
            La somma delle fette supera l&apos;importo del movimento.
          </p>
        )}
        {hasInvalidRow && !sommaSupera && (
          <p className="text-xs text-amber-600">
            Completa conto e importo per ogni fetta, oppure rimuovila.
          </p>
        )}
      </div>

      <DialogFooter className="sm:justify-between">
        <div>
          {hasExistingSplit && (
            <Button
              type="button"
              variant="outline"
              onClick={handleRemoveSplit}
              disabled={isBusy}
            >
              {isRemoving ? 'Rimozione...' : 'Rimuovi suddivisione'}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onChiudi}
            disabled={isBusy}
          >
            Annulla
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isBusy || hasInvalidRow || sommaSupera}
          >
            {isSubmitting ? 'Salvataggio...' : 'Salva'}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
