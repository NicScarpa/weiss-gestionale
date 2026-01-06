'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MATCH_THRESHOLDS } from '@/types/reconciliation'

interface ConfidenceBadgeProps {
  confidence: number | null
  showPercentage?: boolean
  className?: string
}

export function ConfidenceBadge({
  confidence,
  showPercentage = true,
  className,
}: ConfidenceBadgeProps) {
  if (confidence === null) {
    return (
      <Badge variant="outline" className={cn('text-gray-500', className)}>
        -
      </Badge>
    )
  }

  const percentage = Math.round(confidence * 100)

  let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'outline'
  let colorClass = ''

  if (confidence >= MATCH_THRESHOLDS.AUTO_MATCH) {
    variant = 'default'
    colorClass = 'bg-green-600 hover:bg-green-700'
  } else if (confidence >= MATCH_THRESHOLDS.REVIEW) {
    variant = 'secondary'
    colorClass = 'bg-yellow-500 hover:bg-yellow-600 text-white'
  } else {
    variant = 'destructive'
  }

  return (
    <Badge variant={variant} className={cn(colorClass, className)}>
      {showPercentage ? `${percentage}%` : percentage > 90 ? 'Alto' : percentage > 70 ? 'Medio' : 'Basso'}
    </Badge>
  )
}
