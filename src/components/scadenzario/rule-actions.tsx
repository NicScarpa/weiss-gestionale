"use client"

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pencil, ChevronsUp, ChevronsDown, Trash2 } from 'lucide-react'

interface RuleActionsProps {
  isFirst: boolean
  isLast: boolean
  onEdit: () => void
  onDelete: () => void
  onMoveToTop: () => void
  onMoveToBottom: () => void
}

export function RuleActions({
  isFirst,
  isLast,
  onEdit,
  onDelete,
  onMoveToTop,
  onMoveToBottom,
}: RuleActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-white">
        {!isFirst && (
          <DropdownMenuItem onClick={onMoveToTop}>
            <ChevronsUp className="mr-2 h-4 w-4" />
            Muovi in testa
          </DropdownMenuItem>
        )}
        {!isLast && (
          <DropdownMenuItem onClick={onMoveToBottom}>
            <ChevronsDown className="mr-2 h-4 w-4" />
            Muovi in coda
          </DropdownMenuItem>
        )}
        {(!isFirst || !isLast) && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Modifica regola
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Elimina regola
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
