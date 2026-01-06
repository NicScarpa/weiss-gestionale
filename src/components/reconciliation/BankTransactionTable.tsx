'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfidenceBadge } from './ConfidenceBadge'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDateShort } from '@/lib/constants'
import {
  CheckCircle2,
  XCircle,
  MoreHorizontal,
  Link2,
  Ban,
  Undo2,
  Eye,
} from 'lucide-react'
import type { BankTransactionWithMatch, ReconciliationStatus } from '@/types/reconciliation'

interface BankTransactionTableProps {
  transactions: BankTransactionWithMatch[]
  loading?: boolean
  onConfirm?: (id: string) => Promise<void>
  onIgnore?: (id: string) => Promise<void>
  onUnmatch?: (id: string) => Promise<void>
  onMatch?: (id: string) => void
  onViewDetails?: (id: string) => void
}

const statusConfig: Record<
  ReconciliationStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  PENDING: { label: 'In Attesa', variant: 'outline' },
  MATCHED: { label: 'Riconciliato', variant: 'default' },
  TO_REVIEW: { label: 'Da Verificare', variant: 'secondary' },
  MANUAL: { label: 'Manuale', variant: 'default' },
  IGNORED: { label: 'Ignorato', variant: 'outline' },
  UNMATCHED: { label: 'Non Matchato', variant: 'destructive' },
}

export function BankTransactionTable({
  transactions,
  loading,
  onConfirm,
  onIgnore,
  onUnmatch,
  onMatch,
  onViewDetails,
}: BankTransactionTableProps) {
  const [processingId, setProcessingId] = useState<string | null>(null)

  const handleAction = async (id: string, action: () => Promise<void>) => {
    setProcessingId(id)
    try {
      await action()
    } finally {
      setProcessingId(null)
    }
  }

  if (loading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrizione Banca</TableHead>
              <TableHead className="text-right">Importo</TableHead>
              <TableHead>Movimento Prima Nota</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                {[...Array(7)].map((_, j) => (
                  <TableCell key={j}>
                    <div className="h-4 w-full bg-muted animate-pulse rounded" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-muted-foreground">
        Nessuna transazione trovata
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Data</TableHead>
            <TableHead className="min-w-[200px]">Descrizione Banca</TableHead>
            <TableHead className="text-right w-[120px]">Importo</TableHead>
            <TableHead className="min-w-[200px]">Movimento Prima Nota</TableHead>
            <TableHead className="w-[80px]">Match</TableHead>
            <TableHead className="w-[120px]">Status</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((tx) => {
            const status = statusConfig[tx.status]
            const isProcessing = processingId === tx.id

            return (
              <TableRow
                key={tx.id}
                className={cn(
                  tx.status === 'IGNORED' && 'opacity-50',
                  isProcessing && 'opacity-50 pointer-events-none'
                )}
              >
                <TableCell className="font-medium">
                  {formatDateShort(tx.transactionDate)}
                </TableCell>
                <TableCell>
                  <div className="max-w-[300px]">
                    <p className="truncate font-medium">{tx.description}</p>
                    {tx.bankReference && (
                      <p className="text-xs text-muted-foreground truncate">
                        Rif: {tx.bankReference}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell className={cn(
                  'text-right font-mono',
                  tx.amount > 0 ? 'text-green-600' : 'text-red-600'
                )}>
                  {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                </TableCell>
                <TableCell>
                  {tx.matchedEntry ? (
                    <div className="max-w-[300px]">
                      <p className="truncate">{tx.matchedEntry.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateShort(tx.matchedEntry.date)} -{' '}
                        {formatCurrency(
                          tx.matchedEntry.debitAmount || tx.matchedEntry.creditAmount || 0
                        )}
                      </p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <ConfidenceBadge confidence={tx.matchConfidence} />
                </TableCell>
                <TableCell>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={isProcessing}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewDetails?.(tx.id)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Dettagli
                      </DropdownMenuItem>

                      {tx.status === 'TO_REVIEW' && tx.matchedEntryId && onConfirm && (
                        <DropdownMenuItem
                          onClick={() => handleAction(tx.id, () => onConfirm(tx.id))}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                          Conferma Match
                        </DropdownMenuItem>
                      )}

                      {(tx.status === 'PENDING' ||
                        tx.status === 'UNMATCHED' ||
                        tx.status === 'TO_REVIEW') &&
                        onMatch && (
                          <DropdownMenuItem onClick={() => onMatch(tx.id)}>
                            <Link2 className="mr-2 h-4 w-4" />
                            Match Manuale
                          </DropdownMenuItem>
                        )}

                      {tx.status !== 'IGNORED' &&
                        tx.status !== 'MATCHED' &&
                        tx.status !== 'MANUAL' &&
                        onIgnore && (
                          <DropdownMenuItem
                            onClick={() => handleAction(tx.id, () => onIgnore(tx.id))}
                          >
                            <Ban className="mr-2 h-4 w-4" />
                            Ignora
                          </DropdownMenuItem>
                        )}

                      {(tx.status === 'MATCHED' ||
                        tx.status === 'MANUAL' ||
                        tx.status === 'IGNORED') &&
                        onUnmatch && (
                          <DropdownMenuItem
                            onClick={() => handleAction(tx.id, () => onUnmatch(tx.id))}
                          >
                            <Undo2 className="mr-2 h-4 w-4" />
                            Annulla
                          </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
