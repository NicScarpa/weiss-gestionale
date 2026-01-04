'use client'

import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { ChevronLeft } from 'lucide-react'
import { PolicyForm } from '@/components/attendance/PolicyForm'
import Link from 'next/link'

interface PolicyData {
  venue: {
    id: string
    name: string
    code: string
    hasCoordinates: boolean
  }
  policy: {
    geoFenceRadius: number
    requireGeolocation: boolean
    blockOutsideLocation: boolean
    earlyClockInMinutes: number
    lateClockInMinutes: number
    earlyClockOutMinutes: number
    lateClockOutMinutes: number
    autoClockOutEnabled: boolean
    autoClockOutHours: number
    requireBreakPunch: boolean
    minBreakMinutes: number
    notifyOnAnomaly: boolean
    notifyManagerEmail: string | null
  }
  exists: boolean
}

export default function PolicyPage() {
  // Fetch policies
  const { data: policies, isLoading } = useQuery<PolicyData[]>({
    queryKey: ['attendance-policies'],
    queryFn: async () => {
      const response = await fetch('/api/attendance/policies')
      if (!response.ok) throw new Error('Errore caricamento policy')
      const data = await response.json()
      return data.data || []
    },
  })

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/presenze">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Policy Presenze</h1>
          <p className="text-muted-foreground">
            Configura le regole di timbratura per ogni sede
          </p>
        </div>
      </div>

      {/* Policy Forms */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {policies?.map((item) => (
            <PolicyForm
              key={item.venue.id}
              venueId={item.venue.id}
              venueName={item.venue.name}
              policy={item.policy}
              hasCoordinates={item.venue.hasCoordinates}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && (!policies || policies.length === 0) && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            Nessuna sede configurata. Aggiungi una sede dalle impostazioni.
          </p>
        </div>
      )}
    </div>
  )
}
