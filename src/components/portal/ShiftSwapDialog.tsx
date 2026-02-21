'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ArrowLeftRight,
  User,
  Calendar,
  Clock,
  Loader2,
  AlertCircle,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface ShiftAssignment {
  id: string
  date: string
  startTime: string
  endTime: string
  shiftDefinition?: {
    name: string
    code: string
    color: string
  } | null
  venue?: {
    id: string
    name: string
    code: string
  } | null
}

interface Colleague {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
}

interface ColleaguesResponse {
  data: Colleague[]
}

async function fetchColleagues(venueId: string): Promise<Colleague[]> {
  const res = await fetch(`/api/portal/colleagues?venueId=${venueId}`)
  if (!res.ok) throw new Error('Errore nel caricamento colleghi')
  const data: ColleaguesResponse = await res.json()
  return data.data || []
}

async function createSwapRequest(data: {
  assignmentId: string
  targetUserId: string
  message?: string
}): Promise<void> {
  const res = await fetch('/api/shift-swaps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Errore nella richiesta')
  }
}

function formatTime(timeStr: string): string {
  if (timeStr.includes('T')) {
    return format(parseISO(timeStr), 'HH:mm')
  }
  return timeStr.substring(0, 5)
}

interface ShiftSwapDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: ShiftAssignment | null
  currentUserId: string
}

export function ShiftSwapDialog({
  open,
  onOpenChange,
  shift,
  currentUserId,
}: ShiftSwapDialogProps) {
  const [selectedColleague, setSelectedColleague] = useState<string>('')
  const [message, setMessage] = useState('')

  const queryClient = useQueryClient()

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setSelectedColleague('')
        setMessage('')
      })
    }
  }, [open])

  const { data: colleagues, isLoading: loadingColleagues } = useQuery({
    queryKey: ['portal-colleagues', shift?.venue?.id],
    queryFn: () => fetchColleagues(shift?.venue?.id || ''),
    enabled: open && !!shift?.venue?.id,
  })

  const filteredColleagues = colleagues?.filter((c) => c.id !== currentUserId) || []

  const swapMutation = useMutation({
    mutationFn: createSwapRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-swaps'] })
      queryClient.invalidateQueries({ queryKey: ['portal-shifts'] })
      toast.success('Richiesta di scambio inviata!')
      onOpenChange(false)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Errore nella richiesta')
    },
  })

  const handleSubmit = () => {
    if (!shift || !selectedColleague) return

    swapMutation.mutate({
      assignmentId: shift.id,
      targetUserId: selectedColleague,
      message: message || undefined,
    })
  }

  if (!shift) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-portal-primary" />
            Richiedi scambio turno
          </DialogTitle>
          <DialogDescription>
            Seleziona un collega con cui scambiare il turno
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dettagli turno */}
          <div className="p-3 bg-gray-50 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="font-medium">
                {format(parseISO(shift.date), 'EEEE d MMMM yyyy', { locale: it })}
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-gray-400" />
                <span>
                  {formatTime(shift.startTime)} - {formatTime(shift.endTime)}
                </span>
              </div>
              {shift.shiftDefinition && (
                <Badge
                  style={{
                    backgroundColor: `${shift.shiftDefinition.color}20`,
                    borderColor: shift.shiftDefinition.color,
                  }}
                  variant="outline"
                >
                  {shift.shiftDefinition.name}
                </Badge>
              )}
            </div>
          </div>

          {/* Selezione collega */}
          <div className="space-y-2">
            <Label>Seleziona collega</Label>
            {loadingColleagues ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : filteredColleagues.length > 0 ? (
              <RadioGroup
                value={selectedColleague}
                onValueChange={setSelectedColleague}
                className="space-y-2"
              >
                {filteredColleagues.map((colleague) => (
                  <label
                    key={colleague.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors hover:bg-gray-50 ${
                      selectedColleague === colleague.id
                        ? 'border-portal-primary bg-portal-primary-bg'
                        : ''
                    }`}
                  >
                    <RadioGroupItem value={colleague.id} className="sr-only" />
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                      <User className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">
                        {colleague.firstName} {colleague.lastName}
                      </p>
                      <p className="text-xs text-gray-500">{colleague.email}</p>
                    </div>
                    {selectedColleague === colleague.id && (
                      <Check className="w-5 h-5 text-portal-primary" />
                    )}
                  </label>
                ))}
              </RadioGroup>
            ) : (
              <div className="p-4 text-center border rounded-lg bg-gray-50">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-500">
                  Nessun collega disponibile per lo scambio
                </p>
              </div>
            )}
          </div>

          {/* Messaggio opzionale */}
          <div className="space-y-2">
            <Label htmlFor="swap-message">Messaggio (opzionale)</Label>
            <Textarea
              id="swap-message"
              placeholder="Aggiungi un messaggio per il collega..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={swapMutation.isPending}
          >
            Annulla
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedColleague || swapMutation.isPending}
          >
            {swapMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ArrowLeftRight className="w-4 h-4 mr-2" />
            )}
            Invia richiesta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
