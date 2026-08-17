import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CollegaFatturaDialog } from '../CollegaFatturaDialog'
import { installaStubDom } from '@/components/scadenzario/__tests__/render-helpers'
import type { RigaEstrattoConto } from '@/types/reconciliation'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

beforeAll(() => installaStubDom())

const RIGA = {
  id: 't1', venueId: 'v1', transactionDate: '2026-08-14', valueDate: null, description: 'Bonifico tramite Internet Banking *ROSSI SRL', descrizione: 'ROSSI SRL',
  causale: 'Bonifico tramite internet banking', note: null, amount: -100, balanceAfter: null, bankReference: null, importBatchId: null,
  importedAt: '2026-08-16T09:58:00.000Z', importSource: 'PSD2_GOCARDLESS', status: 'PENDING', sezione: 'ATTIVI', bankTransactionCode: '26//11',
  matchedEntryId: null, matchConfidence: null, reconciledBy: null, reconciledAt: null, createdAt: '2026-08-16T09:58:00.000Z', deletedAt: null,
  matchedEntry: null, bankAccount: { id: 'c1', name: 'Weiss' }, modificato: false, stato: 'non_abbinato', residuo: 100,
  origineScrittura: null, residuoDocumenti: null, proposta: false,
} as unknown as RigaEstrattoConto

const SCADENZE = {
  data: [
    { id: 's1', descrizione: 'Fattura Rossi 12', dataScadenza: '2026-08-15', numeroDocumento: 'FT 12', controparteNome: null, importoResiduo: 60, supplier: { id: 'f1', name: 'Rossi Srl' } },
    { id: 's2', descrizione: 'Fattura Rossi 13', dataScadenza: '2026-08-20', numeroDocumento: 'FT 13', controparteNome: null, importoResiduo: 70, supplier: { id: 'f1', name: 'Rossi Srl' } },
  ],
}
const SCRITTURE = {
  data: [
    { id: 'e1', date: '2026-08-14', description: 'Incasso POS 14/08', debitAmount: null, creditAmount: 100, documentRef: null, account: { code: '10.01', name: 'Banca' } },
    { id: 'e2', date: '2026-08-13', description: 'Altro', debitAmount: null, creditAmount: 40, documentRef: null, account: null },
  ],
}

let chiamate: Array<{ url: string; init?: RequestInit }> = []
let fatto = 0
function monta(riga: RigaEstrattoConto = RIGA) {
  chiamate = []
  fatto = 0
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    chiamate.push({ url: u, init })
    if (u.startsWith('/api/scadenzario')) return { ok: true, json: async () => SCADENZE }
    if (u.startsWith('/api/prima-nota')) return { ok: true, json: async () => SCRITTURE }
    return { ok: true, json: async () => ({ ok: true, residuo: 0, reconciliationIds: ['r1'] }) }
  }) as unknown as typeof fetch
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CollegaFatturaDialog riga={riga} open onOpenChange={() => {}} onFatto={() => fatto++} />
    </QueryClientProvider>
  )
}

const collegaPost = () => chiamate.find((c) => c.init?.method === 'POST')

describe('CollegaFatturaDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('elenca le scadenze aperte del verso giusto, col residuo di ciascuna', async () => {
    monta()
    await waitFor(() => expect(screen.getByText('Fattura Rossi 12')).toBeInTheDocument())
    const richiesta = chiamate.find((c) => c.url.startsWith('/api/scadenzario'))!
    expect(richiesta.url).toContain('aperte=1')
    expect(richiesta.url).toContain('tipo=passiva') // la riga è un'uscita
    // `formatCurrency` mette uno spazio unificatore prima di «€»: si cerca la cifra.
    expect(screen.getByText(/60,00/)).toBeInTheDocument()
  })

  it('spuntare una scadenza propone la quota; la somma oltre il residuo della riga blocca il pulsante', async () => {
    monta()
    await waitFor(() => expect(screen.getByText('Fattura Rossi 12')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Seleziona Fattura Rossi 12'))
    expect((screen.getByLabelText('Importo per Fattura Rossi 12') as HTMLInputElement).value).toBe('60,00')
    fireEvent.click(screen.getByLabelText('Seleziona Fattura Rossi 13'))
    // Restavano 40 su 100: la proposta è il minore fra residuo della scadenza e residuo della riga.
    expect((screen.getByLabelText('Importo per Fattura Rossi 13') as HTMLInputElement).value).toBe('40,00')
    expect(screen.getByRole('button', { name: 'Collega' })).toBeEnabled()

    fireEvent.change(screen.getByLabelText('Importo per Fattura Rossi 13'), { target: { value: '70' } })
    expect(screen.getByRole('button', { name: 'Collega' })).toBeDisabled()
    expect(screen.getByText(/superano il residuo/)).toBeInTheDocument()
  })

  it('«Collega» manda le scadenze con le quote alla rotta della riga', async () => {
    monta()
    await waitFor(() => expect(screen.getByText('Fattura Rossi 12')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Seleziona Fattura Rossi 12'))
    fireEvent.change(screen.getByLabelText('Importo per Fattura Rossi 12'), { target: { value: '55,50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Collega' }))
    await waitFor(() => expect(collegaPost()).toBeTruthy())
    expect(collegaPost()!.url).toBe('/api/bank-transactions/t1/collega')
    expect(JSON.parse(String(collegaPost()!.init?.body))).toEqual({ scadenze: [{ scheduleId: 's1', amount: 55.5 }] })
    await waitFor(() => expect(fatto).toBe(1))
  })

  it('la scheda «Scrittura esistente» elenca le scritture libere del verso giusto e ne manda una', async () => {
    monta()
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Scrittura esistente/ }))
    await waitFor(() => expect(screen.getByText('Incasso POS 14/08')).toBeInTheDocument())
    const richiesta = chiamate.find((c) => c.url.startsWith('/api/prima-nota'))!
    expect(richiesta.url).toContain('senzaRigaBancaria=true')
    expect(richiesta.url).toContain('direction=outflow')
    expect(richiesta.url).toContain('registerType=BANK')

    fireEvent.click(screen.getByLabelText('Scegli Incasso POS 14/08'))
    fireEvent.click(screen.getByRole('button', { name: 'Collega' }))
    await waitFor(() => expect(collegaPost()).toBeTruthy())
    expect(JSON.parse(String(collegaPost()!.init?.body))).toEqual({ scritturaEsistenteId: 'e1' })
  })

  it('l\'errore del server resta nel toast e il dialogo non chiama onFatto', async () => {
    monta()
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith('/api/scadenzario')) return { ok: true, json: async () => SCADENZE }
      if (init?.method === 'POST') return { ok: false, json: async () => ({ error: 'La scadenza è pagata' }) }
      return { ok: true, json: async () => ({ data: [] }) }
    }) as unknown as typeof fetch
    await waitFor(() => expect(screen.getByText('Fattura Rossi 12')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Seleziona Fattura Rossi 12'))
    fireEvent.click(screen.getByRole('button', { name: 'Collega' }))
    const { toast } = await import('sonner')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('La scadenza è pagata'))
    expect(fatto).toBe(0)
  })
})
