import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Il contratto di instrumentation.ts è duplice:
 * 1. senza DSN NON deve avvenire alcuna inizializzazione (né errori né log);
 * 2. con il DSN configurato i config di runtime devono essere caricati davvero.
 * Il secondo punto è quello rimasto rotto per mesi: i file sentry.*.config.ts
 * esistevano ma nessuno li importava, quindi Sentry non ha mai visto un errore.
 */

const init = vi.fn()
const captureRequestError = vi.fn()
const getClient = vi.fn<() => object | undefined>()

vi.mock('@sentry/nextjs', () => ({
  init: (...args: unknown[]) => init(...args),
  captureRequestError: (...args: unknown[]) => captureRequestError(...args),
  getClient: () => getClient(),
  replayIntegration: vi.fn(() => ({ name: 'Replay' })),
}))

const DSN = 'https://chiave@o0.ingest.sentry.io/1'

const runtimeIniziale = process.env.NEXT_RUNTIME

async function caricaInstrumentation() {
  // I config di Sentry chiamano init() al momento dell'import: senza reset dei
  // moduli il secondo test vedrebbe la cache del primo e passerebbe per sbaglio.
  vi.resetModules()
  return import('./instrumentation')
}

beforeEach(() => {
  vi.clearAllMocks()
  getClient.mockReturnValue(undefined)
  delete process.env.SENTRY_DSN
  delete process.env.NEXT_PUBLIC_SENTRY_DSN
})

afterEach(() => {
  if (runtimeIniziale === undefined) delete process.env.NEXT_RUNTIME
  else process.env.NEXT_RUNTIME = runtimeIniziale
})

describe('register', () => {
  it('non inizializza Sentry quando nessun DSN è configurato', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'

    const { register } = await caricaInstrumentation()
    await register()

    expect(init).not.toHaveBeenCalled()
  })

  it('inizializza il runtime Node quando SENTRY_DSN è configurato', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'
    process.env.SENTRY_DSN = DSN

    const { register } = await caricaInstrumentation()
    await register()

    expect(init).toHaveBeenCalledTimes(1)
    expect(init.mock.calls[0][0]).toMatchObject({ dsn: DSN })
  })

  it('accetta anche il solo NEXT_PUBLIC_SENTRY_DSN', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'
    process.env.NEXT_PUBLIC_SENTRY_DSN = DSN

    const { register } = await caricaInstrumentation()
    await register()

    expect(init).toHaveBeenCalledTimes(1)
    expect(init.mock.calls[0][0]).toMatchObject({ dsn: DSN })
  })

  it('inizializza il runtime edge quando è quello attivo', async () => {
    process.env.NEXT_RUNTIME = 'edge'
    process.env.SENTRY_DSN = DSN

    const { register } = await caricaInstrumentation()
    await register()

    expect(init).toHaveBeenCalledTimes(1)
    expect(init.mock.calls[0][0]).toMatchObject({ dsn: DSN })
  })

  it('non carica nulla in un runtime che non conosce', async () => {
    process.env.NEXT_RUNTIME = 'deno'
    process.env.SENTRY_DSN = DSN

    const { register } = await caricaInstrumentation()
    await register()

    expect(init).not.toHaveBeenCalled()
  })
})

describe('onRequestError', () => {
  const richiesta = { path: '/api/scadenze', method: 'GET', headers: {} }
  const contesto = { routerKind: 'App Router', routePath: '/api/scadenze', routeType: 'route' } as const

  it('resta inerte se nessun client Sentry è attivo', async () => {
    const { onRequestError } = await caricaInstrumentation()

    expect(() => onRequestError(new Error('crac'), richiesta, contesto)).not.toThrow()
    expect(captureRequestError).not.toHaveBeenCalled()
  })

  it('inoltra a Sentry quando il client è attivo', async () => {
    getClient.mockReturnValue({})
    const errore = new Error('crac')

    const { onRequestError } = await caricaInstrumentation()
    onRequestError(errore, richiesta, contesto)

    expect(captureRequestError).toHaveBeenCalledTimes(1)
    expect(captureRequestError).toHaveBeenCalledWith(errore, richiesta, contesto)
  })
})
