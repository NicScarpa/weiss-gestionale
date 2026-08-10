import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { toast } from 'sonner'
import ScadenzarioPage from '../page'
import {
  installaStubDom,
  montare,
  smontare,
  attendere,
  cliccare,
  cliccareTreVolte,
  scrivere,
  perTesto,
  perId,
  dialogPresente,
} from '@/components/scadenzario/__tests__/render-helpers'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/scadenzario',
}))

type RispostaFinta = { ok: boolean; status: number; json: () => Promise<unknown> }

const scadenzaCreata = {
  id: 'nuova-1',
  tipo: 'passiva',
  stato: 'da_pagare',
  descrizione: 'Fornitura caffè',
  importoTotale: 120,
  importoPagato: 0,
  importoResiduo: 120,
  dataScadenza: '2026-08-15T00:00:00.000Z',
  priorita: 'normale',
  isRicorrente: false,
  verificata: false,
}

let rispostaPost: RispostaFinta = {
  ok: true,
  status: 200,
  json: async () => ({ schedule: scadenzaCreata }),
}

const chiamate: Array<{ url: string; init?: RequestInit }> = []

function rispondi(url: string): RispostaFinta {
  if (url.includes('/api/scadenzario/summary')) {
    return { ok: true, status: 200, json: async () => ({}) }
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: [], pagination: { totalPages: 1 } }),
  }
}

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  installaStubDom()
})

beforeEach(() => {
  vi.clearAllMocks()
  chiamate.length = 0
  rispostaPost = { ok: true, status: 200, json: async () => ({ schedule: scadenzaCreata }) }
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-08-15T23:30:00.000Z'))
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    chiamate.push({ url, init })
    if (init?.method === 'POST') return rispostaPost as unknown as Response
    return rispondi(url) as unknown as Response
  }) as unknown as typeof fetch
})

afterEach(async () => {
  await smontare()
  vi.useRealTimers()
})

function postScadenze() {
  return chiamate.filter((c) => c.url.includes('/api/scadenzario') && c.init?.method === 'POST')
}

async function apriDialogEcompila() {
  await montare(<ScadenzarioPage />)
  await attendere()
  await cliccare(perTesto(/Nuova Scadenza/i))
  await attendere()
  await scrivere(perId('descrizione'), 'Fornitura caffè')
  const importi = document.body.querySelectorAll<HTMLInputElement>('input[type="number"]')
  await scrivere(importi[0], '120')
}

describe('Pagina scadenzario', () => {
  it('tre click su Conferma inviano una sola POST', async () => {
    await apriDialogEcompila()

    await cliccareTreVolte(perTesto(/^Conferma$/i))
    await attendere()

    expect(postScadenze()).toHaveLength(1)
  })

  it('la scadenza creata finisce nel payload come giorno civile', async () => {
    await apriDialogEcompila()

    await cliccare(perTesto(/^Conferma$/i))
    await attendere()

    const body = JSON.parse(String(postScadenze()[0].init!.body))
    expect(body.dataScadenza).toBe('2026-08-15')
    expect(body.dataEmissione).toBe('2026-08-15')
  })

  it('su risposta di errore mostra il messaggio del server e non chiude il dialog', async () => {
    rispostaPost = {
      ok: false,
      status: 422,
      json: async () => ({ error: 'Importo totale deve essere positivo' }),
    }
    await apriDialogEcompila()

    await cliccare(perTesto(/^Conferma$/i))
    await attendere()

    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).toContain(
      'Importo totale deve essere positivo'
    )
    expect(dialogPresente()).toBe(true)
    expect(perId<HTMLInputElement>('descrizione')!.value).toBe('Fornitura caffè')
  })

  it('su creazione riuscita conferma con un toast', async () => {
    await apriDialogEcompila()

    await cliccare(perTesto(/^Conferma$/i))
    await attendere()

    expect(toast.success).toHaveBeenCalledTimes(1)
  })
})
