'use client'

import { Button } from '@/components/ui/button'
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  Send,
  FileCheck,
  XCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { PaymentStatus } from '@/types/prima-nota'

interface PagamentoRowActionsProps {
  paymentId: string
  status: PaymentStatus
  onEdit?: () => void
  onDelete?: () => void
  onApprove?: () => void
  onDispose?: () => void
  onComplete?: () => void
  onFail?: () => void
  onAnnul?: () => void
}

const STATUS_ACTIONS: Record<PaymentStatus, Array<{ key: string; label: string; icon: LucideIcon; action: 'approve' | 'dispose' | 'complete' | 'fail' | 'annul' }>> = {
  BOZZA: [
    { key: 'approve', label: 'Approva', icon: Check, action: 'approve' },
  ],
  DA_APPROVARE: [
    { key: 'dispose', label: 'Dispõni', icon: Send, action: 'dispose' },
    { key: 'annul', label: 'Annulla', icon: XCircle, action: 'annul' },
  ],
  DISPOSTO: [
    { key: 'complete', label: 'Completa', icon: FileCheck, action: 'complete' },
    { key: 'annul', label: 'Annulla', icon: XCircle, action: 'annul' },
  ],
  COMPLETATO: [],
  FALLITO: [],
  ANNULLATO: [],
}

export function PagamentoRowActions({
  paymentId: _paymentId,
  status,
  onEdit,
  onDelete,
  onApprove,
  onDispose,
  onComplete,
  onFail,
  onAnnul,
}: PagamentoRowActionsProps) {
  const actions = STATUS_ACTIONS[status] || []
  const canEdit = status === 'BOZZA' || status === 'DA_APPROVARE'
  const canDelete = status === 'BOZZA'

  const handleAction = (action: string) => {
    switch (action) {
      case 'approve': onApprove?.(); break
      case 'dispose': onDispose?.(); break
      case 'complete': onComplete?.(); break
      case 'fail': onFail?.(); break
      case 'annul': onAnnul?.(); break
    }
  }

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 flex items-center justify-center"
            aria-label="Azioni pagamento"
          >
            <span className="sr-only">Azioni disponibili</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="min-w-[180px]">
          <div className="p-1">
            {onEdit && (
              <DropdownMenuItem
                className={cn(
                  !canEdit && "opacity-50 pointer-events-none"
                )}
                disabled={!canEdit}
                onClick={onEdit}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Modifica
              </DropdownMenuItem>
            )}

            {actions.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    Azioni disponibili
                  </DropdownMenuLabel>
                  {actions.map(({ key, label, icon: Icon, action }) => (
                    <DropdownMenuItem
                      key={key}
                      onClick={() => handleAction(action)}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}

            {onDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className={cn(
                    !canDelete && "opacity-50 pointer-events-none"
                  )}
                  disabled={!canDelete}
                  onClick={onDelete}
                  variant="destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Cancella
                </DropdownMenuItem>
              </>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
