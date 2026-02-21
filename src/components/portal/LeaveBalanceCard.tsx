'use client'

import { useQuery } from '@tanstack/react-query'
import { Palmtree, Clock, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface LeaveBalanceItem {
  leaveType: {
    id: string
    code: string
    name: string
    color: string | null
  }
  year: number
  accrued: number
  used: number
  pending: number
  carriedOver: number
  available: number
}

async function fetchLeaveBalance(): Promise<LeaveBalanceItem[]> {
  const res = await fetch('/api/leave-balance')
  if (!res.ok) throw new Error('Errore nel caricamento saldi')
  const data = await res.json()
  return data.data || []
}

export function LeaveBalanceCard() {
  const { data: balances, isLoading, error } = useQuery({
    queryKey: ['portal-leave-balance'],
    queryFn: fetchLeaveBalance,
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palmtree className="h-5 w-5 text-portal-primary" />
            Saldo Ferie e Permessi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Palmtree className="h-5 w-5 text-portal-primary" />
            Saldo Ferie e Permessi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-red-500">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">Errore nel caricamento</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Filtra solo i tipi rilevanti (FE, ROL principalmente)
  const relevantCodes = ['FE', 'ROL']
  const relevantBalances = balances?.filter(
    (b) => relevantCodes.includes(b.leaveType.code) || b.accrued > 0
  ) || []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Palmtree className="h-5 w-5 text-portal-primary" />
          Saldo Ferie e Permessi
        </CardTitle>
      </CardHeader>
      <CardContent>
        {relevantBalances.length > 0 ? (
          <div className="space-y-4">
            {relevantBalances.slice(0, 4).map((balance) => {
              const total = balance.accrued + balance.carriedOver
              const usedPercent = total > 0 ? (balance.used / total) * 100 : 0
              const pendingPercent = total > 0 ? (balance.pending / total) * 100 : 0

              return (
                <div key={balance.leaveType.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{
                          backgroundColor: balance.leaveType.color || '#6B7280',
                        }}
                      />
                      <span className="font-medium text-sm">
                        {balance.leaveType.name}
                      </span>
                    </div>
                    <span className="text-sm text-gray-600">
                      <span className="font-semibold text-portal-primary">
                        {balance.available.toFixed(1)}
                      </span>
                      {' / '}
                      {total.toFixed(1)} giorni
                    </span>
                  </div>

                  <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                    {/* Used (viola) */}
                    <div
                      className="absolute h-full bg-portal-primary rounded-full"
                      style={{ width: `${usedPercent}%` }}
                    />
                    {/* Pending (giallo) */}
                    <div
                      className="absolute h-full bg-amber-400 rounded-full"
                      style={{
                        left: `${usedPercent}%`,
                        width: `${pendingPercent}%`,
                      }}
                    />
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-portal-primary" />
                      Usati: {balance.used.toFixed(1)}
                    </span>
                    {balance.pending > 0 && (
                      <span className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-amber-400" />
                        <Clock className="h-3 w-3" />
                        In attesa: {balance.pending.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">
            Nessun saldo disponibile
          </p>
        )}
      </CardContent>
    </Card>
  )
}
