"use client"

import { useState, useEffect } from 'react'
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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import {
  RecurrenceType,
  SchedulePaymentMethod,
  RECURRENCE_TYPE_LABELS,
  SCHEDULE_PAYMENT_METHOD_LABELS,
  DAY_OF_WEEK_LABELS,
  CreateRecurrenceInput,
  Recurrence,
} from '@/types/schedule'
import { isFrequenzaSettimanale, isFrequenzaMensile } from '@/lib/recurrence-utils'
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

interface CreateRecurrenceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: CreateRecurrenceInput) => Promise<void>
  isLoading?: boolean
  initialData?: Recurrence | null
  tipo: 'attiva' | 'passiva'
}

interface CategoryOption {
  id: string
  name: string
  parent?: { id: string; name: string }
}

interface AccountOption {
  id: string
  name: string
}

export function CreateRecurrenceDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
  initialData,
  tipo,
}: CreateRecurrenceDialogProps) {
  const isEdit = !!initialData

  // Form state
  const [descrizione, setDescrizione] = useState('')
  const [importo, setImporto] = useState('')
  const [categoriaId, setCategoriaId] = useState<string>('')
  const [contoDiPagamentoId, setContoDiPagamentoId] = useState<string>('')
  const [metodoPagamento, setMetodoPagamento] = useState<string>('')
  const [frequenza, setFrequenza] = useState<string>(RecurrenceType.MENSILE)
  const [giornoDelMese, setGiornoDelMese] = useState<string>('1')
  const [giornoDellSettimana, setGiornoDellSettimana] = useState<string>('0')
  const [dataInizio, setDataInizio] = useState<Date>(new Date())
  const [hasDataFine, setHasDataFine] = useState(false)
  const [dataFine, setDataFine] = useState<Date | undefined>(undefined)
  const [note, setNote] = useState('')

  // Popover states
  const [inizioPopoverOpen, setInizioPopoverOpen] = useState(false)
  const [finePopoverOpen, setFinePopoverOpen] = useState(false)

  // Options from API
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])

  // Fetch categories and accounts
  useEffect(() => {
    if (!open) return

    const fetchOptions = async () => {
      try {
        const [catRes, accRes] = await Promise.all([
          fetch('/api/budget-categories'),
          fetch('/api/accounts'),
        ])
        if (catRes.ok) {
          const catData = await catRes.json()
          setCategories(catData.data || catData || [])
        }
        if (accRes.ok) {
          const accData = await accRes.json()
          setAccounts(accData.accounts || accData.data || [])
        }
      } catch {
        // Silently fail - options will be empty
      }
    }

    fetchOptions()
  }, [open])

  const resetForm = () => {
    setDescrizione('')
    setImporto('')
    setCategoriaId('')
    setContoDiPagamentoId('')
    setMetodoPagamento('')
    setFrequenza(RecurrenceType.MENSILE)
    setGiornoDelMese('1')
    setGiornoDellSettimana('0')
    setDataInizio(new Date())
    setHasDataFine(false)
    setDataFine(undefined)
    setNote('')
  }

  // Reset / populate form when dialog opens
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open && initialData) {
      setDescrizione(initialData.descrizione)
      setImporto(String(Number(initialData.importo)))
      setCategoriaId(initialData.categoriaId || '')
      setContoDiPagamentoId(initialData.contoDiPagamentoId || '')
      setMetodoPagamento(initialData.metodoPagamento || '')
      setFrequenza(initialData.frequenza)
      setGiornoDelMese(initialData.giornoDelMese?.toString() || '1')
      setGiornoDellSettimana(initialData.giornoDellSettimana?.toString() || '0')
      setDataInizio(new Date(initialData.dataInizio))
      setHasDataFine(!!initialData.dataFine)
      setDataFine(initialData.dataFine ? new Date(initialData.dataFine) : undefined)
      setNote(initialData.note || '')
    } else if (open && !initialData) {
      resetForm()
    }
  }, [open, initialData]) // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const data: CreateRecurrenceInput = {
      tipo,
      descrizione,
      importo: parseFloat(importo),
      frequenza,
      dataInizio,
    }

    if (categoriaId) data.categoriaId = categoriaId
    if (contoDiPagamentoId) data.contoDiPagamentoId = contoDiPagamentoId
    if (metodoPagamento) data.metodoPagamento = metodoPagamento
    if (note) data.note = note
    if (hasDataFine && dataFine) data.dataFine = dataFine

    if (isFrequenzaSettimanale(frequenza)) {
      data.giornoDellSettimana = parseInt(giornoDellSettimana)
    }

    if (isFrequenzaMensile(frequenza)) {
      data.giornoDelMese = parseInt(giornoDelMese)
    }

    await onSubmit(data)
    if (!isEdit) {
      resetForm()
    }
    onOpenChange(false)
  }

  const isValid = descrizione && importo && parseFloat(importo) > 0 && frequenza

  const tipoLabel = tipo === 'passiva' ? 'pagamento ricorrente' : 'incasso ricorrente'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Modifica ${tipoLabel}` : `Aggiungi nuovo ${tipoLabel}`}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Modifica i dettagli della ricorrenza'
              : `Crea un nuovo ${tipoLabel} che genererà scadenze automaticamente`}
          </DialogDescription>
        </DialogHeader>

        <form id="create-recurrence-form" onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Descrizione */}
          <div className="space-y-2">
            <Label htmlFor="rec-descrizione">Descrizione *</Label>
            <Input
              id="rec-descrizione"
              placeholder="Es. Affitto mensile, Bolletta luce..."
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              required
            />
          </div>

          {/* Categoria */}
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={categoriaId || '__none__'} onValueChange={(v) => setCategoriaId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleziona categoria..." />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" className="bg-white max-h-60">
                <SelectItem value="__none__">Nessuna categoria</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.parent ? `${cat.parent.name} / ${cat.name}` : cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Importo */}
          <div className="space-y-2">
            <Label htmlFor="rec-importo">Importo *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
              <Input
                id="rec-importo"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                className="pl-7"
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Conto di pagamento */}
          <div className="space-y-2">
            <Label>Conto di pagamento</Label>
            <Select value={contoDiPagamentoId || '__none__'} onValueChange={(v) => setContoDiPagamentoId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Nessun conto" />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" className="bg-white max-h-60">
                <SelectItem value="__none__">Nessun conto</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Modalità di pagamento */}
          <div className="space-y-2">
            <Label>Modalità di pagamento</Label>
            <Select value={metodoPagamento || '__none__'} onValueChange={(v) => setMetodoPagamento(v === '__none__' ? '' : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Seleziona..." />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" className="bg-white">
                <SelectItem value="__none__">Nessuna</SelectItem>
                {Object.values(SchedulePaymentMethod).map((mp) => (
                  <SelectItem key={mp} value={mp}>
                    {SCHEDULE_PAYMENT_METHOD_LABELS[mp]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Sezione Dettagli ricorrenza */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Dettagli ricorrenza</h4>

            {/* Frequenza */}
            <div className="space-y-2">
              <Label>Frequenza *</Label>
              <Select value={frequenza} onValueChange={setFrequenza}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" side="bottom" className="bg-white">
                  {Object.values(RecurrenceType).map((rt) => (
                    <SelectItem key={rt} value={rt}>
                      {RECURRENCE_TYPE_LABELS[rt]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Campo dinamico: Giorno della settimana */}
            {isFrequenzaSettimanale(frequenza) && (
              <div className="space-y-2">
                <Label>Giorno della settimana *</Label>
                <Select value={giornoDellSettimana} onValueChange={setGiornoDellSettimana}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" side="bottom" className="bg-white">
                    {Object.entries(DAY_OF_WEEK_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Campo dinamico: Giorno del mese */}
            {isFrequenzaMensile(frequenza) && (
              <div className="space-y-2">
                <Label>Giorno del mese *</Label>
                <Select value={giornoDelMese} onValueChange={setGiornoDelMese}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" side="bottom" className="bg-white max-h-60">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <SelectItem key={day} value={String(day)}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Data di inizio */}
            <div className="space-y-2">
              <Label>Data di inizio</Label>
              <Popover open={inizioPopoverOpen} onOpenChange={setInizioPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dataInizio, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dataInizio}
                    onSelect={(d) => {
                      if (d) setDataInizio(d)
                      setInizioPopoverOpen(false)
                    }}
                    initialFocus
                    locale={it}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Checkbox data fine */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="has-data-fine"
                checked={hasDataFine}
                onCheckedChange={(checked) => {
                  setHasDataFine(!!checked)
                  if (!checked) setDataFine(undefined)
                }}
              />
              <Label htmlFor="has-data-fine" className="font-normal cursor-pointer">
                Inserire termine ricorrenza
              </Label>
            </div>

            {/* Data di fine (condizionale) */}
            {hasDataFine && (
              <div className="space-y-2">
                <Label>Data di fine</Label>
                <Popover open={finePopoverOpen} onOpenChange={setFinePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dataFine ? format(dataFine, 'dd/MM/yyyy') : 'Seleziona data...'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dataFine}
                      onSelect={(d) => {
                        setDataFine(d || undefined)
                        setFinePopoverOpen(false)
                      }}
                      initialFocus
                      locale={it}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="rec-note">Note</Label>
            <Textarea
              id="rec-note"
              placeholder="Note aggiuntive..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Annulla
          </Button>
          <Button
            type="submit"
            form="create-recurrence-form"
            disabled={isLoading || !isValid}
          >
            {isLoading
              ? (isEdit ? 'Salvataggio...' : 'Creazione...')
              : (isEdit ? 'Salva' : 'Aggiungi')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
