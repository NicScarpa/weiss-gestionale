'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ArrowUpDownIcon,
  CalendarIcon,
} from 'lucide-react'
import { MovimentoRowActions } from './MovimentoRowActions'
import { JournalEntryBadge } from '../shared/JournalEntryBadge'
import { CategorizationBadge } from '../shared/CategorizationBadge'
import {
  type JournalEntry,
  type JournalEntryFilters,
} from '@/types/prima-nota'
import { cn } from '@/lib/utils'

interface MovimentiTableProps {
  data: JournalEntry[]
  filters?: JournalEntryFilters
  onSort?: (field: string, direction: 'asc' | 'desc') => void
  onEdit?: (entry: JournalEntry) => void
  onDelete?: (id: string) => void
  onVerify?: (id: string, verified: boolean) => void
  onHide?: (id: string, hidden: boolean) => void
  onCategorize?: (entry: JournalEntry) => void
  isLoading?: boolean
}

export function MovimentiTable({
  data,
  filters,
  onSort,
  onEdit,
  onDelete,
  onVerify,
  onHide,
  onCategorize,
  isLoading = false,
}: MovimentiTableProps) {
  // Format valuta italiana
  const formatCurrency = (amount?: number) => {
    if (amount === undefined || amount === null) return '-'
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  // Format data italiana
  const formatDate = (date: Date | string) => {
    return format(new Date(date), 'dd/MM/yyyy', { locale: it })
  }

  // Determina se è dare o avere
  const getDebitCredit = (entry: JournalEntry) => {
    if (entry.debitAmount && entry.debitAmount > 0) {
      return { type: 'debit' as const, amount: entry.debitAmount }
    }
    if (entry.creditAmount && entry.creditAmount > 0) {
      return { type: 'credit' as const, amount: entry.creditAmount }
    }
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-t-transparent border-r-transparent" />
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CalendarIcon className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold">Nessun movimento</h3>
        <p className="text-muted-foreground max-w-md">
          {filters
            ? 'Nessun movimento corrisponde ai filtri selezionati.'
            : 'Non ci sono ancora movimenti. Iniziana aggiungendo il primo movimento!'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header tabella */}
      <div className="rounded-lg border bg-background">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr className="border-b">
                <th className="h-10 px-4 text-left">
                  <button
                    type="button"
                    className="flex items-center gap-1 group outline-none focus:outline-none"
                    onClick={() => onSort?.('date', 'desc')}
                  >
                    Data
                    <ArrowUpDownIcon className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                </th>
                <th className="h-10 px-4 text-left">
                  Tipo
                </th>
                <th className="h-10 px-4 text-left">
                  Descrizione
                </th>
                <th className="h-10 px-4 text-left">
                  Documento
                </th>
                <th className="h-10 px-4 text-right">
                  <button
                    type="button"
                    className="flex items-center justify-end gap-1 group outline-none focus:outline-none"
                    onClick={() => onSort?.('amount', 'desc')}
                  >
                    Importo
                    <ArrowUpDownIcon className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                  </button>
                </th>
                <th className="h-10 px-4 text-left">
                  Conto
                </th>
                <th className="h-10 px-4 text-left">
                  Categoria
                </th>
                <th className="h-10 px-4 text-center">
                  Stato
                </th>
                <th className="h-10 px-4 text-right">
                  Azioni
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((entry, idx) => {
                const dc = getDebitCredit(entry)

                return (
                  <tr
                    key={entry.id}
                    className={cn(
                      "border-b transition-colors hover:bg-muted/50",
                      entry.hiddenAt && "opacity-50"
                    )}
                  >
                    {/* Data */}
                    <td className="px-4 py-3 text-sm">
                      {formatDate(entry.date)}
                    </td>

                    {/* Tipo */}
                    <td className="px-4 py-3 text-sm">
                      <JournalEntryBadge type={entry.entryType} />
                    </td>

                    {/* Descrizione */}
                    <td className="px-4 py-3 text-sm">
                      <div className="max-w-[200px] truncate" title={entry.description}>
                        {entry.description}
                        {entry.counterpartName && (
                          <span className="text-muted-foreground ml-1">
                            ({entry.counterpartName})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Documento */}
                    <td className="px-4 py-3 text-sm">
                      {entry.documentRef ? (
                        <div title={entry.documentType}>
                          <span className="font-medium">{entry.documentRef}</span>
                          {entry.documentType && (
                            <span className="text-muted-foreground ml-1">
                              ({entry.documentType})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>

                    {/* Dare/Avere */}
                    <td className="px-4 py-3 text-sm text-right">
                      {dc && (
                        <div className={cn(
                          "font-medium",
                          dc.type === 'debit' ? "text-red-600" : "text-green-600"
                        )}>
                          {dc.type === 'debit' ? 'Dare' : 'Avere'}
                        </div>
                      )}
                      <div className="font-semibold">
                        {formatCurrency(dc?.amount)}
                      </div>
                    </td>

                    {/* Conto */}
                    <td className="px-4 py-3 text-sm">
                      {entry.account ? (
                        <div>
                          <span className="font-medium">{entry.account?.code}</span>
                          <span className="text-muted-foreground ml-1">
                            {entry.account?.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>

                    {/* Categoria */}
                    <td className="px-4 py-3 text-sm">
                      {entry.budgetCategory ? (
                        <div
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: entry.budgetCategory.color || '#6b7280' }}
                        >
                          {entry.budgetCategory.code}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>

                    {/* Stato Categorizzazione */}
                    <td className="px-4 py-3 text-sm">
                      <CategorizationBadge
                        source={entry.categorizationSource || 'manual'}
                        showLabel={false}
                      />
                    </td>

                    {/* Verificato */}
                    <td className="px-4 py-3 text-sm">
                      {entry.verified ? (
                        <span className="text-green-600" title="Verificato">✓</span>
                      ) : entry.categorizationSource === 'automatic' || entry.categorizationSource === 'rule' ? (
                        <span className="text-muted-foreground" title="Da verificare">○</span>
                      ) : null}
                    </td>

                    {/* Azioni */}
                    <td className="px-4 py-3 text-sm">
                      <MovimentoRowActions
                        entryId={entry.id}
                        verified={entry.verified}
                        hiddenAt={entry.hiddenAt}
                        onEdit={() => onEdit?.(entry)}
                        onDelete={() => onDelete?.(entry.id)}
                        onVerify={() => onVerify?.(entry.id, !entry.verified)}
                        onHide={() => onHide?.(entry.id, !!entry.hiddenAt)}
                        onCategorize={() => onCategorize?.(entry)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
