'use client'

import { Badge } from '@/components/ui/badge'
import {
  PAYMENT_STATUS_COLORS,
  PAYMENT_STATUS_ICONS,
  PAYMENT_STATUS_LABELS,
  PaymentStatus,
} from '@/types/prima-nota'
import { cn } from '@/lib/utils'

interface PaymentStatusBadgeProps {
  status: PaymentStatus
  showLabel?: boolean
  variant?: 'default' | 'outline' | 'secondary'
  size?: 'default' | 'sm' | 'lg'
}

export function PaymentStatusBadge({
  status,
  showLabel = false,
  variant = 'default',
  size = 'default',
}: PaymentStatusBadgeProps) {
  const colorClass = PAYMENT_STATUS_COLORS[status]
  const icon = PAYMENT_STATUS_ICONS[status]
  const label = PAYMENT_STATUS_LABELS[status]

  return (
    <Badge
      variant={variant}
      className={cn(
        'font-medium',
        colorClass,
        size === 'sm' && 'text-xs px-2 py-0',
        size === 'lg' && 'text-base px-3 py-1'
      )}
    >
      <span className="mr-1">{icon}</span>
      {showLabel && <span>{label}</span>}
    </Badge>
  )
}
