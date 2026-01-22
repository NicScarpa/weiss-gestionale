import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
const storicoFiltersSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  registerType: z.enum(['CASH', 'BANK']).optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
})

// GET /api/prima-nota/saldi/storico - Storico saldi
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    const filters = storicoFiltersSchema.parse({
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
      registerType: searchParams.get('registerType') || undefined,
      groupBy: searchParams.get('groupBy') || 'day',
    })

    // Determina la sede da filtrare
    let venueId: string | undefined

    if (session.user.role !== 'admin') {
      venueId = session.user.venueId || undefined
    } else if (searchParams.get('venueId')) {
      venueId = searchParams.get('venueId') || undefined
    }

    // Costruisci where clause
    const where: any = {}

    if (venueId) {
      where.venueId = venueId
    }

    if (filters.registerType) {
      where.registerType = filters.registerType
    }

    if (filters.dateFrom || filters.dateTo) {
      where.date = {}
      if (filters.dateFrom) {
        where.date.gte = new Date(filters.dateFrom)
      }
      if (filters.dateTo) {
        where.date.lte = new Date(filters.dateTo)
      }
    }

    // Recupera tutti i movimenti nel periodo
    const entries = await prisma.journalEntry.findMany({
      where,
      select: {
        id: true,
        venueId: true,
        date: true,
        registerType: true,
        debitAmount: true,
        creditAmount: true,
      },
      orderBy: { date: 'asc' },
    })

    // Raggruppa per periodo
    const grouped = groupByPeriod(entries, filters.groupBy)

    // Calcola saldi progressivi
    const history = calculateHistoricalBalances(grouped)

    return NextResponse.json({
      data: history,
      filters: {
        ...filters,
        venueId,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Parametri non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore GET /api/prima-nota/saldi/storico', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dello storico saldi' },
      { status: 500 }
    )
  }
}

interface EntryData {
  id: string
  venueId: string
  date: Date
  registerType: string
  debitAmount: any
  creditAmount: any
}

function groupByPeriod(
  entries: EntryData[],
  groupBy: 'day' | 'week' | 'month'
): Map<string, Map<string, EntryData[]>> {
  const grouped = new Map<string, Map<string, EntryData[]>>()

  for (const entry of entries) {
    const periodKey = getPeriodKey(entry.date, groupBy)
    const registerType = entry.registerType

    if (!grouped.has(periodKey)) {
      grouped.set(periodKey, new Map())
    }

    const periodMap = grouped.get(periodKey)!
    if (!periodMap.has(registerType)) {
      periodMap.set(registerType, [])
    }

    periodMap.get(registerType)!.push(entry)
  }

  return grouped
}

function getPeriodKey(date: Date, groupBy: 'day' | 'week' | 'month'): string {
  const d = new Date(date)

  switch (groupBy) {
    case 'day':
      return d.toISOString().split('T')[0]

    case 'week': {
      // Trova il lunedì della settimana
      const day = d.getDay()
      const diff = d.getDate() - day + (day === 0 ? -6 : 1)
      d.setDate(diff)
      return d.toISOString().split('T')[0]
    }

    case 'month':
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
}

function calculateHistoricalBalances(
  grouped: Map<string, Map<string, EntryData[]>>
): any[] {
  const history: any[] = []

  // Saldi progressivi per registro
  const runningBalances: Record<string, number> = {
    CASH: 0,
    BANK: 0,
  }

  // Ordina le chiavi (periodi) cronologicamente
  const sortedPeriods = Array.from(grouped.keys()).sort()

  for (const period of sortedPeriods) {
    const periodData = grouped.get(period)!
    const periodSummary: any = {
      period,
      registers: {},
      totalAvailable: 0,
    }

    for (const registerType of ['CASH', 'BANK']) {
      const entries = periodData.get(registerType) || []

      let periodDebits = 0
      let periodCredits = 0

      for (const entry of entries) {
        periodDebits += Number(entry.debitAmount || 0)
        periodCredits += Number(entry.creditAmount || 0)
      }

      const openingBalance = runningBalances[registerType]
      const closingBalance = openingBalance + periodDebits - periodCredits

      runningBalances[registerType] = closingBalance

      periodSummary.registers[registerType] = {
        openingBalance,
        debits: periodDebits,
        credits: periodCredits,
        netMovement: periodDebits - periodCredits,
        closingBalance,
        movementCount: entries.length,
      }
    }

    periodSummary.totalAvailable =
      runningBalances.CASH + runningBalances.BANK

    history.push(periodSummary)
  }

  return history
}
