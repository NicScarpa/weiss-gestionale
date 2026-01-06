'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConfidenceBadge } from './ConfidenceBadge'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDateShort } from '@/lib/constants'
import { Search, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { BankTransactionWithMatch, MatchCandidate } from '@/types/reconciliation'

interface MatchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transactionId: string | null
  onSuccess?: () => void
}

interface TransactionDetails extends BankTransactionWithMatch {
  matchCandidates: MatchCandidate[]
}

export function MatchDialog({
  open,
  onOpenChange,
  transactionId,
  onSuccess,
}: MatchDialogProps) {
  const [transaction, setTransaction] = useState<TransactionDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (open && transactionId) {
      loadTransaction()
    } else {
      setTransaction(null)
      setSelectedEntryId(null)
      setSearchTerm('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transactionId])

  const loadTransaction = async () => {
    if (!transactionId) return

    setLoading(true)
    try {
      const res = await fetch(`/api/bank-transactions/${transactionId}`)
      if (!res.ok) throw new Error('Errore nel caricamento')
      const data = await res.json()
      setTransaction(data)

      // Pre-seleziona il migliore candidato se esiste
      if (data.matchCandidates?.length > 0) {
        setSelectedEntryId(data.matchCandidates[0].journalEntryId)
      }
    } catch (error) {
      console.error('Load error:', error)
      toast.error('Errore nel caricamento della transazione')
    } finally {
      setLoading(false)
    }
  }

  const handleMatch = async () => {
    if (!transactionId || !selectedEntryId) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/bank-transactions/${transactionId}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journalEntryId: selectedEntryId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Errore nel match')
      }

      toast.success('Match effettuato con successo')
      onSuccess?.()
      onOpenChange(false)
    } catch (error) {
      console.error('Match error:', error)
      toast.error(error instanceof Error ? error.message : 'Errore nel match')
    } finally {
      setSubmitting(false)
    }
  }

  const filteredCandidates = transaction?.matchCandidates?.filter((c) =>
    c.description.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Match Manuale</DialogTitle>
          <DialogDescription>
            Seleziona il movimento prima nota da associare a questa transazione
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : transaction ? (
          <div className="space-y-4">
            {/* Transaction details */}
            <div className="rounded-lg border p-4 bg-muted/30">
              <h4 className="font-medium mb-2">Transazione Bancaria</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Data:</span>{' '}
                  {formatDateShort(transaction.transactionDate)}
                </div>
                <div>
                  <span className="text-muted-foreground">Importo:</span>{' '}
                  <span
                    className={cn(
                      'font-mono',
                      transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                    )}
                  >
                    {formatCurrency(transaction.amount)}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Descrizione:</span>{' '}
                  {transaction.description}
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca movimenti..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Candidates */}
            {filteredCandidates && filteredCandidates.length > 0 ? (
              <ScrollArea className="h-[250px] rounded-md border">
                <RadioGroup
                  value={selectedEntryId || ''}
                  onValueChange={setSelectedEntryId}
                  className="p-4 space-y-2"
                >
                  {filteredCandidates.map((candidate) => (
                    <Label
                      key={candidate.journalEntryId}
                      htmlFor={candidate.journalEntryId}
                      className={cn(
                        'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                        selectedEntryId === candidate.journalEntryId
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      <RadioGroupItem
                        value={candidate.journalEntryId}
                        id={candidate.journalEntryId}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {candidate.description}
                          </span>
                          <ConfidenceBadge confidence={candidate.confidence} />
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          <span>{formatDateShort(candidate.date)}</span>
                          <span className="mx-2">|</span>
                          <span
                            className={cn(
                              'font-mono',
                              candidate.amount > 0
                                ? 'text-green-600'
                                : 'text-red-600'
                            )}
                          >
                            {formatCurrency(candidate.amount)}
                          </span>
                          {candidate.documentRef && (
                            <>
                              <span className="mx-2">|</span>
                              <span>Rif: {candidate.documentRef}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </Label>
                  ))}
                </RadioGroup>
              </ScrollArea>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm
                  ? 'Nessun movimento trovato con questo filtro'
                  : 'Nessun candidato disponibile per questa transazione'}
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            onClick={handleMatch}
            disabled={!selectedEntryId || submitting}
          >
            {submitting ? 'Salvataggio...' : 'Conferma Match'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
