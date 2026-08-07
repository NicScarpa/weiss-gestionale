import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { MovimentiClient } from './MovimentiClient'

export default async function MovimentiPage() {
  const session = await auth()

  // Solo per CaricaMovimentiDialog (il filtro "Conto" di MovimentiFilters ha
  // ora una fetch propria via AccountCombobox, con types e includeInactive
  // scelti apposta per quel caso — vedi MovimentiFilters.tsx). Qui invece si
  // sta scegliendo il conto su cui caricare NUOVI movimenti: solo conti
  // attivi, non ha senso importare dati su un conto disattivato.
  const [accounts, budgetCategories] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
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
