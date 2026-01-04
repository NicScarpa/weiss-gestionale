'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ArrowLeftRight,
  Check,
  X,
  Clock,
  User,
  Calendar,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface SwapRequest {
  id: string
  date: string
  startTime: string
  endTime: string
  status: string
  swapStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  swapRequestedById: string | null
  swapWithUserId: string | null
  user?: {
    id: string
    firstName: string
    lastName: string
    email: string
  }
  targetUser?: {
    id: string
    firstName: string
    lastName: string
    email: string
  } | null
  requestedByUser?: {
    id: string
    firstName: string
    lastName: string
    email: string
  } | null
  shiftDefinition?: {
    id: string
    name: string
    startTime: string
    endTime: string
  } | null
  targetAssignment?: {
    id: string
    shiftDefinition?: {
      name: string
      startTime: string
      endTime: string
    } | null
  } | null
  venue?: {
    id: string
    name: string
    code: string
  } | null
}

interface SwapResponse {
  swapRequests: SwapRequest[]
}

async function fetchSwaps(direction?: string): Promise<SwapRequest[]> {
  const params = new URLSearchParams()
  if (direction) params.set('direction', direction)

  const res = await fetch(`/api/shift-swaps?${params.toString()}`)
  if (!res.ok) throw new Error('Errore nel caricamento scambi')
  const data: SwapResponse = await res.json()
  return data.swapRequests || []
}

async function respondToSwap(id: string, action: 'accept' | 'reject'): Promise<void> {
  const res = await fetch(`/api/shift-swaps/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Errore nella risposta')
  }
}

async function cancelSwap(id: string): Promise<void> {
  const res = await fetch(`/api/shift-swaps/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Errore nell\'annullamento')
  }
}

function formatTime(timeStr: string): string {
  if (timeStr.includes('T')) {
    return format(parseISO(timeStr), 'HH:mm')
  }
  return timeStr.substring(0, 5)
}

function getStatusBadge(status: 'PENDING' | 'APPROVED' | 'REJECTED') {
  switch (status) {
    case 'PENDING':
      return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><Clock className="w-3 h-3 mr-1" /> In attesa</Badge>
    case 'APPROVED':
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><Check className="w-3 h-3 mr-1" /> Approvato</Badge>
    case 'REJECTED':
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><X className="w-3 h-3 mr-1" /> Rifiutato</Badge>
    default:
      return null
  }
}

interface SwapCardProps {
  swap: SwapRequest
  isSent: boolean
  currentUserId: string
  onAccept?: () => void
  onReject?: () => void
  onCancel?: () => void
  isLoading?: boolean
}

function SwapCard({ swap, isSent, currentUserId, onAccept, onReject, onCancel, isLoading }: SwapCardProps) {
  const isPending = swap.swapStatus === 'PENDING'
  const isReceived = swap.swapWithUserId === currentUserId
  const canRespond = isReceived && isPending
  const canCancel = isSent && isPending

  return (
    <Card className={cn(
      "transition-colors",
      isPending && "border-amber-200 bg-amber-50/30"
    )}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          {/* Header con data e stato */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span className="font-medium">
                {format(parseISO(swap.date), 'EEEE d MMMM yyyy', { locale: it })}
              </span>
            </div>
            {getStatusBadge(swap.swapStatus)}
          </div>

          {/* Dettagli turno */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>
                {formatTime(swap.startTime)} - {formatTime(swap.endTime)}
              </span>
            </div>
            {swap.shiftDefinition && (
              <Badge variant="secondary">{swap.shiftDefinition.name}</Badge>
            )}
            {swap.venue && (
              <span className="text-slate-500">{swap.venue.name}</span>
            )}
          </div>

          {/* Scambio visualizzato */}
          <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 flex-1">
              <User className="w-4 h-4 text-slate-400" />
              <span className="text-sm">
                {swap.user?.firstName} {swap.user?.lastName}
              </span>
            </div>
            <ArrowLeftRight className="w-5 h-5 text-amber-500" />
            <div className="flex items-center gap-2 flex-1 justify-end">
              <span className="text-sm">
                {swap.targetUser?.firstName} {swap.targetUser?.lastName}
              </span>
              <User className="w-4 h-4 text-slate-400" />
            </div>
          </div>

          {/* Turno target (se esiste) */}
          {swap.targetAssignment?.shiftDefinition && (
            <div className="text-xs text-slate-500">
              Il collega ha: {swap.targetAssignment.shiftDefinition.name} ({formatTime(swap.targetAssignment.shiftDefinition.startTime)} - {formatTime(swap.targetAssignment.shiftDefinition.endTime)})
            </div>
          )}

          {/* Azioni */}
          {(canRespond || canCancel) && (
            <div className="flex gap-2 pt-2 border-t">
              {canRespond && (
                <>
                  <Button
                    size="sm"
                    onClick={onAccept}
                    disabled={isLoading}
                    className="flex-1"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-1" /> Accetta
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onReject}
                    disabled={isLoading}
                    className="flex-1"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <X className="w-4 h-4 mr-1" /> Rifiuta
                      </>
                    )}
                  </Button>
                </>
              )}
              {canCancel && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onCancel}
                  disabled={isLoading}
                  className="text-red-600 hover:text-red-700"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Annulla richiesta'
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface ShiftSwapManagerProps {
  currentUserId: string
}

export function ShiftSwapManager({ currentUserId }: ShiftSwapManagerProps) {
  const [activeTab, setActiveTab] = useState('received')
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    type: 'accept' | 'reject' | 'cancel'
    swapId: string
  } | null>(null)

  const queryClient = useQueryClient()

  const { data: swaps, isLoading, error } = useQuery({
    queryKey: ['shift-swaps', activeTab],
    queryFn: () => fetchSwaps(activeTab === 'all' ? undefined : activeTab),
  })

  const respondMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'reject' }) =>
      respondToSwap(id, action),
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['shift-swaps'] })
      toast.success(
        action === 'accept'
          ? 'Scambio accettato con successo!'
          : 'Scambio rifiutato'
      )
      setConfirmDialog(null)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Errore nella risposta')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelSwap(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-swaps'] })
      toast.success('Richiesta annullata')
      setConfirmDialog(null)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Errore nell\'annullamento')
    },
  })

  const handleAction = (type: 'accept' | 'reject' | 'cancel', swapId: string) => {
    setConfirmDialog({ open: true, type, swapId })
  }

  const confirmAction = () => {
    if (!confirmDialog) return

    if (confirmDialog.type === 'cancel') {
      cancelMutation.mutate(confirmDialog.swapId)
    } else {
      respondMutation.mutate({ id: confirmDialog.swapId, action: confirmDialog.type })
    }
  }

  const pendingReceived = swaps?.filter(
    (s) => s.swapWithUserId === currentUserId && s.swapStatus === 'PENDING'
  ).length || 0

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-700">Errore nel caricamento degli scambi</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="received" className="relative">
            Ricevute
            {pendingReceived > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center">
                {pendingReceived}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent">Inviate</TabsTrigger>
          <TabsTrigger value="all">Tutte</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : swaps && swaps.length > 0 ? (
            swaps.map((swap) => (
              <SwapCard
                key={swap.id}
                swap={swap}
                isSent={swap.swapRequestedById === currentUserId}
                currentUserId={currentUserId}
                onAccept={() => handleAction('accept', swap.id)}
                onReject={() => handleAction('reject', swap.id)}
                onCancel={() => handleAction('cancel', swap.id)}
                isLoading={
                  (respondMutation.isPending || cancelMutation.isPending) &&
                  confirmDialog?.swapId === swap.id
                }
              />
            ))
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-slate-500">
                <ArrowLeftRight className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p>Nessuna richiesta di scambio</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog di conferma */}
      <Dialog
        open={confirmDialog?.open ?? false}
        onOpenChange={(open) => !open && setConfirmDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDialog?.type === 'accept' && 'Conferma accettazione'}
              {confirmDialog?.type === 'reject' && 'Conferma rifiuto'}
              {confirmDialog?.type === 'cancel' && 'Annulla richiesta'}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog?.type === 'accept' &&
                'Accettando lo scambio, il turno verrà trasferito al tuo collega e viceversa. Questa azione è definitiva.'}
              {confirmDialog?.type === 'reject' &&
                'Sei sicuro di voler rifiutare questa richiesta di scambio?'}
              {confirmDialog?.type === 'cancel' &&
                'Sei sicuro di voler annullare la richiesta di scambio?'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog(null)}
              disabled={respondMutation.isPending || cancelMutation.isPending}
            >
              Annulla
            </Button>
            <Button
              onClick={confirmAction}
              disabled={respondMutation.isPending || cancelMutation.isPending}
              variant={confirmDialog?.type === 'accept' ? 'default' : 'destructive'}
            >
              {respondMutation.isPending || cancelMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
