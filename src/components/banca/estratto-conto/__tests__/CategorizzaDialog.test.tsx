import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CategorizzaDialog, type BersaglioCategorizza } from '../CategorizzaDialog'
import { installaStubDom } from '@/components/scadenzario/__tests__/render-helpers'
import type { RigaEstrattoConto } from '@/types/reconciliation'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

// Il combobox dei conti è già provato per conto suo: qui si sostituisce con un
// select nudo, così il test parla della categorizzazione e non di Radix.
vi.mock('@/components/prima-nota/shared/AccountCombobox', () => ({
  AccountCombobox: ({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) => (
    <select aria-label="Conto" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">—</option>
      <option value="c-costo">05.01 Commissioni bancarie</option>
      <option value="c-obbligatorio">02.01 Materie prime</option>
    </select>
  ),
}))
vi.mock('@/components/prima-nota/shared/CostCenterSelect', () => ({
  CostCenterSelect: ({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) => (
    <select aria-label="Centro di costo" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">Nessuno</option>
      <option value="cc-weiss">WEISS</option>
    </select>
  ),
}))
vi.mock('@/hooks/useImputableAccounts', () => ({
  useAccountsForCombobox: () => ({
    data: [
      { id: 'c-costo', code: '05.01', name: 'Commissioni bancarie', type: 'COSTO', costCenterRule: 'DEFAULT_STR' },
      { id: 'c-obbligatorio', code: '02.01', name: 'Materie prime', type: 'COSTO', costCenterRule: 'OBBLIGATORIO' },
    ],
  }),
  buildCostCenterRuleMap: (conti: Array<{ id: string; costCenterRule: string }>) => new Map(conti.map((c) => [c.id, c.costCenterRule])),
}))

beforeAll(() => installaStubDom())

const RIGA = {
  id: 't1', venueId: 'v1', transactionDate: '2026-08-14', valueDate: null, description: 'Commissioni', descrizione: null,
  causale: 'Commissioni', note: null, amount: -0.75, balanceAfter: null, bankReference: null, importBatchId: null,
  importedAt: '2026-08-16T09:58:00.000Z', importSource: 'PSD2_GOCARDLESS', status: 'PENDING', sezione: 'ATTIVI', bankTransactionCode: '16//00',
  matchedEntryId: null, matchConfidence: null, reconciledBy: null, reconciledAt: null, createdAt: '2026-08-16T09:58:00.000Z', deletedAt: null,
  matchedEntry: null, bankAccount: { id: 'c1', name: 'Weiss' }, modificato: false, stato: 'non_abbinato', residuo: 0.75,
  origineScrittura: null, residuoDocumenti: null, proposta: false,
} as unknown as RigaEstrattoConto

let chiamate: Array<{ url: string; init?: RequestInit }> = []
let fatto = 0
function monta(bersaglio: BersaglioCategorizza, risposta: unknown = { ok: true, creata: true }) {
  chiamate = []
  fatto = 0
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    chiamate.push({ url: String(url), init })
    return { ok: true, json: async () => risposta }
  }) as unknown as typeof fetch
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CategorizzaDialog bersaglio={bersaglio} open onOpenChange={() => {}} onFatto={() => fatto++} />
    </QueryClientProvider>
  )
}

describe('CategorizzaDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('su una riga mostra il riepilogo e manda conto e centro alla rotta della riga', async () => {
    monta({ tipo: 'riga', riga: RIGA })
    expect(screen.getByText('Categorizza movimento')).toBeInTheDocument()
    expect(screen.getByText('Commissioni')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Categorizza' })).toBeDisabled() // niente conto, niente invio

    fireEvent.change(screen.getByLabelText('Conto'), { target: { value: 'c-costo' } })
    fireEvent.change(screen.getByLabelText('Centro di costo'), { target: { value: 'cc-weiss' } })
    fireEvent.click(screen.getByRole('button', { name: 'Categorizza' }))

    await waitFor(() => expect(chiamate).toHaveLength(1))
    expect(chiamate[0].url).toBe('/api/bank-transactions/t1/categorizza')
    expect(JSON.parse(String(chiamate[0].init?.body))).toEqual({ accountId: 'c-costo', costCenterId: 'cc-weiss' })
    await waitFor(() => expect(fatto).toBe(1))
  })

  it('un conto con centro obbligatorio non parte senza centro', () => {
    monta({ tipo: 'riga', riga: RIGA })
    fireEvent.change(screen.getByLabelText('Conto'), { target: { value: 'c-obbligatorio' } })
    expect(screen.getByRole('button', { name: 'Categorizza' })).toBeDisabled()
    expect(screen.getByText(/obbligatorio per questo conto/)).toBeInTheDocument()
  })

  it('su una selezione manda gli id alla rotta in blocco', async () => {
    monta({ tipo: 'selezione', ids: ['a', 'b', 'c'] }, { toccate: 3, saltate: 0 })
    expect(screen.getByText('Categorizza 3 movimenti')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Conto'), { target: { value: 'c-costo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Categorizza' }))
    await waitFor(() => expect(chiamate).toHaveLength(1))
    expect(chiamate[0].url).toBe('/api/bank-transactions/categorizza-in-blocco')
    expect(JSON.parse(String(chiamate[0].init?.body))).toEqual({ ids: ['a', 'b', 'c'], imputazione: { accountId: 'c-costo' } })
  })

  it('su «tutte le N del filtro» manda il filtro, non gli id', async () => {
    monta({ tipo: 'filtro', filtro: { search: 'commissioni' }, totale: 62 }, { toccate: 62, saltate: 0 })
    expect(screen.getByText('Categorizza 62 movimenti')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Conto'), { target: { value: 'c-costo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Categorizza' }))
    await waitFor(() => expect(chiamate).toHaveLength(1))
    expect(JSON.parse(String(chiamate[0].init?.body))).toEqual({ filtro: { search: 'commissioni' }, imputazione: { accountId: 'c-costo' } })
  })

  it('su una riga già promossa parte dalla categoria attuale, e con le fette non si può', () => {
    const promossa = { ...RIGA, matchedEntryId: 'e1', stato: 'abbinato_manualmente', matchedEntry: { id: 'e1', date: '2026-08-14', description: 'Commissioni', debitAmount: null, creditAmount: 0.75, documentRef: null, account: { id: 'c-costo', code: '05.01', name: 'Commissioni bancarie' }, costCenter: { id: 'cc-weiss', code: 'WEISS', name: 'Weiss' }, fette: 2 } } as unknown as RigaEstrattoConto
    monta({ tipo: 'riga', riga: promossa })
    expect((screen.getByLabelText('Conto') as HTMLSelectElement).value).toBe('c-costo')
    expect(screen.getByText(/ripartita/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Categorizza' })).toBeDisabled()
  })
})
