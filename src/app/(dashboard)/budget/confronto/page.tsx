import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { BudgetConfrontoClient } from './BudgetConfrontoClient'

export const metadata = {
  title: 'Confronto Budget'
}

export default async function BudgetConfrontoPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Recupera le sedi (solo admin vede tutte)
  const venues = await prisma.venue.findMany({
    where: session.user.role === 'admin' ? {} : { id: session.user.venueId || '' },
    select: {
      id: true,
      name: true,
      code: true,
    },
    orderBy: { name: 'asc' },
  })

  // Recupera gli anni disponibili per i budget
  const budgetYears = await prisma.budget.findMany({
    where: session.user.role === 'admin' ? {} : { venueId: session.user.venueId || '' },
    select: {
      year: true,
    },
    distinct: ['year'],
    orderBy: { year: 'desc' },
  })

  const availableYears = [...new Set(budgetYears.map((b) => b.year))]

  return (
    <BudgetConfrontoClient
      venues={venues}
      availableYears={availableYears}
      defaultVenueId={session.user.venueId || undefined}
      isAdmin={session.user.role === 'admin'}
    />
  )
}
