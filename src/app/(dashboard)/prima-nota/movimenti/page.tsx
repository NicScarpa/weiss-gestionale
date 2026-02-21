import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MovimentiClient } from './MovimentiClient'

export default async function MovimentiPage() {
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
    <MovimentiClient
      accounts={accounts}
      budgetCategories={budgetCategories}
    />
  )
}
