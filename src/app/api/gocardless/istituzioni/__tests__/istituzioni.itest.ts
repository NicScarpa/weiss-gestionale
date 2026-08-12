import { describe, it, expect, afterEach } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { impostaClientPerTest } from '@/lib/gocardless/servizio'
import type { ClientGoCardless } from '@/lib/gocardless/client'
import { ErroreGoCardless, LimiteRaggiunto } from '@/lib/gocardless/errori'
import { GET as elencoIstituzioni } from '../route'

setupIntegrationDb()

/** Un client finto: nessuna rete, risposte decise dal test. */
function clientFinto(istituzioni: unknown[]): ClientGoCardless {
  return {
    istituzioni: async () => ({ dati: istituzioni, limiti: { restanti: null, ripresaFraSecondi: null } }),
    dettagliConto: async () => { throw new Error('non previsto in questo test') },
    saldiConto: async () => { throw new Error('non previsto in questo test') },
    movimentiConto: async () => { throw new Error('non previsto in questo test') },
  } as unknown as ClientGoCardless
}

afterEach(() => impostaClientPerTest(null))

describe('GET /api/gocardless/istituzioni', () => {
  it('restituisce le banche con i due numeri che contano', async () => {
    await entraCome('admin')
    impostaClientPerTest(
      clientFinto([
        { id: 'BANCA_FINTA_XXXX', name: 'Banca Finta', bic: 'XXXXITRR', transaction_total_days: '90', max_access_valid_for_days: '180' },
      ])
    )

    const esito = await callRoute(elencoIstituzioni, jsonRequest('http://localhost/api/gocardless/istituzioni?paese=it'))

    expect(esito.status).toBe(200)
    expect(esito.body).toEqual({
      istituzioni: [
        { id: 'BANCA_FINTA_XXXX', nome: 'Banca Finta', bic: 'XXXXITRR', giorniStorico: 90, giorniAccesso: 180 },
      ],
    })
  })

  it('respinge chi non è amministratore', async () => {
    await entraCome('staff')
    impostaClientPerTest(clientFinto([]))

    const esito = await callRoute(elencoIstituzioni, jsonRequest('http://localhost/api/gocardless/istituzioni?paese=it'))

    expect(esito.status).toBe(403)
  })

  it('respinge chi non ha fatto accesso', async () => {
    logout()
    const esito = await callRoute(elencoIstituzioni, jsonRequest('http://localhost/api/gocardless/istituzioni?paese=it'))
    expect(esito.status).toBe(401)
  })

  // I giorni arrivano dall'API come stringa o come numero a seconda del campo:
  // chi legge la risposta non deve doversene accorgere.
  it('normalizza i giorni a numero anche quando la banca li manda come stringa', async () => {
    await entraCome('admin')
    impostaClientPerTest(
      clientFinto([{ id: 'X', name: 'X', transaction_total_days: 365, max_access_valid_for_days: '90' }])
    )

    const esito = await callRoute<{ istituzioni: Array<{ giorniStorico: number; giorniAccesso: number }> }>(
      elencoIstituzioni,
      jsonRequest('http://localhost/api/gocardless/istituzioni?paese=it')
    )

    expect(esito.body.istituzioni[0]).toMatchObject({ giorniStorico: 365, giorniAccesso: 90 })
  })

  it('senza paese usa l Italia', async () => {
    await entraCome('admin')
    let paeseChiesto: string | undefined
    const finto = {
      istituzioni: async (paese: string) => {
        paeseChiesto = paese
        return { dati: [], limiti: { restanti: null, ripresaFraSecondi: null } }
      },
    } as unknown as ClientGoCardless
    impostaClientPerTest(finto)

    await callRoute(elencoIstituzioni, jsonRequest('http://localhost/api/gocardless/istituzioni'))

    expect(paeseChiesto).toBe('it')
  })

  // Il contingente della banca è di 4 chiamate al giorno per conto e per
  // endpoint: sapere quando si riapre vale più che sapere che è chiuso.
  it('risponde 429 con i secondi alla ripresa quando il contingente è esaurito', async () => {
    await entraCome('admin')
    const finto = {
      istituzioni: async () => {
        throw new LimiteRaggiunto('limite raggiunto', null, 3600)
      },
    } as unknown as ClientGoCardless
    impostaClientPerTest(finto)

    const esito = await callRoute<{ secondiAllaRipresa: number | null }>(
      elencoIstituzioni,
      jsonRequest('http://localhost/api/gocardless/istituzioni?paese=it')
    )

    expect(esito.status).toBe(429)
    expect(esito.body.secondiAllaRipresa).toBe(3600)
  })

  it('risponde 502 quando la banca risponde con un errore, senza far trapelare il corpo grezzo', async () => {
    await entraCome('admin')
    const finto = {
      istituzioni: async () => {
        throw new ErroreGoCardless('errore banca', 400, { dettaglio: 'informazione interna della banca' })
      },
    } as unknown as ClientGoCardless
    impostaClientPerTest(finto)

    const esito = await callRoute(
      elencoIstituzioni,
      jsonRequest('http://localhost/api/gocardless/istituzioni?paese=it')
    )

    expect(esito.status).toBe(502)
    expect(JSON.stringify(esito.body)).not.toContain('informazione interna della banca')
  })
})
