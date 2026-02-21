"use client"

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  ScheduleType,
  SchedulePriority,
  ScheduleDocumentType,
  RecurrenceType,
  SchedulePaymentMethod,
  SCHEDULE_TYPE_LABELS,
  SCHEDULE_PRIORITY_LABELS,
  SCHEDULE_DOCUMENT_TYPE_LABELS,
  SCHEDULE_DOCUMENT_TYPE_COLORS,
  RECURRENCE_TYPE_LABELS,
  SCHEDULE_PAYMENT_METHOD_LABELS,
  CreateScheduleInput,
} from '@/types/schedule'
import { CalendarIcon, Plus, ChevronDown, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { cn } from '@/lib/utils'

interface CreateScheduleDialogProps {
  trigger?: React.ReactNode
  onSubmit: (data: CreateScheduleInput) => Promise<void>
  isLoading?: boolean
  initialData?: Partial<CreateScheduleInput> & { id?: string }
  mode?: 'create' | 'edit'
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CreateScheduleDialog({
  trigger,
  onSubmit,
  isLoading = false,
  initialData,
  mode = 'create',
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: CreateScheduleDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = controlledOnOpenChange || setInternalOpen
  const isEdit = mode === 'edit'

  interface ScadenzaRow {
    importo: string
    dataScadenza: Date
    popoverOpen: boolean
  }

  const makeDefaultRow = (): ScadenzaRow => ({
    importo: '',
    dataScadenza: new Date(),
    popoverOpen: false,
  })

  // Campi principali (visibili in creazione)
  const [tipo, setTipo] = useState<ScheduleType>(initialData?.tipo || ScheduleType.PASSIVA)
  const [metodoPagamento, setMetodoPagamento] = useState<SchedulePaymentMethod | undefined>(initialData?.metodoPagamento || undefined)
  const [descrizione, setDescrizione] = useState(initialData?.descrizione || '')
  const [numeroDocumento, setNumeroDocumento] = useState(initialData?.numeroDocumento || '')
  const [controparteNome, setControparteNome] = useState(initialData?.controparteNome || '')
  const [dataEmissione, setDataEmissione] = useState<Date>(initialData?.dataEmissione ? new Date(initialData.dataEmissione) : new Date())
  const [tipoDocumento, setTipoDocumento] = useState<ScheduleDocumentType>(initialData?.tipoDocumento || ScheduleDocumentType.ALTRO)

  // Righe scadenze (array)
  const [scadenze, setScadenze] = useState<ScadenzaRow[]>([{
    importo: initialData?.importoTotale?.toString() || '',
    dataScadenza: initialData?.dataScadenza ? new Date(initialData.dataScadenza) : new Date(),
    popoverOpen: false,
  }])

  // Campi avanzati (solo in edit, collapsible)
  const [controparteIban, setControparteIban] = useState(initialData?.controparteIban || '')
  const [priorita, setPriorita] = useState<SchedulePriority>(initialData?.priorita || SchedulePriority.NORMALE)
  const [isRicorrente, setIsRicorrente] = useState(initialData?.isRicorrente || false)
  const [ricorrenzaTipo, setRicorrenzaTipo] = useState<RecurrenceType | undefined>(initialData?.ricorrenzaTipo || undefined)
  const [ricorrenzaFine, setRicorrenzaFine] = useState<Date | undefined>(initialData?.ricorrenzaFine ? new Date(initialData.ricorrenzaFine) : undefined)
  const [ricorrenzaAttiva, setRicorrenzaAttiva] = useState(initialData?.ricorrenzaAttiva !== undefined ? initialData.ricorrenzaAttiva : true)
  const [note, setNote] = useState(initialData?.note || '')

  // Collapsible state
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // Popover states
  const [emissionePopoverOpen, setEmissionePopoverOpen] = useState(false)
  const [ricorrenzaFinePopoverOpen, setRicorrenzaFinePopoverOpen] = useState(false)

  const updateScadenza = (index: number, updates: Partial<ScadenzaRow>) => {
    setScadenze(prev => prev.map((row, i) => i === index ? { ...row, ...updates } : row))
  }

  const addScadenza = () => {
    setScadenze(prev => [...prev, makeDefaultRow()])
  }

  const removeScadenza = (index: number) => {
    setScadenze(prev => prev.filter((_, i) => i !== index))
  }

  // Reset form when dialog opens with new initialData
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open && initialData) {
      setTipo(initialData.tipo || ScheduleType.PASSIVA)
      setMetodoPagamento(initialData.metodoPagamento || undefined)
      setDescrizione(initialData.descrizione || '')
      setNumeroDocumento(initialData.numeroDocumento || '')
      setControparteNome(initialData.controparteNome || '')
      setDataEmissione(initialData.dataEmissione ? new Date(initialData.dataEmissione) : new Date())
      setTipoDocumento(initialData.tipoDocumento || ScheduleDocumentType.ALTRO)
      setScadenze([{
        importo: initialData.importoTotale?.toString() || '',
        dataScadenza: initialData.dataScadenza ? new Date(initialData.dataScadenza) : new Date(),
        popoverOpen: false,
      }])
      setControparteIban(initialData.controparteIban || '')
      setPriorita(initialData.priorita || SchedulePriority.NORMALE)
      setIsRicorrente(initialData.isRicorrente || false)
      setRicorrenzaTipo(initialData.ricorrenzaTipo || undefined)
      setRicorrenzaFine(initialData.ricorrenzaFine ? new Date(initialData.ricorrenzaFine) : undefined)
      setRicorrenzaAttiva(initialData.ricorrenzaAttiva !== undefined ? initialData.ricorrenzaAttiva : true)
      setNote(initialData.note || '')
      setAdvancedOpen(
        !!(initialData.controparteIban ||
          initialData.note ||
          initialData.isRicorrente ||
          (initialData.priorita && initialData.priorita !== SchedulePriority.NORMALE))
      )
    }
  }, [open, initialData])
  /* eslint-enable react-hooks/set-state-in-effect */

  const resetForm = () => {
    setTipo(ScheduleType.PASSIVA)
    setMetodoPagamento(undefined)
    setDescrizione('')
    setNumeroDocumento('')
    setControparteNome('')
    setDataEmissione(new Date())
    setTipoDocumento(ScheduleDocumentType.ALTRO)
    setScadenze([makeDefaultRow()])
    setControparteIban('')
    setPriorita(SchedulePriority.NORMALE)
    setIsRicorrente(false)
    setRicorrenzaTipo(undefined)
    setRicorrenzaFine(undefined)
    setRicorrenzaAttiva(true)
    setNote('')
    setAdvancedOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const commonData = {
      tipo,
      descrizione,
      valuta: 'EUR' as const,
      dataEmissione,
      tipoDocumento,
      numeroDocumento: numeroDocumento || undefined,
      controparteNome: controparteNome || undefined,
      controparteIban: controparteIban || undefined,
      priorita,
      metodoPagamento,
      isRicorrente,
      ricorrenzaTipo,
      ricorrenzaFine,
      ricorrenzaAttiva,
      note: note || undefined,
    }
    // Crea una schedule per ogni riga scadenza
    for (const row of scadenze) {
      await onSubmit({
        ...commonData,
        importoTotale: parseFloat(row.importo),
        dataScadenza: row.dataScadenza,
      })
    }
    if (!isEdit) {
      resetForm()
    }
    setOpen(false)
  }

  const hasValidScadenze = scadenze.every(r => r.importo && parseFloat(r.importo) > 0)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== undefined ? (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Nuova Scadenza
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Modifica scadenza' : 'Aggiungi nuova scadenza'}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? 'Modifica i dettagli della scadenza' : 'Crea una nuova scadenza di pagamento o incasso'}
          </DialogDescription>
        </DialogHeader>

        <form id="create-schedule-form" onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Riga 1: Direzione, Mod. pagamento, Descrizione */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Direzione *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as ScheduleType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" side="bottom" className="bg-white">
                  {Object.values(ScheduleType).map((t) => (
                    <SelectItem key={t} value={t}>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'w-2.5 h-2.5 rounded-full',
                          t === ScheduleType.ATTIVA ? 'bg-emerald-500' : 'bg-rose-500'
                        )} />
                        {t === ScheduleType.ATTIVA ? 'Entrata' : 'Uscita'}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mod. pagamento *</Label>
              <Select value={metodoPagamento || ''} onValueChange={(v) => setMetodoPagamento(v as SchedulePaymentMethod)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleziona..." />
                </SelectTrigger>
                <SelectContent position="popper" side="bottom" className="bg-white">
                  {Object.values(SchedulePaymentMethod).map((mp) => (
                    <SelectItem key={mp} value={mp}>
                      {SCHEDULE_PAYMENT_METHOD_LABELS[mp]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descrizione">Descrizione *</Label>
              <Input
                id="descrizione"
                placeholder="Descrizione..."
                value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Riga 2: Numero documento, Controparte, Emissione */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="numeroDocumento">Numero documento</Label>
              <Input
                id="numeroDocumento"
                placeholder="Es. Fatt. #123"
                value={numeroDocumento}
                onChange={(e) => setNumeroDocumento(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="controparteNome">Controparte</Label>
              <Input
                id="controparteNome"
                placeholder="Es. Mario Rossi S.r.l."
                value={controparteNome}
                onChange={(e) => setControparteNome(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Emissione *</Label>
              <Popover open={emissionePopoverOpen} onOpenChange={setEmissionePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dataEmissione, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dataEmissione}
                    onSelect={(d) => {
                      if (d) setDataEmissione(d)
                      setEmissionePopoverOpen(false)
                    }}
                    initialFocus
                    locale={it}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Riga 3: Categoria (full width) */}
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={tipoDocumento} onValueChange={(v) => setTipoDocumento(v as ScheduleDocumentType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" className="bg-white">
                {Object.values(ScheduleDocumentType).map((td) => (
                  <SelectItem key={td} value={td}>
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2.5 h-2.5 rounded-full', SCHEDULE_DOCUMENT_TYPE_COLORS[td])} />
                      {SCHEDULE_DOCUMENT_TYPE_LABELS[td]}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Separator + Sezione Scadenze */}
          <Separator />
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Scadenze</h4>

            {scadenze.map((row, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1">
                  <div className="space-y-2">
                    {index === 0 && <Label>Stato pagamento *</Label>}
                    <Select value="da_pagare" disabled>
                      <SelectTrigger className="w-full text-muted-foreground">
                        <SelectValue placeholder="Da pagare" />
                      </SelectTrigger>
                      <SelectContent position="popper" side="bottom" className="bg-white">
                        <SelectItem value="da_pagare">Da pagare</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    {index === 0 && <Label>Importo scadenza *</Label>}
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="0,00"
                        className="pl-7"
                        value={row.importo}
                        onChange={(e) => updateScadenza(index, { importo: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {index === 0 && <Label>Scadenza *</Label>}
                    <Popover
                      open={row.popoverOpen}
                      onOpenChange={(open) => updateScadenza(index, { popoverOpen: open })}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-start font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(row.dataScadenza, 'dd/MM/yyyy')}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={row.dataScadenza}
                          onSelect={(d) => {
                            if (d) updateScadenza(index, { dataScadenza: d, popoverOpen: false })
                          }}
                          initialFocus
                          locale={it}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Cestino: visibile solo se ci sono più righe */}
                {scadenze.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeScadenza(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : (
                  <div className="w-9 shrink-0" />
                )}
              </div>
            ))}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={addScadenza}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Aggiungi
            </Button>
          </div>

          {/* Opzioni avanzate (solo in edit) */}
          {isEdit && (
            <>
              <Separator />
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                    <ChevronDown className={cn(
                      'h-4 w-4 transition-transform',
                      advancedOpen && 'rotate-180'
                    )} />
                    Opzioni avanzate
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="controparteIban">IBAN Controparte</Label>
                      <Input
                        id="controparteIban"
                        placeholder="ITXX XXXX XXXX XXXX XXXX XXXX XX"
                        value={controparteIban}
                        onChange={(e) => setControparteIban(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="priorita">Priorità</Label>
                      <Select value={priorita} onValueChange={(v) => setPriorita(v as SchedulePriority)}>
                        <SelectTrigger id="priorita" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" side="bottom" className="bg-white">
                          {Object.values(SchedulePriority).map((p) => (
                            <SelectItem key={p} value={p}>
                              {SCHEDULE_PRIORITY_LABELS[p]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Ricorrenza */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Ricorrenza</Label>
                      <Switch
                        checked={isRicorrente}
                        onCheckedChange={setIsRicorrente}
                      />
                    </div>

                    {isRicorrente && (
                      <div className="space-y-4 pl-4 border-l-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Tipo Ricorrenza</Label>
                            <Select value={ricorrenzaTipo || ''} onValueChange={(v) => setRicorrenzaTipo(v as RecurrenceType)}>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Seleziona..." />
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

                          <div className="space-y-2">
                            <Label>Fine Ricorrenza</Label>
                            <Popover open={ricorrenzaFinePopoverOpen} onOpenChange={setRicorrenzaFinePopoverOpen}>
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="w-full justify-start font-normal"
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {ricorrenzaFine ? format(ricorrenzaFine, 'dd/MM/yyyy') : 'Seleziona...'}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={ricorrenzaFine}
                                  onSelect={(d) => {
                                    setRicorrenzaFine(d || undefined)
                                    setRicorrenzaFinePopoverOpen(false)
                                  }}
                                  initialFocus
                                  locale={it}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <Label htmlFor="ricorrenzaAttiva">Ricorrenza Attiva</Label>
                          <Switch
                            id="ricorrenzaAttiva"
                            checked={ricorrenzaAttiva}
                            onCheckedChange={setRicorrenzaAttiva}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Note */}
                  <div className="space-y-2">
                    <Label htmlFor="note">Note</Label>
                    <Textarea
                      id="note"
                      placeholder="Note aggiuntive..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </>
          )}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            Annulla
          </Button>
          <Button
            type="submit"
            form="create-schedule-form"
            disabled={isLoading || !descrizione || !hasValidScadenze}
          >
            {isLoading ? (isEdit ? 'Salvataggio...' : 'Creazione...') : (isEdit ? 'Salva modifiche' : 'Conferma')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Backward-compatible alias
export const CreateScheduleSheet = CreateScheduleDialog
