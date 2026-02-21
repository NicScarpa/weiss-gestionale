"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ScheduleRule,
  SCHEDULE_DOCUMENT_TYPE_LABELS,
  SCHEDULE_PAYMENT_METHOD_LABELS,
  SCHEDULE_RULE_ACTION_LABELS,
  ScheduleDocumentType,
  SchedulePaymentMethod,
  ScheduleRuleAction,
} from '@/types/schedule'
import { RuleActions } from './rule-actions'
import { Scale } from 'lucide-react'

interface RuleTableProps {
  rules: ScheduleRule[]
  isLoading: boolean
  onEdit: (rule: ScheduleRule) => void
  onDelete: (rule: ScheduleRule) => void
  onMoveToTop: (rule: ScheduleRule) => void
  onMoveToBottom: (rule: ScheduleRule) => void
}

export function RuleTable({
  rules,
  isLoading,
  onEdit,
  onDelete,
  onMoveToTop,
  onMoveToBottom,
}: RuleTableProps) {
  if (isLoading) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Conto</TableHead>
            <TableHead>Tipo documento</TableHead>
            <TableHead>Tipo pagamento</TableHead>
            <TableHead>Azione</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
              Caricamento...
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
  }

  if (rules.length === 0) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Conto</TableHead>
            <TableHead>Tipo documento</TableHead>
            <TableHead>Tipo pagamento</TableHead>
            <TableHead>Azione</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell colSpan={6} className="text-center py-12">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Scale className="h-10 w-10 opacity-30" />
                <p className="font-medium">Nessuna regola configurata</p>
                <p className="text-sm">Aggiungi una regola per automatizzare la riconciliazione</p>
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
          <TableHead className="w-12">#</TableHead>
          <TableHead>Conto</TableHead>
          <TableHead>Tipo documento</TableHead>
          <TableHead>Tipo pagamento</TableHead>
          <TableHead>Azione</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rules.map((rule, index) => {
          const tipoDocLabel = rule.tipoDocumento
            ? SCHEDULE_DOCUMENT_TYPE_LABELS[rule.tipoDocumento as ScheduleDocumentType] || rule.tipoDocumento
            : '—'
          const tipoPagLabel = rule.tipoPagamento
            ? SCHEDULE_PAYMENT_METHOD_LABELS[rule.tipoPagamento as SchedulePaymentMethod] || rule.tipoPagamento
            : '—'
          const azioneLabel = SCHEDULE_RULE_ACTION_LABELS[rule.azione as ScheduleRuleAction] || rule.azione
          const contoInitials = rule.conto?.code?.slice(0, 2).toUpperCase() || '??'

          return (
            <TableRow key={rule.id}>
              <TableCell className="text-muted-foreground font-mono text-sm">
                {index + 1}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-medium text-slate-600">
                    {contoInitials}
                  </div>
                  <span className="font-medium">{rule.conto?.name || '—'}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {tipoDocLabel}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {tipoPagLabel}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {azioneLabel}
              </TableCell>
              <TableCell>
                <RuleActions
                  isFirst={index === 0}
                  isLast={index === rules.length - 1}
                  onEdit={() => onEdit(rule)}
                  onDelete={() => onDelete(rule)}
                  onMoveToTop={() => onMoveToTop(rule)}
                  onMoveToBottom={() => onMoveToBottom(rule)}
                />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
