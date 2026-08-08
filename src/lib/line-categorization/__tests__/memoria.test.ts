import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    supplierProductAccount: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { alimentaMemoriaFornitore } from '../memoria'

const base = {
  venueId: 'venue-1',
  supplierId: 'forn-1',
  descrizione: 'FARINA 00 KG 25',
  codiceArticolo: 'FAR25',
  accountId: 'conto-farina',
}

const chiave = {
  venueId_supplierId_nomeNormalizzato: {
    venueId: 'venue-1',
    supplierId: 'forn-1',
    nomeNormalizzato: 'farina 00 kg 25',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.supplierProductAccount.findUnique).mockResolvedValue(null)
  vi.mocked(prisma.supplierProductAccount.upsert).mockResolvedValue({} as never)
})

describe('alimentaMemoriaFornitore', () => {
  it('prodotto mai visto: nasce la memoria con una conferma', async () => {
    await alimentaMemoriaFornitore(base)

    expect(prisma.supplierProductAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: chiave,
        create: {
          venueId: 'venue-1',
          supplierId: 'forn-1',
          nomeNormalizzato: 'farina 00 kg 25',
          codiceArticolo: 'FAR25',
          accountId: 'conto-farina',
          conferme: 1,
        },
      })
    )
  })

  it('stesso conto di prima: le conferme salgono di uno', async () => {
    vi.mocked(prisma.supplierProductAccount.findUnique).mockResolvedValue({
      accountId: 'conto-farina',
    } as never)

    await alimentaMemoriaFornitore(base)

    const { update } = vi.mocked(prisma.supplierProductAccount.upsert).mock.calls[0][0]
    expect(update).toMatchObject({ accountId: 'conto-farina', conferme: { increment: 1 } })
  })

  it('conto diverso da prima: le conferme ripartono da uno', async () => {
    // Le conferme accumulate valevano per il conto vecchio. Il contatore
    // ordina gli esempi che finiscono nel prompt: se contasse le conferme del
    // prodotto invece che quelle della mappatura, direbbe il falso proprio
    // sulle mappature appena corrette.
    vi.mocked(prisma.supplierProductAccount.findUnique).mockResolvedValue({
      accountId: 'conto-attrezzature',
    } as never)

    await alimentaMemoriaFornitore(base)

    const { update } = vi.mocked(prisma.supplierProductAccount.upsert).mock.calls[0][0]
    expect(update).toMatchObject({ accountId: 'conto-farina', conferme: 1 })
  })

  it('fattura senza codice articolo: il codice già appreso non viene azzerato', async () => {
    vi.mocked(prisma.supplierProductAccount.findUnique).mockResolvedValue({
      accountId: 'conto-farina',
    } as never)

    await alimentaMemoriaFornitore({ ...base, codiceArticolo: null })

    const { update } = vi.mocked(prisma.supplierProductAccount.upsert).mock.calls[0][0]
    expect(update).not.toHaveProperty('codiceArticolo')
  })

  it('descrizione che normalizza a vuoto: niente memoria, nessuna chiave collassata', async () => {
    await alimentaMemoriaFornitore({ ...base, descrizione: '---' })

    expect(prisma.supplierProductAccount.upsert).not.toHaveBeenCalled()
  })

  it('un errore si registra e non risale: la conferma dell\'utente è già scritta', async () => {
    vi.mocked(prisma.supplierProductAccount.upsert).mockRejectedValue(new Error('db down'))

    await expect(alimentaMemoriaFornitore(base)).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalled()
  })
})
