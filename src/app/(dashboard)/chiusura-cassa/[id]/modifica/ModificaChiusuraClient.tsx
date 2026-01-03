'use client'

import { useRouter } from 'next/navigation'
import { ClosureForm, ClosureFormData } from '@/components/chiusura'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface ModificaChiusuraClientProps {
  closureId: string
  initialData: any
  venue: {
    id: string
    name: string
    vatRate: number
  }
  cashStationTemplates: { id: string; name: string; position: number }[]
  staffMembers: { id: string; firstName: string; lastName: string }[]
  accounts: { id: string; code: string; name: string }[]
  isEditingValidated?: boolean
}

export function ModificaChiusuraClient({
  closureId,
  initialData,
  venue,
  cashStationTemplates,
  staffMembers,
  accounts,
  isEditingValidated = false,
}: ModificaChiusuraClientProps) {
  const router = useRouter()

  // Salva modifiche
  const handleSave = async (data: ClosureFormData) => {
    // Aggiorna i metadati base
    const updateRes = await fetch(`/api/chiusure/${closureId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isEvent: data.isEvent,
        eventName: data.eventName,
        weatherMorning: data.weatherMorning,
        weatherAfternoon: data.weatherAfternoon,
        weatherEvening: data.weatherEvening,
        notes: data.notes,
      }),
    })

    if (!updateRes.ok) {
      const errorData = await updateRes.json()
      throw new Error(errorData.error || 'Errore nell\'aggiornamento')
    }

    // TODO: Aggiornare anche stazioni, parziali, uscite, presenze
    // Per ora è necessario eliminare e ricreare, oppure implementare
    // endpoint specifici per aggiornare le relazioni

    router.push(`/chiusura-cassa/${closureId}`)
  }

  // Invia per validazione
  const handleSubmit = async (data: ClosureFormData) => {
    // Prima salva
    await handleSave(data)

    // Poi invia per validazione
    const submitRes = await fetch(`/api/chiusure/${closureId}/submit`, {
      method: 'POST',
    })

    if (!submitRes.ok) {
      const errorData = await submitRes.json()
      throw new Error(errorData.error || 'Errore nell\'invio')
    }

    router.push('/chiusura-cassa')
  }

  return (
    <div className="space-y-4">
      {isEditingValidated && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Attenzione:</strong> Stai modificando una chiusura già validata.
              Le modifiche potrebbero influire sulle scritture contabili generate.
            </p>
          </CardContent>
        </Card>
      )}

      <ClosureForm
        closureId={closureId}
        initialData={initialData}
        venueId={venue.id}
        venueName={venue.name}
        vatRate={venue.vatRate}
        cashStationTemplates={cashStationTemplates}
        staffMembers={staffMembers}
        accounts={accounts}
        status={isEditingValidated ? 'VALIDATED' : 'DRAFT'}
        onSave={handleSave}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
