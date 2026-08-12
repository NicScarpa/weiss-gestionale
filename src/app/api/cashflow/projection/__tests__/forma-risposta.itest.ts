import { describe, it, expect } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaMovimento } from '@/test/integration/fixtures/scadenzario'
import { GET as proiezione } from '../route'
import type { PuntoProiezione } from '../route'

/**
 * La rotta consuma `serieProiettata`, che parla un'altra lingua: `giorno`,
 * `entrate`, `uscite`. `CashFlowChart` si aspetta `data`, `entrata`, `uscita`
 * (singolare) — un disallineamento silenzioso, perché nessun tipo lega la
 * risposta HTTP al componente: il grafico riceverebbe punti con chiavi
 * sconosciute e disegnerebbe un'area vuota, senza che nulla lanci un errore.
 * Questo test fissa i nomi dei campi della risposta.
 */
setupIntegrationDb()

describe('GET /api/cashflow/projection, forma della risposta', () => {
  it('risponde con i campi che CashFlowChart si aspetta, non quelli di PuntoSerie', async () => {
    await loginAs('admin')
    await creaMovimento({ entrata: 500, date: new Date('2026-09-05') })

    const risposta = await callRoute<PuntoProiezione[]>(
      proiezione,
      jsonRequest('/api/cashflow/projection', {
        searchParams: { from: '2026-09-01', days: '10' },
      })
    )

    expect(risposta.status).toBe(200)
    expect(risposta.body.length).toBeGreaterThan(0)

    for (const punto of risposta.body) {
      expect(Object.keys(punto).sort()).toEqual(['data', 'entrata', 'saldo', 'uscita'])
    }

    const giornoMovimento = risposta.body.find((p) => p.data === '2026-09-05')
    expect(giornoMovimento?.entrata).toBe(500)
    expect(giornoMovimento?.uscita).toBe(0)
  })
})
