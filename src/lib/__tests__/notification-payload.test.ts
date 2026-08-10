import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { componiPushPayload } from '@/lib/notifications/send'
import { NotificationType } from '@prisma/client'

/**
 * Il corpo del push è un contratto con `src/app/sw.ts`: il service worker legge
 * `title`, `body`, `tag`, `data.url` e `type` (da cui sceglie le azioni della
 * notifica). Sbagliare un nome qui non rompe nessuna compilazione, spegne solo
 * il click o i pulsanti sulla notifica, che è invisibile finché non lo si prova
 * su un telefono vero.
 */
describe('corpo della notifica push', () => {
  const base = {
    type: NotificationType.SHIFT_PUBLISHED,
    title: 'Turni pubblicati',
    body: 'Ci sono i turni della settimana',
  }

  it('confeziona quello che il service worker si aspetta di leggere', () => {
    const corpo = componiPushPayload({ ...base, url: '/portale/turni' })

    expect(corpo.title).toBe('Turni pubblicati')
    expect(corpo.body).toBe('Ci sono i turni della settimana')
    expect(corpo.tag).toBe(NotificationType.SHIFT_PUBLISHED)
    // Di primo livello: `sw.ts` lo usa per scegliere le azioni della notifica.
    expect(corpo.type).toBe(NotificationType.SHIFT_PUBLISHED)
    expect(corpo.data?.url).toBe('/portale/turni')
    expect(corpo.data?.type).toBe(NotificationType.SHIFT_PUBLISHED)
  })

  it('porta anche i riferimenti', () => {
    const corpo = componiPushPayload({
      ...base,
      referenceId: 'sch_1',
      referenceType: 'ShiftSchedule',
    })

    expect(corpo.data?.referenceId).toBe('sch_1')
    expect(corpo.data?.referenceType).toBe('ShiftSchedule')
  })

  it('non lascia che un data arbitrario dirotti il click', () => {
    const corpo = componiPushPayload({
      ...base,
      url: '/portale/turni',
      data: { url: 'https://altrove.example/phishing', extra: 'conservato' },
    })

    expect(corpo.data?.url).toBe('/portale/turni')
    expect(corpo.data?.extra).toBe('conservato')
  })

  it('un campo di sistema vuoto non cancella quello passato in data', () => {
    const corpo = componiPushPayload({ ...base, data: { url: '/portale/documenti' } })

    expect(corpo.data?.url).toBe('/portale/documenti')
  })
})
