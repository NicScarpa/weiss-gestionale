import { AccountManagement } from '@/components/settings/AccountManagement'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Piano dei Conti'
}

export default async function ImpostazioniContiPage() {
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
        <h1 className="text-2xl font-bold tracking-tight">Piano dei Conti</h1>
        <p className="text-muted-foreground">
          Gestione conti e sottoconti per la contabilità
        </p>
      </div>

      <AccountManagement />
    </div>
  )
}
