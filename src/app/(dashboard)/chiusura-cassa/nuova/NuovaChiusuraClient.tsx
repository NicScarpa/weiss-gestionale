'use client'

import { useRouter } from 'next/navigation'
import { ClosureForm, ClosureFormData } from '@/components/chiusura'
import { useClosureMutation } from '@/hooks/useClosureMutation'

interface NuovaChiusuraClientProps {
  venue: {
    id: string
    name: string
    vatRate: number
  }
  cashStationTemplates: { id: string; name: string; position: number; isEventOnly: boolean }[]
  staffMembers: { id: string; firstName: string; lastName: string; isFixedStaff: boolean; hourlyRate: number | null }[]
  accounts: { id: string; code: string; name: string }[]
}

export function NuovaChiusuraClient({
  venue,
  cashStationTemplates,
  staffMembers,
  accounts,
}: NuovaChiusuraClientProps) {
  const router = useRouter()

  const { saveDraft, submitForValidation } = useClosureMutation({
    venueId: venue.id,
    onSuccess: (closureId) => {
      router.push(`/chiusura-cassa/${closureId}`)
    },
  })

  // Wrapper for save that navigates on success
  const handleSave = async (data: ClosureFormData) => {
    const closureId = await saveDraft(data)
    if (closureId) {
      router.push(`/chiusura-cassa/${closureId}`)
    }
  }

  return (
    <ClosureForm
      venueId={venue.id}
      venueName={venue.name}
      vatRate={venue.vatRate}
      cashStationTemplates={cashStationTemplates}
      staffMembers={staffMembers}
      accounts={accounts}
      onSave={handleSave}
      onSubmit={submitForValidation}
    />
  )
}
