import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getVapidConfig, isPushConfigured, getVapidPublicKey } from '@/lib/notifications/vapid'

/**
 * Il canale push è configurato solo se ci sono tutte e tre le variabili.
 * Il punto non è accademico: finché mancavano, il vecchio percorso Firebase
 * falliva in silenzio e la UI continuava a dire all'utente che le notifiche
 * erano attive. Qui si pretende che "mezza configurazione" valga zero, così
 * che chi legge lo stato non possa essere ingannato.
 */
describe('configurazione del canale push', () => {
  const originali = { ...process.env }

  beforeEach(() => {
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
    delete process.env.VAPID_SUBJECT
  })

  afterEach(() => {
    process.env = { ...originali }
  })

  it('non è configurato quando non c\'è nessuna variabile', () => {
    expect(isPushConfigured()).toBe(false)
    expect(getVapidConfig()).toBeNull()
    expect(getVapidPublicKey()).toBeNull()
  })

  it('non è configurato se manca la sola chiave privata', () => {
    process.env.VAPID_PUBLIC_KEY = 'pubblica'
    process.env.VAPID_SUBJECT = 'mailto:x@y.it'

    expect(isPushConfigured()).toBe(false)
  })

  it('non è configurato se manca il solo soggetto', () => {
    process.env.VAPID_PUBLIC_KEY = 'pubblica'
    process.env.VAPID_PRIVATE_KEY = 'privata'

    expect(isPushConfigured()).toBe(false)
  })

  it('è configurato quando ci sono tutte e tre', () => {
    process.env.VAPID_PUBLIC_KEY = 'pubblica'
    process.env.VAPID_PRIVATE_KEY = 'privata'
    process.env.VAPID_SUBJECT = 'mailto:x@y.it'

    expect(isPushConfigured()).toBe(true)
    expect(getVapidConfig()).toEqual({
      publicKey: 'pubblica',
      privateKey: 'privata',
      subject: 'mailto:x@y.it',
    })
  })

  it('espone al client la sola chiave pubblica', () => {
    process.env.VAPID_PUBLIC_KEY = 'pubblica'
    process.env.VAPID_PRIVATE_KEY = 'privata-da-non-divulgare'
    process.env.VAPID_SUBJECT = 'mailto:x@y.it'

    expect(getVapidPublicKey()).toBe('pubblica')
  })
})
