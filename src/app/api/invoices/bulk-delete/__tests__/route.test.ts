import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { Prisma } from '@prisma/client'
import { POST } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn(async () => true) },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    electronicInvoice: { findMany: vi.fn(), updateMany: vi.fn() },
    schedule: { findMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session

function richiesta(ids: string[], password = 'segreta') {
  return new NextRequest('http://localhost:3000/api/invoices/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ ids, password }),
  })
}

function fatture(ids: string[], status = 'IMPORTED') {
  return ids.map((id) => ({ id, status }))
}

function scadenza(id: string, invoiceId: string, importoPagato = 0, payments = 0) {
  return {
    id,
    invoiceId,
    descrizione: `rata ${id}`,
    importoPagato: new Prisma.Decimal(importoPagato),
    _count: { payments },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: 'hash' } as never)
  vi.mocked(prisma.schedule.findMany).mockResolvedValue([] as never)
  vi.mocked(prisma.schedule.updateMany).mockResolvedValue({ count: 0 } as never)
  vi.mocked(prisma.electronicInvoice.updateMany).mockResolvedValue({ count: 0 } as never)
  vi.mocked(prisma.$transaction).mockImplementation(
    async (cb: unknown) => (cb as (tx: typeof prisma) => Promise<unknown>)(prisma) as never
  )
})

describe('POST /api/invoices/bulk-delete: il costo non cresce con la selezione', () => {
  it('controlla 225 fatture con una query sola', async () => {
    const ids = Array.from({ length: 225 }, (_, i) => `inv-${i}`)
    vi.mocked(prisma.electronicInvoice.findMany).mockResolvedValue(fatture(ids) as never)
    vi.mocked(prisma.electronicInvoice.updateMany).mockResolvedValue({ count: 225 } as never)

    const res = await POST(richiesta(ids))

    expect(res.status).toBe(200)
    // La regressione da impedire: una query di controllo per fattura. Il pool
    // applicativo apriva più connessioni di quante il pooler Supabase ne
    // conceda in session mode e l'operazione falliva per intero
    // (EMAXCONNSESSION), senza eliminare nulla.
    expect(prisma.schedule.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.electronicInvoice.findMany).toHaveBeenCalledTimes(1)
  })

  it('annulla le scadenze di 225 fatture con un solo aggiornamento', async () => {
    const ids = Array.from({ length: 225 }, (_, i) => `inv-${i}`)
    vi.mocked(prisma.electronicInvoice.findMany).mockResolvedValue(fatture(ids) as never)
    vi.mocked(prisma.schedule.updateMany).mockResolvedValue({ count: 300 } as never)
    vi.mocked(prisma.electronicInvoice.updateMany).mockResolvedValue({ count: 225 } as never)

    const res = await POST(richiesta(ids))
    const body = await res.json()

    // Due scritture in transazione, non due per fattura: con 225 iterazioni
    // sequenziali la transazione superava il proprio timeout.
    expect(prisma.schedule.updateMany).toHaveBeenCalledTimes(1)
    expect(prisma.electronicInvoice.updateMany).toHaveBeenCalledTimes(1)
    expect(body.deleted).toBe(225)
    expect(body.scadenzeAnnullate).toBe(300)
  })
})

describe('POST /api/invoices/bulk-delete: cosa viene riferito a chi elimina', () => {
  it('dice quante fatture ha saltato perché registrate o pagate', async () => {
    const ids = ['inv-1', 'inv-2', 'inv-3']
    vi.mocked(prisma.electronicInvoice.findMany).mockResolvedValue([
      { id: 'inv-1', status: 'IMPORTED' },
      { id: 'inv-2', status: 'PAID' },
      { id: 'inv-3', status: 'PAID' },
    ] as never)
    vi.mocked(prisma.electronicInvoice.updateMany).mockResolvedValue({ count: 1 } as never)

    const res = await POST(richiesta(ids))
    const body = await res.json()

    // Prima queste due sparivano in silenzio: l'utente ne selezionava tre,
    // ne spariva una e il messaggio non spiegava le altre.
    expect(body.saltatePerStato).toBe(2)
    expect(body.message).toContain('1 fatture eliminate')
    expect(body.message).toContain('2 non eliminate: già registrate o pagate')
  })

  it('una fattura solo categorizzata resta eliminabile', async () => {
    vi.mocked(prisma.electronicInvoice.findMany).mockResolvedValue([
      { id: 'inv-1', status: 'CATEGORIZED' },
    ] as never)
    vi.mocked(prisma.electronicInvoice.updateMany).mockResolvedValue({ count: 1 } as never)

    const res = await POST(richiesta(['inv-1']))
    const body = await res.json()

    // Prima «CATEGORIZED» poteva diventare «RECORDED» e da lì bloccarsi. Ora
    // ciò che protegge una fattura è avere pagamenti registrati sulle sue
    // scadenze, non uno stato che diceva soltanto «le ho scritto un movimento».
    expect(res.status).toBe(200)
    expect(body.deleted).toBe(1)
    expect(body.saltatePerStato).toBeUndefined()
  })

  it('conta come saltata una fattura che non esiste più', async () => {
    vi.mocked(prisma.electronicInvoice.findMany).mockResolvedValue([
      { id: 'inv-1', status: 'IMPORTED' },
    ] as never)
    vi.mocked(prisma.electronicInvoice.updateMany).mockResolvedValue({ count: 1 } as never)

    const res = await POST(richiesta(['inv-1', 'inv-sparita']))
    const body = await res.json()

    expect(body.saltatePerStato).toBe(1)
  })

  it('non elimina le fatture con pagamenti registrati e le elenca', async () => {
    vi.mocked(prisma.electronicInvoice.findMany).mockResolvedValue(
      fatture(['inv-1', 'inv-2']) as never
    )
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      scadenza('s1', 'inv-1'),
      scadenza('s2', 'inv-2', 400, 1),
    ] as never)
    vi.mocked(prisma.electronicInvoice.updateMany).mockResolvedValue({ count: 1 } as never)

    const res = await POST(richiesta(['inv-1', 'inv-2']))
    const body = await res.json()

    expect(body.bloccate).toEqual(['inv-2'])
    expect(body.message).toContain('1 non eliminate: hanno pagamenti registrati')
    expect(prisma.electronicInvoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['inv-1'] } } })
    )
  })

  it('rifiuta con 400 quando ogni fattura scelta è registrata o pagata', async () => {
    vi.mocked(prisma.electronicInvoice.findMany).mockResolvedValue([
      { id: 'inv-1', status: 'PAID' },
    ] as never)

    const res = await POST(richiesta(['inv-1']))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('Nessuna fattura eliminabile')
    expect(prisma.electronicInvoice.updateMany).not.toHaveBeenCalled()
  })

  it('rifiuta con 409 quando su tutte risultano pagamenti', async () => {
    vi.mocked(prisma.electronicInvoice.findMany).mockResolvedValue(fatture(['inv-1']) as never)
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([
      scadenza('s1', 'inv-1', 100, 1),
    ] as never)

    const res = await POST(richiesta(['inv-1']))
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.bloccate).toEqual(['inv-1'])
    expect(prisma.electronicInvoice.updateMany).not.toHaveBeenCalled()
  })
})
