import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast } from 'sonner'
import { InvoiceDetail, rigaBolloDaConfermare } from '../InvoiceDetail'
import { LINEA_BOLLO, LINEA_ARROTONDAMENTO } from '@/lib/sdi/righe-di-sistema'
// Importati dal modulo di soli testi della rotta (non da `route.ts`, che
// porta `next/server`/`next-auth` e non risolverebbe sotto `jsdom`) invece
// di ricopiati a mano — revisione Important 2, Task 10: un testo duplicato
// letteralmente resterebbe verde anche il giorno in cui la rotta cambiasse
// la propria parola.
import {
  MESSAGGIO_RIALLINEATO,
  MESSAGGIO_NESSUNA_DIVERGENZA,
} from '@/app/api/prima-nota/[id]/riallinea/messaggi'
import { RiallineamentoNonRigenerabile } from '@/lib/invoices/riallineamento'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

/**
 * Task 8, round di revisione: "Accetta tutte" sul server aggiorna solo le
 * righe già in stato 'proposta' — e il bollo non ne ha mai una salvata
 * (nessun motore la scrive, vedi il report), quindi senza questa logica
 * l'azione lo ignorerebbe sempre. `rigaBolloDaConfermare` decide se e cosa
 * includere nella stessa richiesta; è pura per poter essere testata senza
 * montare `InvoiceDetail`, che avrebbe bisogno di mock per tre fetch
 * (fattura, conti, centri di costo) solo per arrivare a questa decisione.
 */
describe('rigaBolloDaConfermare', () => {
  it('bollo senza imputazione e conto trovato: propone la riga', () => {
    const righeSistema = [
      { numeroLinea: LINEA_BOLLO, descrizione: 'Imposta di bollo', importo: 2, imputazioni: [] },
    ]

    expect(rigaBolloDaConfermare(righeSistema, 'conto-bollo-id')).toEqual([
      { numeroLinea: LINEA_BOLLO, accountId: 'conto-bollo-id' },
    ])
  })

  it('bollo già imputato: non lo ripropone (eviterebbe di sovrascrivere una scelta esistente)', () => {
    const righeSistema = [
      {
        numeroLinea: LINEA_BOLLO,
        descrizione: 'Imposta di bollo',
        importo: 2,
        imputazioni: [
          { progressivo: 0, accountId: 'conto-scelto-a-mano', importo: 2, stato: 'proposta' as const, fonte: 'ai' },
        ],
      },
    ]

    expect(rigaBolloDaConfermare(righeSistema, 'conto-bollo-id')).toEqual([])
  })

  it('nessun bollo sulla fattura (niente riga -1 in righeSistema): niente da proporre', () => {
    const righeSistema = [
      { numeroLinea: LINEA_ARROTONDAMENTO, descrizione: 'Arrotondamento', importo: -0.01, imputazioni: [] },
    ]

    expect(rigaBolloDaConfermare(righeSistema, 'conto-bollo-id')).toEqual([])
  })

  it('conto 30.01 non trovato nella lista conti (contoBolloId undefined): niente da proporre', () => {
    const righeSistema = [
      { numeroLinea: LINEA_BOLLO, descrizione: 'Imposta di bollo', importo: 2, imputazioni: [] },
    ]

    expect(rigaBolloDaConfermare(righeSistema, undefined)).toEqual([])
  })

  it('righeSistema assente (fattura ancora in caricamento): niente da proporre, nessun errore', () => {
    expect(rigaBolloDaConfermare(undefined, 'conto-bollo-id')).toEqual([])
  })
})

/**
 * Task 9, passo 3: il 400 di righe-conti/route.ts su una somma di quote che
 * non quadra deve arrivare a schermo, non restare in un log. È la rete per
 * il caso in cui il controllo lato client (quoteQuadrano) sia stato aggirato
 * o sbagli — qui simulato facendo rispondere il server con un rifiuto anche
 * quando il client ritiene la somma corretta (60 + 40 = 100).
 *
 * Monta InvoiceDetail per intero (non solo LineItemsTable): il percorso da
 * verificare è la mutation reale in InvoiceDetail.tsx
 * (handleSplitSave → righeContiMutation → onError → toast.error), la stessa
 * usata da ogni altra imputazione di riga. Niente di questo va reimplementato
 * nel test: si simula solo la risposta HTTP.
 */
describe('InvoiceDetail — passo 3: il rifiuto del server è visibile', () => {
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

  const CATALOGO_CONTI = [
    {
      id: 'conto-detersivi',
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
      id: 'conto-tovaglioli',
      code: '61.10',
      name: 'Tovaglioli',
      type: 'COSTO',
      mastroCode: '61',
      mastroNome: 'Servizi',
      gruppoCode: null,
      gruppoNome: null,
      costCenterRule: 'DEFAULT_STR',
    },
  ]

  const FATTURA = {
    id: 'inv-1',
    invoiceNumber: '123',
    invoiceDate: '2026-08-01T00:00:00.000Z',
    documentType: 'TD01',
    supplierVat: '12345678901',
    supplierName: 'Fornitore SRL',
    totalAmount: '100.00',
    vatAmount: '0.00',
    netAmount: '100.00',
    status: 'CATEGORIZED',
    importedAt: '2026-08-01T00:00:00.000Z',
    deadlines: [],
    account: null,
    // Una quota già confermata (conto-detersivi): evita il refetchInterval
    // di InvoiceDetail (che ricontrolla ogni 3s finché nessuna riga ha
    // imputazioni) e dà alla quota 0 un conto già pronto, così il test apre
    // un solo popover (quota 1) invece di due.
    parsedData: {
      dettaglioLinee: [
        {
          numeroLinea: 1,
          descrizione: 'Detersivi',
          quantita: 5,
          unitaMisura: 'pz',
          prezzoUnitario: 20,
          prezzoTotale: 100,
          aliquotaIVA: 0,
          imputazioni: [
            { progressivo: 0, accountId: 'conto-detersivi', importo: 100, stato: 'confermata', fonte: 'manuale' },
          ],
        },
      ],
      righeSistema: [],
    },
  }

  function mockFetchInvoiceDetail(rispostaPatch: () => Promise<{ ok: boolean; json: () => Promise<unknown> }>) {
    global.fetch = vi.fn().mockImplementation((input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      const method = (init?.method ?? 'GET').toUpperCase()

      if (url.pathname === '/api/invoices/inv-1' && method === 'GET') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(FATTURA) })
      }
      if (url.pathname === '/api/invoices/inv-1/righe-conti' && method === 'PATCH') {
        return rispostaPatch()
      }
      if (url.pathname === '/api/accounts') {
        const typesParam = url.searchParams.get('types')
        const types = typesParam ? typesParam.split(',') : null
        const accounts = types ? CATALOGO_CONTI.filter((c) => types.includes(c.type)) : CATALOGO_CONTI
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ accounts }) })
      }
      if (url.pathname === '/api/cost-centers') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ costCenters: [] }) })
      }
      return Promise.reject(new Error(`URL non gestita nel mock InvoiceDetail: ${method} ${url.pathname}`))
    }) as unknown as typeof fetch
  }

  function montare() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={queryClient}>
        <InvoiceDetail invoiceId="inv-1" />
      </QueryClientProvider>
    )
  }

  it('un 400 sulla divisione mostra il messaggio del server, con toast.error (stesso canale di ogni altro rifiuto di righe-conti)', async () => {
    mockFetchInvoiceDetail(() =>
      Promise.resolve({
        ok: false,
        json: () =>
          Promise.resolve({
            error: 'Le quote della riga 1 sommano a 100,00 €, ma la riga vale 122,00 €: mancano 22,00 €',
          }),
      })
    )

    montare()

    const bottoneDividi = await waitFor(() =>
      screen.getByRole('button', { name: 'Dividi la riga fra più conti' })
    )
    await act(async () => {
      fireEvent.click(bottoneDividi)
    })

    // Solo la quota 1 ha bisogno di un conto: la quota 0 eredita
    // conto-detersivi dall'imputazione già presente sulla riga.
    await waitFor(() => expect(screen.queryAllByText('Caricamento conti...')).toHaveLength(0))
    await act(async () => {
      fireEvent.click(screen.getAllByRole('combobox')[1])
    })
    await waitFor(() => expect(screen.queryByText('Tovaglioli')).not.toBeNull())
    await act(async () => {
      fireEvent.click(screen.getByText('Tovaglioli'))
    })

    const inputImporti = screen.getAllByRole('spinbutton')
    await act(async () => {
      fireEvent.change(inputImporti[0], { target: { value: '60' } })
    })
    await act(async () => {
      fireEvent.change(inputImporti[1], { target: { value: '40' } })
    })

    // Lato client 60+40=100 quadra con l'importo della riga: Salva è
    // abilitato pur essendo il server, sotto, pronto a rifiutare comunque
    // (il caso "il controllo lato client... sbagli" del passo 3).
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salva' })).not.toBeDisabled())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    })

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).toContain('mancano 22,00 €')

    // Sulla rejection, l'editor resta aperto coi valori digitati: un errore
    // del server non deve far sparire il lavoro dell'utente (vedi report).
    expect(screen.getByRole('button', { name: 'Salva' })).not.toBeNull()
  })
})

/**
 * Task 10: l'avviso di divergenza e il pulsante Riallinea, montati dentro
 * InvoiceDetail per intero — è lì che vive la mutation vera (fetch reale
 * verso /api/prima-nota/[id]/riallinea), non nel componente presentazionale
 * (già testato a parte in InvoiceDetailSections.test.tsx). Le tre risposte
 * della rotta (Task 7) devono arrivare a schermo: 200 fa sparire l'avviso e
 * conferma quante fette sono state rigenerate, 409 e 422 mostrano il
 * messaggio che la rotta scrive, senza inventarne uno diverso.
 */
describe('InvoiceDetail — Task 10: avviso di divergenza e Riallinea', () => {
  // Il mock di `sonner` è unico per l'intero file (vi.mock in cima, fuori da
  // ogni describe): senza azzerarne le chiamate, il toast.error del blocco
  // Task 9 sopra resterebbe contato anche qui, e `toHaveBeenCalledTimes(1)`
  // fallirebbe per un motivo che non ha niente a che fare con Task 10.
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  const FATTURA_BASE = {
    id: 'inv-1',
    invoiceNumber: '123',
    invoiceDate: '2026-08-01T00:00:00.000Z',
    documentType: 'TD01',
    supplierVat: '12345678901',
    supplierName: 'Fornitore SRL',
    totalAmount: '1222.00',
    vatAmount: '122.00',
    netAmount: '1100.00',
    status: 'RECORDED',
    importedAt: '2026-08-01T00:00:00.000Z',
    deadlines: [],
    account: null,
    parsedData: {
      dettaglioLinee: [
        {
          numeroLinea: 1,
          descrizione: 'Farina',
          quantita: 1,
          unitaMisura: 'kg',
          prezzoUnitario: 1000,
          prezzoTotale: 1000,
          aliquotaIVA: 10,
          imputazioni: [
            { progressivo: 0, accountId: 'conto-alimentari', importo: 1000, stato: 'confermata', fonte: 'manuale' },
          ],
        },
      ],
      righeSistema: [],
    },
  }

  function mockFetchConDivergenza(
    divergenze: Array<{ journalEntryId: string; movimentoData: string }>,
    rispostaRiallinea: () => Promise<{ ok: boolean; json: () => Promise<unknown> }>
  ) {
    // Dopo un riallineamento riuscito, InvoiceDetail invalida la query e
    // rilegge la fattura: la seconda GET deve tornare senza la divergenza
    // appena risolta, altrimenti il test non distinguerebbe "l'avviso è
    // sparito" da "la GET non è mai stata richiamata".
    let chiamateGet = 0
    global.fetch = vi.fn().mockImplementation((input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      const method = (init?.method ?? 'GET').toUpperCase()

      if (url.pathname === '/api/invoices/inv-1' && method === 'GET') {
        chiamateGet += 1
        const divergenzeDaMostrare = chiamateGet === 1 ? divergenze : []
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ...FATTURA_BASE, divergenze: divergenzeDaMostrare }),
        })
      }
      if (url.pathname.match(/^\/api\/prima-nota\/mov-\d+\/riallinea$/) && method === 'POST') {
        return rispostaRiallinea()
      }
      if (url.pathname === '/api/accounts') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ accounts: [] }) })
      }
      if (url.pathname === '/api/cost-centers') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ costCenters: [] }) })
      }
      return Promise.reject(new Error(`URL non gestita nel mock InvoiceDetail (Task 10): ${method} ${url.pathname}`))
    }) as unknown as typeof fetch
  }

  function montare() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={queryClient}>
        <InvoiceDetail invoiceId="inv-1" />
      </QueryClientProvider>
    )
  }

  it('nessuna divergenza: l\'avviso non compare', async () => {
    mockFetchConDivergenza([], () => Promise.reject(new Error('non dovrebbe essere chiamata')))

    montare()

    await waitFor(() => expect(screen.getByText('Fattura 123')).not.toBeNull())
    expect(screen.queryByText('Questa fattura è stata reimputata dopo il pagamento')).toBeNull()
  })

  it('200: mostra quante fette sono state rigenerate, "sul movimento" e non "di questa fattura", e l\'avviso sparisce', async () => {
    mockFetchConDivergenza(
      [{ journalEntryId: 'mov-1', movimentoData: '2026-03-31T00:00:00.000Z' }],
      () =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              fette: 2,
              invoiceId: 'inv-1',
              message: MESSAGGIO_RIALLINEATO,
            }),
        })
    )

    montare()

    const bottone = await waitFor(() => screen.getByRole('button', { name: 'Riallinea' }))
    await act(async () => {
      fireEvent.click(bottone)
    })

    // "sul movimento": il riallineamento è per movimento (Task 7), e su un
    // bonifico cumulativo il conteggio può includere fette di un'altra
    // fattura — "di questa fattura" affermerebbe un ambito che il numero
    // non rispetta (revisione minore, Task 10).
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1))
    expect(String(vi.mocked(toast.success).mock.calls[0][0])).toBe(
      `${MESSAGGIO_RIALLINEATO} — 2 fette rigenerate sul movimento`
    )

    await waitFor(() =>
      expect(screen.queryByText('Questa fattura è stata reimputata dopo il pagamento')).toBeNull()
    )
  })

  it('200 con una sola fetta: singolare "1 fetta rigenerata", non "1 fette rigenerate" (revisione minore, Task 10)', async () => {
    mockFetchConDivergenza(
      [{ journalEntryId: 'mov-1', movimentoData: '2026-03-31T00:00:00.000Z' }],
      () =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ fette: 1, invoiceId: 'inv-1', message: MESSAGGIO_RIALLINEATO }),
        })
    )

    montare()

    const bottone = await waitFor(() => screen.getByRole('button', { name: 'Riallinea' }))
    await act(async () => {
      fireEvent.click(bottone)
    })

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1))
    expect(String(vi.mocked(toast.success).mock.calls[0][0])).toBe(
      `${MESSAGGIO_RIALLINEATO} — 1 fetta rigenerata sul movimento`
    )
  })

  it('409: già allineato o mai coperto per intero — il messaggio della rotta arriva con toast.error, l\'avviso resta', async () => {
    mockFetchConDivergenza(
      [{ journalEntryId: 'mov-1', movimentoData: '2026-03-31T00:00:00.000Z' }],
      () =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: MESSAGGIO_NESSUNA_DIVERGENZA }),
        })
    )

    montare()

    const bottone = await waitFor(() => screen.getByRole('button', { name: 'Riallinea' }))
    await act(async () => {
      fireEvent.click(bottone)
    })

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).toBe(MESSAGGIO_NESSUNA_DIVERGENZA)
    // Il server non ha rigenerato nulla: l'avviso resta a schermo, non
    // sparisce su un errore.
    expect(screen.getByText('Questa fattura è stata reimputata dopo il pagamento')).not.toBeNull()
  })

  it('422: la fattura non è rigenerabile — il motivo delle guardie (righe non confermate, capienza, nota di credito) arriva a schermo', async () => {
    // Costruito dalla classe reale, non ricopiato a mano: se `riallineamento.ts`
    // cambia il testo, questo test lo segue invece di restare verde su una
    // frase che la rotta non scrive più.
    const messaggio422 = new RiallineamentoNonRigenerabile('reconciliation-1', 'inv-1').message
    mockFetchConDivergenza(
      [{ journalEntryId: 'mov-1', movimentoData: '2026-03-31T00:00:00.000Z' }],
      () =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: messaggio422 }),
        })
    )

    montare()

    const bottone = await waitFor(() => screen.getByRole('button', { name: 'Riallinea' }))
    await act(async () => {
      fireEvent.click(bottone)
    })

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).toBe(messaggio422)
    expect(screen.getByText('Questa fattura è stata reimputata dopo il pagamento')).not.toBeNull()
  })
})
