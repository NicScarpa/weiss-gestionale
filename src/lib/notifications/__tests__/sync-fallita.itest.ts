import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'

const inviaMail = vi.fn(async () => true)
vi.mock('@/lib/email', () => ({
  sendEmail: (...args: unknown[]) => inviaMail(...(args as [])),
}))

const { avvisaSyncFallita, NOTTI_PRIMA_DELLA_MAIL } = await import('../sync-fallita')

setupIntegrationDb()

async function sedeEAdmin() {
  const admin = await prisma.user.findFirst({
    where: { role: { name: 'admin' }, isActive: true },
    include: { role: true },
  })
  if (!admin?.venueId) throw new Error('Il seed non ha un admin con sede')
  return { venueId: admin.venueId, adminId: admin.id }
}

describe('avvisaSyncFallita', () => {
  beforeEach(() => {
    inviaMail.mockClear()
    inviaMail.mockResolvedValue(true)
    process.env.RESEND_API_KEY = 'chiave-di-prova'
  })

  it('al primo fallimento scrive sul campanello e non manda la mail', async () => {
    const { venueId } = await sedeEAdmin()

    const esito = await avvisaSyncFallita({
      venueId,
      nomeConto: 'Banca della Marca - Weiss',
      errore: 'timeout',
      fallimentiConsecutivi: 1,
    })

    expect(esito.campanello).toBeGreaterThan(0)
    expect(esito.mailInviata).toBe(false)
    expect(inviaMail).not.toHaveBeenCalled()

    const righe = await prisma.notificationLog.findMany({
      where: { type: 'BANK_SYNC_FAILED' },
    })
    expect(righe).toHaveLength(esito.campanello)
  })

  it(`manda la mail dal ${NOTTI_PRIMA_DELLA_MAIL}° fallimento consecutivo`, async () => {
    const { venueId } = await sedeEAdmin()

    const esito = await avvisaSyncFallita({
      venueId,
      nomeConto: 'Banca della Marca - Weiss',
      errore: 'timeout',
      fallimentiConsecutivi: NOTTI_PRIMA_DELLA_MAIL,
    })

    expect(esito.mailInviata).toBe(true)
    expect(esito.mailConfigurata).toBe(true)
    expect(inviaMail).toHaveBeenCalled()
  })

  // Il punto della distinzione: senza questa, il pannello direbbe «mail
  // inviata: no» sia quando è tutto a posto sia quando il canale è spento.
  it('senza chiave distingue «non dovevo» da «non ho potuto»', async () => {
    const { venueId } = await sedeEAdmin()
    delete process.env.RESEND_API_KEY

    const esito = await avvisaSyncFallita({
      venueId,
      nomeConto: 'Banca della Marca - Weiss',
      errore: 'timeout',
      fallimentiConsecutivi: NOTTI_PRIMA_DELLA_MAIL,
    })

    expect(esito.mailInviata).toBe(false)
    expect(esito.mailConfigurata).toBe(false)
    expect(inviaMail).not.toHaveBeenCalled()
  })

  it('la notifica nomina il conto: senza, si è costretti ad aprire i log', async () => {
    const { venueId } = await sedeEAdmin()

    await avvisaSyncFallita({
      venueId,
      nomeConto: 'Banca della Marca - Weiss',
      errore: 'timeout',
      fallimentiConsecutivi: 1,
    })

    const riga = await prisma.notificationLog.findFirst({
      where: { type: 'BANK_SYNC_FAILED' },
    })
    expect(`${riga?.title} ${riga?.body}`).toContain('Banca della Marca - Weiss')
  })

  it('scrive sul canale in-app: è il campanello che le mostra', async () => {
    const { venueId } = await sedeEAdmin()

    await avvisaSyncFallita({
      venueId,
      nomeConto: 'Conto X',
      errore: 'timeout',
      fallimentiConsecutivi: 1,
    })

    const riga = await prisma.notificationLog.findFirst({
      where: { type: 'BANK_SYNC_FAILED' },
    })
    expect(riga?.channel).toBe('IN_APP')
    expect(riga?.readAt).toBeNull()
  })
})
