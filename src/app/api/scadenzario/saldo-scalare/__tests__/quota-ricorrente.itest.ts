import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { addDays, format, startOfDay } from 'date-fns'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { getVenueId } from '@/lib/venue'
import { creaScadenza, creaRicorrenza } from '@/test/integration/fixtures/scadenzario'
import { GET as saldoScalare } from '../route'

/**
 * `usciteRicorrenti`/`entrateRicorrenti` rispondono a «quanto di questo
 * previsto è un impegno che si ripete», non a «da quale fonte viene il
 * numero» — quella è la domanda di `perFonte`, un'altra cosa. Una scadenza
 * nata da una ricorrenza *è* un impegno che si ripete anche se `proietta` la
 * classifica come `scadenza`, quindi va sommata qui come prima del refactor
 * (dalle scadenze `isRicorrente` o con `recurrenceId`), non lasciata sparire
 * solo perché è diventata una scadenza reale.
 */
setupIntegrationDb()

interface ChartPoint {
  date: string
  uscite: number
  entrate: number
  usciteRicorrenti: number
  entrateRicorrenti: number
}

async function saldoScalarePerRange(range = 90) {
  const risposta = await callRoute<{ chartData: ChartPoint[] }>(
    saldoScalare,
    jsonRequest('/api/scadenzario/saldo-scalare', { searchParams: { range: String(range) } })
  )
  expect(risposta.status).toBe(200)
  return risposta.body.chartData
}

describe('GET /api/scadenzario/saldo-scalare, quota ricorrente del giorno', () => {
  it('somma sia le scadenze nate da una ricorrenza sia le spese/ricorrenze non ancora scadenzate', async () => {
    const sessione = await loginAs('admin')
    const venueId = await getVenueId()
    const oggi = startOfDay(new Date())

    // Una scadenza reale generata da una ricorrenza: `proietta` la
    // classifica come `scadenza`, ma resta un impegno che si ripete.
    const ricorrenza = await creaRicorrenza({
      importo: 500,
      tipo: 'passiva',
      // Fuori dalla finestra: non deve generare una propria occorrenza che
      // sporchi il conteggio, qui interessa solo la Schedule già emessa.
      dataFine: addDays(oggi, -1),
    })
    const giornoScadenza = addDays(oggi, 5)
    await creaScadenza({
      venueId,
      importoTotale: 500,
      tipo: 'passiva',
      dataScadenza: giornoScadenza,
      recurrenceId: ricorrenza.id,
    })

    // Una spesa ricorrente senza legame con nessuna ricorrenza (euristica non
    // agganciata): resta fonte `ricorrente` e deve contare comunque.
    await prisma.recurringExpense.create({
      data: {
        venueId,
        name: 'Canone software',
        amount: 90,
        frequency: 'DAILY',
        createdBy: sessione.user.id,
      },
    })

    const chartData = await saldoScalarePerRange(90)

    const puntoScadenza = chartData.find((p) => p.date === format(giornoScadenza, 'yyyy-MM-dd'))
    const puntoAltroGiorno = chartData.find((p) => p.date === format(addDays(oggi, 1), 'yyyy-MM-dd'))

    // Il giorno della scadenza: 500 dalla scadenza nata da ricorrenza + 90
    // dalla spesa giornaliera.
    expect(puntoScadenza?.usciteRicorrenti).toBe(590)
    // Un giorno qualunque senza scadenze: solo la spesa giornaliera.
    expect(puntoAltroGiorno?.usciteRicorrenti).toBe(90)
    // `entrateRicorrenti` non ha nulla da sommare in questo scenario.
    expect(puntoScadenza?.entrateRicorrenti).toBe(0)
  })

  it('una scadenza manuale marcata isRicorrente conta anche senza recurrenceId', async () => {
    const venueId = await getVenueId()
    await loginAs('admin')
    const oggi = startOfDay(new Date())
    const giorno = addDays(oggi, 3)

    await creaScadenza({
      venueId,
      importoTotale: 200,
      tipo: 'attiva',
      dataScadenza: giorno,
    })
    // `creaScadenza` non espone `isRicorrente`: la marco a mano dopo la
    // creazione, per non allargare la fixture oltre quanto serve al test.
    await prisma.schedule.updateMany({
      where: { venueId, tipo: 'attiva' },
      data: { isRicorrente: true },
    })

    const chartData = await saldoScalarePerRange(90)
    const punto = chartData.find((p) => p.date === format(giorno, 'yyyy-MM-dd'))

    expect(punto?.entrateRicorrenti).toBe(200)
  })
})
