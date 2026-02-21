import { formatCurrency } from '@/lib/utils'

interface PaymentProgressBarProps {
  importoTotale: number
  importoPagato: number
  className?: string
}

export function PaymentProgressBar({
  importoTotale,
  importoPagato,
  className,
}: PaymentProgressBarProps) {
  const percentage = importoTotale > 0 ? (importoPagato / importoTotale) * 100 : 0
  const clampedPercentage = Math.min(percentage, 100)

  const fillColor =
    percentage >= 100
      ? 'bg-green-500'
      : percentage > 0
        ? 'bg-amber-500'
        : 'bg-gray-300'

  return (
    <div className={className}>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-muted-foreground">
          Pagato: <span className="font-medium text-foreground">{formatCurrency(importoPagato)}</span>
        </span>
        <span className="text-muted-foreground">
          Residuo: <span className="font-medium text-foreground">{formatCurrency(importoTotale - importoPagato)}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${fillColor}`}
          style={{ width: `${clampedPercentage}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1 text-right">
        {Math.round(percentage)}%
      </p>
    </div>
  )
}
