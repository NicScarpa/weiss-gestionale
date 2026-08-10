"use client"

import { useState, useRef } from 'react'
import { toast } from 'sonner'
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
  /**
   * Deve sollevare un errore se il salvataggio fallisce: è così che il dialog
   * sa di dover restare aperto con i dati che l'utente ha già inserito.
   */
  onSubmit: (data: CreateScheduleInput) => Promise<void>
  isLoading?: boolean
  initialData?: Partial<CreateScheduleInput> & { id?: string }
  mode?: 'create' | 'edit'
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * Le date nel payload sono giorni civili 'yyyy-MM-dd' e non `Date`.
 * `JSON.stringify` di una `Date` produce l'istante UTC: una scadenza scelta
 * per il 15 e inserita dopo le 22:00 italiane arrivava al server come il 14,
 * cioè già scaduta. `CreateScheduleInput` continua a dichiararle `Date` perché
 * è condiviso con altri consumatori: l'asserzione qui sotto è il solo punto in
 * cui le due rappresentazioni si incontrano.
 */
type PayloadScadenza = Omit<
  CreateScheduleInput,
  'dataScadenza' | 'dataEmissione' | 'ricorrenzaFine' | 'dataAttesa'
> & {
  dataScadenza: string
  dataEmissione?: string
  ricorrenzaFine?: string
  dataAttesa?: string | null
}

/** Il giorno mostrato nel calendario, non l'istante che gli sta sotto. */
function giornoCivile(data: Date): string {
  return format(data, 'yyyy-MM-dd')
}

interface ScadenzaRow {
  importo: string
  dataScadenza: Date
  popoverOpen: boolean
}

function makeDefaultRow(): ScadenzaRow {
  return {
    importo: '',
    dataScadenza: new Date(),
    popoverOpen: false,
  }
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

        {/* Radix smonta il contenuto alla chiusura e la `key` lo rifà da capo
            quando si passa da una scadenza all'altra senza chiudere: i campi
            nascono già con i valori giusti, senza un effetto che li riallinei
            a ogni apertura. */}
        <ModuloScadenza
          key={initialData?.id ?? 'nuova'}
          initialData={initialData}
          isEdit={isEdit}
          isLoading={isLoading}
          onSubmit={onSubmit}
          onChiudi={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function ModuloScadenza({
  initialData,
  isEdit,
  isLoading,
  onSubmit,
  onChiudi,
}: {
  initialData?: Partial<CreateScheduleInput> & { id?: string }
  isEdit: boolean
  isLoading: boolean
  onSubmit: (data: CreateScheduleInput) => Promise<void>
  onChiudi: () => void
}) {
  // Campi principali (visibili in creazione)
  const [tipo, setTipo] = useState<ScheduleType>(initialData?.tipo ?? ScheduleType.PASSIVA)
  const [metodoPagamento, setMetodoPagamento] = useState<SchedulePaymentMethod | undefined>(initialData?.metodoPagamento ?? undefined)
  const [descrizione, setDescrizione] = useState(initialData?.descrizione ?? '')
  const [numeroDocumento, setNumeroDocumento] = useState(initialData?.numeroDocumento ?? '')
  const [controparteNome, setControparteNome] = useState(initialData?.controparteNome ?? '')
  const [dataEmissione, setDataEmissione] = useState<Date>(() => initialData?.dataEmissione ? new Date(initialData.dataEmissione) : new Date())
  const [tipoDocumento, setTipoDocumento] = useState<ScheduleDocumentType>(initialData?.tipoDocumento ?? ScheduleDocumentType.ALTRO)

  // Righe scadenze (array)
  const [scadenze, setScadenze] = useState<ScadenzaRow[]>(() => [{
    importo: initialData?.importoTotale?.toString() ?? '',
    dataScadenza: initialData?.dataScadenza ? new Date(initialData.dataScadenza) : new Date(),
    popoverOpen: false,
  }])

  // Campi avanzati (solo in edit, collapsible)
  const [controparteIban, setControparteIban] = useState(initialData?.controparteIban ?? '')
  const [priorita, setPriorita] = useState<SchedulePriority>(initialData?.priorita ?? SchedulePriority.NORMALE)
  const [isRicorrente, setIsRicorrente] = useState(initialData?.isRicorrente ?? false)
  const [ricorrenzaTipo, setRicorrenzaTipo] = useState<RecurrenceType | undefined>(initialData?.ricorrenzaTipo ?? undefined)
  const [ricorrenzaFine, setRicorrenzaFine] = useState<Date | undefined>(() => initialData?.ricorrenzaFine ? new Date(initialData.ricorrenzaFine) : undefined)
  const [ricorrenzaAttiva, setRicorrenzaAttiva] = useState(initialData?.ricorrenzaAttiva ?? true)
  const [note, setNote] = useState(initialData?.note ?? '')
  const [dataAttesa, setDataAttesa] = useState<Date | undefined>(
    () => initialData?.dataAttesa ? new Date(initialData.dataAttesa) : undefined
  )
  const [dataAttesaTouched, setDataAttesaTouched] = useState(false)

  // Le opzioni avanzate si aprono già dispiegate quando la scadenza ha
  // qualcosa da mostrare là dentro.
  const [advancedOpen, setAdvancedOpen] = useState(
    !!(initialData?.controparteIban ||
      initialData?.note ||
      initialData?.isRicorrente ||
      (initialData?.priorita && initialData.priorita !== SchedulePriority.NORMALE))
  )

  const [invioInCorso, setInvioInCorso] = useState(false)

  /**
   * Il solo `disabled` sul bottone non basta: fra il click e il re-render
   * React passa un attimo in cui altri click arrivano lo stesso, e ognuno
   * creava una scadenza. Il ref cambia valore nello stesso giro di esecuzione
   * dell'handler, prima di qualunque await.
   */
  const invioRef = useRef(false)

  // Popover states
  const [emissionePopoverOpen, setEmissionePopoverOpen] = useState(false)
  const [ricorrenzaFinePopoverOpen, setRicorrenzaFinePopoverOpen] = useState(false)
  const [dataAttesaPopoverOpen, setDataAttesaPopoverOpen] = useState(false)

  const updateScadenza = (index: number, updates: Partial<ScadenzaRow>) => {
    setScadenze(prev => prev.map((row, i) => i === index ? { ...row, ...updates } : row))
  }

  const addScadenza = () => {
    setScadenze(prev => [...prev, makeDefaultRow()])
  }

  const removeScadenza = (index: number) => {
    setScadenze(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (invioRef.current) return
    invioRef.current = true
    setInvioInCorso(true)

    const commonData = {
      tipo,
      descrizione,
      valuta: 'EUR' as const,
      dataEmissione: giornoCivile(dataEmissione),
      tipoDocumento,
      numeroDocumento: numeroDocumento || undefined,
      controparteNome: controparteNome || undefined,
      controparteIban: controparteIban || undefined,
      priorita,
      metodoPagamento,
      isRicorrente,
      ricorrenzaTipo,
      ricorrenzaFine: ricorrenzaFine ? giornoCivile(ricorrenzaFine) : undefined,
      ricorrenzaAttiva,
      note: note || undefined,
      ...(isEdit && dataAttesaTouched
        ? { dataAttesa: dataAttesa ? giornoCivile(dataAttesa) : null }
        : {}),
    }

    // Una scadenza per ogni riga, in sequenza
    const daSalvare = scadenze
    let salvate = 0
    try {
      for (const row of daSalvare) {
        const payload: PayloadScadenza = {
          ...commonData,
          importoTotale: parseFloat(row.importo),
          dataScadenza: giornoCivile(row.dataScadenza),
        }
        await onSubmit(payload as unknown as CreateScheduleInput)
        salvate++
      }
    } catch (error) {
      const messaggio =
        error instanceof Error && error.message
          ? error.message
          : 'Non è stato possibile salvare la scadenza'
      // Le righe già salvate escono dal form: se restassero, il tentativo
      // successivo le creerebbe una seconda volta.
      if (salvate > 0) {
        setScadenze(daSalvare.slice(salvate))
        toast.error(
          `${messaggio}. Le prime ${salvate} scadenze su ${daSalvare.length} sono state salvate: ` +
            'nel form restano solo quelle da riprovare'
        )
      } else {
        toast.error(messaggio)
      }
      return
    } finally {
      invioRef.current = false
      setInvioInCorso(false)
    }

    onChiudi()
  }

  const hasValidScadenze = scadenze.every(r => r.importo && parseFloat(r.importo) > 0)
  const inAttesa = isLoading || invioInCorso

  return (
    <>
      <form id="create-schedule-form" onSubmit={handleSubmit} className="space-y-4 py-2">
        {/* Riga 1: Direzione, Mod. pagamento, Descrizione */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Direzione *</Label>
            {/*
              In modifica la direzione è bloccata: il server la rifiuta con un
              400 (`CAMPI_IMMUTABILI` in `api/scadenzario/[id]/route.ts`) perché
              attiva e passiva stanno su lati opposti dei conti, e su una
              scadenza già riconciliata cambiarla sposterebbe denaro registrato.
              Lasciare il menu attivo sarebbe una trappola cortese: l'utente
              sceglie, salva, e solo allora scopre che non si poteva.
            */}
            <Select
              value={tipo}
              onValueChange={(v) => setTipo(v as ScheduleType)}
              disabled={isEdit}
            >
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

                {tipo === ScheduleType.PASSIVA && (
                  <div className="space-y-2">
                    <Label>Data attesa di pagamento</Label>
                    <div className="flex items-center gap-2">
                      <Popover open={dataAttesaPopoverOpen} onOpenChange={setDataAttesaPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" className="justify-start font-normal flex-1">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dataAttesa ? format(dataAttesa, 'dd/MM/yyyy') : 'Stimata automaticamente'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={dataAttesa}
                            onSelect={(d) => {
                              setDataAttesa(d || undefined)
                              setDataAttesaTouched(true)
                              setDataAttesaPopoverOpen(false)
                            }}
                            initialFocus
                            locale={it}
                          />
                        </PopoverContent>
                      </Popover>
                      {dataAttesa && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDataAttesa(undefined)
                            setDataAttesaTouched(true)
                          }}
                        >
                          ×
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Se vuota, viene stimata dal ritardo storico del fornitore.
                    </p>
                  </div>
                )}

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
          onClick={onChiudi}
          disabled={inAttesa}
        >
          Annulla
        </Button>
        <Button
          type="submit"
          form="create-schedule-form"
          disabled={inAttesa || !descrizione || !hasValidScadenze}
        >
          {inAttesa ? (isEdit ? 'Salvataggio...' : 'Creazione...') : (isEdit ? 'Salva modifiche' : 'Conferma')}
        </Button>
      </DialogFooter>
    </>
  )
}
