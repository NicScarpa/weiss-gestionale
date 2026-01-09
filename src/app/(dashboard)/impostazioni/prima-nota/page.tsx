import { PrimaNotaSettings } from '@/components/settings/PrimaNotaSettings'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Impostazioni Prima Nota'
}

export default async function ImpostazioniPrimaNotaPage() {
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
        <h1 className="text-2xl font-bold tracking-tight">Impostazioni Prima Nota</h1>
        <p className="text-muted-foreground">
          Configurazione causali e template
        </p>
      </div>

      <PrimaNotaSettings />
    </div>
  )
}
