'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { it } from 'date-fns/locale'

interface LeaveTabProps {
  userId: string
  isAdmin: boolean
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Tutte' },
  { value: 'PENDING', label: 'In attesa' },
  { value: 'APPROVED', label: 'Approvate' },
  { value: 'REJECTED', label: 'Rifiutate' },
]

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING: { label: 'In attesa', variant: 'outline' },
  APPROVED: { label: 'Approvata', variant: 'default' },
  REJECTED: { label: 'Rifiutata', variant: 'destructive' },
  CANCELLED: { label: 'Annullata', variant: 'secondary' },
}

export function LeaveTab({ userId }: LeaveTabProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [statusFilter, setStatusFilter] = useState('all')

  // Fetch balances
  const { data: balancesData, isLoading: loadingBalances } = useQuery({
    queryKey: ['leave-balances', userId],
    queryFn: async () => {
      const res = await fetch(`/api/leave-balance?userId=${userId}`)
      if (!res.ok) return { balances: [] }
      return res.json()
    },
  })

  // Fetch requests
  const from = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
  const to = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

  const { data: requestsData, isLoading: loadingRequests } = useQuery({
    queryKey: ['leave-requests', userId, from, to],
    queryFn: async () => {
      const res = await fetch(`/api/leave-requests?userId=${userId}&from=${from}&to=${to}`)
      if (!res.ok) return { requests: [] }
      return res.json()
    },
  })

  const balances = balancesData?.balances || []
  const allRequests = requestsData?.requests || requestsData?.data || []
  const requests = statusFilter === 'all'
    ? allRequests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : allRequests.filter((r: any) => r.status === statusFilter)

  return (
    <div className="space-y-6">
      {/* Balance cards */}
      {loadingBalances ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {balances.map((b: any) => (
            <Card key={b.id || b.leaveTypeId}>
              <CardContent className="p-4">
                <p className="text-sm font-medium text-muted-foreground">
                  {b.leaveType?.name || b.leaveTypeName || 'Tipo'}
                </p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold">
                    {Number(b.accrued) - Number(b.used) - Number(b.pending)}
                  </span>
                  <span className="text-xs text-muted-foreground">disponibili</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Maturati: {Number(b.accrued)} | Usati: {Number(b.used)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters + month nav */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {STATUS_FILTERS.map(f => (
            <Button
              key={f.value}
              variant={statusFilter === f.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium w-40 text-center capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: it })}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Requests list */}
      {loadingRequests ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Nessuna richiesta nel periodo selezionato
        </div>
      ) : (
        <div className="space-y-2">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {requests.map((req: any) => {
            const badge = STATUS_BADGE[req.status] || STATUS_BADGE.PENDING
            return (
              <Card key={req.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {req.leaveType?.name || 'Assenza'}
                      </span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(req.startDate), 'dd MMM', { locale: it })}
                      {req.startDate !== req.endDate && (
                        <> - {format(new Date(req.endDate), 'dd MMM yyyy', { locale: it })}</>
                      )}
                      {req.daysRequested && ` (${Number(req.daysRequested)} gg)`}
                    </p>
                  </div>
                  {req.notes && (
                    <p className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {req.notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
