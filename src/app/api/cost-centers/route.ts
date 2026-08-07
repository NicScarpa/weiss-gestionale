import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { logger } from '@/lib/logger'

// GET /api/cost-centers - Lista centri di costo attivi
// Nessun ruolo particolare: la lista serve a chi registra un movimento
// (form economici, offline sync) tanto quanto a chi amministra il piano dei
// conti, e non espone dati finanziari — solo l'anagrafica dei centri.
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const costCenters = await prisma.costCenter.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        isDefault: true,
      },
      orderBy: { code: 'asc' },
    })

    return NextResponse.json({ costCenters })
  } catch (error) {
    logger.error('Errore GET /api/cost-centers', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei centri di costo' },
      { status: 500 }
    )
  }
}
