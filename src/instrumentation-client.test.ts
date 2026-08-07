import { beforeEach, describe, expect, it, vi } from 'vitest'

const init = vi.fn()
const captureRouterTransitionStart = vi.fn()

vi.mock('@sentry/nextjs', () => ({
  init: (...args: unknown[]) => init(...args),
  captureRouterTransitionStart: (...args: unknown[]) => captureRouterTransitionStart(...args),
  replayIntegration: vi.fn(() => ({ name: 'Replay' })),
}))

const DSN = 'https://chiave@o0.ingest.sentry.io/1'

async function caricaClient() {
  vi.resetModules()
  return import('./instrumentation-client')
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.NEXT_PUBLIC_SENTRY_DSN
})

describe('instrumentation client', () => {
  it('non inizializza Sentry senza DSN pubblico', async () => {
    await caricaClient()

    expect(init).not.toHaveBeenCalled()
  })

  it('inizializza Sentry quando il DSN pubblico è configurato', async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = DSN

    await caricaClient()

    expect(init).toHaveBeenCalledTimes(1)
    expect(init.mock.calls[0][0]).toMatchObject({ dsn: DSN })
  })

  it('espone onRouterTransitionStart, richiesto dall App Router', async () => {
    const modulo = await caricaClient()

    expect(typeof modulo.onRouterTransitionStart).toBe('function')
  })

  it('non invia PII per default', async () => {
    const { opzioniSentryClient } = await caricaClient()

    expect(opzioniSentryClient(DSN).sendDefaultPii).toBe(false)
  })
})
