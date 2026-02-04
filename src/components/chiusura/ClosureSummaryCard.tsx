'use client'

import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/constants'
import { ClosureTotals } from './hooks/useClosureCalculations'

interface ClosureSummaryCardProps {
  totals: ClosureTotals
  vatRate: number
}

export function ClosureSummaryCard({ totals, vatRate: _vatRate }: ClosureSummaryCardProps) {
  return (
    <Card
      className={cn(
        totals.hasSignificantDifference && 'border-destructive border-2'
      )}
    >
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          Riepilogo
          {totals.hasSignificantDifference && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Differenza Cassa
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          {/* Colonna sinistra: Movimentazione */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contanti:</span>
              <span className="font-mono">
                {formatCurrency(totals.cashWithExpenses)}
              </span>
            </div>
            <div className="flex justify-between pl-4">
              <span className="text-muted-foreground text-xs">di cui Uscite:</span>
              <span className="font-mono text-xs">
                {formatCurrency(totals.expensesTotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">POS:</span>
              <span className="font-mono">
                {formatCurrency(totals.posTotal)}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold text-[18px]">
              <span>Totale:</span>
              <span className="font-mono">
                {formatCurrency(totals.grossTotal)}
              </span>
            </div>
            <div className="h-4" />
            <div className="flex justify-between text-[12px] text-muted-foreground">
              <div className="flex gap-1">
                <span>IVA:</span>
                <span className="font-mono">{formatCurrency(totals.estimatedVat)}</span>
              </div>
              <div className="flex gap-1">
                <span>Totale netto:</span>
                <span className="font-mono">{formatCurrency(totals.netTotal)}</span>
              </div>
            </div>
          </div>

          {/* Colonna destra: Quadratura Cassa */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contanti:</span>
              <span className="font-mono">
                {formatCurrency(totals.cashTotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cassa Contata:</span>
              <span className="font-mono">
                {formatCurrency(totals.countedTotal)}
              </span>
            </div>
            <div
              className={cn(
                'flex justify-between font-semibold',
                totals.hasSignificantDifference && 'text-destructive'
              )}
            >
              <span>Differenza:</span>
              <span className="font-mono">
                {totals.cashDifference >= 0 ? '+' : ''}
                {formatCurrency(totals.cashDifference)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
