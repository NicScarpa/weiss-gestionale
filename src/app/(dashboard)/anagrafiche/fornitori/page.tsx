import { SupplierManagement } from '@/components/settings/SupplierManagement'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Gestione Fornitori'
}

export default async function ImpostazioniFornitoriPage() {
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
        <h1 className="text-2xl font-bold tracking-tight">Gestione Fornitori</h1>
        <p className="text-muted-foreground">
          Anagrafica fornitori per uscite e fatture
        </p>
      </div>

      <SupplierManagement />
    </div>
  )
}
