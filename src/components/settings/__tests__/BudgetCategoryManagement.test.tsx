import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { BudgetCategoryManagement } from '../BudgetCategoryManagement'
// Gli helper di montaggio del progetto: montano con un QueryClientProvider,
// che questo componente dà per scontato. Sono importati e non ricopiati —
// è quello che chiede il commento in fondo a
// src/components/cashflow/__tests__/render-helpers.tsx.
import {
  attendere,
  cliccare,
  dialogPresente,
  installaStubDom,
  montare,
  perTesto,
  smontare,
} from '@/components/scadenzario/__tests__/render-helpers'

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  installaStubDom()
})

afterEach(async () => {
  await smontare()
  vi.restoreAllMocks()
})

/**
 * Attende una condizione, riprovando.
 *
 * Serve perché due cose qui non sono pronte al termine dei microtask: il
 * pulsante resta disabilitato finché la query delle sedi non risponde, e il
 * portal del dialogo si monta dopo. Con dei semplici `attendere()` il test
 * passava o falliva a seconda di come cadevano i tempi.
 */
async function attendiChe(condizione: () => boolean, cosa: string): Promise<void> {
  for (let tentativo = 0; tentativo < 50; tentativo++) {
    if (condizione()) return
    await act(async () => {
      await new Promise((risolvi) => setTimeout(risolvi, 5))
    })
  }
  throw new Error(`Atteso invano: ${cosa}`)
}

const pulsanteInstalla = () =>
  perTesto('Installa categorie cash flow') as HTMLButtonElement | undefined

function risposta(corpo: unknown) {
  return Promise.resolve({
    ok: true,
    json: async () => corpo,
  } as Response)
}

/** Lo stato della produzione: le 13 categorie generiche esistono e sono attive. */
const CATEGORIE_GENERICHE = ['FOOD_COST', 'COSTI_FISSI', 'MARKETING'].map((code, i) => ({
  id: `cat-${i}`,
  code,
  name: code,
  categoryType: 'COST',
  color: null,
  icon: null,
  benchmarkPercentage: null,
  benchmarkComparison: 'LESS_THAN',
  alertThresholdPercent: null,
  description: null,
  isSystem: true,
  isActive: true,
  parentId: null,
  displayOrder: i,
}))

let chiamatePost: string[] = []

beforeEach(() => {
  chiamatePost = []

  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)

    if (init?.method === 'POST') {
      chiamatePost.push(url)
      return risposta({ message: 'installate' })
    }
    if (url.startsWith('/api/venues')) {
      return risposta({ venues: [{ id: 'sede-1', name: 'Weiss', code: 'WEISS' }] })
    }
    // Prima delle categorie: il percorso dei mapping le ha come prefisso.
    if (url.startsWith('/api/budget-categories/mappings')) {
      return risposta({ unmappedAccounts: [] })
    }
    if (url.startsWith('/api/budget-categories')) {
      return risposta({ categories: CATEGORIE_GENERICHE, hierarchy: CATEGORIE_GENERICHE })
    }

    throw new Error(`fetch non previsto nel test: ${url}`)
  }) as unknown as typeof fetch
})

describe('BudgetCategoryManagement', () => {
  it("offre l'installazione anche quando le categorie generiche ci sono già", async () => {
    // È il caso della produzione, ed era il vicolo cieco: entrambi gli accessi
    // al seed erano condizionati a `categories.length === 0`, mentre il seed
    // esiste proprio per rimpiazzare le 13 generiche, che ci sono e sono
    // attive. Nessuna delle due porte si apriva quando serviva.
    await montare(<BudgetCategoryManagement />)
    await attendere()

    // Le tre categorie generiche sono davvero arrivate: senza questo, il test
    // passerebbe anche mostrando lo stato vuoto, dove il pulsante c'era già.
    await attendiChe(
      () => document.body.textContent?.includes('FOOD_COST') ?? false,
      'le categorie generiche a schermo'
    )

    expect(pulsanteInstalla()).toBeDefined()
  })

  it('non installa al primo clic: prima chiede conferma', async () => {
    await montare(<BudgetCategoryManagement />)
    await attendere()
    await attendiChe(
      () => !!pulsanteInstalla() && !pulsanteInstalla()!.disabled,
      'il pulsante di installazione abilitato'
    )

    await cliccare(pulsanteInstalla())
    await attendiChe(dialogPresente, 'il dialogo di conferma')

    expect(chiamatePost).toEqual([])
  })
})
