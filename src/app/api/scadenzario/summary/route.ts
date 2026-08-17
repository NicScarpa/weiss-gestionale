import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { ScheduleStatus, ScheduleType } from '@/types/schedule'
import { getVenueId } from '@/lib/venue'
import { whereScadenzePagateSenzaMovimento } from '@/lib/scadenzario/pagate-senza-movimento'

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

    // Attive non ancora saldate (da incassare) - conteggio e residuo.
    // "Non saldata" è lo stesso criterio della card "Scadute": stato fuori
    // da pagata/annullata, non "aperta" in senso stretto (include parziali,
    // solleciti, contestate, ecc.)
    const attiveAperteAggregate = await prisma.schedule.aggregate({
      where: {
        ...where,
        tipo: 'attiva',
        stato: { notIn: ['pagata', 'annullata'] },
      },
      _sum: { importoTotale: true, importoPagato: true },
      _count: true,
    })

    // Passive non ancora saldate (da pagare) - conteggio e residuo
    const passiveAperteAggregate = await prisma.schedule.aggregate({
      where: {
        ...where,
        tipo: 'passiva',
        stato: { notIn: ['pagata', 'annullata'] },
      },
      _sum: { importoTotale: true, importoPagato: true },
      _count: true,
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

    // Scadenze su cui è stato registrato un pagamento senza che alcun movimento
    // di prima nota esista: il denaro risulta uscito dallo scadenzario e non è
    // mai entrato nel consuntivo. Sono spesso legittime (contanti, addebiti
    // registrati altrove), ma vanno viste — altrimenti il previsionale e il
    // saldo raccontano due storie diverse in silenzio.
    const senzaMovimento = await prisma.schedule.aggregate({
      where: {
        ...where,
        ...whereScadenzePagateSenzaMovimento(),
      },
      _count: true,
      _sum: { importoPagato: true },
    })

    // Residuo = importo totale - importo già pagato: quello che manca
    // davvero da incassare/pagare, non il totale della scadenza
    const aperteAttiveImporto =
      Number(attiveAperteAggregate._sum.importoTotale || 0) -
      Number(attiveAperteAggregate._sum.importoPagato || 0)
    const apertePassiveImporto =
      Number(passiveAperteAggregate._sum.importoTotale || 0) -
      Number(passiveAperteAggregate._sum.importoPagato || 0)

    return NextResponse.json({
      aperteAttiveCount: attiveAperteAggregate._count || 0,
      aperteAttiveImporto,
      apertePassiveCount: passiveAperteAggregate._count || 0,
      apertePassiveImporto,
      totaleScadute: scaduteAggregate._count || 0,
      totaleScaduteImporto: Number(scaduteAggregate._sum.importoTotale || 0),
      totaleInScadenza7Giorni: inScadenzaAggregate._count || 0,
      totaleInScadenza7GiorniImporto: Number(inScadenzaAggregate._sum.importoTotale || 0),
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
