import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { saldiAlGiorno } from '@/lib/saldi'
import { withAuth } from '@/lib/api-utils'
import {
  addDays,
  subDays,
  subYears,
  startOfDay,
  format,
  parseISO,
  getDay,
  differenceInDays,
} from 'date-fns'
import { it } from 'date-fns/locale'
import { formatCurrency } from '@/lib/formatters'
import { proietta, type FlussoPrevisto } from '@/lib/previsionale/proietta'
import { leggiFlussi } from '@/lib/previsionale/leggi'

import { logger } from '@/lib/logger'
interface ForecastDay {
  date: string
  dateFormatted: string
  dayOfWeek: string
  expectedIncome: number
  expectedExpenses: number
  netChange: number
  projectedBalance: number
  isWeekend: boolean
  incomeSource: 'historical' | 'average' | 'hybrid'
  expenses: Array<{ name: string; amount: number }>
}

/**
 * Data per esteso («mercoledì 12 agosto») per i messaggi di avviso. Nella
 * tabella e nel grafico la forma corta di `dateFormatted` («mer 12 ago») serve
 * a stare nello spazio della colonna, ma dentro una frase si legge come una
 * sigla: l'avviso è l'unico posto dove la data va detta tutta.
 */
function dataEstesa(isoDate: string): string {
  return format(parseISO(isoDate), 'EEEE d MMMM', { locale: it })
}

interface ForecastResult {
  currentBalance: {
    cash: number
    bank: number
    total: number
  }
  forecast: ForecastDay[]
  summary: {
    totalExpectedIncome: number
    totalExpectedExpenses: number
    minBalance: number
    minBalanceDate: string
    maxBalance: number
    maxBalanceDate: string
    daysUntilLowBalance: number | null
    averageDailyIncome: number
  }
  alerts: Array<{
    type: 'LOW_BALANCE' | 'NEGATIVE_BALANCE' | 'HIGH_EXPENSE_DAY'
    date: string
    message: string
    severity: 'warning' | 'critical'
  }>
  settings: {
    lowBalanceThreshold: number
    forecastDays: number
    forecastMethod: string
  }
}

// GET /api/dashboard/forecast - Previsione cash flow
export const GET = withAuth(async (request, { venueId }) => {
  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')

    const forecastDays = Math.min(Math.max(days, 7), 90)
    const today = startOfDay(new Date())

    // Ottieni impostazioni cash flow per la sede
    const settings = await prisma.cashFlowSetting.findUnique({
      where: { venueId },
    })

    const lowBalanceThreshold = settings
      ? Number(settings.lowBalanceThreshold)
      : 5000
    const forecastMethod = settings?.forecastMethod || 'HYBRID'
    const movingAverageDays = settings?.movingAverageDays || 30

    // 1. Calcola saldo attuale
    const currentBalance = await calculateCurrentBalance(venueId)

    // 2. Ottieni dati storici per previsione entrate
    const historicalData = await getHistoricalIncomeData(
      venueId,
      today,
      forecastDays,
      movingAverageDays
    )

    // La finestra parte da domani: il saldo di oggi, da cui la proiezione
    // parte, include già i movimenti reali di oggi (`calculateCurrentBalance`
    // usa `saldiAlGiorno` senza argomento, cioè il giorno civile corrente).
    // Sommarci sopra una stima per lo stesso giorno raddoppierebbe l'incasso.
    const dal = format(addDays(today, 1), 'yyyy-MM-dd')
    const al = format(addDays(today, forecastDays), 'yyyy-MM-dd')

    // 3. Le entrate stimate dallo storico chiusure: `calculateExpectedIncome`
    // resta qui, perché nessun'altra fonte descrive l'incasso da banco.
    // Diventano flussi `fonte: 'stima'`, senza chiave — non descrivono un
    // impegno preso, quindi non devono mai poter scartare né essere scartate
    // da nessun'altra fonte (vedi il commento in testa a `proietta.ts`).
    const incomeByDate = new Map<
      string,
      { income: number; source: 'historical' | 'average' | 'hybrid' }
    >()
    const flussiStima: FlussoPrevisto[] = []

    for (let i = 1; i <= forecastDays; i++) {
      const forecastDate = addDays(today, i)
      const dateStr = format(forecastDate, 'yyyy-MM-dd')
      const { income, source } = calculateExpectedIncome(forecastDate, historicalData, forecastMethod)

      incomeByDate.set(dateStr, { income, source })
      if (income !== 0) {
        flussiStima.push({
          giorno: dateStr,
          importo: income,
          fonte: 'stima',
          descrizione: 'Incasso previsto da banco',
        })
      }
    }

    // 4. Scadenze, spese ricorrenti e ricorrenze non ancora scadenzate: la
    // stessa fonte unica di `/api/scadenzario/saldo-scalare` e
    // `/api/cashflow/projection`. `calculateExpectedExpenses` non vive più
    // qui: si è trasferita in `leggiFlussi`.
    const flussiBase = await leggiFlussi(venueId, dal, al)

    const serie = proietta({
      saldoIniziale: currentBalance.total,
      dal,
      al,
      flussi: [...flussiBase, ...flussiStima],
    })
    const serieByDate = new Map(serie.map((punto) => [punto.giorno, punto]))

    // Il dettaglio "spese ricorrenti" del pannello «Come nasce la previsione»
    // resta scoped alle uscite di fonte 'ricorrente' — la stessa cosa che
    // raccontava `calculateExpectedExpenses` prima di trasferirsi: una
    // scadenza reale (fonte 'scadenza') non è più una stima, e non compare
    // qui, anche se è nata da una ricorrenza.
    const speseRicorrentiPerGiorno = new Map<string, Array<{ name: string; amount: number }>>()
    for (const flusso of flussiBase) {
      if (flusso.fonte !== 'ricorrente' || flusso.importo >= 0) continue
      const elenco = speseRicorrentiPerGiorno.get(flusso.giorno) ?? []
      elenco.push({ name: flusso.descrizione, amount: Math.abs(flusso.importo) })
      speseRicorrentiPerGiorno.set(flusso.giorno, elenco)
    }

    // 5. Assembla la previsione giorno per giorno dalla serie unica.
    const forecast: ForecastDay[] = []
    let minBalance = currentBalance.total
    let minBalanceDate = format(today, 'yyyy-MM-dd')
    let maxBalance = currentBalance.total
    let maxBalanceDate = format(today, 'yyyy-MM-dd')
    let totalExpectedIncome = 0
    let totalExpectedExpenses = 0

    for (let i = 1; i <= forecastDays; i++) {
      const forecastDate = addDays(today, i)
      const dateStr = format(forecastDate, 'yyyy-MM-dd')
      const dayOfWeek = getDay(forecastDate)
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

      // `serie` copre ogni giorno della finestra `[dal, al]`, e questo loop
      // genera esattamente quella finestra: la voce c'è sempre.
      const punto = serieByDate.get(dateStr)!
      const { source } = incomeByDate.get(dateStr)!

      totalExpectedIncome += punto.entrate
      totalExpectedExpenses += punto.uscite

      // Traccia min/max
      if (punto.saldo < minBalance) {
        minBalance = punto.saldo
        minBalanceDate = dateStr
      }
      if (punto.saldo > maxBalance) {
        maxBalance = punto.saldo
        maxBalanceDate = dateStr
      }

      forecast.push({
        date: dateStr,
        dateFormatted: format(forecastDate, 'EEE d MMM', { locale: it }),
        dayOfWeek: format(forecastDate, 'EEEE', { locale: it }),
        expectedIncome: punto.entrate,
        expectedExpenses: punto.uscite,
        netChange: Math.round((punto.entrate - punto.uscite) * 100) / 100,
        projectedBalance: punto.saldo,
        isWeekend,
        incomeSource: source,
        expenses: speseRicorrentiPerGiorno.get(dateStr) ?? [],
      })
    }

    // 6. Genera alert
    const alerts: ForecastResult['alerts'] = []

    // Alert saldo sotto soglia
    const lowBalanceDays = forecast.filter(
      (d) => d.projectedBalance < lowBalanceThreshold
    )
    if (lowBalanceDays.length > 0) {
      const firstLowDay = lowBalanceDays[0]
      alerts.push({
        type: 'LOW_BALANCE',
        date: firstLowDay.date,
        message: `Saldo previsto sotto soglia (${formatCurrency(
          lowBalanceThreshold
        )}) dal ${dataEstesa(firstLowDay.date)}`,
        severity: 'warning',
      })
    }

    // Alert saldo negativo
    const negativeDays = forecast.filter((d) => d.projectedBalance < 0)
    if (negativeDays.length > 0) {
      const firstNegativeDay = negativeDays[0]
      alerts.push({
        type: 'NEGATIVE_BALANCE',
        date: firstNegativeDay.date,
        message: `Saldo previsto negativo dal ${dataEstesa(firstNegativeDay.date)}`,
        severity: 'critical',
      })
    }

    // Alert giornate con spese elevate
    const highExpenseDays = forecast.filter((d) => d.expectedExpenses > 2000)
    for (const day of highExpenseDays.slice(0, 3)) {
      alerts.push({
        type: 'HIGH_EXPENSE_DAY',
        date: day.date,
        message: `Spese elevate previste il ${dataEstesa(day.date)}: ${formatCurrency(
          day.expectedExpenses
        )}`,
        severity: 'warning',
      })
    }

    // Calcola giorni fino a saldo basso
    const daysUntilLowBalance = lowBalanceDays.length > 0
      ? differenceInDays(new Date(lowBalanceDays[0].date), today)
      : null

    const result: ForecastResult = {
      currentBalance,
      forecast,
      summary: {
        totalExpectedIncome: Math.round(totalExpectedIncome * 100) / 100,
        totalExpectedExpenses: Math.round(totalExpectedExpenses * 100) / 100,
        minBalance: Math.round(minBalance * 100) / 100,
        minBalanceDate,
        maxBalance: Math.round(maxBalance * 100) / 100,
        maxBalanceDate,
        daysUntilLowBalance,
        averageDailyIncome:
          Math.round((totalExpectedIncome / forecastDays) * 100) / 100,
      },
      alerts,
      settings: {
        lowBalanceThreshold,
        forecastDays,
        forecastMethod,
      },
    }

    return NextResponse.json(result)
  } catch (error) {
    logger.error('Errore GET /api/dashboard/forecast', error)
    return NextResponse.json(
      { error: 'Errore nel calcolo della previsione' },
      { status: 500 }
    )
  }
}, { roles: ['admin', 'manager'], venueScoped: true })

/**
 * Il saldo da cui la previsione parte: la liquidità di oggi, letta da
 * `@/lib/saldi` come la card «Saldo Attuale» che le sta accanto sullo schermo.
 *
 * Il conteggio fatto qui prima sbagliava in tre modi insieme: sommava al saldo
 * iniziale dell'anno in corso i movimenti di *tutti* gli anni (contando due
 * volte la storia già chiusa), contava i movimenti nascosti, e contava anche
 * quelli datati nel futuro — cioè le scadenze non ancora pagate, che venivano
 * sottratte dal saldo di oggi e poi ancora dalla previsione dei giorni a venire.
 */
async function calculateCurrentBalance(venueId: string) {
  const saldi = await saldiAlGiorno(venueId)

  return {
    cash: saldi.cashBalance,
    bank: saldi.bankBalance,
    total: saldi.totalAvailable,
  }
}

// Ottieni dati storici per previsione
async function getHistoricalIncomeData(
  venueId: string,
  today: Date,
  forecastDays: number,
  movingAverageDays: number
) {
  // Dati anno scorso (stesso periodo)
  const lastYearStart = subYears(today, 1)
  const lastYearEnd = addDays(subYears(today, 1), forecastDays)

  const lastYearClosures = await prisma.dailyClosure.findMany({
    where: {
      venueId,
      status: 'VALIDATED',
      date: {
        gte: lastYearStart,
        lte: lastYearEnd,
      },
    },
    include: {
      stations: {
        select: { cashAmount: true, posAmount: true },
      },
    },
  })

  // Media mobile ultimi N giorni
  const movingAvgStart = subDays(today, movingAverageDays)
  const recentClosures = await prisma.dailyClosure.findMany({
    where: {
      venueId,
      status: 'VALIDATED',
      date: {
        gte: movingAvgStart,
        lt: today,
      },
    },
    include: {
      stations: {
        select: { cashAmount: true, posAmount: true },
      },
    },
  })

  // Calcola incasso per giorno della settimana (media)
  const dayOfWeekAverages: Record<number, { total: number; count: number }> = {}
  for (let i = 0; i < 7; i++) {
    dayOfWeekAverages[i] = { total: 0, count: 0 }
  }

  for (const closure of recentClosures) {
    const income = closure.stations.reduce(
      (sum, s) =>
        sum + (Number(s.cashAmount) || 0) + (Number(s.posAmount) || 0),
      0
    )
    const dow = getDay(new Date(closure.date))
    dayOfWeekAverages[dow].total += income
    dayOfWeekAverages[dow].count++
  }

  // Mappa storico anno scorso per data
  const historicalByDate: Record<string, number> = {}
  for (const closure of lastYearClosures) {
    const income = closure.stations.reduce(
      (sum, s) =>
        sum + (Number(s.cashAmount) || 0) + (Number(s.posAmount) || 0),
      0
    )
    // Usa mese-giorno come chiave per matching anno corrente
    const monthDay = format(new Date(closure.date), 'MM-dd')
    historicalByDate[monthDay] = income
  }

  return {
    dayOfWeekAverages,
    historicalByDate,
    overallAverage:
      recentClosures.length > 0
        ? recentClosures.reduce(
            (sum, c) =>
              sum +
              c.stations.reduce(
                (s, st) =>
                  s + (Number(st.cashAmount) || 0) + (Number(st.posAmount) || 0),
                0
              ),
            0
          ) / recentClosures.length
        : 0,
  }
}

// Calcola entrate previste per un giorno
function calculateExpectedIncome(
  date: Date,
  historicalData: Awaited<ReturnType<typeof getHistoricalIncomeData>>,
  method: string
): { income: number; source: 'historical' | 'average' | 'hybrid' } {
  const monthDay = format(date, 'MM-dd')
  const dayOfWeek = getDay(date)
  const _isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  const historicalIncome = historicalData.historicalByDate[monthDay]
  const dowData = historicalData.dayOfWeekAverages[dayOfWeek]
  const dowAverage = dowData.count > 0 ? dowData.total / dowData.count : 0

  // Domenica tipicamente chiuso o incasso molto basso
  if (dayOfWeek === 0) {
    return { income: 0, source: 'average' }
  }

  switch (method) {
    case 'HISTORICAL':
      if (historicalIncome !== undefined) {
        return { income: historicalIncome, source: 'historical' }
      }
      return { income: dowAverage || historicalData.overallAverage, source: 'average' }

    case 'MOVING_AVERAGE':
      return { income: dowAverage || historicalData.overallAverage, source: 'average' }

    case 'HYBRID':
    default:
      if (historicalIncome !== undefined && dowAverage > 0) {
        // Media ponderata: 60% storico, 40% media recente
        const hybridIncome = historicalIncome * 0.6 + dowAverage * 0.4
        return { income: hybridIncome, source: 'hybrid' }
      }
      if (historicalIncome !== undefined) {
        return { income: historicalIncome, source: 'historical' }
      }
      return { income: dowAverage || historicalData.overallAverage, source: 'average' }
  }
}
