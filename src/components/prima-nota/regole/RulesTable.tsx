'use client'

import { useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  MoreVertical,
  GripVertical,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  Pencil,
  X,
  Plus,
} from 'lucide-react'
import type { CategorizationRule } from '@/types/prima-nota'

interface RulesTableProps {
  rules: CategorizationRule[]
  onEdit: (rule: CategorizationRule) => void
  onDelete: (rule: CategorizationRule) => void
  onMoveToTop: (rule: CategorizationRule) => void
  onMoveToBottom: (rule: CategorizationRule) => void
  onReorder: (reorderedRules: CategorizationRule[]) => void
  onCreate: () => void
  isLoading: boolean
}

function SortableRow({
  rule,
  index,
  onEdit,
  onDelete,
  onMoveToTop,
  onMoveToBottom,
}: {
  rule: CategorizationRule
  index: number
  onEdit: (rule: CategorizationRule) => void
  onDelete: (rule: CategorizationRule) => void
  onMoveToTop: (rule: CategorizationRule) => void
  onMoveToBottom: (rule: CategorizationRule) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const keywordsDisplay = rule.keywords?.join(', ') || '-'

  return (
    <TableRow ref={setNodeRef} style={style} className="group">
      <TableCell className="w-[50px]">
        <div className="flex items-center gap-2">
          <button
            className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="text-muted-foreground text-sm">{index + 1}</span>
        </div>
      </TableCell>
      <TableCell>
        {rule.account ? (
          <span className="text-sm">{rule.account.name}</span>
        ) : (
          <span className="text-sm text-muted-foreground">Tutti i conti</span>
        )}
      </TableCell>
      <TableCell>
        <span className="text-sm font-medium">{rule.name}</span>
      </TableCell>
      <TableCell className="max-w-[200px]">
        <span className="text-sm truncate block" title={keywordsDisplay}>
          {keywordsDisplay}
        </span>
      </TableCell>
      <TableCell className="text-center w-[80px]">
        {rule.autoVerify && (
          <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
        )}
      </TableCell>
      <TableCell className="text-center w-[80px]">
        {rule.autoHide && (
          <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
        )}
      </TableCell>
      <TableCell>
        {rule.budgetCategory ? (
          <Badge
            variant="outline"
            className="text-xs"
            style={{
              backgroundColor: rule.budgetCategory.color ? `${rule.budgetCategory.color}20` : undefined,
              borderColor: rule.budgetCategory.color || undefined,
              color: rule.budgetCategory.color || undefined,
            }}
          >
            {rule.budgetCategory.name}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        )}
      </TableCell>
      <TableCell className="w-[50px]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onMoveToTop(rule)}>
              <ArrowUp className="h-4 w-4 mr-2" />
              Muovi in testa
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMoveToBottom(rule)}>
              <ArrowDown className="h-4 w-4 mr-2" />
              Muovi in coda
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEdit(rule)}>
              <Pencil className="h-4 w-4 mr-2" />
              Modifica regola
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete(rule)}
            >
              <X className="h-4 w-4 mr-2" />
              Elimina regola
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

export function RulesTable({
  rules,
  onEdit,
  onDelete,
  onMoveToTop,
  onMoveToBottom,
  onReorder,
  onCreate,
  isLoading,
}: RulesTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const ruleIds = useMemo(() => rules.map(r => r.id), [rules])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = rules.findIndex(r => r.id === active.id)
    const newIndex = rules.findIndex(r => r.id === over.id)
    const reordered = arrayMove(rules, oldIndex, newIndex)
    onReorder(reordered)
  }

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead>Conto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Keyword</TableHead>
              <TableHead className="text-center w-[80px]">Verifica</TableHead>
              <TableHead className="text-center w-[80px]">Nascondi</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-6" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-8 w-8" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (rules.length === 0) {
    return (
      <div className="rounded-md border bg-card p-12 text-center">
        <p className="text-muted-foreground mb-4">
          Nessuna regola configurata per questa direzione.
        </p>
        <Button variant="outline" onClick={onCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Crea la prima regola
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ruleIds} strategy={verticalListSortingStrategy}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead>Conto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Keyword</TableHead>
                <TableHead className="text-center w-[80px]">Verifica</TableHead>
                <TableHead className="text-center w-[80px]">Nascondi</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule, index) => (
                <SortableRow
                  key={rule.id}
                  rule={rule}
                  index={index}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onMoveToTop={onMoveToTop}
                  onMoveToBottom={onMoveToBottom}
                />
              ))}
            </TableBody>
          </Table>
        </SortableContext>
      </DndContext>
    </div>
  )
}
