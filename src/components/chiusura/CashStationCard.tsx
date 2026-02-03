'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Banknote, CreditCard } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/constants'
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
  floatAmount: 0, // Non più usato ma mantenuto per compatibilità DB
  cashCount: emptyCashCount,
}

interface CashStationCardProps {
  station: CashStationData
  onChange: (data: CashStationData) => void
  disabled?: boolean
  defaultExpanded?: boolean
  className?: string
  vatRate?: number // Aliquota IVA (es. 0.10 per 10%)
}

export function CashStationCard({
  station,
  onChange,
  disabled = false,
  defaultExpanded = false,
  className,
  vatRate = 0.10,
}: CashStationCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  // Calcola totali
  const totalAmount = station.cashAmount + station.posAmount

  // Calcola "non battuto" (totale - corrispettivo scontrini)
  // Rappresenta l'incasso non registrato nei corrispettivi
  const nonBattuto = totalAmount - station.receiptAmount

  // Calcola IVA da importo lordo: IVA = lordo - (lordo / (1 + aliquota))
  const calculateVatFromGross = (grossAmount: number): number => {
    if (grossAmount <= 0) return 0
    // Per aliquota 10%: IVA = lordo - (lordo / 1.10) = lordo * 0.0909...
    return grossAmount - (grossAmount / (1 + vatRate))
  }

  // Handler per cambio campo numerico
  // Quando il campo è vuoto (''), salva 0 nel dato; il binding value={field || ''}
  // converte 0 → '' mostrando correttamente il placeholder
  const handleFieldChange = (
    field: keyof CashStationData,
    value: string
  ) => {
    const numValue = parseFloat(value) || 0

    // Se cambia receiptAmount, auto-calcola receiptVat
    if (field === 'receiptAmount') {
      const calculatedVat = calculateVatFromGross(numValue)
      onChange({
        ...station,
        receiptAmount: numValue,
        receiptVat: Math.round(calculatedVat * 100) / 100,
      })
      return
    }

    // Se cambia invoiceAmount, auto-calcola invoiceVat
    if (field === 'invoiceAmount') {
      const calculatedVat = calculateVatFromGross(numValue)
      onChange({
        ...station,
        invoiceAmount: numValue,
        invoiceVat: Math.round(calculatedVat * 100) / 100,
      })
      return
    }

    onChange({
      ...station,
      [field]: numValue,
    })
  }

  // Handler per cambio conteggio - auto-popola cashAmount
  const handleCashCountChange = (values: CashCountValues) => {
    const total = calculateCashCountTotal(values)
    onChange({
      ...station,
      cashCount: values,
      cashAmount: total, // Auto-popola contanti con totale liquidità
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
                {/* Corrispettivo */}
                <div className="space-y-2">
                  <Label htmlFor={`receipt-${station.position}`}>
                    Corrispettivo
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

                {/* IVA Corrispettivo (auto-calcolata) */}
                <div className="space-y-2">
                  <Label htmlFor={`receipt-vat-${station.position}`} className="flex items-center gap-1">
                    IVA Corrispettivo
                    <span className="text-xs text-muted-foreground">(auto)</span>
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
                    className="font-mono bg-muted/50"
                    placeholder="0,00"
                  />
                </div>

                {/* Fatture */}
                <div className="space-y-2">
                  <Label htmlFor={`invoice-${station.position}`}>
                    Fatture
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

                {/* IVA Fatture (auto-calcolata) */}
                <div className="space-y-2">
                  <Label htmlFor={`invoice-vat-${station.position}`} className="flex items-center gap-1">
                    IVA Fatture
                    <span className="text-xs text-muted-foreground">(auto)</span>
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
                    className="font-mono bg-muted/50"
                    placeholder="0,00"
                  />
                </div>

                {/* Sospesi */}
                <div className="space-y-2 col-span-2">
                  <Label htmlFor={`suspended-${station.position}`}>
                    Sospesi
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
                    Contanti
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
                    POS
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
              </div>
            </div>

            {/* Liquidità (Distinta Contanti) */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Liquidità
              </h4>
              <CashCountGrid
                values={station.cashCount}
                onChange={handleCashCountChange}
                disabled={disabled}
              />
            </div>

            {/* Totale Postazione con dettaglio non battuto */}
            <div className="rounded-lg bg-primary/10 border-2 border-primary p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Totale Postazione</span>
                <span className="font-mono font-bold text-xl text-primary">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
              {/* Non battuto (se c'è differenza tra totale e scontrini) */}
              {totalAmount > 0 && station.receiptAmount > 0 && Math.abs(nonBattuto) > 0.01 && (
                <div className="flex justify-between text-sm pt-2 border-t border-primary/30">
                  <span className="text-muted-foreground">
                    Non battuto (fatture, sospesi, etc.)
                  </span>
                  <span className={cn(
                    "font-mono",
                    nonBattuto > 0 ? "text-amber-600" : "text-green-600"
                  )}>
                    {nonBattuto >= 0 ? '+' : ''}{formatCurrency(nonBattuto)}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
