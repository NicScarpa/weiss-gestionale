'use client'

import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { Plus, Clock, CheckCircle2, XCircle, AlertCircle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { LeaveBalanceCard } from '@/components/portal/LeaveBalanceCard'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface LeaveRequest {
  id: string
  startDate: string
  endDate: string
  daysRequested: number | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  notes: string | null
  rejectionReason: string | null
  requestedAt: string
  leaveType: {
    id: string
    code: string
    name: string
    color: string | null
  }
  approvedBy?: {
    firstName: string
    lastName: string
  } | null
}

async function fetchLeaveRequests(): Promise<LeaveRequest[]> {
  const res = await fetch('/api/leave-requests')
  if (!res.ok) throw new Error('Errore nel caricamento richieste')
  const data = await res.json()
  return data.data || []
}

async function cancelLeaveRequest(id: string) {
  const res = await fetch(`/api/leave-requests/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Errore nell\'annullamento')
  }
  return res.json()
}

function getStatusConfig(status: string) {
  switch (status) {
    case 'PENDING':
      return {
        label: 'In attesa',
        icon: Clock,
        className: 'bg-amber-50 text-amber-600 border border-amber-200',
      }
    case 'APPROVED':
      return {
        label: 'Approvata',
        icon: CheckCircle2,
        className: 'bg-green-50 text-green-600 border border-green-200',
      }
    case 'REJECTED':
      return {
        label: 'Rifiutata',
        icon: XCircle,
        className: 'bg-red-50 text-red-600 border border-red-200',
      }
    case 'CANCELLED':
      return {
        label: 'Annullata',
        icon: AlertCircle,
        className: 'bg-gray-50 text-gray-500 border border-gray-200',
      }
    default:
      return {
        label: status,
        icon: AlertCircle,
        className: 'bg-gray-50 text-gray-500 border border-gray-200',
      }
  }
}

function formatDateRange(start: string, end: string): string {
  const startDate = parseISO(start)
  const endDate = parseISO(end)

  if (start === end) {
    return format(startDate, 'd MMMM yyyy', { locale: it })
  }

  if (startDate.getFullYear() === endDate.getFullYear()) {
    if (startDate.getMonth() === endDate.getMonth()) {
      return `${format(startDate, 'd')} - ${format(endDate, 'd MMMM yyyy', { locale: it })}`
    }
    return `${format(startDate, 'd MMMM')} - ${format(endDate, 'd MMMM yyyy', { locale: it })}`
  }

  return `${format(startDate, 'd MMM yyyy', { locale: it })} - ${format(endDate, 'd MMM yyyy', { locale: it })}`
}

export default function PortalFeriePage() {
  const queryClient = useQueryClient()

  const { data: requests, isLoading, error } = useQuery({
    queryKey: ['portal-leave-requests'],
    queryFn: fetchLeaveRequests,
  })

  const cancelMutation = useMutation({
    mutationFn: cancelLeaveRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-leave-requests'] })
      queryClient.invalidateQueries({ queryKey: ['portal-leave-balance'] })
      toast.success('Richiesta annullata')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Separa richieste per stato
  const pendingRequests = requests?.filter((r) => r.status === 'PENDING') || []
  const otherRequests = requests?.filter((r) => r.status !== 'PENDING') || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ferie e Permessi</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestisci le tue richieste di ferie e permessi
          </p>
        </div>
        <Button asChild className="bg-gray-900 hover:bg-black text-white rounded-xl">
          <Link href="/portale/ferie/nuova">
            <Plus className="h-4 w-4 mr-2" />
            Nuova
          </Link>
        </Button>
      </div>

      {/* Saldo */}
      <LeaveBalanceCard />

      {/* Richieste in attesa */}
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5 text-amber-500" />
              In Attesa di Approvazione
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.map((req) => {
              const status = getStatusConfig(req.status)
              return (
                <div
                  key={req.id}
                  className="flex items-start gap-4 p-4 rounded-2xl border-l-4 border-l-amber-400 border border-gray-100 bg-white"
                >
                  <div
                    className="w-1 h-12 rounded-full mt-1"
                    style={{ backgroundColor: req.leaveType.color || '#6B7280' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">
                        {req.leaveType.name}
                      </span>
                      <Badge className={status.className}>
                        <status.icon className="h-3 w-3 mr-1" />
                        {status.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">
                      {formatDateRange(req.startDate, req.endDate)}
                      {req.daysRequested && (
                        <span className="ml-2 text-gray-500">
                          ({Number(req.daysRequested).toFixed(1)} giorni)
                        </span>
                      )}
                    </p>
                    {req.notes && (
                      <p className="text-sm text-gray-500 mt-1 italic">
                        &quot;{req.notes}&quot;
                      </p>
                    )}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Annullare la richiesta?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Questa azione non può essere annullata. La richiesta verrà
                          cancellata definitivamente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>No, mantieni</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => cancelMutation.mutate(req.id)}
                          className="bg-red-500 hover:bg-red-600"
                        >
                          Sì, annulla
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Storico richieste */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Storico Richieste</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-red-500">Errore nel caricamento</p>
          ) : otherRequests.length > 0 ? (
            <div className="space-y-3">
              {otherRequests.map((req) => {
                const status = getStatusConfig(req.status)
                return (
                  <div
                    key={req.id}
                    className={cn(
                      'flex items-start gap-4 p-4 rounded-lg border',
                      req.status === 'CANCELLED' && 'opacity-60'
                    )}
                  >
                    <div
                      className="w-1 h-12 rounded-full mt-1"
                      style={{ backgroundColor: req.leaveType.color || '#6B7280' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">
                          {req.leaveType.name}
                        </span>
                        <Badge className={status.className}>
                          <status.icon className="h-3 w-3 mr-1" />
                          {status.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600">
                        {formatDateRange(req.startDate, req.endDate)}
                        {req.daysRequested && (
                          <span className="ml-2 text-gray-500">
                            ({Number(req.daysRequested).toFixed(1)} giorni)
                          </span>
                        )}
                      </p>
                      {req.rejectionReason && (
                        <p className="text-sm text-red-500 mt-1">
                          Motivo: {req.rejectionReason}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">
              Nessuna richiesta precedente
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
