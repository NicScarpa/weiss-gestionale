import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MovimentiClient } from './MovimentiClient'

export default async function MovimentiPage() {
  const session = await auth()

  const budgetCategories = await prisma.budgetCategory.findMany({
    select: { id: true, name: true, code: true, color: true },
    orderBy: { code: 'asc' },
  })

  return (
    <MovimentiClient
      budgetCategories={budgetCategories}
    />
  )
}
