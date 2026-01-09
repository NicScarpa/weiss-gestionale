import { PrimaNotaSettings } from '@/components/settings/PrimaNotaSettings'
import { VenueManagement } from '@/components/settings/VenueManagement'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Impostazioni Generali'
}

export default async function ImpostazioniGeneraliPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  if (session.user.role !== 'admin') {
    redirect('/chiusura-cassa?error=unauthorized')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Impostazioni Generali</h1>
        <p className="text-muted-foreground">
          Gestione sedi e configurazioni globali
        </p>
      </div>

      <VenueManagement />

      <div>
        <h2 className="text-xl font-semibold tracking-tight">Prima Nota</h2>
        <p className="text-muted-foreground">
          Configurazione causali e template
        </p>
      </div>

      <PrimaNotaSettings />
    </div>
  )
}
