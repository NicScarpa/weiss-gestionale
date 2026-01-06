import { prisma } from '@/lib/prisma'
import { RiconciliazioneClient } from './RiconciliazioneClient'

export const metadata = {
  title: 'Riconciliazione Bancaria | Weiss Gestionale',
  description: 'Importa e riconcilia i movimenti bancari',
}

export default async function RiconciliazionePage() {
  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      code: true,
    },
    orderBy: { name: 'asc' },
  })

  return <RiconciliazioneClient venues={venues} />
}
