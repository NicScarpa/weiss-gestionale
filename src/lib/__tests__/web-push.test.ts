import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sendNotification = vi.fn()
const setVapidDetails = vi.fn()

vi.mock('web-push', () => ({
  default: { sendNotification, setVapidDetails },
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const SOTTOSCRIZIONE = {
  id: 's1',
  userId: 'u1',
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  p256dh: 'chiave',
  auth: 'segreto',
}

const PAYLOAD = { title: 'Turni pubblicati', body: 'Ci sono i turni della settimana' }

describe('invio via Web Push', () => {
  const originali = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    process.env.VAPID_PUBLIC_KEY = 'pubblica'
    process.env.VAPID_PRIVATE_KEY = 'privata'
    process.env.VAPID_SUBJECT = 'mailto:x@y.it'
  })

  afterEach(() => {
    process.env = { ...originali }
  })

  it('consegna il payload serializzato alla sottoscrizione', async () => {
    sendNotification.mockResolvedValue({ headers: { location: 'https://push/ricevuta/1' } })
    const { inviaPush } = await import('@/lib/notifications/web-push')

    const esito = await inviaPush(SOTTOSCRIZIONE, PAYLOAD)

    expect(esito.success).toBe(true)
    const [destinazione, corpo] = sendNotification.mock.calls[0]
    expect(destinazione).toEqual({
      endpoint: SOTTOSCRIZIONE.endpoint,
      keys: { p256dh: 'chiave', auth: 'segreto' },
    })
    expect(JSON.parse(corpo)).toEqual(PAYLOAD)
  })

  /**
   * Il caso che rendeva muto il vecchio canale: senza credenziali non si invia.
   * La differenza è che ora l'esito lo dice, invece di fingere successo.
   */
  it('senza chiavi VAPID non invia e lo dichiara', async () => {
    delete process.env.VAPID_PRIVATE_KEY
    const { inviaPush } = await import('@/lib/notifications/web-push')

    const esito = await inviaPush(SOTTOSCRIZIONE, PAYLOAD)

    expect(esito.success).toBe(false)
    expect(esito.error).toContain('non configurato')
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('riconosce come defunta una sottoscrizione revocata dal browser', async () => {
    sendNotification.mockRejectedValue({ statusCode: 410, body: 'Gone' })
    const { inviaPush, SOTTOSCRIZIONE_DEFUNTA } = await import('@/lib/notifications/web-push')

    const esito = await inviaPush(SOTTOSCRIZIONE, PAYLOAD)

    expect(esito.success).toBe(false)
    expect(esito.error).toBe(SOTTOSCRIZIONE_DEFUNTA)
  })

  it('tratta come defunta anche una sottoscrizione sconosciuta al push service', async () => {
    sendNotification.mockRejectedValue({ statusCode: 404 })
    const { inviaPush, SOTTOSCRIZIONE_DEFUNTA } = await import('@/lib/notifications/web-push')

    expect((await inviaPush(SOTTOSCRIZIONE, PAYLOAD)).error).toBe(SOTTOSCRIZIONE_DEFUNTA)
  })

  /**
   * Un errore temporaneo del push service non deve spegnere la sottoscrizione:
   * altrimenti un disservizio di mezz'ora disiscriverebbe tutti i dipendenti.
   */
  it('non scambia un errore temporaneo per una sottoscrizione defunta', async () => {
    sendNotification.mockRejectedValue({ statusCode: 503, body: 'Service Unavailable' })
    const { inviaPush, SOTTOSCRIZIONE_DEFUNTA } = await import('@/lib/notifications/web-push')

    const esito = await inviaPush(SOTTOSCRIZIONE, PAYLOAD)

    expect(esito.success).toBe(false)
    expect(esito.error).not.toBe(SOTTOSCRIZIONE_DEFUNTA)
  })

  it('mantiene l\'ordine dei risultati sull\'invio multiplo', async () => {
    sendNotification
      .mockResolvedValueOnce({ headers: {} })
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockResolvedValueOnce({ headers: {} })
    const { inviaPushMultiplo, SOTTOSCRIZIONE_DEFUNTA } = await import(
      '@/lib/notifications/web-push'
    )

    const esiti = await inviaPushMultiplo(
      [
        { ...SOTTOSCRIZIONE, id: 'a' },
        { ...SOTTOSCRIZIONE, id: 'b' },
        { ...SOTTOSCRIZIONE, id: 'c' },
      ],
      PAYLOAD
    )

    expect(esiti.map((e) => e.success)).toEqual([true, false, true])
    expect(esiti[1].error).toBe(SOTTOSCRIZIONE_DEFUNTA)
  })
})
