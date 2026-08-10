import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CategorizationRulesManager } from '@/components/prima-nota/regole/CategorizationRulesManager'

export default async function RegolePage() {
  const session = await auth()

  // Il conto della regola (RegolaFormDialog) ha ora una fetch propria via
  // AccountCombobox: qui serve solo più budgetCategories.
  // `color` è nullable nel database e opzionale nei componenti: la conversione
  // null → undefined sta al confine, come in movimenti/page.tsx.
  const categorie = await prisma.budgetCategory.findMany({
    select: { id: true, name: true, code: true, color: true },
    orderBy: { code: 'asc' },
  })
  const budgetCategories = categorie.map((c) => ({ ...c, color: c.color ?? undefined }))

  return (
    <CategorizationRulesManager
      venueId={session?.user?.venueId || ''}
      budgetCategories={budgetCategories}
    />
  )
}
