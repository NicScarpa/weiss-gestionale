import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VenueManagement } from '@/components/settings/VenueManagement'
import { SupplierManagement } from '@/components/settings/SupplierManagement'
import { AccountManagement } from '@/components/settings/AccountManagement'
import { PrimaNotaSettings } from '@/components/settings/PrimaNotaSettings'
import { BudgetCategoryManagement } from '@/components/settings/BudgetCategoryManagement'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Impostazioni'
}

export default async function ImpostazioniPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Solo admin può accedere alle impostazioni
  if (session.user.role !== 'admin') {
    redirect('/chiusura-cassa?error=unauthorized')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Impostazioni</h1>
        <p className="text-muted-foreground">
          Configurazione del sistema
        </p>
      </div>

      <Tabs defaultValue="sedi" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sedi">Sedi</TabsTrigger>
          <TabsTrigger value="fornitori">Fornitori</TabsTrigger>
          <TabsTrigger value="conti">Piano Conti</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
          <TabsTrigger value="prima-nota">Prima Nota</TabsTrigger>
        </TabsList>

        <TabsContent value="sedi">
          <VenueManagement />
        </TabsContent>

        <TabsContent value="fornitori">
          <SupplierManagement />
        </TabsContent>

        <TabsContent value="conti">
          <AccountManagement />
        </TabsContent>

        <TabsContent value="budget">
          <BudgetCategoryManagement />
        </TabsContent>

        <TabsContent value="prima-nota">
          <PrimaNotaSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}
