import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { ScheduleStatus, ScheduleType } from '@/types/schedule'
import { getVenueId } from '@/lib/venue'

// GET /api/scadenzario/summary - Statistiche per badge e dashboard
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const venueId = await getVenueId()

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)

    // Query base
    const where: Prisma.ScheduleWhereInput = {
      venueId,
      stato: { not: 'annullata' },
      OR: [
        { isRicorrente: false },
        { isRicorrente: true, ricorrenzaAttiva: true },
      ],
    }

    // Totale attive (da incassare) - somma importi
    const attiveAggregate = await prisma.schedule.aggregate({
      where: {
        ...where,
        tipo: 'attiva',
      },
      _sum: { importoTotale: true },
    })

    // Totale passive (da pagare) - somma importi
    const passiveAggregate = await prisma.schedule.aggregate({
      where: {
        ...where,
        tipo: 'passiva',
      },
      _sum: { importoTotale: true },
    })

    // Scadute (oggi e non pagate)
    const scaduteAggregate = await prisma.schedule.aggregate({
      where: {
        ...where,
        dataScadenza: { lte: today },
        stato: { notIn: ['pagata', 'annullata'] },
      },
      _sum: { importoTotale: true },
      _count: true,
    })

    // In scadenza prosimi 7 giorni
    const inScadenzaAggregate = await prisma.schedule.aggregate({
      where: {
        ...where,
        dataScadenza: { gte: today, lte: nextWeek },
        stato: { notIn: ['pagata', 'annullata'] },
      },
      _sum: { importoTotale: true },
      _count: true,
    })

    // Aperte per stato
    const aperteAggregate = await prisma.schedule.groupBy({
      where: {
        ...where,
        stato: 'aperta',
      },
      by: ['stato'],
      _count: { stato: true },
    })

    const aperteCount = aperteAggregate.length > 0 ? (aperteAggregate[0]._count.stato as number) : 0

    // Pagate
    const pagateAggregate = await prisma.schedule.groupBy({
      where: {
        ...where,
        stato: 'pagata',
      },
      by: ['stato'],
      _count: { stato: true },
    })

    const pagateCount = pagateAggregate.length > 0 ? (pagateAggregate[0]._count.stato as number) : 0

    return NextResponse.json({
      totaleAttive: Number(attiveAggregate._sum.importoTotale || 0),
      totalePassive: Number(passiveAggregate._sum.importoTotale || 0),
      totaleScadute: scaduteAggregate._count || 0,
      totaleScaduteImporto: Number(scaduteAggregate._sum.importoTotale || 0),
      totaleInScadenza7Giorni: inScadenzaAggregate._count || 0,
      totaleInScadenza7GiorniImporto: Number(inScadenzaAggregate._sum.importoTotale || 0),
      totaleAperte: aperteCount,
      totalePagate: pagateCount,
    })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/summary', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle statistiche' },
      { status: 500 }
    )
  }
}
