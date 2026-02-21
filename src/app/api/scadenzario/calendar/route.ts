import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { ScheduleStatus } from '@/types/schedule'
import { getVenueId } from '@/lib/venue'

// GET /api/scadenzario/calendar - Dati calendario mensile
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = await getVenueId()

    // Parametri date
    const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear()
    const month = parseInt(searchParams.get('month') || '') || new Date().getMonth() + 1

    // Calcola inizio e fine mese
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0, 23, 59, 59, 999)

    // Recupera scadenze del mese (incluse ricorrenze)
    const schedules = await prisma.schedule.findMany({
      where: {
        venueId,
        stato: { not: 'annullata' },
        OR: [
          {
            dataScadenza: { gte: startDate, lte: endDate },
            isRicorrente: false,
          },
          {
            isRicorrente: true,
            ricorrenzaAttiva: true,
            // Includiamo anche quelle che generano nel mese
            OR: [
              { dataScadenza: { gte: startDate, lte: endDate } },
              {
                ricorrenzaProssimaGenerazione: {
                  gte: startDate,
                  lte: endDate,
                },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        descrizione: true,
        dataScadenza: true,
        importoTotale: true,
        importoPagato: true,
        tipo: true,
        stato: true,
        priorita: true,
        isRicorrente: true,
      },
    })

    // Formatta eventi per calendario
    const events = schedules.map(s => ({
      id: s.id,
      title: s.descrizione,
      date: s.dataScadenza,
      amount: Number(s.importoTotale) - Number(s.importoPagato),
      tipo: s.tipo,
      stato: s.stato,
      priorita: s.priorita,
      isRicorrente: s.isRicorrente,
    }))

    // Raggruppa per data
    const byDate: Record<string, typeof events> = {}
    events.forEach(event => {
      const dateKey = event.date.toISOString().split('T')[0]
      if (!byDate[dateKey]) {
        byDate[dateKey] = []
      }
      byDate[dateKey].push(event)
    })

    return NextResponse.json({
      year,
      month,
      events: byDate,
      total: events.length,
    })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/calendar', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del calendario' },
      { status: 500 }
    )
  }
}
