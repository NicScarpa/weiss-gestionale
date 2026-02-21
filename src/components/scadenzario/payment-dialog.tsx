"use client"

import { useState } from 'react'
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
  onSubmit: (data: PaymentFormData) => Promise<void>
  isLoading?: boolean
  importoResiduo: number
}

export interface PaymentFormData {
  importo: number
  dataPagamento: Date
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit({
      importo: parseFloat(importo),
      dataPagamento,
      metodo,
      riferimento: riferimento || undefined,
      note: note || undefined,
    })
    // Reset form
    setImporto('')
    setDataPagamento(new Date())
    setMetodo(undefined)
    setRiferimento('')
    setNote('')
  }

  const importoNum = parseFloat(importo) || 0

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
              disabled={isLoading}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={isLoading || importoNum <= 0 || importoNum > importoResiduo}>
              {isLoading ? 'Registrazione...' : 'Registra Pagamento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
