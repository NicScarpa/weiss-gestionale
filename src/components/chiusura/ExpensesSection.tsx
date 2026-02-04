'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Receipt, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { PayeeAutocomplete } from '@/components/ui/payee-autocomplete'

// Tipo per uscita
export interface ExpenseData {
  id?: string
  payee: string
  description?: string
  documentRef?: string
  documentType: 'NONE' | 'FATTURA' | 'DDT' | 'RICEVUTA' | 'PERSONALE'
  amount: number
  vatAmount?: number
  accountId?: string
  isPaid?: boolean
  paidBy?: string
}

// Valore iniziale
export const emptyExpense: Omit<ExpenseData, 'position'> = {
  payee: '',
  documentRef: '',
  documentType: 'NONE',
  amount: 0,
  vatAmount: 0,
  paidBy: '',
}

// Opzioni postazioni per paidBy
const STATION_OPTIONS = [
  { value: 'BAR', label: 'BAR' },
  { value: 'CASSA1', label: 'CASSA 1' },
  { value: 'CASSA2', label: 'CASSA 2' },
  { value: 'CASSA3', label: 'CASSA 3' },
  { value: 'TAVOLI', label: 'TAVOLI' },
  { value: 'MARSUPIO', label: 'MARSUPIO' },
  { value: 'ESTERNO', label: 'ESTERNO' },
]

// Opzioni tipo documento
const DOCUMENT_TYPE_OPTIONS = [
  { value: 'NONE', label: 'Nessuno' },
  { value: 'FATTURA', label: 'Fattura' },
  { value: 'DDT', label: 'DDT' },
  { value: 'RICEVUTA', label: 'Ricevuta' },
  { value: 'PERSONALE', label: 'Personale' },
]

interface Account {
  id: string
  code: string
  name: string
}

interface ExpensesSectionProps {
  expenses: ExpenseData[]
  onChange: (expenses: ExpenseData[]) => void
  accounts?: Account[]
  disabled?: boolean
  className?: string
  venueId?: string
}

export function ExpensesSection({
  expenses,
  onChange,
  accounts = [],
  disabled = false,
  className,
  venueId,
}: ExpensesSectionProps) {
  // Calcola totale
  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0)

  // Aggiungi nuova uscita
  const handleAdd = () => {
    onChange([...expenses, { ...emptyExpense }])
  }

  // Rimuovi uscita
  const handleRemove = (index: number) => {
    onChange(expenses.filter((_, i) => i !== index))
  }

  // Aggiorna campo uscita
  const handleFieldChange = (
    index: number,
    field: keyof ExpenseData,
    value: string | number | boolean
  ) => {
    const updated = [...expenses]
    if (field === 'amount' || field === 'vatAmount') {
      updated[index] = {
        ...updated[index],
        [field]: typeof value === 'string' ? parseFloat(value) || 0 : value,
      }
    } else {
      updated[index] = {
        ...updated[index],
        [field]: value,
      }
    }
    onChange(updated)
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Uscite di cassa
          </CardTitle>
          {total > 0 && (
            <span className="text-sm font-mono text-muted-foreground">
              ({formatCurrency(total)})
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={disabled}
          className="gap-1"
        >
          <Plus className="h-4 w-4" />
          Aggiungi
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nessuna uscita registrata. Clicca &quot;Aggiungi&quot; per inserire spese.
          </p>
        ) : (
          expenses.map((expense, index) => (
            <div
              key={index}
              className="border rounded-lg p-3 space-y-3"
            >
              {/* Prima riga: Beneficiario */}
              <div className="grid grid-cols-[1fr_40px] gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Beneficiario *</Label>
                  <PayeeAutocomplete
                    value={expense.payee}
                    onChange={(val) => handleFieldChange(index, 'payee', val)}
                    onSupplierSelect={(suggestion) => {
                      if (suggestion.defaultAccountId) {
                        handleFieldChange(index, 'accountId', suggestion.defaultAccountId)
                      }
                    }}
                    venueId={venueId}
                    disabled={disabled}
                  />
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(index)}
                  disabled={disabled}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Seconda riga: Importi e Documento */}
              <div className="grid grid-cols-4 gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Importo *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={expense.amount || ''}
                    onChange={(e) =>
                      handleFieldChange(index, 'amount', e.target.value)
                    }
                    disabled={disabled}
                    className="font-mono"
                    placeholder="0,00"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">IVA</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={expense.vatAmount || ''}
                    onChange={(e) =>
                      handleFieldChange(index, 'vatAmount', e.target.value)
                    }
                    disabled={disabled}
                    className="font-mono"
                    placeholder="0,00"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Tipo Documento</Label>
                  <Select
                    value={expense.documentType}
                    onValueChange={(value) =>
                      handleFieldChange(index, 'documentType', value)
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Rif. Documento</Label>
                  <Input
                    value={expense.documentRef || ''}
                    onChange={(e) =>
                      handleFieldChange(index, 'documentRef', e.target.value)
                    }
                    disabled={disabled}
                    placeholder="es. 123/2026"
                  />
                </div>
              </div>

              {/* Terza riga: Conto e Postazione */}
              <div className="grid grid-cols-2 gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Conto Contabile</Label>
                  <Select
                    value={expense.accountId || ''}
                    onValueChange={(value) =>
                      handleFieldChange(index, 'accountId', value)
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona..." />
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

                <div className="space-y-1">
                  <Label className="text-xs">Pagato da *</Label>
                  <Select
                    value={expense.paidBy || ''}
                    onValueChange={(value) =>
                      handleFieldChange(index, 'paidBy', value)
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className={cn(!expense.paidBy && expense.amount > 0 && 'border-destructive')}>
                      <SelectValue placeholder="Seleziona postazione... *" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Totale */}
        {expenses.length > 0 && (
          <div className="flex justify-end pt-2 border-t">
            <div className="text-right">
              <span className="text-sm text-muted-foreground">Totale Uscite: </span>
              <span className="font-mono font-bold text-lg">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
