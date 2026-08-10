import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { startOfYear, endOfYear, format, parseISO } from 'date-fns'
import { getVenueId } from '@/lib/venue'
import { aggregaContoEconomico, type MovimentoContoEconomico } from '@/lib/report/conto-economico'

import { logger } from '@/lib/logger'

/** Campi della voce di conto richiesti dall'aggregatore, in testata e nelle fette. */
const ACCOUNT_SELECT = {
  id: true,
  code: true,
  name: true,
  type: true,
  mastroCode: true,
  mastroNome: true,
  gruppoCode: true,
  gruppoNome: true,
} as const

// GET /api/report/conto-economico - Conto economico per centro di costo
export const GET = withAuth(async (request) => {
  try {
    const { searchParams } = new URL(request.url)
    const dateFromParam = searchParams.get('dateFrom')
    const dateToParam = searchParams.get('dateTo')

    // Periodo di default: anno corrente
    const now = new Date()
    const startDate = dateFromParam ? parseISO(dateFromParam) : startOfYear(now)
    const endDate = dateToParam ? parseISO(dateToParam) : endOfYear(now)

    const venueId = await getVenueId()

    // Le fette vincono sulla testata e il segno lo dà il movimento: nessun
    // groupBy Prisma, l'aggregazione è tutta in `aggregaContoEconomico`.
    const [movimenti, costCenters] = await Promise.all([
      prisma.journalEntry.findMany({
        where: {
          venueId,
          registerType: { in: ['CASH', 'BANK'] },
          date: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          accountId: true,
          debitAmount: true,
          creditAmount: true,
          account: { select: ACCOUNT_SELECT },
          costCenter: { select: { code: true } },
          allocations: {
            select: {
              accountId: true,
              importo: true,
              account: { select: ACCOUNT_SELECT },
            },
          },
        },
      }) satisfies Promise<MovimentoContoEconomico[]>,
      prisma.costCenter.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
    ])

    const conto = aggregaContoEconomico(movimenti, costCenters)

    return NextResponse.json({
      period: {
        from: format(startDate, 'yyyy-MM-dd'),
        to: format(endDate, 'yyyy-MM-dd'),
      },
      costCenters,
      ...conto,
    })
  } catch (error) {
    logger.error('Errore GET /api/report/conto-economico', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei dati' },
      { status: 500 }
    )
  }
}, { roles: ['admin', 'manager'] })
