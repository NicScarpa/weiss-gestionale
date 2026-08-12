import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { addDays, startOfDay, format } from 'date-fns'
import { getVenueId } from '@/lib/venue'
import { serieProiettata } from '@/lib/previsionale/leggi'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function residuo(s: { importoTotale: any; importoPagato: any }) {
  return Number(s.importoTotale) - Number(s.importoPagato)
}

// GET /api/scadenzario/saldo-scalare - Calcola saldo scalare
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const rangeGiorni = parseInt(searchParams.get('range') || '90')
    const includiScaduto = searchParams.get('includiScaduto') === 'true'

    const today = startOfDay(new Date())
    const endDate = addDays(today, rangeGiorni)

    const venueId = await getVenueId()
    const venueFilter = { venueId }

    const selectFields = {
      id: true,
      tipo: true,
      importoTotale: true,
      importoPagato: true,
      dataScadenza: true,
      dataAttesa: true,
      isRicorrente: true,
      stato: true,
    } as const

    // Il previsionale lavora sulla data attesa di cassa, non su quella
    // contrattuale (modello Sibill). dataAttesa null = coincide con
    // dataScadenza, da cui il fallback nelle due condizioni
    const finestraFutura = { gte: today, lte: endDate }

    // Future schedules (within range, not cancelled)
    const schedulesInRange = await prisma.schedule.findMany({
      where: {
        ...venueFilter,
        stato: { not: 'annullata' },
        OR: [
          { dataAttesa: finestraFutura },
          { dataAttesa: null, dataScadenza: finestraFutura },
        ],
      },
      select: selectFields,
      orderBy: { dataScadenza: 'asc' },
    })

    // Overdue schedules (before today, not paid/cancelled)
    const overdueSchedules = await prisma.schedule.findMany({
      where: {
        ...venueFilter,
        stato: { notIn: ['annullata', 'pagata'] },
        OR: [
          { dataAttesa: { lt: today } },
          { dataAttesa: null, dataScadenza: { lt: today } },
        ],
      },
      select: selectFields,
    })

    // Overdue totals
    const scadutoDaPagare = overdueSchedules
      .filter(s => s.tipo === 'passiva')
      .reduce((sum, s) => sum + residuo(s), 0)

    const scadutoDaIncassare = overdueSchedules
      .filter(s => s.tipo === 'attiva')
      .reduce((sum, s) => sum + residuo(s), 0)

    // Future totals
    const pagamentiTotale = schedulesInRange
      .filter(s => s.tipo === 'passiva')
      .reduce((sum, s) => sum + residuo(s), 0)

    const pagamentiRicorrenti = schedulesInRange
      .filter(s => s.tipo === 'passiva' && s.isRicorrente)
      .reduce((sum, s) => sum + residuo(s), 0)

    const incassiTotale = schedulesInRange
      .filter(s => s.tipo === 'attiva')
      .reduce((sum, s) => sum + residuo(s), 0)

    const incassiRicorrenti = schedulesInRange
      .filter(s => s.tipo === 'attiva' && s.isRicorrente)
      .reduce((sum, s) => sum + residuo(s), 0)

    // Saldo oggi: net position considering overdue + future
    const saldoOggi = incassiTotale + scadutoDaIncassare - pagamentiTotale - scadutoDaPagare

    // Il grafico viene dal previsionale unico (Task 4): parte dal saldo reale
    // di cassa e banca, non da `saldoOggi`, che è un netto sintetico usato
    // solo per il pannello "scaduto" qui sotto. Le due grandezze rispondono a
    // domande diverse e non vanno confuse.
    const dal = format(today, 'yyyy-MM-dd')
    const al = format(endDate, 'yyyy-MM-dd')
    const serie = await serieProiettata(venueId, dal, al)

    const chartData = serie.map((punto) => ({
      date: punto.giorno,
      saldo: punto.saldo,
      uscite: punto.uscite,
      entrate: punto.entrate,
      // Non esiste più un flag `isRicorrente` da sommare: la quota
      // "ricorrente" del giorno è ciò che viene dalla fonte omonima di
      // `proietta` — una spesa o un incasso proiettato che non ha ancora una
      // scadenza reale a coprirlo. Una scadenza nata da una ricorrenza pesa
      // già come `scadenza`, non compare qui: non è più solo una stima.
      usciteRicorrenti: punto.perFonte.ricorrente < 0 ? Math.abs(punto.perFonte.ricorrente) : 0,
      entrateRicorrenti: punto.perFonte.ricorrente > 0 ? punto.perFonte.ricorrente : 0,
    }))

    const saldoFinale = chartData.length > 0 ? chartData[chartData.length - 1].saldo : saldoOggi

    return NextResponse.json({
      saldoOggi: Math.round(saldoOggi * 100) / 100,
      pagamenti: {
        totale: Math.round(pagamentiTotale * 100) / 100,
        ricorrenti: Math.round(pagamentiRicorrenti * 100) / 100,
      },
      incassi: {
        totale: Math.round(incassiTotale * 100) / 100,
        ricorrenti: Math.round(incassiRicorrenti * 100) / 100,
      },
      saldoFinale: Math.round(saldoFinale * 100) / 100,
      scaduto: {
        daPagare: Math.round(scadutoDaPagare * 100) / 100,
        daIncassare: Math.round(scadutoDaIncassare * 100) / 100,
        saldoFinaleIncluso: Math.round((saldoFinale - scadutoDaPagare + scadutoDaIncassare) * 100) / 100,
      },
      chartData,
      range: {
        from: format(today, 'yyyy-MM-dd'),
        to: format(endDate, 'yyyy-MM-dd'),
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/saldo-scalare', error)
    return NextResponse.json(
      { error: 'Errore nel calcolo del saldo scalare' },
      { status: 500 }
    )
  }
}
