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

  // Recupera la prima sede disponibile
  const venue = await prisma.venue.findFirst({
    select: {
      id: true,
      name: true,
      code: true,
    },
    orderBy: { name: 'asc' },
  })

  const venueId = venue?.id || ''

  // Recupera gli anni per cui esistono già budget
  const existingBudgets = await prisma.budget.findMany({
    where: { venueId },
    select: {
      venueId: true,
      year: true,
    },
  })

  return (
    <NuovoBudgetClient
      venueId={venueId}
      existingBudgets={existingBudgets}
    />
  )
}
