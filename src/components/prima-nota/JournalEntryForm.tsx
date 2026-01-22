'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { CalendarIcon, Save, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/constants'
import { toast } from 'sonner'
import type { RegisterType, EntryType } from '@/types/prima-nota'

import { logger } from '@/lib/logger'
// Opzioni registro
const REGISTER_OPTIONS: { value: RegisterType; label: string }[] = [
  { value: 'CASH', label: 'Cassa' },
  { value: 'BANK', label: 'Banca' },
]

// Opzioni tipo movimento per registro
const ENTRY_TYPE_OPTIONS: Record<RegisterType, { value: EntryType; label: string }[]> = {
  CASH: [
    { value: 'INCASSO', label: 'Incasso' },
    { value: 'USCITA', label: 'Uscita' },
    { value: 'VERSAMENTO', label: 'Versamento in banca' },
    { value: 'PRELIEVO', label: 'Prelievo da banca' },
  ],
  BANK: [
    { value: 'INCASSO', label: 'Bonifico in entrata' },
    { value: 'USCITA', label: 'Pagamento' },
    { value: 'VERSAMENTO', label: 'Versamento da cassa' },
    { value: 'PRELIEVO', label: 'Prelievo verso cassa' },
  ],
}

// Tipo dati form
export interface JournalEntryFormData {
  date: string
  registerType: RegisterType
  entryType: EntryType
  amount: number
  description: string
  documentRef?: string
  documentType?: string
  accountId?: string
  vatAmount?: number
  notes?: string
}

// Props
interface JournalEntryFormProps {
  initialData?: Partial<JournalEntryFormData>
  accounts?: { id: string; code: string; name: string }[]
  defaultRegisterType?: RegisterType
  onSubmit: (data: JournalEntryFormData) => Promise<void>
  onCancel?: () => void
  submitLabel?: string
  isEditing?: boolean
}

const initialFormState: JournalEntryFormData = {
  date: format(new Date(), 'yyyy-MM-dd'),
  registerType: 'CASH',
  entryType: 'INCASSO',
  amount: 0,
  description: '',
  documentRef: '',
  documentType: '',
  accountId: '',
  vatAmount: undefined,
  notes: '',
}

export function JournalEntryForm({
  initialData,
  accounts = [],
  defaultRegisterType = 'CASH',
  onSubmit,
  onCancel,
  submitLabel = 'Registra Movimento',
  isEditing = false,
}: JournalEntryFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<JournalEntryFormData>({
    ...initialFormState,
    registerType: defaultRegisterType,
    ...initialData,
  })

  // Quando cambia il registro, resetta il tipo movimento
  const handleRegisterChange = (value: RegisterType) => {
    setFormData((prev) => ({
      ...prev,
      registerType: value,
      entryType: ENTRY_TYPE_OPTIONS[value][0].value,
    }))
  }

  const handleFieldChange = (
    field: keyof JournalEntryFormData,
    value: string | number | undefined
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validazione
    if (!formData.amount || formData.amount <= 0) {
      toast.error('Inserisci un importo valido')
      return
    }

    if (!formData.description.trim()) {
      toast.error('Inserisci una descrizione')
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit(formData)
      if (!isEditing) {
        // Reset form dopo creazione
        setFormData({
          ...initialFormState,
          registerType: defaultRegisterType,
        })
      }
      toast.success(isEditing ? 'Movimento aggiornato' : 'Movimento registrato')
    } catch (error: any) {
      logger.error('Errore', error)
      toast.error(error.message || 'Errore nel salvataggio')
    } finally {
      setIsSubmitting(false)
    }
  }

  const entryTypeOptions = ENTRY_TYPE_OPTIONS[formData.registerType]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Plus className="h-5 w-5" />
          {isEditing ? 'Modifica Movimento' : 'Nuovo Movimento'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Prima riga: Data, Registro, Tipo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Data</Label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleFieldChange('date', e.target.value)}
                  className="pl-10"
                  disabled={isEditing}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="registerType">Registro</Label>
              <Select
                value={formData.registerType}
                onValueChange={(v) => handleRegisterChange(v as RegisterType)}
                disabled={isEditing}
              >
                <SelectTrigger id="registerType">
                  <SelectValue placeholder="Seleziona registro" />
                </SelectTrigger>
                <SelectContent>
                  {REGISTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="entryType">Tipo Movimento</Label>
              <Select
                value={formData.entryType}
                onValueChange={(v) => handleFieldChange('entryType', v)}
                disabled={isEditing}
              >
                <SelectTrigger id="entryType">
                  <SelectValue placeholder="Seleziona tipo" />
                </SelectTrigger>
                <SelectContent>
                  {entryTypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Seconda riga: Importo, IVA, Riferimento */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Importo</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  EUR
                </span>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount || ''}
                  onChange={(e) =>
                    handleFieldChange('amount', parseFloat(e.target.value) || 0)
                  }
                  className="pl-12 font-mono"
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vatAmount">IVA (opzionale)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  EUR
                </span>
                <Input
                  id="vatAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.vatAmount || ''}
                  onChange={(e) =>
                    handleFieldChange(
                      'vatAmount',
                      e.target.value ? parseFloat(e.target.value) : undefined
                    )
                  }
                  className="pl-12 font-mono"
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="documentRef">Rif. Documento</Label>
              <Input
                id="documentRef"
                value={formData.documentRef || ''}
                onChange={(e) => handleFieldChange('documentRef', e.target.value)}
                placeholder="Es: FT-2026/001"
              />
            </div>
          </div>

          {/* Terza riga: Descrizione, Conto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="description">Descrizione *</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                placeholder="Descrizione del movimento..."
                required
              />
            </div>

            {accounts.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="accountId">Conto Contabile</Label>
                <Select
                  value={formData.accountId || ''}
                  onValueChange={(v) => handleFieldChange('accountId', v)}
                >
                  <SelectTrigger id="accountId">
                    <SelectValue placeholder="Seleziona conto" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="notes">Note (opzionale)</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              placeholder="Note aggiuntive..."
              rows={2}
            />
          </div>

          {/* Anteprima importo */}
          {formData.amount > 0 && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Importo movimento:</span>
                <span className="font-mono font-semibold text-lg">
                  {formatCurrency(formData.amount)}
                </span>
              </div>
              {formData.vatAmount && formData.vatAmount > 0 && (
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>di cui IVA:</span>
                  <span className="font-mono">
                    {formatCurrency(formData.vatAmount)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Azioni */}
          <div className="flex justify-end gap-3 pt-2">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Annulla
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              <Save className="h-4 w-4 mr-2" />
              {isSubmitting ? 'Salvataggio...' : submitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
