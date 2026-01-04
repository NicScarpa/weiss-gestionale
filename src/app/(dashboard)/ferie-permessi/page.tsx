'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  Clock,
  CheckCircle2,
  XCircle,
  Filter,
  User,
  MapPin,
  CalendarDays,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface LeaveRequest {
  id: string
  startDate: string
  endDate: string
  daysRequested: number | null
  hoursRequested: number | null
  isPartialDay: boolean
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  notes: string | null
  requestedAt: string
  leaveType: {
    id: string
    code: string
    name: string
    color: string | null
  }
  user: {
    id: string
    firstName: string
    lastName: string
    email: string
    venue?: {
      id: string
      name: string
      code: string
    } | null
  }
}

async function fetchLeaveRequests(status?: string): Promise<LeaveRequest[]> {
  const url = status
    ? `/api/leave-requests?status=${status}`
    : '/api/leave-requests'
  const res = await fetch(url)
  if (!res.ok) throw new Error('Errore nel caricamento richieste')
  const data = await res.json()
  return data.data || []
}

async function approveRequest(id: string, managerNotes?: string) {
  const res = await fetch(`/api/leave-requests/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ managerNotes }),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Errore nell\'approvazione')
  }
  return res.json()
}

async function rejectRequest(id: string, rejectionReason: string) {
  const res = await fetch(`/api/leave-requests/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rejectionReason }),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Errore nel rifiuto')
  }
  return res.json()
}

function formatDateRange(start: string, end: string): string {
  const startDate = parseISO(start)
  const endDate = parseISO(end)

  if (start.split('T')[0] === end.split('T')[0]) {
    return format(startDate, 'd MMMM yyyy', { locale: it })
  }

  return `${format(startDate, 'd MMM')} - ${format(endDate, 'd MMM yyyy', { locale: it })}`
}

export default function FeriePermessiPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('PENDING')
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null)
  const [dialogMode, setDialogMode] = useState<'approve' | 'reject' | null>(null)
  const [notes, setNotes] = useState('')

  const { data: requests, isLoading, error } = useQuery({
    queryKey: ['leave-requests-manager', statusFilter],
    queryFn: () => fetchLeaveRequests(statusFilter === 'ALL' ? undefined : statusFilter),
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, managerNotes }: { id: string; managerNotes?: string }) =>
      approveRequest(id, managerNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests-manager'] })
      toast.success('Richiesta approvata')
      closeDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectRequest(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests-manager'] })
      toast.success('Richiesta rifiutata')
      closeDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const openApproveDialog = (req: LeaveRequest) => {
    setSelectedRequest(req)
    setDialogMode('approve')
    setNotes('')
  }

  const openRejectDialog = (req: LeaveRequest) => {
    setSelectedRequest(req)
    setDialogMode('reject')
    setNotes('')
  }

  const closeDialog = () => {
    setSelectedRequest(null)
    setDialogMode(null)
    setNotes('')
  }

  const handleConfirm = () => {
    if (!selectedRequest) return

    if (dialogMode === 'approve') {
      approveMutation.mutate({
        id: selectedRequest.id,
        managerNotes: notes || undefined,
      })
    } else if (dialogMode === 'reject') {
      if (!notes.trim()) {
        toast.error('Il motivo del rifiuto è obbligatorio')
        return
      }
      rejectMutation.mutate({
        id: selectedRequest.id,
        reason: notes,
      })
    }
  }

  const pendingCount = requests?.filter((r) => r.status === 'PENDING').length || 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ferie e Permessi</h1>
          <p className="text-sm text-slate-600 mt-1">
            Gestisci le richieste di ferie e permessi del personale
          </p>
        </div>

        {pendingCount > 0 && statusFilter !== 'PENDING' && (
          <Badge variant="destructive" className="text-sm">
            {pendingCount} in attesa
          </Badge>
        )}
      </div>

      {/* Filtri */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-500" />
          <span className="text-sm text-slate-600">Stato:</span>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDING">In Attesa</SelectItem>
            <SelectItem value="APPROVED">Approvate</SelectItem>
            <SelectItem value="REJECTED">Rifiutate</SelectItem>
            <SelectItem value="ALL">Tutte</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista richieste */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Richieste
            {requests && (
              <Badge variant="outline" className="ml-2">
                {requests.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-red-500 text-center py-8">
              Errore nel caricamento delle richieste
            </p>
          ) : requests && requests.length > 0 ? (
            <div className="space-y-4">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className={cn(
                    'flex items-start gap-4 p-4 rounded-lg border',
                    req.status === 'PENDING' && 'bg-amber-50/50 border-amber-200',
                    req.status === 'APPROVED' && 'bg-emerald-50/50 border-emerald-200',
                    req.status === 'REJECTED' && 'bg-red-50/50 border-red-200'
                  )}
                >
                  {/* Indicatore colore tipo */}
                  <div
                    className="w-1 h-16 rounded-full"
                    style={{ backgroundColor: req.leaveType.color || '#6B7280' }}
                  />

                  {/* Info richiesta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="h-4 w-4 text-slate-400" />
                      <span className="font-medium text-slate-900">
                        {req.user.firstName} {req.user.lastName}
                      </span>
                      {req.user.venue && (
                        <Badge variant="outline" className="text-xs">
                          <MapPin className="h-3 w-3 mr-1" />
                          {req.user.venue.code}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      <Badge
                        variant="secondary"
                        style={{
                          backgroundColor: `${req.leaveType.color}20` || undefined,
                          borderColor: req.leaveType.color || undefined,
                        }}
                      >
                        {req.leaveType.name}
                      </Badge>
                      <span className="text-sm text-slate-600">
                        {formatDateRange(req.startDate, req.endDate)}
                      </span>
                      {req.daysRequested && (
                        <span className="text-sm text-slate-500">
                          ({Number(req.daysRequested).toFixed(1)} gg)
                        </span>
                      )}
                    </div>

                    {req.notes && (
                      <p className="text-sm text-slate-500 italic mb-2">
                        &quot;{req.notes}&quot;
                      </p>
                    )}

                    <p className="text-xs text-slate-400">
                      Richiesta il {format(parseISO(req.requestedAt), 'd MMM yyyy HH:mm', { locale: it })}
                    </p>
                  </div>

                  {/* Azioni */}
                  {req.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                        onClick={() => openApproveDialog(req)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Approva
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => openRejectDialog(req)}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Rifiuta
                      </Button>
                    </div>
                  )}

                  {req.status !== 'PENDING' && (
                    <Badge
                      className={cn(
                        req.status === 'APPROVED' && 'bg-emerald-100 text-emerald-700',
                        req.status === 'REJECTED' && 'bg-red-100 text-red-700',
                        req.status === 'CANCELLED' && 'bg-slate-100 text-slate-600'
                      )}
                    >
                      {req.status === 'APPROVED' && 'Approvata'}
                      {req.status === 'REJECTED' && 'Rifiutata'}
                      {req.status === 'CANCELLED' && 'Annullata'}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center py-8">
              Nessuna richiesta trovata
            </p>
          )}
        </CardContent>
      </Card>

      {/* Dialog conferma */}
      <Dialog open={dialogMode !== null} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'approve' ? 'Approva Richiesta' : 'Rifiuta Richiesta'}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest && (
                <>
                  Richiesta di {selectedRequest.user.firstName} {selectedRequest.user.lastName}
                  {' per '}
                  {selectedRequest.leaveType.name}
                  {' dal '}
                  {formatDateRange(selectedRequest.startDate, selectedRequest.endDate)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>
                {dialogMode === 'approve' ? 'Note (opzionale)' : 'Motivo del rifiuto *'}
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  dialogMode === 'approve'
                    ? 'Aggiungi eventuali note...'
                    : 'Specifica il motivo del rifiuto...'
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Annulla
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={approveMutation.isPending || rejectMutation.isPending}
              className={cn(
                dialogMode === 'approve' && 'bg-emerald-600 hover:bg-emerald-700',
                dialogMode === 'reject' && 'bg-red-600 hover:bg-red-700'
              )}
            >
              {dialogMode === 'approve' ? 'Approva' : 'Rifiuta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
