import { describe, it, expect } from 'vitest'
import { pickEffectivePolicy, toPolicyRules, neutralPolicy } from '../policy-resolver'
import { at } from './fixtures'

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pol-1',
    name: 'Full time',
    dayStartMinutes: at(9),
    dayEndMinutes: at(18),
    lunchStartMinutes: at(13),
    lunchEndMinutes: at(14),
    lunchWindowMinutes: 30,
    flexMinutes: 15,
    roundingMinutes: 15,
    roundingToleranceMinutes: 5,
    roundingOutMinutes: null,
    roundingOutToleranceMinutes: null,
    maxDailyMinutes: null,
    contractWeeklyHours: null,
    saturdayAsOvertime: false,
    blockSunday: false,
    singlePunchMode: false,
    extraBreaks: [],
    ...overrides,
  }
}

describe('pickEffectivePolicy', () => {
  const dellaSede = policyRow({ id: 'sede' })
  const delDipendente = policyRow({ id: 'dipendente' })
  const predefinita = policyRow({ id: 'predefinita' })

  it('la regola del locale prevale su quella del dipendente', () => {
    const scelta = pickEffectivePolicy({
      venuePolicy: dellaSede,
      userPolicy: delDipendente,
      defaultPolicy: predefinita,
    })

    expect(scelta?.id).toBe('sede')
  })

  it('senza regola del locale vale quella del dipendente', () => {
    const scelta = pickEffectivePolicy({
      venuePolicy: null,
      userPolicy: delDipendente,
      defaultPolicy: predefinita,
    })

    expect(scelta?.id).toBe('dipendente')
  })

  it('senza regole specifiche resta la predefinita aziendale', () => {
    const scelta = pickEffectivePolicy({
      venuePolicy: null,
      userPolicy: null,
      defaultPolicy: predefinita,
    })

    expect(scelta?.id).toBe('predefinita')
  })

  it('se non c è nessuna regola non ne inventa una', () => {
    const scelta = pickEffectivePolicy({
      venuePolicy: null,
      userPolicy: null,
      defaultPolicy: null,
    })

    expect(scelta).toBeNull()
  })
})

describe('toPolicyRules', () => {
  it('traduce la riga del database nei termini del motore', () => {
    const regole = toPolicyRules(policyRow())

    expect(regole.dayStartMinutes).toBe(at(9))
    expect(regole.lunch).toEqual({ startMinutes: at(13), endMinutes: at(14) })
    expect(regole.entryRounding).toEqual({ intervalMinutes: 15, toleranceMinutes: 5 })
  })

  it("in mancanza di valori propri l'uscita usa l'arrotondamento dell'entrata", () => {
    const regole = toPolicyRules(policyRow())

    expect(regole.exitRounding).toEqual({ intervalMinutes: 15, toleranceMinutes: 5 })
  })

  it("l'uscita può avere intervallo e tolleranza suoi", () => {
    const regole = toPolicyRules(
      policyRow({ roundingOutMinutes: 30, roundingOutToleranceMinutes: 10 })
    )

    expect(regole.exitRounding).toEqual({ intervalMinutes: 30, toleranceMinutes: 10 })
  })

  it('senza pausa pranzo configurata non deduce nulla', () => {
    const regole = toPolicyRules(
      policyRow({ lunchStartMinutes: null, lunchEndMinutes: null })
    )

    expect(regole.lunch).toBeNull()
  })

  it('ricava le ore giornaliere da contratto da quelle settimanali', () => {
    // Convenzione già in uso nel calcolo paghe: settimana su sei giorni
    const regole = toPolicyRules(policyRow({ contractWeeklyHours: 36 }))

    expect(regole.contractDailyMinutes).toBe(at(6))
  })
})

describe('neutralPolicy', () => {
  it('non applica finestre né arrotondamenti', () => {
    const regole = neutralPolicy(null)

    expect(regole.dayStartMinutes).toBeNull()
    expect(regole.entryRounding.intervalMinutes).toBe(1)
    expect(regole.lunch).toBeNull()
    expect(regole.contractDailyMinutes).toBeNull()
  })

  it('usa le ore di contratto del dipendente quando ci sono', () => {
    const regole = neutralPolicy(48)

    expect(regole.contractDailyMinutes).toBe(at(8))
  })
})
