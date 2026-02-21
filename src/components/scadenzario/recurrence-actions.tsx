"use client"

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pencil, Play, Power, Trash2 } from 'lucide-react'
import { Recurrence } from '@/types/schedule'

interface RecurrenceActionsProps {
  recurrence: Recurrence
  onEdit: () => void
  onGenerate: () => void
  onToggleActive: () => void
  onDelete: () => void
}

export function RecurrenceActions({
  recurrence,
  onEdit,
  onGenerate,
  onToggleActive,
  onDelete,
}: RecurrenceActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-white">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Modifica
        </DropdownMenuItem>
        {recurrence.isActive && (
          <DropdownMenuItem onClick={onGenerate}>
            <Play className="mr-2 h-4 w-4" />
            Genera prossima
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onToggleActive}>
          <Power className="mr-2 h-4 w-4" />
          {recurrence.isActive ? 'Disattiva' : 'Attiva'}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Elimina
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
