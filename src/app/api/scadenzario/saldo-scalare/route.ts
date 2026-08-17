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

    /**
     * Giorni di storico (≤ 0) e di previsione (> 0) intorno a oggi.
     *
     * La finestra si esprime come «quanto passato» + «quanto futuro» invece
     * che con due date assolute, perché è il modo in cui si ragiona in
     * tesoreria e perché resta valida il giorno dopo senza reimpostarla.
     *
     * Entrambi i valori sono limitati: la serie si costruisce giorno per
     * giorno, quindi una finestra arbitrariamente lunga arrivata dalla query
     * string diventa un ciclo arbitrariamente lungo.
     */
    function intero(valore: string | null, predefinito: number, min: number, max: number): number {
      const n = Number(valore)
      if (valore === null || valore.trim() === '' || !Number.isFinite(n)) return predefinito
      return Math.min(max, Math.max(min, Math.trunc(n)))
    }

    const rangeGiorni = intero(searchParams.get('range'), 90, 1, 365)
    const ancoraGiorni = intero(searchParams.get('da'), 0, -365, 0)
    const includiScaduto = searchParams.get('includiScaduto') === 'true'

    const today = startOfDay(new Date())
    const startDate = addDays(today, ancoraGiorni)
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
      recurrenceId: true,
      stato: true,
    } as const

    /** Marcata come ricorrente esplicitamente, o generata da una `Recurrence`. */
    function eRicorrente(s: { isRicorrente: boolean; recurrenceId: string | null }) {
      return s.isRicorrente || Boolean(s.recurrenceId)
    }

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
    const dal = format(startDate, 'yyyy-MM-dd')
    const al = format(endDate, 'yyyy-MM-dd')
    const serie = await serieProiettata(venueId, dal, al)

    // Group schedules by date, per la quota "ricorrenti" del grafico
    const schedulesByDate = new Map<string, typeof schedulesInRange>()
    for (const s of schedulesInRange) {
      const dateKey = format(new Date(s.dataAttesa ?? s.dataScadenza), 'yyyy-MM-dd')
      if (!schedulesByDate.has(dateKey)) {
        schedulesByDate.set(dateKey, [])
      }
      schedulesByDate.get(dateKey)!.push(s)
    }

    const chartData = serie.map((punto) => {
      const daySchedules = schedulesByDate.get(punto.giorno) ?? []

      // La quota "ricorrenti" del giorno risponde alla stessa domanda di
      // sempre — quanto di questo previsto è un impegno che si ripete — non
      // a quella di `perFonte` (da quale fonte viene il numero). Una
      // scadenza nata da una ricorrenza *è* un impegno che si ripete anche
      // se `proietta` la classifica come `scadenza`, quindi conta qui come
      // prima: dalle scadenze marcate `isRicorrente` o con `recurrenceId`
      // valorizzato. Ci si somma la quota di fonte `ricorrente` — spese
      // ricorrenti e ricorrenze non ancora diventate una scadenza reale —
      // perché anche quella è un impegno che si ripete, solo non ancora
      // scadenzato.
      const usciteRicorrentiDaScadenze = daySchedules
        .filter((s) => s.tipo === 'passiva' && eRicorrente(s))
        .reduce((sum, s) => sum + residuo(s), 0)
      const entrateRicorrentiDaScadenze = daySchedules
        .filter((s) => s.tipo === 'attiva' && eRicorrente(s))
        .reduce((sum, s) => sum + residuo(s), 0)

      const usciteRicorrentiDaFonte = punto.perFonte.ricorrente < 0 ? Math.abs(punto.perFonte.ricorrente) : 0
      const entrateRicorrentiDaFonte = punto.perFonte.ricorrente > 0 ? punto.perFonte.ricorrente : 0

      return {
        date: punto.giorno,
        saldo: punto.saldo,
        uscite: punto.uscite,
        entrate: punto.entrate,
        usciteRicorrenti: Math.round((usciteRicorrentiDaScadenze + usciteRicorrentiDaFonte) * 100) / 100,
        entrateRicorrenti: Math.round((entrateRicorrentiDaScadenze + entrateRicorrentiDaFonte) * 100) / 100,
      }
    })

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
        from: dal,
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
