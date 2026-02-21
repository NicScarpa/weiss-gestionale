"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Recurrence, RECURRENCE_TYPE_LABELS, SCHEDULE_PAYMENT_METHOD_LABELS, RecurrenceType, SchedulePaymentMethod } from '@/types/schedule'
import { formatCurrency } from '@/lib/utils'
import { RecurrenceActions } from './recurrence-actions'
import { Repeat } from 'lucide-react'

interface RecurrenceTableProps {
  recurrences: Recurrence[]
  isLoading: boolean
  onEdit: (recurrence: Recurrence) => void
  onGenerate: (id: string) => void
  onToggleActive: (id: string, isActive: boolean) => void
  onDelete: (id: string) => void
}

export function RecurrenceTable({
  recurrences,
  isLoading,
  onEdit,
  onGenerate,
  onToggleActive,
  onDelete,
}: RecurrenceTableProps) {
  if (isLoading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Descrizione</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead className="text-right">Importo</TableHead>
            <TableHead>Conto pagamento</TableHead>
            <TableHead>Mod. pagamento</TableHead>
            <TableHead>Frequenza</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
              Caricamento...
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
  }

  if (recurrences.length === 0) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Descrizione</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead className="text-right">Importo</TableHead>
            <TableHead>Conto pagamento</TableHead>
            <TableHead>Mod. pagamento</TableHead>
            <TableHead>Frequenza</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell colSpan={7} className="text-center py-12">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Repeat className="h-10 w-10 opacity-30" />
                <p className="font-medium">Nessun risultato</p>
                <p className="text-sm">Crea la tua prima ricorrenza per automatizzare le scadenze</p>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Descrizione</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead className="text-right">Importo</TableHead>
          <TableHead>Conto pagamento</TableHead>
          <TableHead>Mod. pagamento</TableHead>
          <TableHead>Frequenza</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {recurrences.map((recurrence) => {
          const categoriaLabel = recurrence.categoria
            ? recurrence.categoria.parent
              ? `${recurrence.categoria.parent.name} / ${recurrence.categoria.name}`
              : recurrence.categoria.name
            : '—'

          const frequenzaLabel = RECURRENCE_TYPE_LABELS[recurrence.frequenza as RecurrenceType] || recurrence.frequenza
          const metodoPagamentoLabel = recurrence.metodoPagamento
            ? SCHEDULE_PAYMENT_METHOD_LABELS[recurrence.metodoPagamento as SchedulePaymentMethod] || recurrence.metodoPagamento
            : '—'

          return (
            <TableRow
              key={recurrence.id}
              className={recurrence.isActive ? '' : 'opacity-50'}
            >
              <TableCell>
                <div className="space-y-1">
                  <span className="font-medium">{recurrence.descrizione}</span>
                  {!recurrence.isActive && (
                    <Badge variant="secondary" className="text-[10px] ml-2">
                      Disattivata
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {categoriaLabel}
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(Number(recurrence.importo))}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {recurrence.contoDiPagamento?.name || '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {metodoPagamentoLabel}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="font-normal">
                  {frequenzaLabel}
                </Badge>
              </TableCell>
              <TableCell>
                <RecurrenceActions
                  recurrence={recurrence}
                  onEdit={() => onEdit(recurrence)}
                  onGenerate={() => onGenerate(recurrence.id)}
                  onToggleActive={() => onToggleActive(recurrence.id, !recurrence.isActive)}
                  onDelete={() => onDelete(recurrence.id)}
                />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
