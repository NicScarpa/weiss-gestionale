import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

// GET /api/scadenzario/[id]/occorrenze - Lista occorrenze figlie di una ricorrenza
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Verifica esistenza scadenza padre
    const parentSchedule = await prisma.schedule.findFirst({
      where: { id },
      select: { id: true, venueId: true, isRicorrente: true },
    })

    if (!parentSchedule) {
      return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
    }

    const occurrences = await prisma.schedule.findMany({
      where: { ricorrenzaParentId: id },
      orderBy: { dataScadenza: 'desc' },
      select: {
        id: true,
        descrizione: true,
        dataScadenza: true,
        importoTotale: true,
        importoPagato: true,
        stato: true,
        tipo: true,
      },
    })

    const occurrencesWithResiduo = occurrences.map(o => ({
      ...o,
      importoResiduo: Number(o.importoTotale) - Number(o.importoPagato),
    }))

    return NextResponse.json({ occurrences: occurrencesWithResiduo })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/[id]/occorrenze', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle occorrenze' },
      { status: 500 }
    )
  }
}
