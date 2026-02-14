import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/cashflow/summary - Dati per le 4 summary cards
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const venueId = session.user.venueId!

  // Calcolo saldo attuale (cassa + banca)
  const today = new Date().toISOString().split('T')[0]

  const [cashBalance, bankBalance] = await Promise.all([
    prisma.registerBalance.findUnique({
      where: { venueId_registerType_date: { venueId, registerType: 'CASH', date: today } },
      select: { closingBalance: true },
    }),
    prisma.registerBalance.findUnique({
      where: { venueId_registerType_date: { venueId, registerType: 'BANK', date: today } },
      select: { closingBalance: true },
    }),
  ])

  const saldoAttuale = (cashBalance?.closingBalance?.toNumber() || 0) + (bankBalance?.closingBalance?.toNumber() || 0)

  // Trend 7 gg (differenza tra oggi e 7 gg fa)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]

  const [oldBalance] = await prisma.$queryRaw`
    SELECT SUM(closing_balance) as balance
    FROM register_balances
    WHERE venue_id = ${venueId}::uuid
      AND date >= ${sevenDaysAgoStr}::date
      AND date < ${today}::date
  ` as Array<{ balance: bigint }>

  const trend7gg = saldoAttuale - (oldBalance[0]?.balance ? Number(oldBalance[0].balance) : 0)

  // Previsione 30gg (basata su media movimenti)
  const thirtyDaysLater = new Date()
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30)

  const [movementStats] = await prisma.$queryRaw`
    SELECT
      AVG(CASE WHEN debit_amount > 0 THEN debit_amount ELSE 0 END) as avg_debit,
      AVG(CASE WHEN credit_amount > 0 THEN credit_amount ELSE 0 END) as avg_credit
    FROM journal_entries
    WHERE venue_id = ${venueId}::uuid
      AND date >= ${sevenDaysAgoStr}::date
      AND date <= ${today}::date
  ` as Array<{ avg_debit: number; avg_credit: number }>

  const avgDailyNet = (movementStats[0]?.avg_credit || 0) - (movementStats[0]?.avg_debit || 0)
  const previsione30gg = avgDailyNet * 30

  // Delta
  const deltaPrevisione = avgDailyNet * 30

  // Runway (mesi con saldo attuale e burn rate)
  const burnRateMensile = Math.abs(avgDailyNet * 30)
  const runwayMesi = avgDailyNet >= 0 ? Infinity : saldoAttuale / Math.abs(avgDailyNet * 30)

  // Prossimo alert
  const prossimoAlert = await prisma.cashFlowAlert.findFirst({
    where: {
      venueId,
      stato: 'ATTIVO',
      dataPrevista: { gte: new Date() },
    },
    orderBy: { dataPrevista: 'asc' },
  })

  const summary = {
    saldoAttuale,
    trend7gg,
    previsione30gg,
    deltaPrevisione,
    runwayMesi: isFinite(runwayMesi) ? runwayMesi : 999,
    burnRateMensile,
    prossimoAlert: prossimoAlert ? {
      tipo: prossimoAlert.tipo,
      data: prossimoAlert.dataPrevista,
      messaggio: prossimoAlert.messaggio,
    } : null,
  }

  return NextResponse.json(summary)
}
