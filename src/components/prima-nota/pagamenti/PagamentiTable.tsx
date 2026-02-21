'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ArrowUpDownIcon,
  CalendarIcon,
  CreditCardIcon,
} from 'lucide-react'
import { PaymentStatusBadge } from '../shared/PaymentStatusBadge'
import { PagamentoRowActions } from './PagamentoRowActions'
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_TYPE_LABELS,
  type PaymentStatus,
  type PaymentType,
} from '@/types/prima-nota'
import { cn } from '@/lib/utils'

interface PagamentiTableProps {
  data: Array<{
    id: string
    dataEsecuzione: Date
    tipo: PaymentType
    importo: number
    beneficiarioNome: string
    beneficiarioIban?: string
    causale?: string
    stato: PaymentStatus
  }>
  filters?: {
    dateFrom?: Date
    dateTo?: Date
    tipo?: PaymentType
    stato?: PaymentStatus
    beneficiarioNome?: string
    search?: string
  }
  onSort?: (field: string, direction: 'asc' | 'desc') => void
  onEdit?: (payment: { id: string }) => void
  onDelete?: (id: string) => void
  onApprove?: (id: string) => void
  onDispose?: (id: string) => void
  onComplete?: (id: string) => void
  onFail?: (id: string) => void
  onAnnulla?: (id: string) => void
  onPageChange?: (page: number) => void
  isLoading?: boolean
}

export function PagamentiTable({
  data,
  filters,
  onSort,
  onEdit,
  onDelete,
  onApprove,
  onDispose,
  onComplete,
  onFail,
  onAnnulla,
  onPageChange,
  isLoading = false,
}: PagamentiTableProps) {
  // Format data italiana
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

  return (
    <div className="space-y-4">
      {/* Header con filtri attivi e conteggio */}
      {filters && (
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" />
            {filters.dateFrom && (
              <span className="mr-3">
                Dal: {formatDate(filters.dateFrom)}
              </span>
            )}
            {filters.dateTo && (
              <span className="mr-3">
                Al: {formatDate(filters.dateTo)}
              </span>
            )}
            {filters.stato && (
              <span className="mr-3">
                Stato: {PAYMENT_STATUS_LABELS[filters.stato]}
              </span>
            )}
            {filters.beneficiarioNome && (
              <span className="mr-3">
                Beneficiario: {filters.beneficiarioNome}
              </span>
            )}
          </div>
          <div className="font-semibold">{data.length} pagamenti</div>
        </div>
      )}

      {/* Tabella */}
      <div className="rounded-lg border bg-background">
        <table className="w-full">
          <thead className="border-b bg-muted/50">
            <tr className="border-b">
              <th className="h-10 px-4 text-left">
                <button
                  type="button"
                  className="flex items-center gap-1 group outline-none focus:outline-none transition-opacity hover:bg-muted/100"
                  onClick={() => onSort?.('dataEsecuzione', 'asc')}
                >
                  Data
                  <ArrowUpDownIcon className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100" />
                </button>
              </th>
              <th className="h-10 px-4 text-left">
                Tipo
              </th>
              <th className="h-10 px-4 text-left min-w-[250px]">
                Beneficiario
              </th>
              <th className="h-10 px-4 text-right">
                Importo
              </th>
              <th className="h-10 px-4 text-left">
                Causale
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
            {isLoading ? (
              <tr>
                <td colSpan={8} className="text-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-t-foreground mx-auto" />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground">
                  <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-sm mt-2">Nessun pagamento trovato</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {filters
                      ? 'Prova a cambiare i filtri di ricerca.'
                      : 'Iniziana aggiungendo il primo pagamento!'}
                  </p>
                </td>
              </tr>
            ) : (
              data.map((payment) => (
                <tr
                  key={payment.id}
                  className={cn(
                    "border-b transition-colors hover:bg-muted/50",
                    payment.stato === 'ANNULLATO' && "opacity-50"
                  )}
                >
                  {/* Data */}
                  <td className="px-4 py-3 text-sm">
                    {formatDate(payment.dataEsecuzione)}
                  </td>

                  {/* Tipo */}
                  <td className="px-4 py-3 text-sm">
                    <span className={cn(
                      "inline-flex items-center gap-1.5",
                      payment.tipo === 'BONIFICO' && "text-blue-600",
                      payment.tipo === 'F24' && "text-orange-600",
                    )}>
                      <CreditCardIcon className="h-4 w-4" />
                      <span className="ml-1">{PAYMENT_TYPE_LABELS[payment.tipo]}</span>
                    </span>
                  </td>

                  {/* Beneficiario */}
                  <td className="px-4 py-3 text-sm">
                    <div className="min-w-[200px]">
                      <div className="font-medium">{payment.beneficiarioNome}</div>
                      {payment.beneficiarioIban && (
                        <div className="text-xs text-muted-foreground font-mono ml-2">
                          {payment.beneficiarioIban}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Importo */}
                  <td className="px-4 py-3 text-sm text-right font-medium">
                    €{formatCurrency(payment.importo)}
                  </td>

                  {/* Causale */}
                  <td className="px-4 py-3 text-sm">
                    <div className="max-w-[200px] truncate" title={payment.causale}>
                      {payment.causale || '-'}
                    </div>
                  </td>

                  {/* Stato */}
                  <td className="px-4 py-3 text-sm">
                    <PaymentStatusBadge status={payment.stato} />
                  </td>

                  {/* Azioni */}
                  <td className="px-4 py-3">
                    <PagamentoRowActions
                      paymentId={payment.id}
                      status={payment.stato}
                      onEdit={onEdit ? () => onEdit({ id: payment.id }) : undefined}
                      onDelete={onDelete ? () => onDelete(payment.id) : undefined}
                      onApprove={onApprove ? () => onApprove(payment.id) : undefined}
                      onDispose={onDispose ? () => onDispose(payment.id) : undefined}
                      onComplete={onComplete ? () => onComplete(payment.id) : undefined}
                      onFail={onFail ? () => onFail(payment.id) : undefined}
                      onAnnul={onAnnulla ? () => onAnnulla(payment.id) : undefined}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Paginazione */}
        {onPageChange && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              Mostrando {(filters ? 'filtrati' : 'tutti')} i pagamenti
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-1 text-sm border rounded hover:bg-muted-100 disabled:opacity-50"
                disabled
              >
                Precedente
              </button>
              <button
                type="button"
                className="px-3 py-1 text-sm border rounded hover:bg-muted-100 disabled:opacity-50"
                disabled
              >
                Successivo
              </button>
              <button
                type="button"
                className="px-3 py-1 text-sm border rounded hover:bg-muted-100 disabled:opacity-50"
                disabled
              >
                Successivo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
