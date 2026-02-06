'use client'

import { useSession } from 'next-auth/react'
import { ArrowLeftRight, Loader2 } from 'lucide-react'
import { ShiftSwapManager } from '@/components/portal/ShiftSwapManager'

export default function PortaleScambiPage() {
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!session?.user) {
    return null
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ArrowLeftRight className="w-6 h-6 text-green-500" />
          Scambi Turni
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestisci le richieste di scambio turni con i tuoi colleghi
        </p>
      </div>

      <ShiftSwapManager currentUserId={session.user.id} />
    </div>
  )
}
