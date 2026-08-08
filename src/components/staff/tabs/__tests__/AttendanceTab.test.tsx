import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { format } from 'date-fns'

import { AttendanceTab } from '../AttendanceTab'

/**
 * La scheda presenze del dipendente: la sola schermata in cui il titolare
 * vede, giorno per giorno, gli orari di una persona.
 *
 * Il difetto che questi test tengono chiuso: la scheda leggeva
 * `data.records`, mentre `GET /api/attendance/records` risponde `{ data,
 * pagination }`. Ogni giorno mostrava "-" e il totale del mese era 0,0 h,
 * qualunque cosa fosse stata timbrata — dal giorno in cui la scheda è nata.
 *
 * Si monta con `createRoot` + `act`: il progetto ha `@testing-library/react`
 * ma non il suo peer `@testing-library/dom`, e importarlo fa fallire la suite.
 */

let root: Root | null = null
let container: HTMLElement | null = null

/** Mezzogiorno di oggi: la scheda mostra il mese corrente, e a metà giornata
 *  nessun confine di fuso può spostare la timbratura di un giorno. */
function oggiAlle(ore: number, minuti = 0): string {
  const adesso = new Date()
  return new Date(
    Date.UTC(adesso.getUTCFullYear(), adesso.getUTCMonth(), adesso.getUTCDate(), ore, minuti)
  ).toISOString()
}

function rispostaConRecords(records: unknown[]) {
  return {
    ok: true,
    json: async () => ({ data: records, pagination: { total: records.length } }),
  }
}

async function montare(records: unknown[]): Promise<void> {
  global.fetch = vi.fn().mockResolvedValue(rispostaConRecords(records)) as typeof fetch

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <AttendanceTab userId="utente-1" isAdmin />
      </QueryClientProvider>
    )
  })

  // La query risolve fuori dal render: senza attendere, il componente resta
  // sugli scheletri di caricamento e il test misurerebbe la schermata vuota.
  for (let giro = 0; giro < 20 && !container.querySelector('.divide-y'); giro++) {
    await act(async () => {
      await new Promise((risolvi) => setTimeout(risolvi, 0))
    })
  }
}

function testoDellaPagina(): string {
  return (document.body.textContent || '').replace(/\s+/g, ' ')
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount()
    })
  }
  container?.remove()
  root = null
  container = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const entrataVera = {
  id: 'rec-in',
  punchType: 'IN' as const,
  punchedAt: oggiAlle(9),
  isManual: false,
  manualEntryBy: null,
  manualEntryReason: null,
}

const uscitaDiSistema = {
  id: 'rec-out',
  punchType: 'OUT' as const,
  punchedAt: oggiAlle(13),
  isManual: true,
  manualEntryBy: 'SYSTEM',
  manualEntryReason: 'Uscita non timbrata: chiusa alla fine del turno pianificato',
}

describe('AttendanceTab', () => {
  it('mostra le timbrature che la API restituisce', async () => {
    await montare([entrataVera, uscitaDiSistema])

    const testo = testoDellaPagina()

    expect(testo).toContain('09:00')
    expect(testo).toContain('13:00')
  })

  it('somma le ore della giornata invece di mostrare zero', async () => {
    await montare([entrataVera, uscitaDiSistema])

    expect(testoDellaPagina()).toContain('4.0h')
  })

  it('con nessuna timbratura resta vuota senza inventare ore', async () => {
    await montare([])

    expect(testoDellaPagina()).toContain('0.0h')
  })

  it('chiede alla API il mese mostrato', async () => {
    await montare([entrataVera])

    const chiamata = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const mese = format(new Date(), 'yyyy-MM')

    expect(String(chiamata)).toContain(`from=${mese}-01`)
  })
})
