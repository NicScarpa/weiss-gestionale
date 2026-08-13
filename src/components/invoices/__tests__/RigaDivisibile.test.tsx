import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Table, TableBody } from '@/components/ui/table'
import { RigaDivisibile, sommaQuote, quoteQuadrano, quoteComplete, messaggioScarto, type QuotaBozza } from '../RigaDivisibile'
import type { RigaVisualizzata } from '../InvoiceDetailSections'

/**
 * Task 9: righe figlie di una riga fattura divisa. Le funzioni pure
 * (sommaQuote, quoteQuadrano, quoteComplete, messaggioScarto) coprono il
 * calcolo del vincolo del passo 2 senza montare il DOM; il rendering copre
 * il pallino per-quota (Task 8, minor 9) e il collasso di una bozza non
 * salvata (Annulla).
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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function mockFetchAccounts() {
  global.fetch = vi.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          accounts: [
            {
              id: 'conto-a',
              code: '61.09',
              name: 'Detersivi',
              type: 'COSTO',
              mastroCode: '61',
              mastroNome: 'Servizi',
              gruppoCode: null,
              gruppoNome: null,
              costCenterRule: 'DEFAULT_STR',
            },
            {
              id: 'conto-b',
              code: '61.10',
              name: 'Tovaglioli',
              type: 'COSTO',
              mastroCode: '61',
              mastroNome: 'Servizi',
              gruppoCode: null,
              gruppoNome: null,
              costCenterRule: 'DEFAULT_STR',
            },
          ],
        }),
    })
  ) as unknown as typeof fetch
}

function rigaBase(overrides: Partial<RigaVisualizzata> = {}): RigaVisualizzata {
  return {
    numeroLinea: 2,
    descrizione: 'Detersivi',
    isSistema: false,
    importo: 100,
    imputazioni: [],
    ...overrides,
  }
}

function montare(riga: RigaVisualizzata, props: Partial<Parameters<typeof RigaDivisibile>[0]> = {}) {
  mockFetchAccounts()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onSalva = props.onSalva ?? vi.fn()
  return render(
    <QueryClientProvider client={queryClient}>
      <Table>
        <TableBody>
          <RigaDivisibile riga={riga} canEditAccounts onSalva={onSalva} {...props} />
        </TableBody>
      </Table>
    </QueryClientProvider>
  )
}

describe('sommaQuote', () => {
  it('somma solo importi numerici, tratta il vuoto o il non numerico come zero', () => {
    const quote: QuotaBozza[] = [
      { progressivo: 0, importo: '60' },
      { progressivo: 1, importo: '' },
      { progressivo: 2, importo: 'non-un-numero' },
    ]
    expect(sommaQuote(quote)).toBe(60)
  })
})

describe('quoteQuadrano', () => {
  it('vero quando la somma combacia con l\'importo della riga (tolleranza 0,005)', () => {
    const quote: QuotaBozza[] = [
      { progressivo: 0, importo: '60' },
      { progressivo: 1, importo: '40' },
    ]
    expect(quoteQuadrano(quote, 100)).toBe(true)
  })

  it('falso quando manca uno scarto sopra la tolleranza', () => {
    const quote: QuotaBozza[] = [
      { progressivo: 0, importo: '60' },
      { progressivo: 1, importo: '30' },
    ]
    expect(quoteQuadrano(quote, 100)).toBe(false)
  })
})

describe('quoteComplete', () => {
  it('falso se una quota non ha ancora un conto', () => {
    const quote: QuotaBozza[] = [
      { progressivo: 0, accountId: 'conto-a', importo: '60' },
      { progressivo: 1, importo: '40' },
    ]
    expect(quoteComplete(quote)).toBe(false)
  })

  it('falso se una quota ha importo zero o negativo', () => {
    const quote: QuotaBozza[] = [
      { progressivo: 0, accountId: 'conto-a', importo: '100' },
      { progressivo: 1, accountId: 'conto-b', importo: '0' },
    ]
    expect(quoteComplete(quote)).toBe(false)
  })

  it('vero quando ogni quota ha conto e importo positivo', () => {
    const quote: QuotaBozza[] = [
      { progressivo: 0, accountId: 'conto-a', importo: '60' },
      { progressivo: 1, accountId: 'conto-b', importo: '40' },
    ]
    expect(quoteComplete(quote)).toBe(true)
  })
})

describe('messaggioScarto', () => {
  it('con la somma inferiore dice quanto manca', () => {
    const quote: QuotaBozza[] = [
      { progressivo: 0, importo: '60' },
      { progressivo: 1, importo: '30' },
    ]
    expect(messaggioScarto(quote, 100)).toContain('mancano')
    expect(messaggioScarto(quote, 100)).toContain('10,00')
  })

  it('con la somma superiore dice quanto c\'è di troppo', () => {
    const quote: QuotaBozza[] = [
      { progressivo: 0, importo: '70' },
      { progressivo: 1, importo: '40' },
    ]
    expect(messaggioScarto(quote, 100)).toContain('di troppo')
    expect(messaggioScarto(quote, 100)).toContain('10,00')
  })
})

describe('RigaDivisibile — rendering', () => {
  it('una riga divisa con la prima quota confermata e la seconda proposta mostra ENTRAMBI gli stati', () => {
    // Task 8, minor 9 del reviewer: prima si leggeva solo imputazioni[0], e
    // la seconda quota (ancora una proposta AI da rivedere) spariva dalla
    // vista dietro un pallino verde unico sulla riga madre.
    const riga = rigaBase({
      imputazioni: [
        { progressivo: 0, accountId: 'conto-a', importo: 60, stato: 'confermata', fonte: 'manuale' },
        { progressivo: 1, accountId: 'conto-b', importo: 40, stato: 'proposta', fonte: 'ai' },
      ],
    })
    montare(riga)

    const pallini = document.querySelectorAll('span[title="Imputazione confermata"], span[title^="Imputazione proposta"]')
    expect(pallini).toHaveLength(2)
    expect(document.querySelector('span[title="Imputazione confermata"]')).not.toBeNull()
    expect(document.querySelector('span[title^="Imputazione proposta"]')).not.toBeNull()
  })

  it('Annulla su una bozza non salvata chiama onAnnulla (la riga collassa, il chiamante scarta la bozza)', async () => {
    const onAnnulla = vi.fn()
    const riga = rigaBase({ imputazioni: [] })
    montare(riga, { onAnnulla })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    })

    expect(onAnnulla).toHaveBeenCalledTimes(1)
  })

  it('una riga già divisa sul server non mostra Annulla: non c\'è una riga singola a cui tornare', () => {
    const riga = rigaBase({
      imputazioni: [
        { progressivo: 0, accountId: 'conto-a', importo: 60, stato: 'confermata', fonte: 'manuale' },
        { progressivo: 1, accountId: 'conto-b', importo: 40, stato: 'confermata', fonte: 'manuale' },
      ],
    })
    // onAnnulla assente, come farebbe LineItemsTable per `divisa === true`.
    montare(riga, { onAnnulla: undefined })

    expect(screen.queryByRole('button', { name: 'Annulla' })).toBeNull()
  })

  it('Salva invia l\'insieme completo delle quote (progressivo, accountId, importo), mai una sola', async () => {
    const onSalva = vi.fn()
    const riga = rigaBase({
      imputazioni: [
        { progressivo: 0, accountId: 'conto-a', importo: 60, stato: 'confermata', fonte: 'manuale' },
        { progressivo: 1, accountId: 'conto-b', importo: 40, stato: 'confermata', fonte: 'manuale' },
      ],
    })
    montare(riga, { onSalva })

    await waitFor(() => expect(screen.getByRole('button', { name: 'Salva' })).not.toBeDisabled())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    })

    expect(onSalva).toHaveBeenCalledWith([
      { progressivo: 0, accountId: 'conto-a', importo: 60 },
      { progressivo: 1, accountId: 'conto-b', importo: 40 },
    ])
  })
})
