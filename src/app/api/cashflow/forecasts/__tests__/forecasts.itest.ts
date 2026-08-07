import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { toDateOnlyUtc } from '@/lib/timezone'
import { giornoCorrente, giornoIndietro } from '@/lib/saldi'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { GET as listForecasts, POST as createForecast } from '../route'
import {
  GET as getForecast,
  PATCH as patchForecast,
  DELETE as deleteForecast,
} from '../[id]/route'
import { POST as createLine } from '../[id]/lines/route'
import { DELETE as deleteLine } from '../[id]/lines/[lineId]/route'

/**
 * Il CRUD delle previsioni di cassa.
 *
 * Cinque route scritte a gennaio e mai collegate a un'interfaccia: nessuno le
 * aveva mai percorse per intero, e infatti la sequenza più ovvia — creo una
 * previsione, poi la elimino — falliva con un errore di foreign key.
 * `CashFlowForecastLine` ha `onDelete: Restrict` e la creazione generava una
 * riga per ogni giorno del periodo: il DELETE andava a sbattere sulle righe che
 * aveva creato lui stesso. In più cancellava fisicamente, mentre
 * `CashFlowForecast` è fra i `SOFT_DELETE_MODELS` di `@/lib/prisma`.
 */
setupIntegrationDb()

interface Forecast {
  id: string
  nome: string
  stato: string
  tipo: string
  saldoIniziale: string | number
}

async function creaPrevisione(valori: Record<string, unknown> = {}) {
  const risposta = await callRoute<Forecast>(
    createForecast,
    jsonRequest('/api/cashflow/forecasts', {
      method: 'POST',
      body: {
        nome: 'Previsione di prova',
        dataInizio: '2026-09-01',
        dataFine: '2026-09-30',
        saldoIniziale: 10000,
        ...valori,
      },
    })
  )
  expect(risposta.status).toBe(201)
  return risposta.body
}

describe('CRUD previsioni di cassa', () => {
  it('crea una previsione in stato BOZZA', async () => {
    await loginAs('admin')

    const previsione = await creaPrevisione({ nome: 'Autunno 2026' })

    expect(previsione.nome).toBe('Autunno 2026')
    expect(previsione.stato).toBe('BOZZA')
    expect(previsione.tipo).toBe('BASE')
  })

  // Una previsione appena creata è vuota: le righe le aggiunge chi la compila.
  // Prima ne nascevano una per giorno, tutte a zero e tutte di tipo USCITA —
  // 365 righe fantasma per una previsione annuale, e un elenco illeggibile.
  it('la previsione nasce senza righe', async () => {
    await loginAs('admin')

    const previsione = await creaPrevisione()

    const righe = await prisma.cashFlowForecastLine.count({
      where: { forecastId: previsione.id },
    })
    expect(righe).toBe(0)
  })

  // Senza saldo di partenza la previsione nasceva da zero euro, cioè da una
  // cifra che non è mai stata vera: il punto di partenza è la liquidità di
  // oggi, la stessa che la card "Saldo Attuale" prende da `@/lib/saldi`.
  it('senza saldo iniziale parte dalla liquidità reale', async () => {
    await loginAs('admin')
    const venue = await venueDiTest()
    await prisma.journalEntry.create({
      data: {
        venueId: venue.id,
        date: toDateOnlyUtc(giornoIndietro(giornoCorrente(), 5)),
        registerType: 'BANK',
        description: 'Incasso',
        debitAmount: 4200,
      },
    })

    const previsione = await creaPrevisione({ saldoIniziale: undefined })

    expect(Number(previsione.saldoIniziale)).toBe(4200)
  })

  it('elenca le previsioni della sede', async () => {
    await loginAs('admin')
    await creaPrevisione({ nome: 'Prima' })
    await creaPrevisione({ nome: 'Seconda' })

    const risposta = await callRoute<{ data: Forecast[]; pagination: { total: number } }>(
      listForecasts,
      jsonRequest('/api/cashflow/forecasts')
    )

    expect(risposta.status).toBe(200)
    expect(risposta.body.pagination.total).toBe(2)
    expect(risposta.body.data.map((f) => f.nome).sort()).toEqual(['Prima', 'Seconda'])
  })

  it('aggiorna nome e stato di una previsione', async () => {
    await loginAs('admin')
    const previsione = await creaPrevisione()

    const risposta = await callRoute<Forecast>(
      patchForecast,
      jsonRequest(`/api/cashflow/forecasts/${previsione.id}`, {
        method: 'PATCH',
        body: { nome: 'Rinominata', stato: 'ATTIVA' },
      }),
      { id: previsione.id }
    )

    expect(risposta.status).toBe(200)
    expect(risposta.body.nome).toBe('Rinominata')
    expect(risposta.body.stato).toBe('ATTIVA')
  })

  // Il caso che nessuno aveva mai percorso: una previsione con delle righe,
  // cioè l'unica che valga la pena di creare, non si riusciva a eliminare.
  it('elimina una previsione che ha delle righe', async () => {
    await loginAs('admin')
    const previsione = await creaPrevisione()

    await callRoute(
      createLine,
      jsonRequest(`/api/cashflow/forecasts/${previsione.id}/lines`, {
        method: 'POST',
        body: { data: '2026-09-10', tipo: 'USCITA', importo: 500, descrizione: 'Affitto' },
      }),
      { id: previsione.id }
    )

    const risposta = await callRoute(
      deleteForecast,
      jsonRequest(`/api/cashflow/forecasts/${previsione.id}`, { method: 'DELETE' }),
      { id: previsione.id }
    )

    expect(risposta.status).toBe(200)

    // Cancellazione logica, come per ogni modello in `SOFT_DELETE_MODELS`: la
    // riga resta sul database con `deletedAt` valorizzato e sparisce da sola
    // dalle letture, righe collegate comprese.
    const elenco = await callRoute<{ data: Forecast[]; pagination: { total: number } }>(
      listForecasts,
      jsonRequest('/api/cashflow/forecasts')
    )
    expect(elenco.body.pagination.total).toBe(0)

    const dettaglio = await callRoute(
      getForecast,
      jsonRequest(`/api/cashflow/forecasts/${previsione.id}`),
      { id: previsione.id }
    )
    expect(dettaglio.status).toBe(404)

    const rimasta = await prisma.cashFlowForecast.findUnique({ where: { id: previsione.id } })
    expect(rimasta?.deletedAt).toBeInstanceOf(Date)
  })

  it('una previsione eliminata non si può più modificare', async () => {
    await loginAs('admin')
    const previsione = await creaPrevisione()
    await callRoute(
      deleteForecast,
      jsonRequest(`/api/cashflow/forecasts/${previsione.id}`, { method: 'DELETE' }),
      { id: previsione.id }
    )

    const risposta = await callRoute(
      patchForecast,
      jsonRequest(`/api/cashflow/forecasts/${previsione.id}`, {
        method: 'PATCH',
        body: { nome: 'Risorta' },
      }),
      { id: previsione.id }
    )

    expect(risposta.status).toBe(404)
  })

  it('rifiuta di eliminare una previsione attiva', async () => {
    await loginAs('admin')
    const previsione = await creaPrevisione()
    await prisma.cashFlowForecast.update({
      where: { id: previsione.id },
      data: { stato: 'ATTIVA' },
    })

    const risposta = await callRoute<{ error: string }>(
      deleteForecast,
      jsonRequest(`/api/cashflow/forecasts/${previsione.id}`, { method: 'DELETE' }),
      { id: previsione.id }
    )

    expect(risposta.status).toBe(400)
    expect(await prisma.cashFlowForecast.count()).toBe(1)
  })

  it('il dettaglio riporta totali e saldo progressivo delle righe', async () => {
    await loginAs('admin')
    const previsione = await creaPrevisione({ saldoIniziale: 1000 })

    for (const riga of [
      { data: '2026-09-05', tipo: 'ENTRATA', importo: 300 },
      { data: '2026-09-10', tipo: 'USCITA', importo: 500 },
    ]) {
      await callRoute(
        createLine,
        jsonRequest(`/api/cashflow/forecasts/${previsione.id}/lines`, {
          method: 'POST',
          body: riga,
        }),
        { id: previsione.id }
      )
    }

    const risposta = await callRoute<{
      lines: { saldoProgressivo: number }[]
      summary: { totaleEntrate: number; totaleUscite: number; saldoFinale: number }
    }>(getForecast, jsonRequest(`/api/cashflow/forecasts/${previsione.id}`), { id: previsione.id })

    expect(risposta.status).toBe(200)
    expect(risposta.body.summary.totaleEntrate).toBe(300)
    expect(risposta.body.summary.totaleUscite).toBe(500)
    expect(risposta.body.summary.saldoFinale).toBe(800)
    expect(risposta.body.lines.map((l) => l.saldoProgressivo)).toEqual([1300, 800])
  })

  it('elimina una singola riga', async () => {
    await loginAs('admin')
    const previsione = await creaPrevisione()
    const creata = await callRoute<{ id: string }>(
      createLine,
      jsonRequest(`/api/cashflow/forecasts/${previsione.id}/lines`, {
        method: 'POST',
        body: { data: '2026-09-10', tipo: 'USCITA', importo: 500 },
      }),
      { id: previsione.id }
    )

    const risposta = await callRoute(
      deleteLine,
      jsonRequest(`/api/cashflow/forecasts/${previsione.id}/lines/${creata.body.id}`, {
        method: 'DELETE',
      }),
      { id: previsione.id, lineId: creata.body.id }
    )

    expect(risposta.status).toBe(200)
    expect(await prisma.cashFlowForecastLine.count()).toBe(0)
  })

  // Le route delle righe lavoravano sul solo `lineId`: bastava conoscerlo per
  // agire su una riga appartenente a un'altra previsione.
  it("non elimina una riga passando l'identificativo di un'altra previsione", async () => {
    await loginAs('admin')
    const mia = await creaPrevisione({ nome: 'Mia' })
    const altrui = await creaPrevisione({ nome: 'Altrui' })

    const riga = await callRoute<{ id: string }>(
      createLine,
      jsonRequest(`/api/cashflow/forecasts/${altrui.id}/lines`, {
        method: 'POST',
        body: { data: '2026-09-10', tipo: 'USCITA', importo: 500 },
      }),
      { id: altrui.id }
    )

    const risposta = await callRoute(
      deleteLine,
      jsonRequest(`/api/cashflow/forecasts/${mia.id}/lines/${riga.body.id}`, { method: 'DELETE' }),
      { id: mia.id, lineId: riga.body.id }
    )

    expect(risposta.status).toBe(404)
    expect(await prisma.cashFlowForecastLine.count()).toBe(1)
  })

  it('eliminare una riga inesistente risponde 404, non 500', async () => {
    await loginAs('admin')
    const previsione = await creaPrevisione()

    const risposta = await callRoute(
      deleteLine,
      jsonRequest(`/api/cashflow/forecasts/${previsione.id}/lines/inesistente`, {
        method: 'DELETE',
      }),
      { id: previsione.id, lineId: 'inesistente' }
    )

    expect(risposta.status).toBe(404)
  })

  it('senza sessione risponde 401', async () => {
    const risposta = await callRoute(listForecasts, jsonRequest('/api/cashflow/forecasts'))

    expect(risposta.status).toBe(401)
  })

  it('allo staff risponde 403', async () => {
    await loginAs('staff')

    const risposta = await callRoute(listForecasts, jsonRequest('/api/cashflow/forecasts'))

    expect(risposta.status).toBe(403)
  })
})
