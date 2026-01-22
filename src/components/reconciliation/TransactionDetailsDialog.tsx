'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDateShort } from '@/lib/constants'
import {
  Calendar,
  CreditCard,
  FileText,
  Building2,
  Clock,
  User,
  Link2,
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
  Hash,
} from 'lucide-react'
import { toast } from 'sonner'
import type { BankTransactionWithMatch, ReconciliationStatus, ImportSource } from '@/types/reconciliation'

import { logger } from '@/lib/logger'
interface TransactionDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transactionId: string | null
}

const statusConfig: Record<ReconciliationStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; className?: string }> = {
  PENDING: { label: 'In Attesa', variant: 'outline' },
  MATCHED: { label: 'Riconciliato', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
  MANUAL: { label: 'Match Manuale', variant: 'default', className: 'bg-blue-600 hover:bg-blue-700' },
  TO_REVIEW: { label: 'Da Verificare', variant: 'secondary', className: 'bg-yellow-500 hover:bg-yellow-600 text-white' },
  UNMATCHED: { label: 'Non Matchato', variant: 'destructive' },
  IGNORED: { label: 'Ignorato', variant: 'outline', className: 'text-gray-500' },
}

const importSourceLabels: Record<ImportSource, string> = {
  CSV: 'File CSV',
  XLSX: 'File Excel',
  CBI_XML: 'CBI XML',
  CBI_TXT: 'CBI TXT',
  PSD2_FABRICK: 'PSD2 Fabrick',
  PSD2_TINK: 'PSD2 Tink',
  MANUAL: 'Inserimento Manuale',
}

interface DetailRowProps {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  className?: string
}

function DetailRow({ icon, label, value, className }: DetailRowProps) {
  return (
    <div className={cn('flex items-start gap-3 py-2', className)}>
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  )
}

export function TransactionDetailsDialog({
  open,
  onOpenChange,
  transactionId,
}: TransactionDetailsDialogProps) {
  const [transaction, setTransaction] = useState<BankTransactionWithMatch | null>(null)
  const [loading, setLoading] = useState(false)

  const loadTransaction = useCallback(async () => {
    if (!transactionId) return

    setLoading(true)
    try {
      const res = await fetch(`/api/bank-transactions/${transactionId}`)
      if (!res.ok) throw new Error('Errore nel caricamento')
      const data = await res.json()
      setTransaction(data)
    } catch (error) {
      logger.error('Load error', error)
      toast.error('Errore nel caricamento della transazione')
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }, [transactionId, onOpenChange])

  useEffect(() => {
    if (open && transactionId) {
      loadTransaction()
    } else {
      setTransaction(null)
    }
  }, [open, transactionId, loadTransaction])

  const status = transaction?.status ? statusConfig[transaction.status] : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Dettagli Transazione
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : transaction ? (
          <div className="space-y-4">
            {/* Amount and Status Header */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                {transaction.amount > 0 ? (
                  <div className="p-2 rounded-full bg-green-100">
                    <ArrowDownLeft className="h-5 w-5 text-green-600" />
                  </div>
                ) : (
                  <div className="p-2 rounded-full bg-red-100">
                    <ArrowUpRight className="h-5 w-5 text-red-600" />
                  </div>
                )}
                <div>
                  <div className="text-sm text-muted-foreground">
                    {transaction.amount > 0 ? 'Entrata' : 'Uscita'}
                  </div>
                  <div
                    className={cn(
                      'text-2xl font-bold font-mono',
                      transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                    )}
                  >
                    {formatCurrency(transaction.amount)}
                  </div>
                </div>
              </div>
              {status && (
                <Badge variant={status.variant} className={cn('text-sm px-3 py-1', status.className)}>
                  {status.label}
                </Badge>
              )}
            </div>

            {/* Description */}
            <div className="p-3 rounded-lg border bg-card">
              <div className="text-sm text-muted-foreground mb-1">Descrizione</div>
              <div className="text-sm leading-relaxed">{transaction.description}</div>
            </div>

            {/* Transaction Details */}
            <div className="space-y-1">
              <DetailRow
                icon={<Calendar className="h-4 w-4" />}
                label="Data Operazione"
                value={formatDateShort(transaction.transactionDate)}
              />

              {transaction.valueDate && (
                <DetailRow
                  icon={<Calendar className="h-4 w-4" />}
                  label="Data Valuta"
                  value={formatDateShort(transaction.valueDate)}
                />
              )}

              {transaction.bankReference && (
                <DetailRow
                  icon={<Hash className="h-4 w-4" />}
                  label="Riferimento Banca"
                  value={<code className="text-xs bg-muted px-2 py-1 rounded">{transaction.bankReference}</code>}
                />
              )}

              {transaction.balanceAfter !== null && (
                <DetailRow
                  icon={<CreditCard className="h-4 w-4" />}
                  label="Saldo Dopo Operazione"
                  value={
                    <span className="font-mono">
                      {formatCurrency(transaction.balanceAfter)}
                    </span>
                  }
                />
              )}

              {transaction.venue && (
                <DetailRow
                  icon={<Building2 className="h-4 w-4" />}
                  label="Sede"
                  value={
                    <span>
                      {transaction.venue.name}{' '}
                      <Badge variant="outline" className="ml-1 text-xs">
                        {transaction.venue.code}
                      </Badge>
                    </span>
                  }
                />
              )}
            </div>

            {/* Matched Entry */}
            {transaction.matchedEntry && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Link2 className="h-4 w-4" />
                    Movimento Prima Nota Associato
                  </div>
                  <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-950/20 space-y-2">
                    <div className="font-medium">{transaction.matchedEntry.description}</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>Data: {formatDateShort(transaction.matchedEntry.date)}</span>
                      {transaction.matchedEntry.debitAmount && (
                        <span className="font-mono text-red-600">
                          Dare: {formatCurrency(transaction.matchedEntry.debitAmount)}
                        </span>
                      )}
                      {transaction.matchedEntry.creditAmount && (
                        <span className="font-mono text-green-600">
                          Avere: {formatCurrency(transaction.matchedEntry.creditAmount)}
                        </span>
                      )}
                      {transaction.matchedEntry.documentRef && (
                        <span>Rif: {transaction.matchedEntry.documentRef}</span>
                      )}
                    </div>
                    {transaction.matchConfidence !== null && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Confidence: </span>
                        <span className="font-medium">{Math.round(transaction.matchConfidence * 100)}%</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Import & Reconciliation Info */}
            <Separator />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground mb-1 flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  Importazione
                </div>
                <div>{importSourceLabels[transaction.importSource]}</div>
                <div className="text-xs text-muted-foreground">
                  {formatDateShort(transaction.importedAt)}
                </div>
              </div>

              {transaction.reconciledAt && (
                <div>
                  <div className="text-muted-foreground mb-1 flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Riconciliazione
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateShort(transaction.reconciledAt)}
                  </div>
                </div>
              )}
            </div>

            {/* ID for debugging */}
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>ID: {transaction.id}</span>
                <span>|</span>
                <span>Creato: {formatDateShort(transaction.createdAt)}</span>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
