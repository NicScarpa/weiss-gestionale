'use client'

import { LeaveRequestForm } from '@/components/portal/LeaveRequestForm'

export default function NuovaRichiestaFeriePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nuova Richiesta</h1>
        <p className="text-sm text-gray-500 mt-1">
          Compila il form per richiedere ferie o permessi
        </p>
      </div>

      <LeaveRequestForm />
    </div>
  )
}
