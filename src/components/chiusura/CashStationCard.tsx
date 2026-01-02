'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Banknote, CreditCard, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import {
  formatCurrency,
  CASH_DIFFERENCE_THRESHOLD,
  DEFAULT_CASH_FLOAT,
} from '@/lib/constants'
import {
  CashCountGrid,
  CashCountValues,
  emptyCashCount,
  calculateCashCountTotal,
} from './CashCountGrid'

// Tipo per i dati della postazione
export interface CashStationData {
  id?: string
  name: string
  position: number
  receiptAmount: number
  receiptVat: number
  invoiceAmount: number
  invoiceVat: number
  suspendedAmount: number
  cashAmount: number
  posAmount: number
  floatAmount: number
  cashCount: CashCountValues
}

// Valori iniziali
export const emptyCashStation: Omit<CashStationData, 'name' | 'position'> = {
  receiptAmount: 0,
  receiptVat: 0,
  invoiceAmount: 0,
  invoiceVat: 0,
  suspendedAmount: 0,
  cashAmount: 0,
  posAmount: 0,
  floatAmount: DEFAULT_CASH_FLOAT,
  cashCount: emptyCashCount,
}

interface CashStationCardProps {
  station: CashStationData
  onChange: (data: CashStationData) => void
  disabled?: boolean
  defaultExpanded?: boolean
  className?: string
}

export function CashStationCard({
  station,
  onChange,
  disabled = false,
  defaultExpanded = false,
  className,
}: CashStationCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  // Calcola totali
  const totalAmount = station.cashAmount + station.posAmount
  const cashCounted = calculateCashCountTotal(station.cashCount)
  const expectedCash = station.cashAmount - station.floatAmount
  const cashDifference = cashCounted - station.cashAmount

  // Determina se c'è una differenza significativa
  const hasSignificantDifference =
    Math.abs(cashDifference) > CASH_DIFFERENCE_THRESHOLD

  // Handler per cambio campo numerico
  const handleFieldChange = (
    field: keyof CashStationData,
    value: string
  ) => {
    const numValue = parseFloat(value) || 0
    onChange({
      ...station,
      [field]: numValue,
    })
  }

  // Handler per cambio conteggio
  const handleCashCountChange = (values: CashCountValues) => {
    onChange({
      ...station,
      cashCount: values,
    })
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        {/* Header sempre visibile */}
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex items-center justify-between w-full text-left',
                'touch-manipulation'
              )}
            >
              <div className="flex items-center gap-3">
                <CardTitle className="text-lg">{station.name}</CardTitle>
                {hasSignificantDifference && cashCounted > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Differenza
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono font-bold text-lg">
                  {formatCurrency(totalAmount)}
                </span>
                {isExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </button>
          </CollapsibleTrigger>

          {/* Mini riepilogo quando chiuso */}
          {!isExpanded && totalAmount > 0 && (
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Banknote className="h-4 w-4" />
                {formatCurrency(station.cashAmount)}
              </span>
              <span className="flex items-center gap-1">
                <CreditCard className="h-4 w-4" />
                {formatCurrency(station.posAmount)}
              </span>
            </div>
          )}
        </CardHeader>

        {/* Contenuto espandibile */}
        <CollapsibleContent>
          <CardContent className="space-y-6 pt-0">
            {/* Sezione Incassi */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Incassi
              </h4>

              <div className="grid grid-cols-2 gap-4">
                {/* Scontrini */}
                <div className="space-y-2">
                  <Label htmlFor={`receipt-${station.position}`}>
                    Scontrini (€)
                  </Label>
                  <Input
                    id={`receipt-${station.position}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={station.receiptAmount || ''}
                    onChange={(e) =>
                      handleFieldChange('receiptAmount', e.target.value)
                    }
                    disabled={disabled}
                    className="font-mono"
                    placeholder="0,00"
                  />
                </div>

                {/* IVA Scontrini */}
                <div className="space-y-2">
                  <Label htmlFor={`receipt-vat-${station.position}`}>
                    IVA Scontrini (€)
                  </Label>
                  <Input
                    id={`receipt-vat-${station.position}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={station.receiptVat || ''}
                    onChange={(e) =>
                      handleFieldChange('receiptVat', e.target.value)
                    }
                    disabled={disabled}
                    className="font-mono"
                    placeholder="0,00"
                  />
                </div>

                {/* Fatture */}
                <div className="space-y-2">
                  <Label htmlFor={`invoice-${station.position}`}>
                    Fatture (€)
                  </Label>
                  <Input
                    id={`invoice-${station.position}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={station.invoiceAmount || ''}
                    onChange={(e) =>
                      handleFieldChange('invoiceAmount', e.target.value)
                    }
                    disabled={disabled}
                    className="font-mono"
                    placeholder="0,00"
                  />
                </div>

                {/* IVA Fatture */}
                <div className="space-y-2">
                  <Label htmlFor={`invoice-vat-${station.position}`}>
                    IVA Fatture (€)
                  </Label>
                  <Input
                    id={`invoice-vat-${station.position}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={station.invoiceVat || ''}
                    onChange={(e) =>
                      handleFieldChange('invoiceVat', e.target.value)
                    }
                    disabled={disabled}
                    className="font-mono"
                    placeholder="0,00"
                  />
                </div>

                {/* Sospesi */}
                <div className="space-y-2 col-span-2">
                  <Label htmlFor={`suspended-${station.position}`}>
                    Sospesi (€)
                  </Label>
                  <Input
                    id={`suspended-${station.position}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={station.suspendedAmount || ''}
                    onChange={(e) =>
                      handleFieldChange('suspendedAmount', e.target.value)
                    }
                    disabled={disabled}
                    className="font-mono"
                    placeholder="0,00"
                  />
                </div>
              </div>
            </div>

            {/* Sezione Metodi di Pagamento */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Metodi di Pagamento
              </h4>

              <div className="grid grid-cols-2 gap-4">
                {/* Contanti */}
                <div className="space-y-2">
                  <Label
                    htmlFor={`cash-${station.position}`}
                    className="flex items-center gap-2"
                  >
                    <Banknote className="h-4 w-4" />
                    Contanti (€)
                  </Label>
                  <Input
                    id={`cash-${station.position}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={station.cashAmount || ''}
                    onChange={(e) =>
                      handleFieldChange('cashAmount', e.target.value)
                    }
                    disabled={disabled}
                    className="font-mono"
                    placeholder="0,00"
                  />
                </div>

                {/* POS */}
                <div className="space-y-2">
                  <Label
                    htmlFor={`pos-${station.position}`}
                    className="flex items-center gap-2"
                  >
                    <CreditCard className="h-4 w-4" />
                    POS (€)
                  </Label>
                  <Input
                    id={`pos-${station.position}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={station.posAmount || ''}
                    onChange={(e) =>
                      handleFieldChange('posAmount', e.target.value)
                    }
                    disabled={disabled}
                    className="font-mono"
                    placeholder="0,00"
                  />
                </div>

                {/* Fondo Cassa */}
                <div className="space-y-2 col-span-2">
                  <Label htmlFor={`float-${station.position}`}>
                    Fondo Cassa (€)
                  </Label>
                  <Input
                    id={`float-${station.position}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={station.floatAmount || ''}
                    onChange={(e) =>
                      handleFieldChange('floatAmount', e.target.value)
                    }
                    disabled={disabled}
                    className="font-mono"
                    placeholder="114,00"
                  />
                </div>
              </div>
            </div>

            {/* Conteggio Contanti */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Conteggio Contanti
              </h4>
              <CashCountGrid
                values={station.cashCount}
                onChange={handleCashCountChange}
                disabled={disabled}
              />
            </div>

            {/* Riepilogo Differenza */}
            {station.cashAmount > 0 && cashCounted > 0 && (
              <div
                className={cn(
                  'rounded-lg p-4 space-y-2',
                  hasSignificantDifference
                    ? 'bg-destructive/10 border-2 border-destructive'
                    : 'bg-muted/50'
                )}
              >
                <div className="flex justify-between text-sm">
                  <span>Contanti dichiarati:</span>
                  <span className="font-mono">
                    {formatCurrency(station.cashAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Contanti contati:</span>
                  <span className="font-mono">{formatCurrency(cashCounted)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-medium">
                  <span className="flex items-center gap-2">
                    Differenza:
                    {hasSignificantDifference && (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    )}
                  </span>
                  <span
                    className={cn(
                      'font-mono font-bold',
                      hasSignificantDifference
                        ? 'text-destructive'
                        : cashDifference === 0
                        ? 'text-green-600'
                        : 'text-amber-600'
                    )}
                  >
                    {cashDifference >= 0 ? '+' : ''}
                    {formatCurrency(cashDifference)}
                  </span>
                </div>
              </div>
            )}

            {/* Totale Postazione */}
            <div className="rounded-lg bg-primary/10 border-2 border-primary p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Totale Postazione</span>
                <span className="font-mono font-bold text-xl text-primary">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
