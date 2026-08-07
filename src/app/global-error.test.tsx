import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const captureException = vi.fn()

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}))

import GlobalError from './global-error'

describe('GlobalError', () => {
  // Un global-error rimpiazza il documento intero, quindi produce <html> e
  // <body>: è corretto in Next, ma testing-library monta dentro un <div> e
  // React se ne lamenta. Silenziamo solo quel messaggio, non gli altri.
  const consoleError = console.error
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('cannot be a child of')) return
      consoleError(...args)
    })
  })
  afterAll(() => {
    vi.mocked(console.error).mockRestore()
  })

  beforeEach(() => {
    captureException.mockClear()
  })

  it('riporta a Sentry l errore di rendering', () => {
    const errore = Object.assign(new Error('rendering esploso'), { digest: 'abc123' })

    render(<GlobalError error={errore} reset={() => {}} />)

    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(errore)
  })

  it('mostra un messaggio e il pulsante per riprovare', () => {
    const reset = vi.fn()

    render(<GlobalError error={new Error('rendering esploso')} reset={reset} />)

    expect(screen.getByRole('button', { name: /riprova/i })).toBeDefined()
    screen.getByRole('button', { name: /riprova/i }).click()
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
