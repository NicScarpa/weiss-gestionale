'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertTriangle,
  Clock,
  MapPin,
  Check,
  X,
  User,
  Calendar,
} from 'lucide-react'
import { toast } from 'sonner'

interface Anomaly {
  id: string
  anomalyType: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_FIXED'
  date: string
  description: string | null
  expectedValue: string | null
  actualValue: string | null
  differenceMinutes: number | null
  hoursAffected: number | null
  costImpact: number | null
  user: {
    id: string
    firstName: string
    lastName: string
  }
  venue: {
    id: string
    name: string
    code: string
  }
  assignment: {
    id: string
    startTime: string
    endTime: string
    shiftDefinition: {
      name: string
      code: string
    } | null
  } | null
  resolvedBy: string | null
  resolvedAt: string | null
  resolutionNotes: string | null
}

interface AnomalyCardProps {
  anomaly: Anomaly
}

const anomalyTypeConfig: Record<
  string,
  { label: string; icon: typeof AlertTriangle; color: string }
> = {
  EARLY_CLOCK_IN: {
    label: 'Entrata anticipata',
    icon: Clock,
    color: 'text-blue-600',
  },
  LATE_CLOCK_IN: {
    label: 'Ritardo',
    icon: Clock,
    color: 'text-orange-600',
  },
  EARLY_CLOCK_OUT: {
    label: 'Uscita anticipata',
    icon: Clock,
    color: 'text-purple-600',
  },
  LATE_CLOCK_OUT: {
    label: 'Straordinario',
    icon: Clock,
    color: 'text-green-600',
  },
  OUTSIDE_LOCATION: {
    label: 'Fuori sede',
    icon: MapPin,
    color: 'text-red-600',
  },
  MISSING_CLOCK_OUT: {
    label: 'Uscita mancante',
    icon: AlertTriangle,
    color: 'text-red-600',
  },
  OVERTIME: {
    label: 'Straordinario',
    icon: Clock,
    color: 'text-amber-600',
  },
  MISSING_BREAK: {
    label: 'Pausa mancante',
    icon: AlertTriangle,
    color: 'text-yellow-600',
  },
  SHORT_BREAK: {
    label: 'Pausa troppo corta',
    icon: Clock,
    color: 'text-yellow-600',
  },
}

const statusConfig = {
  PENDING: { label: 'Da verificare', variant: 'outline' as const },
  APPROVED: { label: 'Approvata', variant: 'default' as const },
  REJECTED: { label: 'Rifiutata', variant: 'destructive' as const },
  AUTO_FIXED: { label: 'Auto-corretta', variant: 'secondary' as const },
}

export function AnomalyCard({ anomaly }: AnomalyCardProps) {
  const queryClient = useQueryClient()
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false)
  const [resolveAction, setResolveAction] = useState<'approve' | 'reject'>('approve')
  const [notes, setNotes] = useState('')

  const typeConfig = anomalyTypeConfig[anomaly.anomalyType] || {
    label: anomaly.anomalyType,
    icon: AlertTriangle,
    color: 'text-gray-600',
  }
  const TypeIcon = typeConfig.icon
  const status = statusConfig[anomaly.status]

  const resolveMutation = useMutation({
    mutationFn: async ({
      action,
      notes,
    }: {
      action: 'approve' | 'reject'
      notes: string
    }) => {
      const response = await fetch(`/api/attendance/anomalies/${anomaly.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: action === 'approve' ? 'APPROVED' : 'REJECTED',
          notes,
        }),
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Errore risoluzione')
      }
      return response.json()
    },
    onSuccess: () => {
      toast.success(
        resolveAction === 'approve' ? 'Anomalia approvata' : 'Anomalia rifiutata'
      )
      queryClient.invalidateQueries({ queryKey: ['anomalies'] })
      setResolveDialogOpen(false)
      setNotes('')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleResolve = (action: 'approve' | 'reject') => {
    setResolveAction(action)
    setResolveDialogOpen(true)
  }

  const confirmResolve = () => {
    resolveMutation.mutate({ action: resolveAction, notes })
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
              <CardTitle className="text-base">{typeConfig.label}</CardTitle>
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* User */}
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {anomaly.user.firstName} {anomaly.user.lastName}
            </span>
            <span className="text-muted-foreground">• {anomaly.venue.name}</span>
          </div>

          {/* Date */}
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{format(new Date(anomaly.date), 'EEEE d MMMM yyyy', { locale: it })}</span>
          </div>

          {/* Expected vs Actual */}
          {(anomaly.expectedValue || anomaly.actualValue) && (
            <div className="bg-muted/50 rounded-md p-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                {anomaly.expectedValue && (
                  <div>
                    <span className="text-muted-foreground">Previsto:</span>{' '}
                    <span className="font-medium">{anomaly.expectedValue}</span>
                  </div>
                )}
                {anomaly.actualValue && (
                  <div>
                    <span className="text-muted-foreground">Effettivo:</span>{' '}
                    <span className="font-medium">{anomaly.actualValue}</span>
                  </div>
                )}
              </div>
              {anomaly.differenceMinutes !== null && (
                <div className="mt-2">
                  <span className="text-muted-foreground">Differenza:</span>{' '}
                  <span
                    className={`font-medium ${anomaly.differenceMinutes > 0 ? 'text-red-600' : 'text-green-600'}`}
                  >
                    {anomaly.differenceMinutes > 0 ? '+' : ''}
                    {anomaly.differenceMinutes} min
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {anomaly.description && (
            <p className="text-sm text-muted-foreground">{anomaly.description}</p>
          )}

          {/* Resolution Notes */}
          {anomaly.resolvedAt && (
            <div className="border-t pt-3 mt-3">
              <p className="text-xs text-muted-foreground">
                Risolto il {format(new Date(anomaly.resolvedAt), "d MMM yyyy 'alle' HH:mm", { locale: it })}
              </p>
              {anomaly.resolutionNotes && (
                <p className="text-sm mt-1">{anomaly.resolutionNotes}</p>
              )}
            </div>
          )}
        </CardContent>

        {/* Actions */}
        {anomaly.status === 'PENDING' && (
          <CardFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => handleResolve('reject')}
            >
              <X className="h-4 w-4 mr-1" />
              Rifiuta
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => handleResolve('approve')}
            >
              <Check className="h-4 w-4 mr-1" />
              Approva
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* Resolve Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {resolveAction === 'approve' ? 'Approva Anomalia' : 'Rifiuta Anomalia'}
            </DialogTitle>
            <DialogDescription>
              {resolveAction === 'approve'
                ? "Conferma l'approvazione dell'anomalia. Le ore verranno conteggiate."
                : "Conferma il rifiuto dell'anomalia. Le ore non verranno conteggiate."}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Textarea
              placeholder="Note (opzionale)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              variant={resolveAction === 'approve' ? 'default' : 'destructive'}
              onClick={confirmResolve}
              disabled={resolveMutation.isPending}
            >
              {resolveAction === 'approve' ? 'Approva' : 'Rifiuta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
