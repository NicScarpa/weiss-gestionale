import { describe, it, expect } from 'vitest'
import { ultimeEntrateAperte } from '../sessioni-aperte'

function timbratura(
  userId: string,
  punchType: 'IN' | 'OUT' | 'BREAK_START' | 'BREAK_END',
  iso: string
) {
  return { userId, punchType, punchedAt: new Date(iso) }
}

describe('ultimeEntrateAperte', () => {
  it('chi ha solo l\'entrata risulta dentro, con l\'orario dell\'entrata', () => {
    const aperte = ultimeEntrateAperte([
      timbratura('anna', 'IN', '2026-08-06T16:00:00Z'),
    ])

    expect(aperte.get('anna')?.toISOString()).toBe('2026-08-06T16:00:00.000Z')
  })

  it('chi è uscito non risulta dentro', () => {
    const aperte = ultimeEntrateAperte([
      timbratura('anna', 'IN', '2026-08-06T16:00:00Z'),
      timbratura('anna', 'OUT', '2026-08-06T21:00:00Z'),
    ])

    expect(aperte.has('anna')).toBe(false)
  })

  it('chi è rientrato dopo un\'uscita risulta dentro dal rientro', () => {
    // Il turno spezzato: mattina chiusa, sera ancora aperta.
    const aperte = ultimeEntrateAperte([
      timbratura('anna', 'IN', '2026-08-06T05:00:00Z'),
      timbratura('anna', 'OUT', '2026-08-06T11:00:00Z'),
      timbratura('anna', 'IN', '2026-08-06T15:00:00Z'),
    ])

    expect(aperte.get('anna')?.toISOString()).toBe('2026-08-06T15:00:00.000Z')
  })

  it('le pause non chiudono la sessione', () => {
    const aperte = ultimeEntrateAperte([
      timbratura('anna', 'IN', '2026-08-06T16:00:00Z'),
      timbratura('anna', 'BREAK_START', '2026-08-06T18:00:00Z'),
      timbratura('anna', 'BREAK_END', '2026-08-06T18:15:00Z'),
    ])

    expect(aperte.get('anna')?.toISOString()).toBe('2026-08-06T16:00:00.000Z')
  })

  it('valuta ogni persona per conto suo', () => {
    const aperte = ultimeEntrateAperte([
      timbratura('anna', 'IN', '2026-08-06T16:00:00Z'),
      timbratura('bruno', 'IN', '2026-08-06T16:00:00Z'),
      timbratura('bruno', 'OUT', '2026-08-06T22:00:00Z'),
    ])

    expect(aperte.has('anna')).toBe(true)
    expect(aperte.has('bruno')).toBe(false)
  })
})
