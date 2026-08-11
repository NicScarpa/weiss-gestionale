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

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
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

    // Scadute (oggi e non pagate). Lo scaduto si giudica sulla data attesa di
    // cassa (dataAttesa null = coincide con la contrattuale); il filtro sta in
    // AND per non sovrascrivere l'OR di base sulle ricorrenze
    const scaduteAggregate = await prisma.schedule.aggregate({
      where: {
        ...where,
        AND: [
          {
            OR: [
              { dataAttesa: { lte: today } },
              { dataAttesa: null, dataScadenza: { lte: today } },
            ],
          },
        ],
        stato: { notIn: ['pagata', 'annullata'] },
      },
      _sum: { importoTotale: true },
      _count: true,
    })

    // In scadenza prosimi 7 giorni
    const finestra7Giorni = { gte: today, lte: nextWeek }
    const inScadenzaAggregate = await prisma.schedule.aggregate({
      where: {
        ...where,
        AND: [
          {
            OR: [
              { dataAttesa: finestra7Giorni },
              { dataAttesa: null, dataScadenza: finestra7Giorni },
            ],
          },
        ],
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

    // Scadenze su cui è stato registrato un pagamento senza che alcun movimento
    // di prima nota esista: il denaro risulta uscito dallo scadenzario e non è
    // mai entrato nel consuntivo. Sono spesso legittime (contanti, addebiti
    // registrati altrove), ma vanno viste — altrimenti il previsionale e il
    // saldo raccontano due storie diverse in silenzio.
    const senzaMovimento = await prisma.schedule.aggregate({
      where: {
        ...where,
        importoPagato: { gt: 0 },
        reconciliations: { none: { status: 'VERIFIED' } },
      },
      _count: true,
      _sum: { importoPagato: true },
    })

    return NextResponse.json({
      totaleAttive: Number(attiveAggregate._sum.importoTotale || 0),
      totalePassive: Number(passiveAggregate._sum.importoTotale || 0),
      totaleScadute: scaduteAggregate._count || 0,
      totaleScaduteImporto: Number(scaduteAggregate._sum.importoTotale || 0),
      totaleInScadenza7Giorni: inScadenzaAggregate._count || 0,
      totaleInScadenza7GiorniImporto: Number(inScadenzaAggregate._sum.importoTotale || 0),
      totaleAperte: aperteCount,
      totalePagate: pagateCount,
      pagateSenzaMovimento: senzaMovimento._count || 0,
      pagateSenzaMovimentoImporto: Number(senzaMovimento._sum.importoPagato || 0),
    })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/summary', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle statistiche' },
      { status: 500 }
    )
  }
}
