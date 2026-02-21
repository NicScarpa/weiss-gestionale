'use client'

import { Button } from '@/components/ui/button'
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  Verified,
  EyeOff,
  Tag,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface MovimentoRowActionsProps {
  entryId: string
  verified?: boolean
  hiddenAt?: Date | null
  onEdit?: () => void
  onDelete?: () => void
  onVerify?: () => void
  onHide?: () => void
  onCategorize?: () => void
}

export function MovimentoRowActions({
  entryId,
  verified,
  hiddenAt,
  onEdit,
  onDelete,
  onVerify,
  onHide,
  onCategorize,
}: MovimentoRowActionsProps) {
  return (
    <div className="flex items-center gap-1">
      {onCategorize && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onCategorize}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          title="Categorizza manualmente"
        >
          <Tag className="h-3.5 w-3.5" />
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 flex items-center justify-center"
            aria-label="Azioni"
          >
            <span className="sr-only">Azioni disponibili</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent>
          {onEdit && (
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Modifica
            </DropdownMenuItem>
          )}

          {onVerify && (
            <DropdownMenuItem
              onClick={onVerify}
              disabled={verified}
              className={verified ? 'text-muted-foreground' : undefined}
            >
              <Verified className="mr-2 h-4 w-4" />
              {verified ? 'Già verificato' : 'Verifica'}
            </DropdownMenuItem>
          )}

          {onHide && (
            <DropdownMenuItem onClick={onHide}>
              <EyeOff className="mr-2 h-4 w-4" />
              {hiddenAt ? 'Mostra dallo' : 'Nascondi'}
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {onDelete && (
            <DropdownMenuItem onClick={onDelete} variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Cancella
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
