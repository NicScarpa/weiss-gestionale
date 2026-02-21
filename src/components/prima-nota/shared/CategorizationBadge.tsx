'use client'

import { Badge } from '@/components/ui/badge'
import {
  CATEGORIZATION_SOURCE_COLORS,
  CATEGORIZATION_SOURCE_ICONS,
  CATEGORIZATION_SOURCE_LABELS,
  CategorizationSource,
} from '@/types/prima-nota'
import { cn } from '@/lib/utils'

interface CategorizationBadgeProps {
  source: CategorizationSource
  showLabel?: boolean
  variant?: 'default' | 'outline' | 'secondary'
}

export function CategorizationBadge({
  source,
  showLabel = false,
  variant = 'default',
}: CategorizationBadgeProps) {
  const colorClass = CATEGORIZATION_SOURCE_COLORS[source]
  const icon = CATEGORIZATION_SOURCE_ICONS[source]
  const label = CATEGORIZATION_SOURCE_LABELS[source]

  return (
    <Badge
      variant={variant}
      className={cn(
        'font-medium',
        colorClass
      )}
    >
      <span className="mr-1">{icon}</span>
      {showLabel && <span>{label}</span>}
    </Badge>
  )
}
