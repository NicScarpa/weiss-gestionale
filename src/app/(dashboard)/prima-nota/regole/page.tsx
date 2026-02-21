import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CategorizationRulesManager } from '@/components/prima-nota/regole/CategorizationRulesManager'

export default async function RegolePage() {
  const session = await auth()

  const [accounts, budgetCategories] = await Promise.all([
    prisma.account.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { code: 'asc' },
    }),
    prisma.budgetCategory.findMany({
      select: { id: true, name: true, code: true, color: true },
      orderBy: { code: 'asc' },
    }),
  ])

  return (
    <CategorizationRulesManager
      venueId={session?.user?.venueId || ''}
      accounts={accounts}
      budgetCategories={budgetCategories}
    />
  )
}
