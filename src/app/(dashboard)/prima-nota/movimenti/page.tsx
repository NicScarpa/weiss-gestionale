import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MovimentiClient } from './MovimentiClient'

export default async function MovimentiPage() {
  const session = await auth()

  // `color` è nullable nel database e opzionale nei componenti: la conversione
  // null → undefined sta qui, al confine fra i due, invece che in ognuno dei
  // cinque componenti che dichiarano questa forma.
  const categorie = await prisma.budgetCategory.findMany({
    select: { id: true, name: true, code: true, color: true },
    orderBy: { code: 'asc' },
  })
  const budgetCategories = categorie.map((c) => ({ ...c, color: c.color ?? undefined }))

  return (
    <MovimentiClient
      budgetCategories={budgetCategories}
    />
  )
}
