'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { AccountCombobox } from '@/components/prima-nota/shared/AccountCombobox'
import { CostCenterSelect } from '@/components/prima-nota/shared/CostCenterSelect'
import { useAccountsForCombobox, buildCostCenterRuleMap } from '@/hooks/useImputableAccounts'
import type { JournalEntry } from '@/types/prima-nota'

interface EditContoCentroDialogProps {
  entry: JournalEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount)
}

/**
 * Selezione corrente del dialog, nella stessa forma in cui la tiene lo
 * stato React: `undefined` per il conto significa "non ancora scelto",
 * per il centro significa "Nessuno" scelto esplicitamente in
 * CostCenterSelect (sentinella NESSUN_CENTRO risolta a `undefined`).
 */
interface ReclassifySelection {
  accountId: string | undefined
  costCenterId: string | undefined
}

/**
 * Costruisce il body della PUT di riclassifica includendo solo i campi
 * realmente cambiati rispetto al movimento originale — mai una chiave in
 * più, perché la route (Task 8) rifiuta con 400 qualunque campo diverso da
 * accountId/costCenterId sui movimenti da chiusura.
 *
 * Il centro di costo, se cambiato, è sempre esplicito (`string` o `null`,
 * mai omesso): `JSON.stringify` scarta le chiavi `undefined`, quindi se lo
 * si lasciasse `undefined` per rappresentare "Nessuno" la chiave
 * sparirebbe dal body e il server la leggerebbe come "nessun cambiamento"
 * anziché come "azzeralo e lascia che sia la regola del conto a deciderlo" —
 * l'esatto opposto di quello che l'utente ha scelto in UI.
 */
export function buildReclassifyPayload(
  original: Pick<JournalEntry, 'accountId' | 'costCenterId'>,
  selection: ReclassifySelection
): { accountId?: string; costCenterId?: string | null } {
  const payload: { accountId?: string; costCenterId?: string | null } = {}

  if (selection.accountId && selection.accountId !== original.accountId) {
    payload.accountId = selection.accountId
  }
  if (selection.costCenterId !== original.costCenterId) {
    payload.costCenterId = selection.costCenterId ?? null
  }

  return payload
}

/**
 * Dialog di riclassifica per i movimenti generati da una chiusura di cassa
 * (Task 15): l'unica correzione ammessa lato server (Task 8) è conto e
 * centro di costo — importi, data, registro e descrizione restano dato
 * contabile intoccabile, mostrati qui sotto in sola lettura perché chi apre
 * il dialog capisca subito che questa è una riclassifica, non una modifica.
 *
 * Nessun filtro `types` sull'AccountCombobox: i movimenti da chiusura non
 * imputano solo conti di ricavo/costo (corrispettivi, spese) ma anche, per
 * le due gambe del versamento cassa↔banca, i conti patrimoniali di sistema
 * CASSA/BANCA (tipo ATTIVO, vedi closure-journal-entries.ts). Filtrare per
 * tipo dedotto dal movimento — come fa MovimentoFormDialog per i movimenti
 * ordinari — escluderebbe quei conti dalla lista e la combobox mostrerebbe
 * "Seleziona conto" anche quando un conto è già assegnato: un'apparenza
 * sbagliata proprio nel dialog che deve ispirare fiducia su cosa cambia.
 */
export function EditContoCentroDialog({ entry, open, onOpenChange, onSaved }: EditContoCentroDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Riclassifica movimento da chiusura</DialogTitle>
          <DialogDescription>
            Puoi correggere solo conto e centro di costo. Importo, data, registro e descrizione
            sono dato contabile della chiusura e non si possono modificare da qui.
          </DialogDescription>
        </DialogHeader>

        {/* Radix smonta il contenuto alla chiusura, e la `key` lo rifà da capo
            quando si passa da un movimento all'altro senza chiudere: i campi
            nascono già dal movimento, senza un effetto che li riallinei — che
            costava un secondo render a ogni apertura. */}
        <ModuloRiclassifica
          key={entry?.id ?? 'nessuno'}
          entry={entry}
          onChiudi={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  )
}

function ModuloRiclassifica({
  entry,
  onChiudi,
  onSaved,
}: {
  entry: JournalEntry | null
  onChiudi: () => void
  onSaved: () => void
}) {
  const [accountId, setAccountId] = React.useState<string | undefined>(entry?.accountId)
  const [costCenterId, setCostCenterId] = React.useState<string | undefined>(entry?.costCenterId)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Nessun filtro types (vedi sopra): stessa chiave di query di un
  // AccountCombobox "aperto", copre l'intero piano dei conti senza fetch
  // aggiuntive rispetto a quelle già usate altrove (es. SplitEntryDialog).
  const { data: accountsForRule = [] } = useAccountsForCombobox()
  const costCenterRuleByAccountId = React.useMemo(
    () => buildCostCenterRuleMap(accountsForRule),
    [accountsForRule]
  )
  const isCostCenterRequired = accountId
    ? costCenterRuleByAccountId.get(accountId) === 'OBBLIGATORIO'
    : false
  const centroMancante = isCostCenterRequired && !costCenterId

  const importo = entry ? Math.abs(entry.debitAmount || entry.creditAmount || 0) : 0
  const payload = entry ? buildReclassifyPayload(entry, { accountId, costCenterId }) : {}
  const hasChanges = Object.keys(payload).length > 0

  const handleSubmit = async () => {
    if (!entry || !hasChanges || centroMancante) return
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/prima-nota/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Errore nella riclassifica del movimento')

      toast.success('Movimento riclassificato')
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Errore sconosciuto')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
        {entry && (
          <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Data</span>
              <span className="font-medium">
                {format(new Date(entry.date), 'dd/MM/yyyy', { locale: it })}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span className="text-muted-foreground shrink-0">Descrizione</span>
              <span className="font-medium text-right">{entry.description}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Importo</span>
              <span className="font-medium">{formatCurrency(importo)}</span>
            </div>
          </div>
        )}

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Conto</Label>
            <AccountCombobox value={accountId} onChange={setAccountId} disabled={isSubmitting} />
          </div>
          <div className="space-y-1.5">
            <Label>Centro di costo{isCostCenterRequired ? ' *' : ''}</Label>
            <CostCenterSelect
              value={costCenterId}
              onChange={setCostCenterId}
              required={isCostCenterRequired}
              disabled={isSubmitting}
            />
            {centroMancante && (
              <p className="text-xs text-destructive">
                Il centro di costo è obbligatorio per questo conto.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onChiudi}
            disabled={isSubmitting}
          >
            Annulla
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !hasChanges || centroMancante}
          >
            {isSubmitting ? 'Salvataggio...' : 'Riclassifica'}
          </Button>
        </DialogFooter>
    </>
  )
}
