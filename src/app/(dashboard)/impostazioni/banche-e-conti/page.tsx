import { BancheEContiClient } from '@/components/settings/BancheEContiClient'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Banche e Conti'
}

export default async function BancheEContiPage() {
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
        <h1 className="text-2xl font-bold tracking-tight">Banche e Conti</h1>
        <p className="text-muted-foreground">
          Gestione conti bancari e conti cassa
        </p>
      </div>

      <BancheEContiClient />
    </div>
  )
}
