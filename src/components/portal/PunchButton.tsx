'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { getCurrentPosition, VenueLocation } from '@/lib/geolocation'
import { LogIn, LogOut, Coffee, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AttendanceStatus } from './PunchStatus'

type PunchType = 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END'

interface PunchButtonProps {
  status: AttendanceStatus
  venue: VenueLocation | null
  disabled?: boolean
  className?: string
}

const buttonConfig: Record<
  AttendanceStatus,
  {
    punchType: PunchType
    label: string
    icon: React.ElementType
    bgColor: string
    hoverColor: string
  }
> = {
  NOT_CLOCKED_IN: {
    punchType: 'IN',
    label: 'TIMBRA ENTRATA',
    icon: LogIn,
    bgColor: 'bg-green-600',
    hoverColor: 'hover:bg-green-700',
  },
  CLOCKED_IN: {
    punchType: 'OUT',
    label: 'TIMBRA USCITA',
    icon: LogOut,
    bgColor: 'bg-red-600',
    hoverColor: 'hover:bg-red-700',
  },
  ON_BREAK: {
    punchType: 'BREAK_END',
    label: 'FINE PAUSA',
    icon: Coffee,
    bgColor: 'bg-amber-600',
    hoverColor: 'hover:bg-amber-700',
  },
  CLOCKED_OUT: {
    punchType: 'IN',
    label: 'NUOVO TURNO',
    icon: LogIn,
    bgColor: 'bg-green-600',
    hoverColor: 'hover:bg-green-700',
  },
}

export function PunchButton({
  status,
  venue,
  disabled = false,
  className,
}: PunchButtonProps) {
  const queryClient = useQueryClient()
  const [isGettingLocation, setIsGettingLocation] = useState(false)

  const config = buttonConfig[status]
  const Icon = config.icon

  const punchMutation = useMutation({
    mutationFn: async (data: {
      punchType: PunchType
      venueId: string
      latitude?: number
      longitude?: number
      accuracy?: number
    }) => {
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nella timbratura')
      }

      return res.json()
    },
    onSuccess: (data) => {
      // Invalida le query per aggiornare lo stato
      queryClient.invalidateQueries({ queryKey: ['attendance-current'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] })

      const typeLabels: Record<PunchType, string> = {
        IN: 'Entrata',
        OUT: 'Uscita',
        BREAK_START: 'Inizio pausa',
        BREAK_END: 'Fine pausa',
      }

      const message = data.data.isWithinRadius
        ? `${typeLabels[config.punchType]} registrata`
        : `${typeLabels[config.punchType]} registrata (fuori sede)`

      toast.success(message)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handlePunch = async () => {
    if (!venue) {
      toast.error('Nessuna sede selezionata')
      return
    }

    setIsGettingLocation(true)

    try {
      // Ottieni posizione GPS
      const position = await getCurrentPosition()

      // Invia timbratura
      await punchMutation.mutateAsync({
        punchType: config.punchType,
        venueId: venue.id,
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
      })
    } catch (error) {
      // Se errore GPS, prova comunque a timbrare senza coordinate
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: string }).code !== 'NOT_SUPPORTED'
      ) {
        console.warn('GPS error, attempting punch without location:', error)

        try {
          await punchMutation.mutateAsync({
            punchType: config.punchType,
            venueId: venue.id,
          })
        } catch {
          // L'errore viene già gestito da onError
        }
      } else {
        toast.error(
          (error as { message?: string })?.message ||
            'Errore nel recupero della posizione'
        )
      }
    } finally {
      setIsGettingLocation(false)
    }
  }

  const isLoading = isGettingLocation || punchMutation.isPending

  return (
    <Button
      onClick={handlePunch}
      disabled={disabled || isLoading || !venue}
      className={cn(
        'w-full h-24 text-xl font-bold text-white shadow-lg',
        config.bgColor,
        config.hoverColor,
        'transition-all duration-200',
        'active:scale-[0.98]',
        className
      )}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-3 h-8 w-8 animate-spin" />
          {isGettingLocation ? 'Rilevamento GPS...' : 'Timbratura...'}
        </>
      ) : (
        <>
          <Icon className="mr-3 h-8 w-8" />
          {config.label}
        </>
      )}
    </Button>
  )
}

// Pulsante separato per la pausa (quando si è in servizio)
export function BreakButton({
  venue,
  disabled = false,
  className,
}: {
  venue: VenueLocation | null
  disabled?: boolean
  className?: string
}) {
  const queryClient = useQueryClient()
  const [isGettingLocation, setIsGettingLocation] = useState(false)

  const punchMutation = useMutation({
    mutationFn: async (data: {
      punchType: PunchType
      venueId: string
      latitude?: number
      longitude?: number
      accuracy?: number
    }) => {
      const res = await fetch('/api/attendance/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Errore nella timbratura')
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-current'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] })
      toast.success('Pausa iniziata')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleBreak = async () => {
    if (!venue) return

    setIsGettingLocation(true)

    try {
      const position = await getCurrentPosition()

      await punchMutation.mutateAsync({
        punchType: 'BREAK_START',
        venueId: venue.id,
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
      })
    } catch (error) {
      try {
        await punchMutation.mutateAsync({
          punchType: 'BREAK_START',
          venueId: venue.id,
        })
      } catch {
        // Errore gestito da onError
      }
    } finally {
      setIsGettingLocation(false)
    }
  }

  const isLoading = isGettingLocation || punchMutation.isPending

  return (
    <Button
      variant="outline"
      onClick={handleBreak}
      disabled={disabled || isLoading || !venue}
      className={cn('flex-1', className)}
    >
      {isLoading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Coffee className="mr-2 h-4 w-4" />
      )}
      Inizia Pausa
    </Button>
  )
}
