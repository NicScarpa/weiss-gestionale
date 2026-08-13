import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, within, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LineItemsTable } from '../InvoiceDetailSections'
import { LINEA_BOLLO, LINEA_ARROTONDAMENTO, CONTO_PROPOSTO_BOLLO } from '@/lib/sdi/righe-di-sistema'

/**
 * Task 8: righe di sistema in tabella, contatore di copertura, tendina del
 * conto aperta a COSTO e PATRIMONIALE. Rendering vero con
 * @testing-library/react (non solo funzioni pure): il progetto la usa già
 * altrove (MovimentoFormDialog.test.tsx) nonostante una nota più vecchia in
 * AccountCombobox.test.tsx dicesse il contrario.
 */

/** API DOM che Radix/cmdk usano e jsdom non implementa. */
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

/**
 * Catalogo conti per il mock di /api/accounts, filtrato per `types` come fa
 * davvero il server (src/app/api/accounts/route.ts): un mock che ignorasse
 * il filtro darebbe verde anche se il componente passasse il types sbagliato
 * — esattamente il tipo di test "verde per il motivo sbagliato" da evitare.
 */
const CATALOGO_CONTI = [
  {
    id: 'conto-detersivi',
    code: '61.09',
    name: 'Detersivi e materiale di pulizia',
    type: 'COSTO',
    mastroCode: '61',
    mastroNome: 'Servizi',
    gruppoCode: null,
    gruppoNome: null,
    costCenterRule: 'DEFAULT_STR',
  },
  {
    id: 'conto-bollo',
    code: CONTO_PROPOSTO_BOLLO,
    name: 'Imposta di bollo',
    type: 'COSTO',
    mastroCode: '30',
    mastroNome: 'Oneri diversi di gestione',
    gruppoCode: null,
    gruppoNome: null,
    costCenterRule: 'DEFAULT_STR',
  },
  {
    id: 'conto-frigo',
    code: '20.05',
    name: 'Attrezzature da cucina',
    type: 'PATRIMONIALE',
    mastroCode: null,
    mastroNome: null,
    gruppoCode: null,
    gruppoNome: null,
    costCenterRule: 'DEFAULT_STR',
  },
  {
    id: 'conto-vendite',
    code: '01.01',
    name: 'Vendite al banco',
    type: 'RICAVO',
    mastroCode: '01',
    mastroNome: 'Ricavi',
    gruppoCode: null,
    gruppoNome: null,
    costCenterRule: 'DEFAULT_STR',
  },
]

function mockFetchAccounts() {
  global.fetch = vi.fn().mockImplementation((input: string | URL) => {
    const url = new URL(String(input), 'http://localhost')
    const typesParam = url.searchParams.get('types')
    const types = typesParam ? typesParam.split(',') : null
    const accounts = types
      ? CATALOGO_CONTI.filter((c) => types.includes(c.type))
      : CATALOGO_CONTI
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ accounts }),
    })
  }) as unknown as typeof fetch
}

/**
 * formatCurrency (Intl, stile 'currency') separa l'importo da "€" con uno
 * spazio unificatore (U+00A0), non uno spazio normale: senza normalizzare,
 * un confronto testuale scritto con la tastiera non incontra mai quel
 * carattere.
 */
function normalizzaSpazi(testo: string | null): string {
  return (testo ?? '').replace(/ /g, ' ')
}

function conQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
}

function righe(overrides: Partial<React.ComponentProps<typeof LineItemsTable>> = {}) {
  mockFetchAccounts()
  return render(
    conQueryClient(
      <LineItemsTable
        dettaglioLinee={[
          {
            numeroLinea: 1,
            descrizione: 'Farina tipo 0',
            quantita: 50,
            unitaMisura: 'kg',
            prezzoUnitario: 20,
            prezzoTotale: 1000,
            aliquotaIVA: 10,
            imputazioni: [],
          },
          {
            numeroLinea: 2,
            descrizione: 'Detersivi',
            quantita: 5,
            unitaMisura: 'pz',
            prezzoUnitario: 20,
            prezzoTotale: 100,
            aliquotaIVA: 22,
            imputazioni: [],
          },
        ]}
        showAccountColumn
        {...overrides}
      />
    )
  )
}

/** Righe della tabella (esclude l'header e la riga del contatore in tfoot). */
function righeCorpo(): HTMLElement[] {
  return Array.from(document.querySelectorAll('tbody tr'))
}

/** Il trigger della tendina del conto dentro la riga che contiene `testo`. */
async function trigatoreRiga(testo: string): Promise<HTMLElement> {
  await waitFor(() => {
    expect(screen.queryByText('Caricamento conti...')).toBeNull()
  })
  const riga = righeCorpo().find((r) => r.textContent?.includes(testo))
  if (!riga) throw new Error(`Riga "${testo}" non trovata`)
  return within(riga).getByRole('combobox')
}

async function apriTendina(testo: string) {
  const trigger = await trigatoreRiga(testo)
  await act(async () => {
    fireEvent.click(trigger)
  })
  return trigger
}

describe('LineItemsTable — righe di sistema', () => {
  it('una fattura con bollo mostra una riga in più di dettaglioLinee.length', () => {
    righe({
      righeSistema: [
        { numeroLinea: LINEA_BOLLO, descrizione: 'Imposta di bollo', importo: 2, imputazioni: [] },
      ],
    })

    expect(righeCorpo()).toHaveLength(3) // 2 righe vere + 1 di sistema
  })

  it('una fattura senza bollo né arrotondamento mostra esattamente dettaglioLinee.length righe', () => {
    righe({ righeSistema: [] })

    expect(righeCorpo()).toHaveLength(2)
  })

  it('la riga di sistema è distinta da un\'icona, non dal suo numero di linea riservato', () => {
    righe({
      righeSistema: [
        { numeroLinea: LINEA_BOLLO, descrizione: 'Imposta di bollo', importo: 2, imputazioni: [] },
      ],
    })

    const rigaBollo = righeCorpo().find((r) => r.textContent?.includes('Imposta di bollo'))!
    expect(within(rigaBollo).getByLabelText('Riga di sistema')).toBeTruthy()
    // Il numero riservato (-1) è un dettaglio interno: non deve comparire in tabella.
    expect(rigaBollo.textContent).not.toContain('-1')
  })

  it('l\'importo della riga di sistema non è mai un campo modificabile', () => {
    righe({
      righeSistema: [
        { numeroLinea: LINEA_BOLLO, descrizione: 'Imposta di bollo', importo: 2, imputazioni: [] },
      ],
    })

    const rigaBollo = righeCorpo().find((r) => r.textContent?.includes('Imposta di bollo'))!
    expect(rigaBollo.textContent).toContain('2,00')
    expect(within(rigaBollo).queryByRole('spinbutton')).toBeNull()
    expect(within(rigaBollo).queryByRole('textbox')).toBeNull()
  })

  it('il conto del bollo nasce proposto su 30.01 come suggerimento in tendina', async () => {
    righe({
      righeSistema: [
        { numeroLinea: LINEA_BOLLO, descrizione: 'Imposta di bollo', importo: 2, imputazioni: [] },
      ],
      defaultBolloAccountLabel: '30.01 - Imposta di bollo',
    })

    const trigger = await trigatoreRiga('Imposta di bollo')
    expect(trigger.textContent).toContain('Suggerito: 30.01 - Imposta di bollo')
  })

  it('il conto scelto per il bollo si salva: seleziona un conto e chiama onAccountChange con LINEA_BOLLO', async () => {
    const onAccountChange = vi.fn()
    righe({
      righeSistema: [
        { numeroLinea: LINEA_BOLLO, descrizione: 'Imposta di bollo', importo: 2, imputazioni: [] },
      ],
      onAccountChange,
    })

    await apriTendina('Imposta di bollo')
    await waitFor(() => expect(screen.queryByText('Imposta di bollo', { selector: 'span.ml-2' })).not.toBeNull())

    await act(async () => {
      fireEvent.click(screen.getByText('Imposta di bollo', { selector: 'span.ml-2' }))
    })

    expect(onAccountChange).toHaveBeenCalledWith(LINEA_BOLLO, 'conto-bollo')
  })

  it('il conto scelto per il bollo si rilegge: un\'imputazione già salvata compare selezionata in tendina', async () => {
    righe({
      righeSistema: [
        {
          numeroLinea: LINEA_BOLLO,
          descrizione: 'Imposta di bollo',
          importo: 2,
          imputazioni: [
            {
              progressivo: 0,
              accountId: 'conto-bollo',
              importo: 2,
              stato: 'confermata',
              fonte: 'manuale',
            },
          ],
        },
      ],
    })

    const trigger = await trigatoreRiga('Imposta di bollo')
    // Il valore selezionato (non il placeholder) è "codice — nome" del conto:
    // se non si rileggesse, il trigger mostrerebbe ancora "Seleziona conto".
    expect(trigger.textContent).toContain('30.01')
    expect(trigger.textContent).toContain('Imposta di bollo')
  })
})

describe('LineItemsTable — contatore di copertura', () => {
  it('con tutte le righe imputate e confermate lo stato è «completa»', () => {
    righe({
      dettaglioLinee: [
        {
          numeroLinea: 1,
          descrizione: 'Farina tipo 0',
          prezzoUnitario: 20,
          prezzoTotale: 1000,
          aliquotaIVA: 10,
          imputazioni: [
            { progressivo: 0, accountId: 'conto-detersivi', importo: 1000, stato: 'confermata', fonte: 'manuale' },
          ],
        },
        {
          numeroLinea: 2,
          descrizione: 'Detersivi',
          prezzoUnitario: 20,
          prezzoTotale: 100,
          aliquotaIVA: 22,
          imputazioni: [
            { progressivo: 0, accountId: 'conto-detersivi', importo: 100, stato: 'confermata', fonte: 'manuale' },
          ],
        },
      ],
      righeSistema: [
        {
          numeroLinea: LINEA_BOLLO,
          descrizione: 'Imposta di bollo',
          importo: 2,
          imputazioni: [
            { progressivo: 0, accountId: 'conto-bollo', importo: 2, stato: 'confermata', fonte: 'manuale' },
          ],
        },
      ],
      totaleDocumento: '1102.00',
    })

    const testo = normalizzaSpazi(document.body.textContent)
    expect(testo).toContain('Attribuito 1.102,00 € / 1.102,00 €')
    expect(testo).toContain('✓ completa')
  })

  it('togliendo l\'imputazione di una riga compare l\'importo mancante e il numero della riga', () => {
    righe({
      dettaglioLinee: [
        {
          numeroLinea: 1,
          descrizione: 'Farina tipo 0',
          prezzoUnitario: 20,
          prezzoTotale: 1000,
          aliquotaIVA: 10,
          imputazioni: [
            { progressivo: 0, accountId: 'conto-detersivi', importo: 1000, stato: 'confermata', fonte: 'manuale' },
          ],
        },
        {
          // Riga 2 senza imputazione: manca all'appello.
          numeroLinea: 2,
          descrizione: 'Detersivi',
          prezzoUnitario: 20,
          prezzoTotale: 100,
          aliquotaIVA: 22,
          imputazioni: [],
        },
      ],
      righeSistema: [
        {
          numeroLinea: LINEA_BOLLO,
          descrizione: 'Imposta di bollo',
          importo: 2,
          imputazioni: [
            { progressivo: 0, accountId: 'conto-bollo', importo: 2, stato: 'confermata', fonte: 'manuale' },
          ],
        },
      ],
      totaleDocumento: '1102.00',
    })

    // Attribuito: 1000 (riga 1) + 2 (bollo) = 1.002,00, non 1.102,00.
    expect(normalizzaSpazi(document.body.textContent)).toContain('Attribuito 1.002,00 € / 1.102,00 €')
    expect(document.body.textContent).toContain('manca la riga 2')
    expect(document.body.textContent).not.toContain('completa')
  })

  it('con più righe scoperte le elenca tutte, righe di sistema comprese', () => {
    righe({
      dettaglioLinee: [
        {
          numeroLinea: 1,
          descrizione: 'Farina tipo 0',
          prezzoUnitario: 20,
          prezzoTotale: 1000,
          aliquotaIVA: 10,
          imputazioni: [],
        },
        {
          numeroLinea: 2,
          descrizione: 'Detersivi',
          prezzoUnitario: 20,
          prezzoTotale: 100,
          aliquotaIVA: 22,
          imputazioni: [],
        },
      ],
      righeSistema: [
        { numeroLinea: LINEA_BOLLO, descrizione: 'Imposta di bollo', importo: 2, imputazioni: [] },
      ],
      totaleDocumento: '1102.00',
    })

    expect(document.body.textContent).toContain('mancano la riga 1, la riga 2 e il bollo')
  })

  it('una nota di arrotondamento negativa non confermata risulta comunque fra le righe mancanti', () => {
    righe({
      dettaglioLinee: [
        {
          numeroLinea: 1,
          descrizione: 'Farina tipo 0',
          prezzoUnitario: 20,
          prezzoTotale: 1000,
          aliquotaIVA: 10,
          imputazioni: [
            { progressivo: 0, accountId: 'conto-detersivi', importo: 1000, stato: 'confermata', fonte: 'manuale' },
          ],
        },
      ],
      righeSistema: [
        {
          numeroLinea: LINEA_ARROTONDAMENTO,
          descrizione: 'Arrotondamento',
          importo: -0.01,
          imputazioni: [],
        },
      ],
      totaleDocumento: '999.99',
    })

    expect(document.body.textContent).toContain("manca l'arrotondamento")
  })

  it('una proposta AI non ancora confermata non conta come attribuita', () => {
    // Specchia la guardia sul back end (schedule-reconciliation-service.ts),
    // che eredita solo dalle imputazioni CONFERMATE: una riga gialla (AI, non
    // ancora rivista da un umano) non deve far sembrare il documento coperto.
    righe({
      dettaglioLinee: [
        {
          numeroLinea: 1,
          descrizione: 'Farina tipo 0',
          prezzoUnitario: 20,
          prezzoTotale: 1000,
          aliquotaIVA: 10,
          imputazioni: [
            { progressivo: 0, accountId: 'conto-detersivi', importo: 1000, stato: 'proposta', fonte: 'ai' },
          ],
        },
      ],
      righeSistema: [],
      totaleDocumento: '1000.00',
    })

    const testo = normalizzaSpazi(document.body.textContent)
    expect(testo).toContain('Attribuito 0,00 € / 1.000,00 €')
    expect(testo).toContain('manca la riga 1')
  })

  it('il contatore usa formatCurrency (formato italiano), non una formattazione propria', () => {
    righe({
      dettaglioLinee: [
        {
          numeroLinea: 1,
          descrizione: 'Farina tipo 0',
          prezzoUnitario: 20,
          prezzoTotale: 1234.5,
          aliquotaIVA: 10,
          imputazioni: [],
        },
      ],
      righeSistema: [],
      totaleDocumento: '1234.50',
    })

    // Formato it-IT con separatore delle migliaia: un toFixed(2) fatto a mano
    // scriverebbe "1234.50", non "1.234,50".
    expect(document.body.textContent).toContain('1.234,50')
    expect(document.body.textContent).not.toContain('1234.50')
  })
})

describe('LineItemsTable — types COSTO e PATRIMONIALE', () => {
  it('un conto PATRIMONIALE compare nella tendina', async () => {
    righe()

    await apriTendina('Farina tipo 0')

    await waitFor(() => {
      expect(screen.queryByText('Attrezzature da cucina')).not.toBeNull()
    })
  })

  it('un conto RICAVO non compare nella tendina', async () => {
    righe()

    await apriTendina('Farina tipo 0')

    // Il conto COSTO del catalogo compare di sicuro: prova che la tendina si
    // sia davvero aperta e popolata, non solo che RICAVO manchi per un
    // popover ancora vuoto.
    await waitFor(() => {
      expect(screen.queryByText('Detersivi e materiale di pulizia')).not.toBeNull()
    })
    expect(screen.queryByText('Vendite al banco')).toBeNull()
  })

  it('un conto PATRIMONIALE si salva: selezionarlo chiama onAccountChange con il suo id', async () => {
    const onAccountChange = vi.fn()
    righe({ onAccountChange })

    await apriTendina('Farina tipo 0')
    await waitFor(() => {
      expect(screen.queryByText('Attrezzature da cucina')).not.toBeNull()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Attrezzature da cucina'))
    })

    expect(onAccountChange).toHaveBeenCalledWith(1, 'conto-frigo')
  })
})
