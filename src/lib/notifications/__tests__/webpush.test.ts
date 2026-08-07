import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sendNotification = vi.fn()
const setVapidDetails = vi.fn()

vi.mock('web-push', () => ({
  default: {
    sendNotification: (...args: unknown[]) => sendNotification(...args),
    setVapidDetails: (...args: unknown[]) => setVapidDetails(...args),
  },
}))

import { buildPushPayload, sendWebPush, sendWebPushBatch } from '../webpush'

const iscrizione = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  p256dh: 'chiave-pubblica-del-browser',
  auth: 'segreto-del-browser',
}

const avviso = {
  type: 'CLOCK_REMINDER' as const,
  title: 'Il tuo turno è finito',
  body: "Ricordati di timbrare l'uscita",
  url: '/portale/timbra',
}

describe('buildPushPayload', () => {
  it('confeziona quello che il service worker si aspetta di leggere', () => {
    // Il service worker legge title, body, tag e data.url: se cambiano i nomi
    // la notifica arriva muta o senza collegamento.
    const payload = JSON.parse(buildPushPayload(avviso))

    expect(payload.title).toBe('Il tuo turno è finito')
    expect(payload.body).toBe("Ricordati di timbrare l'uscita")
    expect(payload.tag).toBe('CLOCK_REMINDER')
    expect(payload.data.url).toBe('/portale/timbra')
    expect(payload.data.type).toBe('CLOCK_REMINDER')
  })

  it('porta anche i riferimenti, per aprire la cosa giusta', () => {
    const payload = JSON.parse(
      buildPushPayload({ ...avviso, referenceId: 'anom-1', referenceType: 'AttendanceAnomaly' })
    )

    expect(payload.data.referenceId).toBe('anom-1')
    expect(payload.data.referenceType).toBe('AttendanceAnomaly')
  })
})

describe('sendWebPush', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.VAPID_PUBLIC_KEY = 'pubblica'
    process.env.VAPID_PRIVATE_KEY = 'privata'
    process.env.VAPID_SUBJECT = 'mailto:test@weisscafe.com'
  })

  afterEach(() => {
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
  })

  it('invia al browser iscritto e riferisce il successo', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 })

    const esito = await sendWebPush(iscrizione, avviso)

    expect(esito.success).toBe(true)
    const [destinatario] = sendNotification.mock.calls[0]
    expect(destinatario.endpoint).toBe(iscrizione.endpoint)
    expect(destinatario.keys.p256dh).toBe(iscrizione.p256dh)
  })

  it("senza chiavi configurate non finge di aver inviato", async () => {
    delete process.env.VAPID_PUBLIC_KEY

    const esito = await sendWebPush(iscrizione, avviso)

    expect(esito.success).toBe(false)
    expect(esito.error).toContain('VAPID')
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it("un'iscrizione non più valida si riconosce, per poterla disattivare", async () => {
    // 404 e 410 sono il modo in cui il browser dice "questo dispositivo non
    // esiste più": vanno distinti dagli errori temporanei, altrimenti si
    // continuerebbe a scrivere a un indirizzo morto per sempre.
    sendNotification.mockRejectedValue({ statusCode: 410, body: 'Gone' })

    const esito = await sendWebPush(iscrizione, avviso)

    expect(esito.success).toBe(false)
    expect(esito.error).toBe('invalid_token')
  })

  it('un errore temporaneo non fa perdere l\'iscrizione', async () => {
    sendNotification.mockRejectedValue({ statusCode: 503, body: 'Service Unavailable' })

    const esito = await sendWebPush(iscrizione, avviso)

    expect(esito.success).toBe(false)
    expect(esito.error).not.toBe('invalid_token')
  })
})

describe('sendWebPushBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.VAPID_PUBLIC_KEY = 'pubblica'
    process.env.VAPID_PRIVATE_KEY = 'privata'
  })

  it('il fallimento di un dispositivo non ferma gli altri', async () => {
    sendNotification
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockResolvedValueOnce({ statusCode: 201 })

    const esiti = await sendWebPushBatch(
      [
        { ...iscrizione, endpoint: 'https://esempio/1' },
        { ...iscrizione, endpoint: 'https://esempio/2' },
      ],
      avviso
    )

    expect(esiti).toHaveLength(2)
    expect(esiti[0].success).toBe(false)
    expect(esiti[1].success).toBe(true)
  })
})
