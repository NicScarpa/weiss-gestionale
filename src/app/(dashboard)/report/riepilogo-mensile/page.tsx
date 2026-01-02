import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { RiepilogoMensileClient } from './RiepilogoMensileClient'

export const metadata = {
  title: 'Riepilogo Mensile'
}

export default async function RiepilogoMensilePage() {
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
    <RiepilogoMensileClient
      venueId={session.user.venueId || undefined}
      isAdmin={session.user.role === 'admin'}
      venues={venues}
    />
  )
}
