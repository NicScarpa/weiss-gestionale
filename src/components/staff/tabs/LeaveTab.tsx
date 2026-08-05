'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Settings2 } from 'lucide-react'
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

export function LeaveTab({ userId, isAdmin }: LeaveTabProps) {
  const queryClient = useQueryClient()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [statusFilter, setStatusFilter] = useState('all')

  // Dialog "Imposta saldo" (solo admin)
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false)
  const [balanceForm, setBalanceForm] = useState({
    leaveTypeId: '',
    year: String(new Date().getFullYear()),
    accrued: '',
    carriedOver: '',
  })
  const [isSavingBalance, setIsSavingBalance] = useState(false)

  // Tipi assenza (per il form saldo)
  const { data: leaveTypesData } = useQuery({
    queryKey: ['leave-types'],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await fetch('/api/leave-types')
      if (!res.ok) return { data: [] }
      return res.json()
    },
  })

  const handleSaveBalance = async () => {
    if (!balanceForm.leaveTypeId || !balanceForm.accrued) {
      toast.error('Scegli il tipo di assenza e il maturato')
      return
    }
    setIsSavingBalance(true)
    try {
      const res = await fetch('/api/leave-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          leaveTypeId: balanceForm.leaveTypeId,
          year: Number(balanceForm.year),
          accrued: Number(balanceForm.accrued),
          carriedOver: balanceForm.carriedOver ? Number(balanceForm.carriedOver) : 0,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Errore nel salvataggio del saldo')
      }
      toast.success('Saldo ferie aggiornato')
      setBalanceDialogOpen(false)
      setBalanceForm({ leaveTypeId: '', year: String(new Date().getFullYear()), accrued: '', carriedOver: '' })
      queryClient.invalidateQueries({ queryKey: ['leave-balances', userId] })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Errore sconosciuto'
      toast.error(message)
    } finally {
      setIsSavingBalance(false)
    }
  }

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

  const balances = balancesData?.data || []
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
        <div className="space-y-2">
          {isAdmin && (
            <div className="flex justify-end">
              <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings2 className="h-4 w-4 mr-2" />
                    Imposta saldo
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[420px]">
                  <DialogHeader>
                    <DialogTitle>Imposta saldo ferie/permessi</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Tipo di assenza</Label>
                      <Select
                        value={balanceForm.leaveTypeId}
                        onValueChange={(v) => setBalanceForm(f => ({ ...f, leaveTypeId: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Scegli il tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {(leaveTypesData?.data || []).map((lt: any) => (
                            <SelectItem key={lt.id} value={lt.id}>
                              {lt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>Anno</Label>
                        <Input
                          type="number"
                          value={balanceForm.year}
                          onChange={(e) => setBalanceForm(f => ({ ...f, year: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Maturato</Label>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          placeholder="es. 26"
                          value={balanceForm.accrued}
                          onChange={(e) => setBalanceForm(f => ({ ...f, accrued: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Residuo a.p.</Label>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          placeholder="0"
                          value={balanceForm.carriedOver}
                          onChange={(e) => setBalanceForm(f => ({ ...f, carriedOver: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setBalanceDialogOpen(false)}>
                        Annulla
                      </Button>
                      <Button onClick={handleSaveBalance} disabled={isSavingBalance}>
                        {isSavingBalance ? 'Salvataggio…' : 'Salva'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {balances.map((b: any) => (
              <Card key={b.leaveType?.id || b.leaveTypeId}>
                <CardContent className="p-4">
                  <p className="text-sm font-medium text-muted-foreground">
                    {b.leaveType?.name || b.leaveTypeName || 'Tipo'}
                  </p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold">
                      {Number(b.available ?? (Number(b.accrued) + Number(b.carriedOver || 0) - Number(b.used) - Number(b.pending)))}
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
