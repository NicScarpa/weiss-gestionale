import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ConfidenceLevel } from '@/types/cash-flow'

interface ConfidenceBadgeProps {
  level: ConfidenceLevel
}

export function ConfidenceBadge({ level }: ConfidenceBadgeProps) {
  const config = {
    CERTA: { label: 'Certa', className: 'bg-green-100 text-green-700' },
    ALTA: { label: 'Alta', className: 'bg-blue-100 text-blue-700' },
    MEDIA: { label: 'Media', className: 'bg-amber-100 text-amber-700' },
    BASSA: { label: 'Bassa', className: 'bg-red-100 text-red-700' },
  }[level]

  return (
    <Badge className={cn('text-xs', config[level].className)}>
      {config[level].label}
    </Badge>
  )
}
