'use client'

import { useState, Fragment } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Link as LinkIcon,
  FileText,
  User,
  Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/constants'
import { DangerousDeleteDialog } from '@/components/ui/dangerous-delete-dialog'
import type { JournalEntry } from '@/types/prima-nota'

interface JournalEntryTableProps {
  entries: JournalEntry[]
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  summary?: {
    totalDebits: number
    totalCredits: number
    netMovement: number
  }
  onPageChange?: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  onEdit?: (entry: JournalEntry) => void
  onDelete?: (entry: JournalEntry) => void
  isLoading?: boolean
  showVenue?: boolean
}

export function JournalEntryTable({
  entries,
  pagination,
  summary,
  onPageChange,
  onPageSizeChange,
  onEdit,
  onDelete,
  isLoading = false,
  showVenue = false,
}: JournalEntryTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null)

  const toggleExpand = (entryId: string) => {
    setExpandedId((prev) => (prev === entryId ? null : entryId))
  }

  const handleDelete = (entry: JournalEntry) => {
    if (!onDelete) return
    setDeleteTarget(entry)
  }

  const confirmDelete = async () => {
    if (!deleteTarget || !onDelete) return
    setDeletingId(deleteTarget.id)
    try {
      await onDelete(deleteTarget)
    } finally {
      setDeletingId(null)
      setDeleteTarget(null)
    }
  }

  // Determina se il movimento è modificabile
  const isEditable = (entry: JournalEntry) => !entry.closureId

  // Colore badge per tipo registro
  const getRegisterBadge = (registerType: string) => {
    switch (registerType) {
      case 'CASH':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            Cassa
          </Badge>
        )
      case 'BANK':
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            Banca
          </Badge>
        )
      default:
        return <Badge variant="outline">{registerType}</Badge>
    }
  }

  // Formatta saldo progressivo
  const formatBalance = (balance?: number) => {
    if (balance === undefined || balance === null) return '-'
    return (
      <span
        className={cn(
          'font-mono font-medium',
          balance >= 0 ? 'text-foreground' : 'text-red-600'
        )}
      >
        {formatCurrency(balance)}
      </span>
    )
  }

  if (isLoading) {
    return (
      <div className="border rounded-lg">
        <div className="p-8 text-center text-muted-foreground">
          Caricamento movimenti...
        </div>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="border rounded-lg">
        <div className="p-8 text-center text-muted-foreground">
          Nessun movimento trovato
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Tabella */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Data</TableHead>
              {showVenue && <TableHead className="w-[100px]">Sede</TableHead>}
              <TableHead className="w-[80px]">Registro</TableHead>
              <TableHead>Descrizione</TableHead>
              <TableHead className="w-[130px] text-right">Dare</TableHead>
              <TableHead className="w-[130px] text-right">Avere</TableHead>
              <TableHead className="w-[130px] text-right">Saldo</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const isExpanded = expandedId === entry.id
              return (
                <Fragment key={entry.id}>
                  <TableRow
                    className={cn(
                      'cursor-pointer hover:bg-muted/50 transition-colors',
                      entry.closureId && 'bg-muted/30',
                      deletingId === entry.id && 'opacity-50',
                      isExpanded && 'bg-muted/50'
                    )}
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1">
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        )}
                        {format(new Date(entry.date), 'dd/MM/yy', { locale: it })}
                      </div>
                    </TableCell>

                    {showVenue && (
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {entry.venue?.code || '-'}
                        </Badge>
                      </TableCell>
                    )}

                    <TableCell>{getRegisterBadge(entry.registerType)}</TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{entry.description}</span>
                        {!isExpanded && (
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            {entry.documentRef && (
                              <span className="flex items-center gap-1">
                                <LinkIcon className="h-3 w-3" />
                                {entry.documentRef}
                              </span>
                            )}
                            {entry.closureId && (
                              <Badge variant="outline" className="text-xs py-0">
                                da chiusura
                              </Badge>
                            )}
                            {entry.account && (
                              <span className="text-muted-foreground">
                                {entry.account.code}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-right font-mono">
                      {entry.debitAmount && entry.debitAmount > 0 ? (
                        <span className="text-green-600">
                          {formatCurrency(entry.debitAmount)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">-</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right font-mono">
                      {entry.creditAmount && entry.creditAmount > 0 ? (
                        <span className="text-red-600">
                          {formatCurrency(entry.creditAmount)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">-</span>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      {formatBalance(entry.runningBalance)}
                    </TableCell>

                    <TableCell>
                      {isEditable(entry) && (onEdit || onDelete) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={deletingId === entry.id}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {onEdit && (
                              <DropdownMenuItem onClick={() => onEdit(entry)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Modifica
                              </DropdownMenuItem>
                            )}
                            {onDelete && (
                              <DropdownMenuItem
                                onClick={() => handleDelete(entry)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Elimina
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>

                  {/* Riga espansa con dettagli */}
                  {isExpanded && (
                    <TableRow key={`${entry.id}-details`} className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={showVenue ? 8 : 7} className="py-3 px-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          {/* Documento */}
                          {entry.documentRef && (
                            <div>
                              <span className="text-muted-foreground flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                Documento
                              </span>
                              <span className="font-medium">{entry.documentRef}</span>
                              {entry.documentType && (
                                <span className="text-muted-foreground ml-1">
                                  ({entry.documentType})
                                </span>
                              )}
                            </div>
                          )}

                          {/* Conto */}
                          {entry.account && (
                            <div>
                              <span className="text-muted-foreground">Conto</span>
                              <div className="font-medium">
                                {entry.account.code} - {entry.account.name}
                              </div>
                            </div>
                          )}

                          {/* IVA */}
                          {entry.vatAmount && entry.vatAmount > 0 && (
                            <div>
                              <span className="text-muted-foreground">IVA</span>
                              <div className="font-mono font-medium">
                                {formatCurrency(entry.vatAmount)}
                              </div>
                            </div>
                          )}

                          {/* Chiusura di riferimento */}
                          {entry.closureId && entry.closure && (
                            <div>
                              <span className="text-muted-foreground">Chiusura</span>
                              <div className="font-medium">
                                {format(new Date(entry.closure.date), 'dd/MM/yyyy', { locale: it })}
                              </div>
                            </div>
                          )}

                          {/* Creato da */}
                          {entry.createdBy && (
                            <div>
                              <span className="text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" />
                                Creato da
                              </span>
                              <span className="font-medium">
                                {entry.createdBy.firstName} {entry.createdBy.lastName}
                              </span>
                            </div>
                          )}

                          {/* Data creazione */}
                          <div>
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Registrato il
                            </span>
                            <span className="font-medium">
                              {format(new Date(entry.createdAt), 'dd/MM/yyyy HH:mm', { locale: it })}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Riepilogo totali */}
      {summary && (
        <div className="flex justify-end">
          <div className="bg-muted/50 rounded-lg px-4 py-2 text-sm space-y-1">
            <div className="flex justify-between gap-8">
              <span className="text-muted-foreground">Totale Dare:</span>
              <span className="font-mono font-medium text-green-600">
                {formatCurrency(summary.totalDebits)}
              </span>
            </div>
            <div className="flex justify-between gap-8">
              <span className="text-muted-foreground">Totale Avere:</span>
              <span className="font-mono font-medium text-red-600">
                {formatCurrency(summary.totalCredits)}
              </span>
            </div>
            <div className="flex justify-between gap-8 pt-1 border-t">
              <span className="font-medium">Saldo:</span>
              <span
                className={cn(
                  'font-mono font-semibold',
                  summary.netMovement >= 0 ? 'text-green-600' : 'text-red-600'
                )}
              >
                {summary.netMovement >= 0 ? '+' : ''}
                {formatCurrency(summary.netMovement)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Paginazione */}
      {pagination && (
        <div className="flex items-center justify-between">
          {/* Selettore dimensione pagina */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Mostra</span>
            <Select
              value={pagination.limit.toString()}
              onValueChange={(v) => onPageSizeChange?.(parseInt(v))}
            >
              <SelectTrigger className="w-[80px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="500">500</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              per pagina ({pagination.total} totali)
            </span>
          </div>

          {/* Navigazione pagine */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(pagination.page - 1)}
                disabled={pagination.page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Precedente
              </Button>
              <span className="text-sm text-muted-foreground">
                Pagina {pagination.page} di {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
              >
                Successivo
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
      <DangerousDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Elimina Movimento"
        description="Stai per eliminare questo movimento. Questa azione è irreversibile."
        entityName={deleteTarget?.description}
        confirmLabel="Elimina Movimento"
        onConfirm={confirmDelete}
      />
    </div>
  )
}
