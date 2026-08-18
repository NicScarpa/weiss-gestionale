"use client"

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SchedulePaymentMethod, SCHEDULE_PAYMENT_METHOD_LABELS } from '@/types/schedule'
import { formatCurrency } from '@/lib/formatters'
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { AccountCombobox } from '@/components/prima-nota/shared/AccountCombobox'
import { useCostCenters } from '@/components/prima-nota/shared/CostCenterSelect'
import { useAccountsForCombobox, buildCostCenterRuleMap } from '@/hooks/useImputableAccounts'
import type { AccountType } from '@prisma/client'

/**
 * Una scadenza passiva si paga su un conto di costo, una attiva si incassa su
 * un conto di ricavo: la finestra non sa quale delle due sia, quindi li offre
 * entrambi e lascia scegliere.
 */
const CONTI_IMPUTABILI: AccountType[] = ['COSTO', 'RICAVO']
import { it } from 'date-fns/locale'

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Deve sollevare un errore se il salvataggio fallisce: è così che il dialog
   * sa di dover restare aperto con i dati che l'utente ha già inserito.
   */
  onSubmit: (data: PaymentFormData) => Promise<void>
  isLoading?: boolean
  importoResiduo: number
}

export interface PaymentFormData {
  importo: number
  /**
   * Giorno civile 'yyyy-MM-dd'. Una `Date` diventerebbe un istante UTC nel
   * JSON: un pagamento registrato dopo le 22:00 italiane arriverebbe al
   * server con la data del giorno prima.
   */
  dataPagamento: string
  metodo?: SchedulePaymentMethod
  riferimento?: string
  note?: string
  /** Conto su cui imputare la scrittura di prima nota generata dal pagamento. */
  accountId: string
  /** Solo quando il conto scelto lo pretende. */
  costCenterId?: string
}

export function PaymentDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  importoResiduo,
}: PaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Registra Pagamento</DialogTitle>
          <DialogDescription>
            Importo residuo: <span className="font-semibold text-foreground">
              {formatCurrency(importoResiduo)}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Radix smonta il contenuto alla chiusura: alla riapertura il modulo
            rinasce vuoto e con la data di oggi, senza un effetto che lo
            svuoti. Se il salvataggio fallisce il dialog resta aperto e
            quello che l'utente ha scritto resta lì. */}
        <ModuloPagamento
          onSubmit={onSubmit}
          isLoading={isLoading}
          importoResiduo={importoResiduo}
          onChiudi={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function ModuloPagamento({
  onSubmit,
  isLoading,
  importoResiduo,
  onChiudi,
}: {
  onSubmit: (data: PaymentFormData) => Promise<void>
  isLoading: boolean
  importoResiduo: number
  onChiudi: () => void
}) {
  const [importo, setImporto] = useState('')
  const [dataPagamento, setDataPagamento] = useState<Date>(() => new Date())
  const [metodo, setMetodo] = useState<SchedulePaymentMethod | undefined>()
  const [riferimento, setRiferimento] = useState('')
  const [note, setNote] = useState('')
  const [accountId, setAccountId] = useState<string | undefined>()
  const [costCenterId, setCostCenterId] = useState<string | undefined>()
  const [errore, setErrore] = useState<string | null>(null)
  const [invioInCorso, setInvioInCorso] = useState(false)

  // Il conto decide se serve anche un centro di costo: alcuni conti del piano
  // lo pretendono, e senza il campo qui il server rifiuterebbe il pagamento
  // indicando un'azione che da questa finestra non si potrebbe compiere.
  const { data: contiPerRegola = [] } = useAccountsForCombobox(CONTI_IMPUTABILI)
  const regolaCentro = accountId
    ? buildCostCenterRuleMap(contiPerRegola).get(accountId)
    : undefined
  const centroObbligatorio = regolaCentro === 'OBBLIGATORIO'
  const { data: centriDiCosto = [] } = useCostCenters()

  /**
   * Il solo `disabled` sul bottone non basta: fra il click e il re-render
   * React passa un attimo in cui altri click arrivano lo stesso, e ognuno
   * registrava un pagamento. Il ref cambia valore nello stesso giro di
   * esecuzione dell'handler, prima di qualunque await.
   */
  const invioRef = useRef(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (invioRef.current) return

    if (!accountId) {
      setErrore('Scegli il conto su cui imputare il pagamento in prima nota')
      return
    }
    if (centroObbligatorio && !costCenterId) {
      setErrore('Il conto scelto richiede un centro di costo')
      return
    }
    setErrore(null)

    invioRef.current = true
    setInvioInCorso(true)

    try {
      await onSubmit({
        importo: parseFloat(importo),
        dataPagamento: format(dataPagamento, 'yyyy-MM-dd'),
        metodo,
        riferimento: riferimento || undefined,
        note: note || undefined,
        accountId,
        costCenterId: costCenterId || undefined,
      })
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'Non è stato possibile registrare il pagamento'
      )
    } finally {
      invioRef.current = false
      setInvioInCorso(false)
    }
  }

  const importoNum = parseFloat(importo) || 0
  const inAttesa = isLoading || invioInCorso

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {errore && (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 p-2 text-sm text-destructive">
          {errore}
        </p>
      )}

      {/* Conto: il pagamento nasce anche come scrittura di prima nota, e la
          scadenza non porta con sé un conto su cui imputarla. */}
      <div className="space-y-2">
        <Label>Conto *</Label>
        <AccountCombobox
          types={CONTI_IMPUTABILI}
          value={accountId}
          onChange={(scelto) => {
            setAccountId(scelto)
            setCostCenterId(undefined)
          }}
          placeholder="Su quale conto va registrato"
          disabled={isLoading || invioInCorso}
        />
        <p className="text-xs text-muted-foreground">
          Il pagamento viene registrato anche in prima nota, su questo conto
        </p>
      </div>

      {centroObbligatorio && (
        <div className="space-y-2">
          <Label>Centro di costo *</Label>
          <Select value={costCenterId} onValueChange={setCostCenterId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleziona centro di costo" />
            </SelectTrigger>
            <SelectContent>
              {centriDiCosto.map((centro) => (
                <SelectItem key={centro.id} value={centro.id}>
                  {centro.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Il conto scelto lo richiede
          </p>
        </div>
      )}

      {/* Importo */}
      <div className="space-y-2">
        <Label htmlFor="importo">Importo pagato *</Label>
        <Input
          id="importo"
          type="number"
          step="0.01"
          min="0.01"
          max={importoResiduo}
          placeholder="0,00"
          value={importo}
          onChange={(e) => setImporto(e.target.value)}
          required
        />
      </div>

      {/* Data Pagamento */}
      <div className="space-y-2">
        <Label>Data Pagamento *</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start text-normal font-normal"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(dataPagamento, 'PPPP', { locale: it })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            {/* `required`: la data di pagamento non è annullabile, e lo stato
                che la tiene è una `Date` piena. Senza, ricliccare il giorno
                già selezionato lo deselezionava e passava `undefined` a
                `setDataPagamento`, dopodiché il `format` qui sopra andava in
                RangeError e il dialog spariva. */}
            <Calendar
              mode="single"
              required
              selected={dataPagamento}
              onSelect={setDataPagamento}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Metodo Pagamento */}
      <div className="space-y-2">
        <Label htmlFor="metodo">Metodo Pagamento</Label>
        <Select value={metodo || ''} onValueChange={(v) => setMetodo(v as SchedulePaymentMethod || undefined)}>
          <SelectTrigger id="metodo">
            <SelectValue placeholder="Seleziona metodo..." />
          </SelectTrigger>
          <SelectContent>
            {Object.values(SchedulePaymentMethod).map((m) => (
              <SelectItem key={m} value={m}>
                {SCHEDULE_PAYMENT_METHOD_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Riferimento */}
      <div className="space-y-2">
        <Label htmlFor="riferimento">Riferimento</Label>
        <Input
          id="riferimento"
          placeholder="Es. Bolletta #123"
          value={riferimento}
          onChange={(e) => setRiferimento(e.target.value)}
        />
      </div>

      {/* Note */}
      <div className="space-y-2">
        <Label htmlFor="note">Note</Label>
        <Textarea
          id="note"
          placeholder="Note aggiuntive..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={onChiudi}
          disabled={inAttesa}
        >
          Annulla
        </Button>
        <Button type="submit" disabled={inAttesa || importoNum <= 0 || importoNum > importoResiduo}>
          {inAttesa ? 'Registrazione...' : 'Registra Pagamento'}
        </Button>
      </DialogFooter>
    </form>
  )
}
