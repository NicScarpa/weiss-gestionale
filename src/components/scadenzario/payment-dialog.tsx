"use client"

import { useEffect, useRef, useState } from 'react'
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
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
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
}

export function PaymentDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  importoResiduo,
}: PaymentDialogProps) {
  const [importo, setImporto] = useState('')
  const [dataPagamento, setDataPagamento] = useState<Date>(new Date())
  const [metodo, setMetodo] = useState<SchedulePaymentMethod | undefined>()
  const [riferimento, setRiferimento] = useState('')
  const [note, setNote] = useState('')
  const [invioInCorso, setInvioInCorso] = useState(false)

  /**
   * Il solo `disabled` sul bottone non basta: fra il click e il re-render
   * React passa un attimo in cui altri click arrivano lo stesso, e ognuno
   * registrava un pagamento. Il ref cambia valore nello stesso giro di
   * esecuzione dell'handler, prima di qualunque await.
   */
  const invioRef = useRef(false)

  // Il form si svuota quando il dialog si chiude, non appena il submit
  // ritorna: se il salvataggio fallisce il dialog resta aperto e quello che
  // l'utente ha scritto deve restare lì.
  useEffect(() => {
    if (!open) {
      setImporto('')
      setDataPagamento(new Date())
      setMetodo(undefined)
      setRiferimento('')
      setNote('')
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (invioRef.current) return
    invioRef.current = true
    setInvioInCorso(true)

    try {
      await onSubmit({
        importo: parseFloat(importo),
        dataPagamento: format(dataPagamento, 'yyyy-MM-dd'),
        metodo,
        riferimento: riferimento || undefined,
        note: note || undefined,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Registra Pagamento</DialogTitle>
          <DialogDescription>
            Importo residuo: <span className="font-semibold text-foreground">
              {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(importoResiduo)}
            </span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
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
                <Calendar
                  mode="single"
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
              onClick={() => onOpenChange(false)}
              disabled={inAttesa}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={inAttesa || importoNum <= 0 || importoNum > importoResiduo}>
              {inAttesa ? 'Registrazione...' : 'Registra Pagamento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
