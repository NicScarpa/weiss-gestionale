'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  ENTRY_TYPE_LABELS,
  ENTRY_TYPE_COLORS,
  REGISTER_LABELS,
  REGISTRI_IMPLICITI,
  isTrasferimento,
  type EntryType,
  type RegisterType,
  type JournalEntryFormData,
} from '@/types/prima-nota'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/formatters'
import { AccountCombobox } from '@/components/prima-nota/shared/AccountCombobox'
import {
  CostCenterSelect,
  resolveCostCenterField,
  useCostCenters,
} from '@/components/prima-nota/shared/CostCenterSelect'
import { useAccountsForCombobox, buildCostCenterRuleMap, type AccountType } from '@/hooks/useImputableAccounts'

/**
 * Tipi di conto imputabili per tipo di movimento: un incasso genera ricavo,
 * un'uscita genera costo, gli altri (versamento/prelievo tra cassa e banca,
 * giroconto) possono imputare entrambi. Estratta come funzione pura per
 * essere testata senza montare il dialog (il progetto non ha infrastruttura
 * di test per il rendering di componenti React, vedi report Task 11/12).
 */
export function accountTypesForEntryType(entryType: EntryType): AccountType[] {
  if (entryType === 'INCASSO') return ['RICAVO']
  if (entryType === 'USCITA') return ['COSTO']
  return ['RICAVO', 'COSTO']
}

const MOVIMENTO_SCHEMA = z
  .object({
    date: z.date(),
    registerType: z.enum(['CASH', 'BANK']),
    entryType: z.enum(['INCASSO', 'USCITA', 'VERSAMENTO', 'PRELIEVO', 'GIROCONTO']),
    /** Registro di destinazione: serve al solo giroconto (vedi sotto). */
    counterRegisterType: z.enum(['CASH', 'BANK']).optional(),
    amount: z.number().positive({ message: 'L\'importo deve essere positivo' }),
    description: z.string().min(1, { message: 'La descrizione è obbligatoria' }),
    documentRef: z.string().optional(),
    documentType: z.string().optional(),
    accountId: z.string().optional(),
    costCenterId: z.string().optional(),
    vatAmount: z.number().min(0).optional(),
    notes: z.string().optional(),
  })
  // Versamento e prelievo hanno la direzione nel nome; il giroconto no, e senza
  // destinazione il server lo rifiuta. Chiederla qui evita di far scrivere tutto
  // il movimento per poi vederselo respingere.
  .superRefine((dati, ctx) => {
    if (dati.entryType !== 'GIROCONTO') return

    if (!dati.counterRegisterType) {
      ctx.addIssue({
        code: 'custom',
        path: ['counterRegisterType'],
        message: 'Indica il registro di destinazione',
      })
      return
    }

    if (dati.counterRegisterType === dati.registerType) {
      ctx.addIssue({
        code: 'custom',
        path: ['counterRegisterType'],
        message: 'Scegli un registro diverso da quello di partenza',
      })
    }
  })

type MovimentoFormData = z.infer<typeof MOVIMENTO_SCHEMA>

/**
 * Lettura di un campo numerico facoltativo: la casella vuota vale «assente».
 *
 * Va usata al posto di `valueAsNumber`, che sulla casella vuota non restituisce
 * `undefined` ma `NaN`. Uno schema che accetta `number | undefined` rifiuta
 * `NaN`, quindi un campo etichettato «opzionale» diventava obbligatorio e il
 * modulo non si salvava più: per l'IVA significava bloccare versamenti,
 * prelievi e giroconti, che l'IVA non ce l'hanno affatto.
 */
function numeroFacoltativo(valore: unknown): number | undefined {
  return valore === '' || valore === null || valore === undefined ? undefined : Number(valore)
}

interface MovimentoFormDialogProps {
  entry?: JournalEntryFormData
  onSave: (data: MovimentoFormData) => void | Promise<void>
  open?: boolean
  onOpenChange?: (open: boolean) => void
  isSubmitting?: boolean
}

export function MovimentoFormDialog({
  entry,
  onSave,
  open = false,
  onOpenChange,
  isSubmitting = false,
}: MovimentoFormDialogProps) {
  const form = useForm<MovimentoFormData>({
    resolver: zodResolver(MOVIMENTO_SCHEMA),
    defaultValues: entry ? {
      date: entry.date,
      // Per versamento e prelievo i registri sono quelli del tipo, non quelli
      // salvati sulla singola riga: aperto su una delle due righe, il modulo
      // deve mostrare l'operazione intera.
      ...(entry.entryType === 'VERSAMENTO' || entry.entryType === 'PRELIEVO'
        ? {
            registerType: REGISTRI_IMPLICITI[entry.entryType].da,
            counterRegisterType: REGISTRI_IMPLICITI[entry.entryType].a,
          }
        : { registerType: entry.registerType }),
      entryType: entry.entryType,
      amount: Math.abs(entry.amount),
      description: entry.description,
      documentRef: entry.documentRef,
      documentType: entry.documentType,
      accountId: entry.accountId,
      costCenterId: entry.costCenterId,
      vatAmount: entry.vatAmount,
      notes: entry.notes,
    } : {
      date: new Date(),
      registerType: 'CASH' as RegisterType,
      entryType: 'INCASSO' as EntryType,
      amount: 0,
      description: '',
    },
  })

  const entryType = form.watch('entryType')
  const registerType = form.watch('registerType')
  const counterRegisterType = form.watch('counterRegisterType')

  const trasferimento = isTrasferimento(entryType)
  const isEntrata = entryType === 'INCASSO'

  /** Direzione già decisa dal tipo: al versamento e al prelievo non si chiede. */
  const direzioneImplicita =
    entryType === 'VERSAMENTO' || entryType === 'PRELIEVO'
      ? REGISTRI_IMPLICITI[entryType]
      : null

  /**
   * Cambiare il tipo di movimento cambia quali registri hanno senso: il
   * versamento va per forza dalla cassa alla banca, il prelievo il contrario, e
   * i movimenti a riga singola non hanno una destinazione. Allineare i campi
   * qui evita che resti nel modulo un valore scelto per un tipo precedente e
   * spedito con un tipo che non lo prevede.
   */
  const cambiaTipo = (nuovo: EntryType) => {
    form.setValue('entryType', nuovo)

    if (nuovo === 'VERSAMENTO' || nuovo === 'PRELIEVO') {
      form.setValue('registerType', REGISTRI_IMPLICITI[nuovo].da)
      form.setValue('counterRegisterType', REGISTRI_IMPLICITI[nuovo].a)
    } else if (nuovo !== 'GIROCONTO') {
      form.setValue('counterRegisterType', undefined)
    }

    // Spostare denaro da un registro all'altro non è un'operazione imponibile:
    // il server scarta l'IVA dei trasferimenti, e lasciarla nel modulo darebbe
    // l'impressione di averla registrata.
    if (isTrasferimento(nuovo)) {
      form.setValue('vatAmount', undefined)
    }
  }

  /** L'altro registro rispetto a quello scelto: un giroconto ne coinvolge due. */
  const cambiaRegistroDiPartenza = (nuovo: RegisterType) => {
    form.setValue('registerType', nuovo)
    if (entryType === 'GIROCONTO' && form.getValues('counterRegisterType') === nuovo) {
      form.setValue('counterRegisterType', nuovo === 'CASH' ? 'BANK' : 'CASH')
    }
  }

  const accountTypes = accountTypesForEntryType(entryType)
  const accountId = form.watch('accountId')

  /**
   * La data di una scrittura nata da una riga della banca è quella della banca
   * (spec estratto conto, decisione 2): `PUT /api/prima-nota/[id]` la rifiuta
   * con un 409. Lasciare il campo aperto significava far scegliere una data
   * per poi negarla — e il rifiuto riportava chi modificava davanti al modulo,
   * dove un secondo «Aggiorna» salvava altro. Si cambia dall'estratto conto,
   * scollegando la riga.
   */
  const dataDallaBanca = !!entry?.bankTransactionId

  // Stessa chiave di query di AccountCombobox (types): nessuna fetch
  // aggiuntiva, la mappa copre esattamente i conti che l'utente può
  // scegliere qui, inclusi eventuali conti legacy.
  const { data: accountsForRule = [] } = useAccountsForCombobox(accountTypes)
  const costCenterRuleByAccountId = React.useMemo(
    () => buildCostCenterRuleMap(accountsForRule),
    [accountsForRule]
  )
  const costCenterRule = accountId ? costCenterRuleByAccountId.get(accountId) : undefined
  const isCostCenterRequired = costCenterRule === 'OBBLIGATORIO'

  const { data: costCenters = [] } = useCostCenters()
  // In modifica il movimento ha già un centro salvato (il server lo assegna
  // sempre): trattarlo come "già scelto dall'utente" evita che riaprire il
  // dialog lo sovrascriva silenziosamente con il default.
  const [costCenterTouched, setCostCenterTouched] = React.useState(!!entry)

  const costCenterFieldState = resolveCostCenterField({
    rule: costCenterRule,
    currentValue: form.watch('costCenterId'),
    hasManualSelection: costCenterTouched,
    costCenters,
  })

  React.useEffect(() => {
    if (costCenterFieldState.value !== form.getValues('costCenterId')) {
      form.setValue('costCenterId', costCenterFieldState.value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costCenterFieldState.value])

  const onSubmit = async (data: MovimentoFormData) => {
    if (isCostCenterRequired && !data.costCenterId) {
      form.setError('costCenterId', {
        type: 'manual',
        message: 'Il centro di costo è obbligatorio per questo conto.',
      })
      return
    }
    try {
      await onSave(data)
      form.reset()
      setCostCenterTouched(false)
    } catch (error) {
      console.error('Errore salvataggio movimento:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {entry ? 'Modifica Movimento' : 'Nuovo Movimento'}
          </DialogTitle>
          <DialogDescription>
            {entry ? 'Modifica i dettagli del movimento selezionato.' : 'Inserisci un nuovo movimento nel registro.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <div className="space-y-4 py-4">
            {/* Data e Registro */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            disabled={dataDallaBanca}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value
                              ? new Date(field.value).toLocaleDateString('it-IT')
                              : "Seleziona data"}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ? new Date(field.value) : undefined}
                          onSelect={(date) => field.onChange(date)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {dataDallaBanca && (
                      <FormDescription>
                        Data dalla banca: si cambia dall&apos;estratto conto, scollegando la riga.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="entryType"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={(v) => cambiaTipo(v as EntryType)} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(ENTRY_TYPE_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            <span className={ENTRY_TYPE_COLORS[key as keyof typeof ENTRY_TYPE_COLORS]}>
                              {label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/*
              Registri e importo. Un trasferimento ne coinvolge due — da dove
              esce il denaro e dove entra — perché è una scrittura in due righe:
              chiederne uno solo era il modo in cui l'altra riga non veniva mai
              scritta e il saldo totale si muoveva.
            */}
            <div className="grid grid-cols-2 gap-4">
              {trasferimento ? (
                <div className="col-span-2 grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="registerType"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Da</FormLabel>
                        <Select
                          onValueChange={(v) => cambiaRegistroDiPartenza(v as RegisterType)}
                          value={field.value}
                          disabled={direzioneImplicita !== null}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Registro di partenza" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CASH">Cassa</SelectItem>
                            <SelectItem value="BANK">Banca</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="counterRegisterType"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>A</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value ?? ''}
                          disabled={direzioneImplicita !== null}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Registro di destinazione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CASH">Cassa</SelectItem>
                            <SelectItem value="BANK">Banca</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ) : (
                <FormField
                  control={form.control}
                  name="registerType"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Registro</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona registro" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CASH">Cassa</SelectItem>
                          <SelectItem value="BANK">Banca</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Importo</FormLabel>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...form.register('amount', { valueAsNumber: true })}
                        className="pl-8"
                      />
                      <span className="absolute left-2.5 top-2.5 text-sm text-muted-foreground">
                        €
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Descrizione */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Descrizione *</FormLabel>
                  <Input
                    placeholder="Descrizione del movimento..."
                    {...form.register('description')}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Documento */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="documentRef"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Riferimento Doc.</FormLabel>
                    <Input
                      placeholder="es. Fattura #123"
                      {...form.register('documentRef')}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="documentType"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Tipo Doc.</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FATTURA">Fattura</SelectItem>
                        <SelectItem value="DDT">DDT</SelectItem>
                        <SelectItem value="RICEVUTA">Ricevuta</SelectItem>
                        <SelectItem value="SCONTRINO">Scontrino</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Conto */}
            <FormField
              control={form.control}
              name="accountId"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Conto</FormLabel>
                  <AccountCombobox
                    value={field.value}
                    onChange={field.onChange}
                    types={accountTypes}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Centro di costo */}
            <FormField
              control={form.control}
              name="costCenterId"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Centro di costo{isCostCenterRequired ? ' *' : ''}</FormLabel>
                  <CostCenterSelect
                    value={field.value}
                    onChange={(value) => {
                      setCostCenterTouched(true)
                      field.onChange(value)
                    }}
                    required={isCostCenterRequired}
                    hint={costCenterFieldState.hint}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/*
              IVA: non compare sui trasferimenti. Spostare denaro fra la cassa e
              la banca non è un'operazione imponibile, e il server la scarta.
            */}
            {!trasferimento && (
              <FormField
                control={form.control}
                name="vatAmount"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>IVA (opzionale)</FormLabel>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...form.register('vatAmount', { setValueAs: numeroFacoltativo })}
                        className="pl-8"
                      />
                      <span className="absolute left-2.5 top-2.5 text-sm text-muted-foreground">
                        €
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Note */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Note</FormLabel>
                  <Textarea
                    placeholder="Note aggiuntive..."
                    rows={3}
                    {...form.register('notes')}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/*
            Riepilogo. Un trasferimento non è né un'entrata né un'uscita: il
            denaro cambia registro e la liquidità resta quella di prima. Finiva
            fra le entrate, e chi lo registrava si aspettava di veder salire il
            totale — cosa che, con la riga sola, succedeva davvero.
          */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Operazione:</span>
              {trasferimento ? (
                <span className="font-medium text-blue-700">
                  Trasferimento
                  {registerType && counterRegisterType
                    ? `: ${REGISTER_LABELS[registerType]} → ${REGISTER_LABELS[counterRegisterType]}`
                    : ''}
                </span>
              ) : (
                <span className={cn(
                  "font-medium",
                  isEntrata ? "text-green-700" : "text-red-700"
                )}>
                  {isEntrata ? 'Entrata (Dare)' : 'Uscita (Avere)'}
                </span>
              )}
            </div>
            {trasferimento && (
              <p className="text-xs text-muted-foreground">
                Vengono scritte due righe: l&apos;uscita dal registro di partenza e
                l&apos;entrata in quello di destinazione. La liquidità totale non cambia.
              </p>
            )}
            <div className="flex items-center justify-between text-sm">
              <span>Importo:</span>
              <span className="font-medium">
                {formatCurrency(form.watch('amount') ?? 0)}
              </span>
            </div>
          </div>
        </Form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange?.(false)}
            disabled={isSubmitting}
          >
            Annulla
          </Button>
          <Button
            type="button"
            onClick={form.handleSubmit(onSubmit)}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Salvataggio...' : entry ? 'Aggiorna' : 'Salva'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
