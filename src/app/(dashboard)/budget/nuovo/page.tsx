import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { NuovoBudgetClient } from './NuovoBudgetClient'

export const metadata = {
  title: 'Nuovo Budget'
}

export default async function NuovoBudgetPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Solo admin e manager possono creare budget
  if (!['admin', 'manager'].includes(session.user.role || '')) {
    redirect('/budget')
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

  // Recupera gli anni per cui esistono già budget per ogni sede
  const existingBudgets = await prisma.budget.findMany({
    where: session.user.role === 'admin' ? {} : { venueId: session.user.venueId || '' },
    select: {
      venueId: true,
      year: true,
    },
  })

  return (
    <NuovoBudgetClient
      venues={venues}
      existingBudgets={existingBudgets}
      defaultVenueId={session.user.venueId || undefined}
    />
  )
}
