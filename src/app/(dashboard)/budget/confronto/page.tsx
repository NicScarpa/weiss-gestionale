import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getVenue } from '@/lib/venue'
import { BudgetConfrontoClient } from './BudgetConfrontoClient'

export const metadata = {
  title: 'Confronto Budget'
}

export default async function BudgetConfrontoPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Sede unica dell'installazione (architettura single-venue, vedi src/lib/venue.ts)
  const venue = await getVenue()

  const venueId = venue?.id || ''

  // Recupera gli anni disponibili per i budget
  const budgetYears = await prisma.budget.findMany({
    select: {
      year: true,
    },
    distinct: ['year'],
    orderBy: { year: 'desc' },
  })

  const availableYears = [...new Set(budgetYears.map((b) => b.year))]

  return (
    <BudgetConfrontoClient
      venueId={venueId}
      availableYears={availableYears}
    />
  )
}
