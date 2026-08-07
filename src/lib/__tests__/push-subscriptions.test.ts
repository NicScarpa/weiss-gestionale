import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushSubscription = {
  upsert: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}

vi.mock('@/lib/prisma', () => ({ prisma: { pushSubscription } }))

const {
  salvaSottoscrizione,
  sottoscrizioniAttive,
  sottoscrizioniAttiveDi,
  disattivaSottoscrizione,
} = await import('@/lib/notifications/subscriptions')

const DATI = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'chiave-pubblica-del-browser', auth: 'segreto' },
}

describe('sottoscrizioni push', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * La tripletta viaggia in una colonna sola: se l'ordine dei campi dipendesse
   * dal client, lo stesso dispositivo potrebbe generare due righe diverse e
   * ricevere ogni notifica due volte.
   */
  it('persiste la sottoscrizione in forma canonica, non nell\'ordine ricevuto', async () => {
    pushSubscription.upsert.mockResolvedValue({ id: '1', deviceName: null, deviceType: null })

    await salvaSottoscrizione({ userId: 'u1', dati: DATI })
    const primaChiamata = pushSubscription.upsert.mock.calls[0][0].where.fcmToken

    // Stessa sottoscrizione, campi in ordine invertito.
    await salvaSottoscrizione({
      userId: 'u1',
      dati: { keys: { auth: DATI.keys.auth, p256dh: DATI.keys.p256dh }, endpoint: DATI.endpoint },
    })
    const secondaChiamata = pushSubscription.upsert.mock.calls[1][0].where.fcmToken

    expect(primaChiamata).toBe(secondaChiamata)
    expect(JSON.parse(primaChiamata)).toEqual(DATI)
  })

  it('restituisce endpoint e chiavi separati a chi deve inviare', async () => {
    pushSubscription.findMany.mockResolvedValue([
      { id: 's1', userId: 'u1', fcmToken: JSON.stringify(DATI) },
    ])

    const attive = await sottoscrizioniAttive('u1')

    expect(attive).toEqual([
      {
        id: 's1',
        userId: 'u1',
        endpoint: DATI.endpoint,
        p256dh: DATI.keys.p256dh,
        auth: DATI.keys.auth,
      },
    ])
  })

  /**
   * In tabella restano i vecchi token Firebase, che non contengono le chiavi di
   * cifratura. Vanno ignorati invece di far fallire l'invio a tutti gli altri.
   */
  it('scarta le righe nel vecchio formato Firebase', async () => {
    pushSubscription.findMany.mockResolvedValue([
      { id: 'vecchia', userId: 'u1', fcmToken: 'token-fcm-nudo' },
      { id: 'nuova', userId: 'u1', fcmToken: JSON.stringify(DATI) },
    ])

    const attive = await sottoscrizioniAttive('u1')

    expect(attive).toHaveLength(1)
    expect(attive[0].id).toBe('nuova')
  })

  it('scarta anche le righe a cui mancano le chiavi', async () => {
    pushSubscription.findMany.mockResolvedValue([
      { id: 'monca', userId: 'u1', fcmToken: JSON.stringify({ endpoint: DATI.endpoint }) },
    ])

    expect(await sottoscrizioniAttive('u1')).toEqual([])
  })

  it('non interroga il database per un elenco di utenti vuoto', async () => {
    expect(await sottoscrizioniAttiveDi([])).toEqual([])
    expect(pushSubscription.findMany).not.toHaveBeenCalled()
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
