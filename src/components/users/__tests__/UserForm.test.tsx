import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'

import { UserForm } from '../UserForm'

/**
 * Il modulo utente: la tendina «Sede».
 *
 * Leggeva `venuesData.data`, mentre `GET /api/venues` risponde
 * `{ venues: [...] }`: l'elenco restava vuoto e l'unica voce selezionabile era
 * «Nessuna sede», quindi nessun utente poteva essere assegnato al locale.
 * È il gemello rovesciato del difetto di `/staff/nuovo`, dove invece si
 * leggeva `.roles` da una rotta che risponde `{ data }`.
 */

/** API DOM che Radix usa e jsdom non implementa. */
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: 'admin' } }, status: 'authenticated' }),
}))

const SEDI = [{ id: 'sede-1', name: 'Weiss Cafè', code: 'WEISS' }]

beforeEach(() => {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/venues')) {
      return { ok: true, json: async () => ({ venues: SEDI }) } as Response
    }
    if (url.startsWith('/api/roles')) {
      return { ok: true, json: async () => ({ data: [] }) } as Response
    }
    throw new Error(`Richiesta non prevista nel test: ${url}`)
  }) as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function tendina(testo: string): HTMLElement {
  const trigger = Array.from(
    document.querySelectorAll<HTMLElement>('[role="combobox"]')
  ).find((b) => b.textContent?.includes(testo))
  if (!trigger) throw new Error(`Tendina «${testo}» non trovata`)
  return trigger
}

function vociAperte(): string[] {
  return Array.from(document.querySelectorAll('[role="option"]')).map(
    (o) => o.textContent?.trim() ?? ''
  )
}

describe('UserForm - tendina Sede', () => {
  it('elenca le sedi restituite da /api/venues', async () => {
    await act(async () => {
      render(
        <UserForm mode="create" onSubmit={async () => {}} onCancel={() => {}} />
      )
    })

    await act(async () => {
      fireEvent.pointerDown(tendina('Nessuna sede'), {
        button: 0,
        ctrlKey: false,
        pointerType: 'mouse',
      })
    })

    expect(vociAperte()).toContain('Weiss Cafè (WEISS)')
  })
})
