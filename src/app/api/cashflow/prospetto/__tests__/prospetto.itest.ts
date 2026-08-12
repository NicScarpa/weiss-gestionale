import { describe, it, expect } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import type { Prospetto } from '@/lib/cashflow/prospetto'
import type { EsitoControllo } from '@/lib/cashflow/controlli'
import { GET as prospetto } from '../route'

setupIntegrationDb()

interface Risposta {
  prospetto: Prospetto
  controlli: EsitoControllo[]
}

function richiesta(anno = '2026') {
  return jsonRequest(`/api/cashflow/prospetto?anno=${anno}`)
}

describe('GET /api/cashflow/prospetto', () => {
  it('impedisce a uno staff di leggere il prospetto', async () => {
    await entraCome('staff')

    const { status } = await callRoute(prospetto, richiesta())

    expect(status).toBe(403)
  })

  it('lo consente a un manager, con prospetto e controlli', async () => {
    await entraCome('manager')

    const { status, body } = await callRoute<Risposta>(prospetto, richiesta())

    expect(status).toBe(200)
    expect(body.prospetto.anno).toBe(2026)
    // 203 righe: 9 famiglie + 39 sottogruppi + 149 voci + 3 totali + 3 memo
    expect(body.prospetto.righe).toHaveLength(203)
    expect(body.controlli.map((c) => c.codice)).toEqual([
      'C1', 'C2', 'C3', 'C4',
    ])
  })

  it("anno non numerico: risponde 400 invece di produrre un prospetto vuoto", async () => {
    await entraCome('admin')

    const { status } = await callRoute(prospetto, richiesta('duemilaventisei'))
    expect(status).toBe(400)
  })
})
