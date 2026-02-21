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
  type EntryType,
  type RegisterType,
  type JournalEntryFormData,
} from '@/types/prima-nota'
import { cn } from '@/lib/utils'

const MOVIMENTO_SCHEMA = z.object({
  date: z.date(),
  registerType: z.enum(['CASH', 'BANK']),
  entryType: z.enum(['INCASSO', 'USCITA', 'VERSAMENTO', 'PRELIEVO', 'GIROCONTO']),
  amount: z.number().positive({ message: 'L\'importo deve essere positivo' }),
  description: z.string().min(1, { message: 'La descrizione è obbligatoria' }),
  documentRef: z.string().optional(),
  documentType: z.string().optional(),
  accountId: z.string().optional(),
  vatAmount: z.number().min(0).optional(),
  notes: z.string().optional(),
})

type MovimentoFormData = z.infer<typeof MOVIMENTO_SCHEMA>

interface MovimentoFormDialogProps {
  entry?: JournalEntryFormData
  accounts?: Array<{ id: string; code: string; name: string }>
  onSave: (data: MovimentoFormData) => void | Promise<void>
  open?: boolean
  onOpenChange?: (open: boolean) => void
  isSubmitting?: boolean
}

export function MovimentoFormDialog({
  entry,
  accounts = [],
  onSave,
  open = false,
  onOpenChange,
  isSubmitting = false,
}: MovimentoFormDialogProps) {
  const form = useForm<MovimentoFormData>({
    resolver: zodResolver(MOVIMENTO_SCHEMA),
    defaultValues: entry ? {
      date: entry.date,
      registerType: entry.registerType,
      entryType: entry.entryType,
      amount: Math.abs(entry.amount),
      description: entry.description,
      documentRef: entry.documentRef,
      documentType: entry.documentType,
      accountId: entry.accountId,
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
  const isEntrata = entryType === 'INCASSO' || entryType === 'VERSAMENTO' || entryType === 'PRELIEVO'

  const onSubmit = async (data: MovimentoFormData) => {
    try {
      await onSave(data)
      form.reset()
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
                    <FormMessage />
                  </FormItem>
                )}
              />

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
            </div>

            {/* Tipo Movimento e Importo */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="entryType"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
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
            {accounts.length > 0 && (
              <FormField
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Conto</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona conto" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            <span className="font-medium">{account.code}</span>
                            <span className="ml-2 text-muted-foreground">{account.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* IVA */}
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
                      {...form.register('vatAmount', { valueAsNumber: true })}
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

          {/* Riepilogo Dare/Avere */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Operazione:</span>
              <span className={cn(
                "font-medium",
                isEntrata ? "text-green-700" : "text-red-700"
              )}>
                {isEntrata ? 'Entrata (Dare)' : 'Uscita (Avere)'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Importo:</span>
              <span className="font-medium">
                €{form.watch('amount')?.toFixed(2) || '0.00'}
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
