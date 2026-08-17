import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'

import NuovoClientePage from '../nuovo/page'
import SchedaClientePage from '../[id]/page'

/**
 * Le due schermate del cliente: quella nuova e quella in modifica.
 *
 * Da «Anagrafiche → Clienti» il bottone «Nuovo Cliente» e la modifica di riga
 * rimandavano a `/anagrafiche/clienti/nuovo` e `/anagrafiche/clienti/[id]`:
 * pagine mai costruite, quindi 404. L'API `/api/customers` aveva già POST e
 * PUT, ma nessuna schermata li chiamava.
 */

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

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: 'admin', id: 'admin-1' } }, status: 'authenticated' }),
}))

vi.mock('@/components/prima-nota/shared/AccountCombobox', () => ({
  AccountCombobox: () => <input aria-label="Conto predefinito" readOnly />,
}))

const CLIENTE = {
  id: 'cliente-1',
  denominazione: 'Bar Centrale',
  partitaIva: '01234567890',
  citta: 'Sacile',
  paese: 'IT',
  attivo: true,
}

let chiamate: Array<{ url: string; opzioni?: RequestInit }>

beforeEach(() => {
  chiamate = []
  push.mockClear()
  global.fetch = vi.fn(async (input: RequestInfo | URL, opzioni?: RequestInit) => {
    const url = String(input)
    chiamate.push({ url, opzioni })
    if (url.startsWith('/api/customers/')) {
      return { ok: true, json: async () => ({ customer: CLIENTE }) } as Response
    }
    return { ok: true, json: async () => ({ customer: { ...CLIENTE } }) } as Response
  }) as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function campo(etichetta: string): HTMLInputElement {
  const label = Array.from(document.querySelectorAll('label')).find(
    (l) => l.textContent?.replace('*', '').trim() === etichetta
  )
  const id = label?.getAttribute('for')
  const controllo = id ? document.getElementById(id) : null
  if (!controllo) throw new Error(`Campo «${etichetta}» non trovato`)
  return controllo as HTMLInputElement
}

async function salva() {
  const bottone = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === 'Salva'
  )
  if (!bottone) throw new Error('Bottone «Salva» non trovato')
  await act(async () => {
    fireEvent.click(bottone)
  })
}

function corpoDi(chiamata: { opzioni?: RequestInit }): Record<string, unknown> {
  return JSON.parse(String(chiamata.opzioni?.body ?? '{}'))
}

describe('nuovo cliente', () => {
  it('crea il cliente con POST e torna alla lista', async () => {
    await act(async () => {
      render(<NuovoClientePage />)
    })

    await act(async () => {
      fireEvent.change(campo('Denominazione'), { target: { value: 'Bar Centrale' } })
      fireEvent.change(campo('Città'), { target: { value: 'Sacile' } })
    })
    await salva()

    const creazione = chiamate.find((c) => c.opzioni?.method === 'POST')
    expect(creazione?.url).toBe('/api/customers')
    expect(corpoDi(creazione!)).toMatchObject({ denominazione: 'Bar Centrale', citta: 'Sacile' })
    expect(push).toHaveBeenCalledWith('/anagrafiche/clienti')
  })

  it('non chiama l\'API se manca la denominazione', async () => {
    await act(async () => {
      render(<NuovoClientePage />)
    })
    await salva()

    expect(chiamate.some((c) => c.opzioni?.method === 'POST')).toBe(false)
  })
})

describe('scheda cliente', () => {
  it('carica il cliente e lo salva con PUT', async () => {
    await act(async () => {
      render(<SchedaClientePage params={Promise.resolve({ id: 'cliente-1' })} />)
    })

    expect(campo('Denominazione').value).toBe('Bar Centrale')

    await act(async () => {
      fireEvent.change(campo('Città'), { target: { value: 'Pordenone' } })
    })
    await salva()

    const modifica = chiamate.find((c) => c.opzioni?.method === 'PUT')
    expect(modifica?.url).toBe('/api/customers')
    expect(corpoDi(modifica!)).toMatchObject({ id: 'cliente-1', citta: 'Pordenone' })
  })
})
