'use client'

import { useRouter } from 'next/navigation'
import { ClosureForm, ClosureFormData } from '@/components/chiusura'
import { toast } from 'sonner'

interface ModificaChiusuraClientProps {
  closureId: string
  initialData: any
  venue: {
    id: string
    name: string
    vatRate: number
    defaultFloat: number
  }
  cashStationTemplates: { id: string; name: string; position: number }[]
  staffMembers: { id: string; firstName: string; lastName: string }[]
  accounts: { id: string; code: string; name: string }[]
}

export function ModificaChiusuraClient({
  closureId,
  initialData,
  venue,
  cashStationTemplates,
  staffMembers,
  accounts,
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
    <ClosureForm
      closureId={closureId}
      initialData={initialData}
      venueId={venue.id}
      venueName={venue.name}
      vatRate={venue.vatRate}
      defaultFloat={venue.defaultFloat}
      cashStationTemplates={cashStationTemplates}
      staffMembers={staffMembers}
      accounts={accounts}
      status="DRAFT"
      onSave={handleSave}
      onSubmit={handleSubmit}
    />
  )
}
