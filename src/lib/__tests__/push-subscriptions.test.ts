import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushSubscription = {
  upsert: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

vi.mock('@/lib/prisma', () => ({ prisma: { pushSubscription } }))

const {
  salvaSottoscrizione,
  sottoscrizioniAttive,
  sottoscrizioniAttiveDi,
  trovaPerEndpoint,
  disattivaSottoscrizione,
} = await import('@/lib/notifications/subscriptions')

const DATI = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'chiave-pubblica-del-browser', auth: 'segreto' },
}

describe('sottoscrizioni push', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pushSubscription.upsert.mockResolvedValue({ id: '1', deviceName: null, deviceType: null })
  })

  /**
   * L'endpoint è la chiave naturale della sottoscrizione: un dispositivo che si
   * risottoscrive deve aggiornare la propria riga, non aggiungerne una seconda,
   * o si ritroverebbe ogni notifica in doppia copia.
   */
  it('usa l\'endpoint come chiave, così il dispositivo non si duplica', async () => {
    await salvaSottoscrizione({ userId: 'u1', dati: DATI })

    const chiamata = pushSubscription.upsert.mock.calls[0][0]
    expect(chiamata.where).toEqual({ endpoint: DATI.endpoint })
    expect(chiamata.create).toMatchObject({
      endpoint: DATI.endpoint,
      p256dh: DATI.keys.p256dh,
      auth: DATI.keys.auth,
      userId: 'u1',
      isActive: true,
    })
  })

  it('riattiva una sottoscrizione che era stata spenta', async () => {
    await salvaSottoscrizione({ userId: 'u1', dati: DATI })

    expect(pushSubscription.upsert.mock.calls[0][0].update).toMatchObject({ isActive: true })
  })

  it('converte in data la scadenza dichiarata dal browser', async () => {
    const scadenza = Date.UTC(2026, 7, 20, 12, 0, 0)

    await salvaSottoscrizione({ userId: 'u1', dati: { ...DATI, expirationTime: scadenza } })

    expect(pushSubscription.upsert.mock.calls[0][0].create.expiresAt).toEqual(new Date(scadenza))
  })

  it('lascia vuota la scadenza quando il browser non la dichiara', async () => {
    await salvaSottoscrizione({ userId: 'u1', dati: DATI })

    expect(pushSubscription.upsert.mock.calls[0][0].create.expiresAt).toBeNull()
  })

  it('chiede al database i soli campi che servono a inviare', async () => {
    pushSubscription.findMany.mockResolvedValue([])

    await sottoscrizioniAttive('u1')

    expect(pushSubscription.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', isActive: true },
      select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
    })
  })

  it('non interroga il database per un elenco di utenti vuoto', async () => {
    expect(await sottoscrizioniAttiveDi([])).toEqual([])
    expect(pushSubscription.findMany).not.toHaveBeenCalled()
  })

  it('cerca per endpoint sull\'indice unique', async () => {
    pushSubscription.findUnique.mockResolvedValue({ id: 's1', userId: 'u1' })

    expect(await trovaPerEndpoint(DATI.endpoint)).toEqual({ id: 's1', userId: 'u1' })
    expect(pushSubscription.findUnique).toHaveBeenCalledWith({
      where: { endpoint: DATI.endpoint },
      select: { id: true, userId: true },
    })
  })

  it('disattiva la sottoscrizione senza cancellarla', async () => {
    pushSubscription.update.mockResolvedValue({})

    await disattivaSottoscrizione('s1')

    expect(pushSubscription.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { isActive: false },
    })
  })
})
