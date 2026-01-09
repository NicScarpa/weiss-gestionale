import { BudgetCategoryManagement } from '@/components/settings/BudgetCategoryManagement'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Categorie Budget'
}

export default async function ImpostazioniBudgetPage() {
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
        <h1 className="text-2xl font-bold tracking-tight">Categorie Budget</h1>
        <p className="text-muted-foreground">
          Configurazione categorie e mapping per il budget
        </p>
      </div>

      <BudgetCategoryManagement />
    </div>
  )
}
