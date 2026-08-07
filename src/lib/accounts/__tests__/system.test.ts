import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: { account: { findUnique: vi.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { getSystemAccount, getSystemAccountOptional } from '../system'

beforeEach(() => vi.clearAllMocks())

describe('getSystemAccount', () => {
  it('chiave presente e attiva: restituisce il conto', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      id: 'conto-banca',
      systemKey: 'BANCA',
      isActive: true,
    } as never)

    await expect(getSystemAccount('BANCA')).resolves.toMatchObject({ id: 'conto-banca' })
    expect(prisma.account.findUnique).toHaveBeenCalledWith({ where: { systemKey: 'BANCA' } })
  })

  it('chiave assente: lancia un errore esplicito', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null)

    await expect(getSystemAccount('BANCA')).rejects.toThrow(
      'Conto di sistema BANCA non configurato: impostare accounts.system_key'
    )
  })

  it('conto trovato ma inattivo: trattato come assente', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      id: 'conto-banca',
      systemKey: 'BANCA',
      isActive: false,
    } as never)

    await expect(getSystemAccount('BANCA')).rejects.toThrow(
      'Conto di sistema BANCA non configurato: impostare accounts.system_key'
    )
  })
})

describe('getSystemAccountOptional', () => {
  it('chiave assente: restituisce null invece di lanciare', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null)
    await expect(getSystemAccountOptional('CORRISPETTIVI')).resolves.toBeNull()
  })

  it('conto inattivo: restituisce null', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      id: 'conto-x',
      systemKey: 'CASSA',
      isActive: false,
    } as never)
    await expect(getSystemAccountOptional('CASSA')).resolves.toBeNull()
  })

  it('chiave presente e attiva: restituisce il conto', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      id: 'conto-cassa',
      systemKey: 'CASSA',
      isActive: true,
    } as never)
    await expect(getSystemAccountOptional('CASSA')).resolves.toMatchObject({ id: 'conto-cassa' })
  })
})
