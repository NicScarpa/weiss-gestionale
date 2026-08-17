import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModificaMovimentoDialog } from '../ModificaMovimentoDialog'
import { installaStubDom } from '@/components/scadenzario/__tests__/render-helpers'
import type { RigaEstrattoConto } from '@/types/reconciliation'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

// Le linguette riportano in vista quella attiva: `scrollIntoView` in jsdom non
// esiste, e senza lo stub il primo clic su una scheda fa cadere la suite.
beforeAll(() => installaStubDom())

const RIGA = {
  id: 't1', venueId: 'v1', transactionDate: '2026-08-14', valueDate: null, description: 'Bonifico a vs favore *DITTA', descrizione: 'DITTA',
  causale: 'Bonifico a vs favore', note: null, amount: 907.9, balanceAfter: null, bankReference: null, importBatchId: null,
  importedAt: '2026-08-16T09:58:00.000Z', importSource: 'PSD2_GOCARDLESS', status: 'PENDING', sezione: 'ATTIVI', bankTransactionCode: '48//00',
  matchedEntryId: null, matchConfidence: null, reconciledBy: null, reconciledAt: null, createdAt: '2026-08-16T09:58:00.000Z', deletedAt: null,
  matchedEntry: null, bankAccount: { id: 'c1', name: 'Weiss' }, modificato: false, stato: 'non_abbinato', residuo: 907.9,
} as unknown as RigaEstrattoConto

let chiamate: Array<{ url: string; init?: RequestInit }> = []
function monta(riga: RigaEstrattoConto) {
  chiamate = []
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    chiamate.push({ url: String(url), init })
    if (String(url).endsWith('/cronologia')) return { ok: true, json: async () => ({ modifiche: [] }) }
    return { ok: true, json: async () => ({ ...riga, descrizione: 'x' }) }
  }) as unknown as typeof fetch
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ModificaMovimentoDialog riga={riga} open onOpenChange={() => {}} onSalvata={() => {}} />
    </QueryClientProvider>
  )
}

describe('ModificaMovimentoDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  // Data e importo vengono dalla banca: si vedono, non si toccano (spec, decisione 2).
  it('su una riga della banca data e importo sono in sola lettura, descrizione causale e note no', () => {
    monta(RIGA)
    expect(screen.getByLabelText('Data')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Importo')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Descrizione')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Causale')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Note')).not.toHaveAttribute('readonly')
    expect(screen.getAllByText(/dalla banca/).length).toBeGreaterThan(0)
  })

  it('su una riga manuale anche data e importo si modificano', () => {
    monta({ ...RIGA, importSource: 'MANUAL' } as RigaEstrattoConto)
    expect(screen.getByLabelText('Data')).not.toHaveAttribute('readonly')
    expect(screen.getByLabelText('Importo')).not.toHaveAttribute('readonly')
  })

  it('salva mandando solo i campi modificati alla PATCH', async () => {
    monta(RIGA)
    fireEvent.change(screen.getByLabelText('Descrizione'), { target: { value: 'Ditta S.r.l., saldo fattura 12' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'pagata in ritardo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(() => expect(chiamate.some((c) => c.init?.method === 'PATCH')).toBe(true))
    const patch = chiamate.find((c) => c.init?.method === 'PATCH')!
    expect(patch.url).toBe('/api/bank-transactions/t1')
    expect(JSON.parse(String(patch.init?.body))).toEqual({ descrizione: 'Ditta S.r.l., saldo fattura 12', note: 'pagata in ritardo' })
  })

  it('ha la scheda «Cronologia modifiche»', () => {
    monta(RIGA)
    expect(screen.getByRole('tab', { name: /Cronologia modifiche/ })).toBeInTheDocument()
  })
})
