'use client'

import { Badge } from '@/components/ui/badge'
import { ENTRY_TYPE_COLORS, ENTRY_TYPE_LABELS } from '@/types/prima-nota'
import { cn } from '@/lib/utils'

interface JournalEntryBadgeProps {
  type: string
  showLabel?: boolean
  variant?: 'default' | 'outline' | 'secondary'
}

export function JournalEntryBadge({ type, showLabel = false, variant = 'default' }: JournalEntryBadgeProps) {
  const colorClass = ENTRY_TYPE_COLORS[type as keyof typeof ENTRY_TYPE_COLORS] || 'text-gray-600'
  const label = ENTRY_TYPE_LABELS[type as keyof typeof ENTRY_TYPE_LABELS] || type

  return (
    <Badge
      variant={variant}
      className={cn(
        'font-medium',
        colorClass
      )}
    >
      {showLabel && <span className="mr-1">{label}</span>}
      {type}
    </Badge>
  )
}
