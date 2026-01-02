import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { NuovaChiusuraClient } from './NuovaChiusuraClient'

export const metadata = {
  title: 'Nuova Chiusura Cassa'
}

export default async function NuovaChiusuraPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Verifica che l'utente abbia una sede assegnata
  if (!session.user.venueId) {
    redirect('/chiusura-cassa?error=no-venue')
  }

  // Recupera dati necessari per il form
  const [venue, cashStationTemplates, staffMembers, accounts] = await Promise.all([
    // Venue con dettagli
    prisma.venue.findUnique({
      where: { id: session.user.venueId },
      select: {
        id: true,
        name: true,
        code: true,
        vatRate: true,
        defaultFloat: true,
      },
    }),
    // Template postazioni cassa
    prisma.cashStationTemplate.findMany({
      where: {
        venueId: session.user.venueId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        position: true,
        isEventOnly: true,
      },
      orderBy: { position: 'asc' },
    }),
    // Staff della sede
    prisma.user.findMany({
      where: {
        venueId: session.user.venueId,
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        isFixedStaff: true,
        hourlyRate: true,
      },
      orderBy: [{ isFixedStaff: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    }),
    // Piano conti (solo conti di spesa/costo)
    prisma.account.findMany({
      where: {
        isActive: true,
        type: 'COSTO',
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
      orderBy: { code: 'asc' },
    }),
  ])

  if (!venue) {
    redirect('/chiusura-cassa?error=venue-not-found')
  }

  // Se non ci sono template postazioni, usa default
  const stations = cashStationTemplates.length > 0
    ? cashStationTemplates
    : [
        { id: 'bar', name: 'BAR', position: 0, isEventOnly: false },
        { id: 'cassa1', name: 'CASSA 1', position: 1, isEventOnly: false },
        { id: 'cassa2', name: 'CASSA 2', position: 2, isEventOnly: true },
        { id: 'cassa3', name: 'CASSA 3', position: 3, isEventOnly: true },
      ]

  // Converti Decimal a number per staffMembers
  const formattedStaff = staffMembers.map((s) => ({
    ...s,
    hourlyRate: s.hourlyRate ? Number(s.hourlyRate) : null,
  }))

  return (
    <NuovaChiusuraClient
      venue={{
        id: venue.id,
        name: venue.name,
        vatRate: (Number(venue.vatRate) / 100) || 0.1,
        defaultFloat: Number(venue.defaultFloat) || 114,
      }}
      cashStationTemplates={stations}
      staffMembers={formattedStaff}
      accounts={accounts}
    />
  )
}
