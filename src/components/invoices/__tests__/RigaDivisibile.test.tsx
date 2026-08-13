import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Table, TableBody } from '@/components/ui/table'
import {
  RigaDivisibile,
  sommaQuote,
  quoteQuadrano,
  quoteComplete,
  quotePronte,
  messaggioScarto,
  messaggioIncompleto,
  etichettaConto,
  messaggioUnione,
  type QuotaBozza,
} from '../RigaDivisibile'
import type { RigaVisualizzata } from '../riga-fattura-condivisa'

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

  // Round 1 di revisione, minor: parseFloat('0.001') è 0.001, supera un
  // controllo `n > 0` grezzo, ma round2 lo arrotonda a 0 — che il server
  // rifiuterebbe comunque (.positive() su un valore già arrotondato).
  it('falso se un importo arrotondato al centesimo diventa zero (es. 0,001)', () => {
    const quote: QuotaBozza[] = [
      { progressivo: 0, accountId: 'conto-a', importo: '99.999' },
      { progressivo: 1, accountId: 'conto-b', importo: '0.001' },
    ]
    expect(quoteComplete(quote)).toBe(false)
  })
})

describe('quotePronte', () => {
  it('null se anche una sola quota non è pronta', () => {
    const quote: QuotaBozza[] = [
      { progressivo: 0, accountId: 'conto-a', importo: '60' },
      { progressivo: 1, importo: '40' },
    ]
    expect(quotePronte(quote)).toBeNull()
  })

  it('l\'array delle quote pronte, con gli importi già arrotondati al centesimo', () => {
    const quote: QuotaBozza[] = [
      { progressivo: 0, accountId: 'conto-a', importo: '60.005' },
      { progressivo: 1, accountId: 'conto-b', importo: '39.995' },
    ]
    expect(quotePronte(quote)).toEqual([
      { progressivo: 0, accountId: 'conto-a', importo: 60.01 },
      { progressivo: 1, accountId: 'conto-b', importo: 39.99 },
    ])
  })
})

describe('messaggioIncompleto', () => {
  it('dice quale quota non ha ancora un conto', () => {
    const quote: QuotaBozza[] = [
      { progressivo: 0, accountId: 'conto-a', importo: '60' },
      { progressivo: 1, importo: '40' },
    ]
    expect(messaggioIncompleto(quote)).toContain('manca il conto della quota 2')
  })

  it('dice quale quota ha un importo non valido', () => {
    const quote: QuotaBozza[] = [
      { progressivo: 0, accountId: 'conto-a', importo: '' },
      { progressivo: 1, accountId: 'conto-b', importo: '40' },
    ]
    expect(messaggioIncompleto(quote)).toContain('la quota 1 deve avere un importo maggiore di zero')
  })

  it('elenca più problemi insieme, uno per quota', () => {
    const quote: QuotaBozza[] = [
      { progressivo: 0, importo: '' },
      { progressivo: 1, accountId: 'conto-b', importo: '' },
    ]
    const testo = messaggioIncompleto(quote)
    expect(testo).toContain('manca il conto della quota 1')
    expect(testo).toContain('la quota 1 deve avere un importo maggiore di zero')
    expect(testo).toContain('la quota 2 deve avere un importo maggiore di zero')
    expect(testo).not.toContain('manca il conto della quota 2')
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

describe('etichettaConto', () => {
  const accounts = [
    { id: 'conto-a', code: '61.09', name: 'Detersivi' },
    { id: 'conto-b', code: '61.10', name: 'Tovaglioli' },
  ]

  it('"codice — nome" per un conto presente nella lista', () => {
    expect(etichettaConto(accounts, 'conto-a')).toBe('61.09 — Detersivi')
  })

  it('undefined se l\'id non è nella lista (conto non ancora caricato o disattivato)', () => {
    expect(etichettaConto(accounts, 'conto-inesistente')).toBeUndefined()
  })

  it('undefined se l\'id è assente', () => {
    expect(etichettaConto(accounts, undefined)).toBeUndefined()
  })
})

describe('messaggioUnione', () => {
  it('nomina il conto che resta e quello che sparisce (round 2 di revisione: non un generico "sei sicuro?")', () => {
    const testo = messaggioUnione('61.09 — Detersivi', ['61.10 — Tovaglioli'])
    expect(testo).toContain('61.09 — Detersivi')
    expect(testo).toContain('61.10 — Tovaglioli')
    expect(testo).toContain('sarà rimossa')
  })

  it('con più conti rimossi li elenca tutti, al plurale', () => {
    const testo = messaggioUnione('Conto A', ['Conto B', 'Conto C'])
    expect(testo).toContain('Conto B')
    expect(testo).toContain('Conto C')
    expect(testo).toContain('saranno rimosse')
  })

  it('senza conti da nominare (etichetta non risolta) dice solo dove vengono unite', () => {
    const testo = messaggioUnione('61.09 — Detersivi', [])
    expect(testo).toContain('61.09 — Detersivi')
    expect(testo).not.toContain('rimossa')
    expect(testo).not.toContain('rimosse')
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

  // Round 1 di revisione, Important 1: 60+40 quadra (quoteQuadrano vero) ma
  // manca il conto della seconda quota — prima il messaggio diventava
  // comunque verde ("le quote coprono l'importo della riga") mentre "Salva"
  // restava spento, senza dire perché.
  it('con la somma corretta ma un conto mancante, il messaggio dice cosa manca — non "coprono l\'importo" — e resta ambra', async () => {
    const riga = rigaBase({
      imputazioni: [
        { progressivo: 0, accountId: 'conto-a', importo: 60, stato: 'confermata', fonte: 'manuale' },
      ],
    })
    montare(riga)

    // Seconda quota: solo l'importo, nessun conto scelto (quoteIniziali
    // lascia la seconda quota vuota su una riga con una sola imputazione
    // esistente — vedi la funzione).
    const inputImporti = screen.getAllByRole('spinbutton')
    await act(async () => {
      fireEvent.change(inputImporti[0], { target: { value: '60' } })
    })
    await act(async () => {
      fireEvent.change(inputImporti[1], { target: { value: '40' } })
    })

    expect(screen.getByRole('button', { name: 'Salva' })).toBeDisabled()
    const testo = document.body.textContent ?? ''
    expect(testo).toContain('manca il conto della quota 2')
    expect(testo).not.toContain("Le quote coprono l'importo della riga")
    // Il messaggio non è più verde (la classe che lo rendeva tale non compare).
    expect(document.querySelector('span.text-green-600')).toBeNull()
  })

  // Round 2 di revisione: "Unisci" è un'azione irreversibile e distruttiva
  // (la quota rimossa non torna: una nuova divisione riparte sempre da due
  // quote vuote). Il bottone ora apre una conferma che nomina i conti
  // coinvolti, invece di salvare al primo clic.
  it('"Unisci in un conto solo" apre una conferma che nomina il conto che resta e quello che sparisce', async () => {
    const onSalva = vi.fn()
    const riga = rigaBase({
      imputazioni: [
        { progressivo: 0, accountId: 'conto-a', importo: 60, stato: 'confermata', fonte: 'manuale' },
        { progressivo: 1, accountId: 'conto-b', importo: 40, stato: 'confermata', fonte: 'manuale' },
      ],
    })
    // onAnnulla assente: è così che LineItemsTable la monta per una riga già
    // divisa (`divisa === true`), il caso in cui "Unisci" deve comparire.
    montare(riga, { onSalva, onAnnulla: undefined })

    // Il bottone resta disabilitato finché i conti (per nominarli nella
    // conferma) non sono caricati.
    const bottoneUnisci = await waitFor(() => {
      const bottone = screen.getByRole('button', { name: 'Unisci in un conto solo' })
      expect(bottone).not.toBeDisabled()
      return bottone
    })
    await act(async () => {
      fireEvent.click(bottoneUnisci)
    })

    // La conferma è a schermo, con i nomi — non un generico "sei sicuro?" —
    // e nessuna richiesta è ancora partita.
    await waitFor(() => {
      expect(screen.queryByText('Unire le quote in un conto solo?')).not.toBeNull()
    })
    const testo = document.body.textContent ?? ''
    expect(testo).toContain('61.09')
    expect(testo).toContain('Detersivi')
    expect(testo).toContain('61.10')
    expect(testo).toContain('Tovaglioli')
    expect(onSalva).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Unisci' }))
    })

    expect(onSalva).toHaveBeenCalledWith([{ progressivo: 0, accountId: 'conto-a', importo: 100 }])
  })

  it('annullando la conferma di unione non parte nessuna richiesta', async () => {
    const onSalva = vi.fn()
    const riga = rigaBase({
      imputazioni: [
        { progressivo: 0, accountId: 'conto-a', importo: 60, stato: 'confermata', fonte: 'manuale' },
        { progressivo: 1, accountId: 'conto-b', importo: 40, stato: 'confermata', fonte: 'manuale' },
      ],
    })
    montare(riga, { onSalva, onAnnulla: undefined })

    const bottoneUnisci = await waitFor(() => {
      const bottone = screen.getByRole('button', { name: 'Unisci in un conto solo' })
      expect(bottone).not.toBeDisabled()
      return bottone
    })
    await act(async () => {
      fireEvent.click(bottoneUnisci)
    })
    await waitFor(() => {
      expect(screen.queryByText('Unire le quote in un conto solo?')).not.toBeNull()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    })

    await waitFor(() => {
      expect(screen.queryByText('Unire le quote in un conto solo?')).toBeNull()
    })
    expect(onSalva).not.toHaveBeenCalled()
  })

  it('"Unisci in un conto solo" non compare quando la riga non è ancora divisa (Annulla presente)', () => {
    const riga = rigaBase({ imputazioni: [] })
    montare(riga, { onAnnulla: vi.fn() })

    expect(screen.queryByRole('button', { name: 'Unisci in un conto solo' })).toBeNull()
  })
})
