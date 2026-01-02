import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ConfrontoAnnualeClient } from './ConfrontoAnnualeClient'

export const metadata = {
  title: 'Confronto Annuale'
}

export default async function ConfrontoAnnualePage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Fetch venues for admin filter
  const venues = session.user.role === 'admin'
    ? await prisma.venue.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      })
    : []

  return (
    <ConfrontoAnnualeClient
      venueId={session.user.venueId || undefined}
      isAdmin={session.user.role === 'admin'}
      venues={venues}
    />
  )
}
