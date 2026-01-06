'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Clock, AlertTriangle, Ban, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/constants'
import type { ReconciliationSummary } from '@/types/reconciliation'

interface ReconciliationSummaryCardsProps {
  summary: ReconciliationSummary | null
  loading?: boolean
}

export function ReconciliationSummaryCards({
  summary,
  loading,
}: ReconciliationSummaryCardsProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const cards = [
    {
      title: 'Riconciliati',
      value: summary?.matched ?? 0,
      icon: CheckCircle2,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Da Verificare',
      value: summary?.toReview ?? 0,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
    },
    {
      title: 'Non Matchati',
      value: summary?.unmatched ?? 0,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    },
    {
      title: 'Ignorati',
      value: summary?.ignored ?? 0,
      icon: Ban,
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
    },
    {
      title: 'Differenza',
      value: summary?.difference ?? 0,
      icon: Wallet,
      color: summary?.difference === 0 ? 'text-green-600' : 'text-red-600',
      bgColor: summary?.difference === 0 ? 'bg-green-100' : 'bg-red-100',
      isCurrency: true,
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <div className={cn('p-2 rounded-full', card.bgColor)}>
              <card.icon className={cn('h-4 w-4', card.color)} />
            </div>
          </CardHeader>
          <CardContent>
            <div className={cn('text-2xl font-bold', card.color)}>
              {card.isCurrency ? formatCurrency(card.value) : card.value}
            </div>
            {!card.isCurrency && summary && (
              <p className="text-xs text-muted-foreground">
                su {summary.totalTransactions} totali
              </p>
            )}
            {card.isCurrency && summary && (
              <p className="text-xs text-muted-foreground">
                Banca: {formatCurrency(summary.bankBalance)} | Contabile:{' '}
                {formatCurrency(summary.ledgerBalance)}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
