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
import { formatCurrency } from '@/lib/formatters'
import type { RigaEstrattoConto } from '@/types/reconciliation'

/** Su cosa si categorizza: una riga, le righe selezionate, o tutte quelle del filtro. */
export type BersaglioCategorizza =
  | { tipo: 'riga'; riga: RigaEstrattoConto }
  | { tipo: 'selezione'; ids: string[] }
  | { tipo: 'filtro'; filtro: Record<string, string>; totale: number }

interface Props {
  bersaglio: BersaglioCategorizza | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A cose fatte: il contenitore ricarica la lista e svuota la selezione. */
  onFatto: () => void
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function quante(b: BersaglioCategorizza): number {
  if (b.tipo === 'riga') return 1
  if (b.tipo === 'selezione') return b.ids.length
  return b.totale
}

/**
 * Categorizza: la riga diventa una scrittura di prima nota con conto e centro
 * (spec, «Le azioni»); in blocco, N righe con la stessa imputazione — le 62
 * commissioni in un colpo. La categoria di budget non si chiede: si deriva dal
 * conto (piano dei conti v4).
 */
export function CategorizzaDialog({ bersaglio, open, onOpenChange, onFatto }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        {/* La `key` rifà il modulo da capo quando cambia il bersaglio senza
            chiudere: i campi nascono già dalla riga, senza un effetto. */}
        {bersaglio && (
          <Modulo
            key={bersaglio.tipo === 'riga' ? bersaglio.riga.id : `${bersaglio.tipo}-${quante(bersaglio)}`}
            bersaglio={bersaglio}
            onChiudi={() => onOpenChange(false)}
            onFatto={onFatto}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Modulo({
  bersaglio,
  onChiudi,
  onFatto,
}: {
  bersaglio: BersaglioCategorizza
  onChiudi: () => void
  onFatto: () => void
}) {
  const riga = bersaglio.tipo === 'riga' ? bersaglio.riga : null
  const n = quante(bersaglio)
  const [accountId, setAccountId] = React.useState<string | undefined>(riga?.matchedEntry?.account?.id)
  const [costCenterId, setCostCenterId] = React.useState<string | undefined>(riga?.matchedEntry?.costCenter?.id)
  const [inCorso, setInCorso] = React.useState(false)

  const { data: conti = [] } = useAccountsForCombobox()
  const regolaPerConto = React.useMemo(() => buildCostCenterRuleMap(conti), [conti])
  const centroObbligatorio = accountId ? regolaPerConto.get(accountId) === 'OBBLIGATORIO' : false
  const centroMancante = centroObbligatorio && !costCenterId
  // Con le fette il conto lo governa la suddivisione: la rotta rifiuterebbe,
  // e qui lo si dice prima.
  const conFette = (riga?.matchedEntry?.fette ?? 0) > 0

  const invia = async () => {
    if (!accountId || centroMancante || conFette) return
    setInCorso(true)
    try {
      const imputazione = { accountId, ...(costCenterId ? { costCenterId } : {}) }
      let url: string
      let corpo: unknown
      if (bersaglio.tipo === 'riga') {
        url = `/api/bank-transactions/${bersaglio.riga.id}/categorizza`
        corpo = imputazione
      } else {
        url = '/api/bank-transactions/categorizza-in-blocco'
        corpo = bersaglio.tipo === 'selezione' ? { ids: bersaglio.ids, imputazione } : { filtro: bersaglio.filtro, imputazione }
      }
      const r = await fetch(url, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(corpo) })
      const json = (await r.json().catch(() => ({}))) as { error?: string; creata?: boolean; toccate?: number; saltate?: number }
      if (!r.ok) throw new Error(json.error || 'Categorizzazione non riuscita')

      if (riga) {
        toast.success(json.creata ? 'Movimento categorizzato' : 'Categoria aggiornata')
      } else {
        const toccate = json.toccate ?? 0
        const saltate = json.saltate ?? 0
        toast.success(
          `${toccate} ${toccate === 1 ? 'movimento categorizzato' : 'movimenti categorizzati'}` +
            (saltate > 0 ? ` · ${saltate} ${saltate === 1 ? 'saltato' : 'saltati'}` : '')
        )
      }
      onFatto()
      onChiudi()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Errore sconosciuto')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {riga ? 'Categorizza movimento' : n === 1 ? 'Categorizza 1 movimento' : `Categorizza ${n} movimenti`}
        </DialogTitle>
        <DialogDescription>
          {riga
            ? 'Il movimento diventa una scrittura di prima nota con il conto e il centro scelti. Data, importo e verso restano quelli della banca.'
            : 'Ogni movimento diventa una scrittura di prima nota con lo stesso conto e centro; quelli già categorizzati ricevono la nuova imputazione.'}
        </DialogDescription>
      </DialogHeader>

      {riga && (
        <div className="space-y-1.5 rounded-lg border bg-muted/50 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Data</span>
            <span className="font-medium">{format(new Date(riga.transactionDate), 'dd/MM/yyyy', { locale: it })}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <span className="shrink-0 text-muted-foreground">Descrizione</span>
            <span className="min-w-0 truncate text-right font-medium">{riga.descrizione ?? riga.description}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Importo</span>
            <span className="font-medium">
              {riga.amount > 0 ? '+' : '−'}
              {formatCurrency(Math.abs(riga.amount))}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label>Conto</Label>
          <AccountCombobox value={accountId} onChange={setAccountId} disabled={inCorso || conFette} />
        </div>
        <div className="space-y-1.5">
          <Label>Centro di costo{centroObbligatorio ? ' *' : ''}</Label>
          <CostCenterSelect value={costCenterId} onChange={setCostCenterId} required={centroObbligatorio} disabled={inCorso || conFette} />
          {centroMancante && <p className="text-xs text-destructive">Il centro di costo è obbligatorio per questo conto.</p>}
        </div>
        {conFette && (
          <p className="text-xs text-muted-foreground">
            La scrittura collegata è ripartita su più conti dalla fattura: la categoria si modifica dalla prima nota.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onChiudi} disabled={inCorso}>
          Annulla
        </Button>
        <Button type="button" onClick={invia} disabled={inCorso || !accountId || centroMancante || conFette}>
          {inCorso ? 'Salvataggio…' : 'Categorizza'}
        </Button>
      </DialogFooter>
    </>
  )
}
