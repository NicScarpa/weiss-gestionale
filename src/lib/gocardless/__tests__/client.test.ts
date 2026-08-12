import { describe, it, expect, vi } from 'vitest'
import { creaClient } from '../client'
import { ErroreGoCardless, LimiteRaggiunto } from '../errori'
import contoA from './fixtures/movimenti-conto-a.json'
import saldi from './fixtures/saldi-conto.json'

/** Risposta finta con corpo JSON e header a piacere. */
function risposta(corpo: unknown, stato = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(corpo), { status: stato, headers })
}

const TOKEN = { access: 'finto-access', access_expires: 86400, refresh: 'finto-refresh', refresh_expires: 2592000 }

/** Un `fetch` finto che risponde in sequenza e registra le chiamate. */
function fetchFinto(...risposte: Response[]) {
  const chiamate: { url: string; init?: RequestInit }[] = []
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chiamate.push({ url: String(url), init })
    const prossima = risposte.shift()
    if (!prossima) throw new Error('fetch finto: chiamate più del previsto')
    return prossima
  })
  return { impl: impl as unknown as typeof fetch, chiamate }
}

const CREDENZIALI = { secretId: 'id-finto', secretKey: 'chiave-finta' }
const senzaAttesa = async () => {}

describe('client GoCardless', () => {
  it('chiede il token una volta sola e lo riusa per le chiamate successive', async () => {
    const { impl, chiamate } = fetchFinto(
      risposta(TOKEN),
      risposta(saldi),
      risposta(saldi)
    )
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    await c.saldiConto('conto-1')
    await c.saldiConto('conto-1')

    expect(chiamate).toHaveLength(3)
    expect(chiamate[0].url).toContain('/token/new/')
    expect(chiamate[1].url).toContain('/accounts/conto-1/balances/')
    expect(chiamate[2].url).toContain('/accounts/conto-1/balances/')
  })

  it('manda il token come Bearer e non manda mai le credenziali oltre il token', async () => {
    const { impl, chiamate } = fetchFinto(risposta(TOKEN), risposta(saldi))
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    await c.saldiConto('conto-1')

    const intestazioni = chiamate[1].init?.headers as Record<string, string>
    expect(intestazioni.authorization).toBe('Bearer finto-access')
    expect(JSON.stringify(chiamate[1])).not.toContain('chiave-finta')
  })

  it('valida la risposta con lo schema e restituisce i dati tipizzati', async () => {
    const { impl } = fetchFinto(risposta(TOKEN), risposta(contoA))
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    const esito = await c.movimentiConto('conto-1')

    expect(esito.dati.transactions.booked).toHaveLength(6)
  })

  it('estrae i limiti dagli header, che sono la fonte di verità sul contingente', async () => {
    const { impl } = fetchFinto(
      risposta(TOKEN),
      risposta(contoA, 200, {
        'http_x_ratelimit_account_success_remaining': '2',
        'http_x_ratelimit_account_success_reset': '86395',
      })
    )
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    const esito = await c.movimentiConto('conto-1')

    expect(esito.limiti.restanti).toBe(2)
    expect(esito.limiti.ripresaFraSecondi).toBe(86395)
  })

  it('riprova due volte su un 503 e poi riesce', async () => {
    const { impl, chiamate } = fetchFinto(
      risposta(TOKEN),
      risposta({ detail: 'guasto' }, 503),
      risposta({ detail: 'guasto' }, 503),
      risposta(saldi)
    )
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    const esito = await c.saldiConto('conto-1')

    expect(esito.dati.balances).toHaveLength(2)
    expect(chiamate).toHaveLength(4)
  })

  it('si arrende dopo i tentativi previsti e lancia ErroreGoCardless', async () => {
    const { impl, chiamate } = fetchFinto(
      risposta(TOKEN),
      risposta({ detail: 'guasto' }, 503),
      risposta({ detail: 'guasto' }, 503),
      risposta({ detail: 'guasto' }, 503)
    )
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    await expect(c.saldiConto('conto-1')).rejects.toBeInstanceOf(ErroreGoCardless)
    // Il tipo dell'errore da solo non basta: se RITENTATIVI salisse, il
    // fetch finto esaurito verrebbe comunque incapsulato in un
    // ErroreGoCardless (è il ramo dell'errore di rete) e il test resterebbe
    // verde. Il budget dei tentativi si controlla contando le chiamate: 1 sul
    // token più 3 sui dati (RITENTATIVI = 2, cioè il primo tentativo più 2
    // extra).
    expect(chiamate).toHaveLength(4)
  })

  // Il limite della banca è giornaliero: ritentare non lo sblocca e consuma
  // le chiamate che restano.
  it('NON riprova su un 429 e lancia LimiteRaggiunto con i secondi alla ripresa', async () => {
    const { impl, chiamate } = fetchFinto(
      risposta(TOKEN),
      risposta({ detail: 'limite giornaliero' }, 429, {
        'http_x_ratelimit_account_success_reset': '3600',
      })
    )
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    const errore = await c.movimentiConto('conto-1').catch((e) => e)

    expect(errore).toBeInstanceOf(LimiteRaggiunto)
    expect(errore.secondiAllaRipresa).toBe(3600)
    expect(chiamate).toHaveLength(2)
  })

  it('non riprova su un 400: una richiesta sbagliata resta sbagliata', async () => {
    const { impl, chiamate } = fetchFinto(
      risposta(TOKEN),
      risposta({ detail: 'conto inesistente' }, 400)
    )
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    await expect(c.saldiConto('conto-1')).rejects.toBeInstanceOf(ErroreGoCardless)
    expect(chiamate).toHaveLength(2)
  })

  it('passa date_from e date_to quando richiesti', async () => {
    const { impl, chiamate } = fetchFinto(risposta(TOKEN), risposta(contoA))
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    await c.movimentiConto('conto-1', { da: '2026-05-01', a: '2026-08-01' })

    expect(chiamate[1].url).toContain('date_from=2026-05-01')
    expect(chiamate[1].url).toContain('date_to=2026-08-01')
  })

  it('riprova su un errore di rete (fetch che rigetta), non solo su un 5xx', async () => {
    const chiamate: string[] = []
    let numero = 0
    const impl = vi.fn(async (url: string | URL | Request) => {
      chiamate.push(String(url))
      numero++
      if (numero === 1) return risposta(TOKEN)
      if (numero === 2) throw new TypeError('fetch failed')
      return risposta(saldi)
    }) as unknown as typeof fetch
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    const esito = await c.saldiConto('conto-1')

    expect(esito.dati.balances).toHaveLength(2)
    expect(chiamate).toHaveLength(3)
  })

  it('il backoff cresce a ogni tentativo (prima 500ms, poi 1000ms)', async () => {
    const { impl } = fetchFinto(
      risposta(TOKEN),
      risposta({ detail: 'guasto' }, 503),
      risposta({ detail: 'guasto' }, 503),
      risposta(saldi)
    )
    const attese: number[] = []
    const attesaSpia = async (ms: number) => {
      attese.push(ms)
    }
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: attesaSpia })

    await c.saldiConto('conto-1')

    expect(attese).toEqual([500, 1000])
  })

  it('un 429 sul rinnovo del token lancia LimiteRaggiunto, non un ErroreGoCardless generico', async () => {
    const { impl, chiamate } = fetchFinto(
      risposta({ detail: 'limite sul token' }, 429, {
        'http_x_ratelimit_account_success_reset': '120',
      })
    )
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    const errore = await c.saldiConto('conto-1').catch((e) => e)

    expect(errore).toBeInstanceOf(LimiteRaggiunto)
    // Nemmeno sul token il 429 va ritentato: una sola chiamata, subito l'errore.
    expect(chiamate).toHaveLength(1)
  })

  it('riprova sul rinnovo del token quando risponde 5xx, poi procede con la chiamata dati', async () => {
    const { impl, chiamate } = fetchFinto(
      risposta({ detail: 'guasto' }, 503),
      risposta({ detail: 'guasto' }, 503),
      risposta(TOKEN),
      risposta(saldi)
    )
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    const esito = await c.saldiConto('conto-1')

    expect(esito.dati.balances).toHaveLength(2)
    expect(chiamate).toHaveLength(4)
    expect(chiamate[0].url).toContain('/token/new/')
    expect(chiamate[1].url).toContain('/token/new/')
    expect(chiamate[2].url).toContain('/token/new/')
    expect(chiamate[3].url).toContain('/accounts/conto-1/balances/')
  })

  it('su un 401 sulla chiamata dati scarta il token in cache e riprova una sola volta con uno nuovo', async () => {
    const TOKEN_NUOVO = { ...TOKEN, access: 'nuovo-access' }
    const { impl, chiamate } = fetchFinto(
      risposta(TOKEN),
      risposta({ detail: 'token rifiutato dal server' }, 401),
      risposta(TOKEN_NUOVO),
      risposta(saldi)
    )
    const c = creaClient({ ...CREDENZIALI, fetchImpl: impl, attesa: senzaAttesa })

    const esito = await c.saldiConto('conto-1')

    expect(esito.dati.balances).toHaveLength(2)
    expect(chiamate).toHaveLength(4)
    const intestazioniSecondaChiamataDati = chiamate[3].init?.headers as Record<string, string>
    expect(intestazioniSecondaChiamataDati.authorization).toBe('Bearer nuovo-access')
  })
})
