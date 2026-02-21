'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CreditCardIcon } from 'lucide-react'
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  PAYMENT_TYPE_LABELS,
  type PaymentFormData,
  type PaymentType,
} from '@/types/prima-nota'

const ITALIAN_IBAN_PATTERN = /^IT\d{2}[A-Za-z0-9]{5}\d{5}$/

const PAGAMENTO_SCHEMA = z.object({
  dataEsecuzione: z.date(),
  tipo: z.enum(['BONIFICO', 'F24', 'ALTRO']),
  importo: z.number().positive({ message: 'L\'importo deve essere positivo' }),
  beneficiarioNome: z.string().min(1, { message: 'Il beneficiario è obbligatorio' }),
  beneficiarioIban: z.string().regex(ITALIAN_IBAN_PATTERN, { message: 'IBAN italiano non valido' }).optional(),
  causale: z.string().optional(),
  note: z.string().optional(),
  riferimentoInterno: z.string().optional(),
})

type PagamentoFormData = z.infer<typeof PAGAMENTO_SCHEMA>

interface PagamentoFormDialogProps {
  payment?: PaymentFormData
  onSave: (data: PagamentoFormData) => void | Promise<void>
  open?: boolean
  onOpenChange?: (open: boolean) => void
  isSubmitting?: boolean
}

export function PagamentoFormDialog({
  payment,
  onSave,
  open = true,
  onOpenChange,
  isSubmitting = false,
}: PagamentoFormDialogProps) {
  const form = useForm<PagamentoFormData>({
    resolver: zodResolver(PAGAMENTO_SCHEMA),
    defaultValues: payment ? {
      dataEsecuzione: payment.dataEsecuzione,
      tipo: payment.tipo,
      importo: payment.importo,
      beneficiarioNome: payment.beneficiarioNome,
      beneficiarioIban: payment.beneficiarioIban,
      causale: payment.causale,
      note: payment.note,
      riferimentoInterno: payment.riferimentoInterno,
    } : {
      dataEsecuzione: new Date(),
      tipo: 'BONIFICO' as PaymentType,
      importo: 0,
      beneficiarioNome: '',
    },
  })

  const onSubmit = async (data: PagamentoFormData) => {
    try {
      await onSave(data)
      form.reset()
    } catch (error) {
      console.error('Errore salvataggio pagamento:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {payment ? 'Modifica Pagamento' : 'Nuovo Pagamento'}
          </DialogTitle>
          <DialogDescription>
            {payment
              ? 'Modifica i dettagli del pagamento selezionato.'
              : 'Inserisci un nuovo pagamento da effettuare.'
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <div className="space-y-4 py-4">
            {/* Data e Tipo */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="dataEsecuzione"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data Esecuzione *</FormLabel>
                    <Calendar
                      mode="single"
                      selected={field.value ? new Date(field.value) : undefined}
                      onSelect={(date) => field.onChange(date?.toISOString())}
                      className="w-full"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Tipo Pagamento *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAYMENT_TYPE_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            <span className="flex items-center gap-2">
                              <CreditCardIcon className="h-4 w-4" />
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

            {/* Beneficiario e Importo */}
            <div className="grid grid-cols-[2fr_1fr] gap-4">
              <FormField
                control={form.control}
                name="beneficiarioNome"
                render={({ field: _field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Beneficiario *</FormLabel>
                    <Input
                      placeholder="Nome beneficiario..."
                      {...form.register('beneficiarioNome')}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="importo"
                render={({ field: _field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Importo *</FormLabel>
                    <div className="relative">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...form.register('importo', { valueAsNumber: true })}
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

            {/* IBAN */}
            <FormField
              control={form.control}
              name="beneficiarioIban"
              render={({ field: _field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>IBAN (opzionale)</FormLabel>
                  <Input
                    placeholder="ITXX XXXX XXXX XXXX XXXX"
                    {...form.register('beneficiarioIban')}
                    className="font-mono"
                    maxLength={27}
                  />
                  <FormDescription>
                    Codice IBAN italiano per bonifici bancari
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Riferimento Interno */}
            <FormField
              control={form.control}
              name="riferimentoInterno"
              render={({ field: _field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Riferimento Interno</FormLabel>
                  <Input
                    placeholder="Codice riferimento interno..."
                    {...form.register('riferimentoInterno')}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Causale */}
            <FormField
              control={form.control}
              name="causale"
              render={({ field: _field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Causale</FormLabel>
                  <Input
                    placeholder="Descrizione causale..."
                    {...form.register('causale')}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Note */}
            <FormField
              control={form.control}
              name="note"
              render={({ field: _field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Note</FormLabel>
                  <Textarea
                    placeholder="Note aggiuntive..."
                    rows={3}
                    {...form.register('note')}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Riepilogo Importo */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Totale Pagamento:</span>
              <span className="font-semibold text-lg">
                €{form.watch('importo')?.toFixed(2) || '0.00'}
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
            {isSubmitting ? 'Salvataggio...' : payment ? 'Aggiorna' : 'Salva'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
