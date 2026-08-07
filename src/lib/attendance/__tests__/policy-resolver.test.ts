import { describe, it, expect } from 'vitest'
import {
  pickEffectivePolicy,
  toPolicyRules,
  neutralPolicy,
  resolvePolicyRules,
} from '../policy-resolver'
import { at } from './fixtures'

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pol-1',
    name: 'Full time',
    dayStartMinutes: at(9),
    dayEndMinutes: at(18),
    lunchStartMinutes: at(13),
    lunchEndMinutes: at(14),
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
    useShiftAsWindow: false,
    extraBreaks: [],
    ...overrides,
  }
}

describe('pickEffectivePolicy', () => {
  const delLuogo = policyRow({ id: 'luogo' })
  const delDipendente = policyRow({ id: 'dipendente' })
  const predefinita = policyRow({ id: 'predefinita' })

  it('la regola del luogo di lavoro prevale su quella del dipendente', () => {
    const scelta = pickEffectivePolicy({
      locationPolicy: delLuogo,
      userPolicy: delDipendente,
      defaultPolicy: predefinita,
    })

    expect(scelta?.id).toBe('luogo')
  })

  it('senza regola del luogo vale quella del dipendente', () => {
    const scelta = pickEffectivePolicy({
      locationPolicy: null,
      userPolicy: delDipendente,
      defaultPolicy: predefinita,
    })

    expect(scelta?.id).toBe('dipendente')
  })

  it('senza regole specifiche resta la predefinita aziendale', () => {
    const scelta = pickEffectivePolicy({
      locationPolicy: null,
      userPolicy: null,
      defaultPolicy: predefinita,
    })

    expect(scelta?.id).toBe('predefinita')
  })

  it('se non c è nessuna regola non ne inventa una', () => {
    const scelta = pickEffectivePolicy({
      locationPolicy: null,
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

  it('se la regola non fissa le ore settimanali valgono quelle del dipendente', () => {
    // Una regola predefinita salvata senza ore settimanali non deve azzerare
    // lo straordinario di chi un contratto ce l'ha: 40 ore su 6 giorni = 400 min
    const regole = toPolicyRules(policyRow({ contractWeeklyHours: null }), 40)

    expect(regole.contractDailyMinutes).toBe(400)
  })

  it('senza ore né sulla regola né sul contratto vale il default di 8 ore', () => {
    // È il comportamento del calcolo paghe prima delle regole orario
    const regole = toPolicyRules(policyRow({ contractWeeklyHours: null }), null)

    expect(regole.contractDailyMinutes).toBe(at(8))
  })
})

describe('neutralPolicy', () => {
  it('non applica finestre né arrotondamenti', () => {
    const regole = neutralPolicy(null)

    expect(regole.dayStartMinutes).toBeNull()
    expect(regole.entryRounding.intervalMinutes).toBe(1)
    expect(regole.lunch).toBeNull()
  })

  it('usa le ore di contratto del dipendente quando ci sono', () => {
    const regole = neutralPolicy(48)

    expect(regole.contractDailyMinutes).toBe(at(8))
  })

  it('senza contratto usa il default storico di 8 ore al giorno', () => {
    // Il vecchio calcolo paghe usava 8 ore quando il contratto mancava: chi
    // non ha regole deve continuare a essere calcolato esattamente come prima
    const regole = neutralPolicy(null)

    expect(regole.contractDailyMinutes).toBe(at(8))
  })
})

describe('resolvePolicyRules', () => {
  const contesto = {
    defaultPolicy: policyRow({ id: 'predefinita', name: 'Predefinita' }),
    userPolicyByUserId: new Map([['user-2', policyRow({ id: 'suo', name: 'Part time' })]]),
    locationPolicyByLocationId: new Map([
      ['loc-1', policyRow({ id: 'del-locale', name: 'Orario del bar' })],
    ]),
  }

  it('usa la regola del luogo in cui si è timbrato', () => {
    const { policyName } = resolvePolicyRules(contesto, 'user-2', 'loc-1', null)

    expect(policyName).toBe('Orario del bar')
  })

  it('ricade sulla regola del dipendente se il luogo non ne ha una', () => {
    const { policyName } = resolvePolicyRules(contesto, 'user-2', 'loc-senza-regola', null)

    expect(policyName).toBe('Part time')
  })

  it('senza luogo indicato vale la regola del dipendente', () => {
    const { policyName } = resolvePolicyRules(contesto, 'user-2', null, null)

    expect(policyName).toBe('Part time')
  })

  it('per chi non ha regole proprie resta la predefinita', () => {
    const { policyName } = resolvePolicyRules(contesto, 'user-9', null, null)

    expect(policyName).toBe('Predefinita')
  })

  it('il contratto del dipendente completa la regola che non fissa le ore', () => {
    // La predefinita del contesto non ha ore settimanali: per un dipendente
    // con 40 ore di contratto lo straordinario scatta comunque a 400 min
    const { rules } = resolvePolicyRules(contesto, 'user-9', null, 40)

    expect(rules.contractDailyMinutes).toBe(400)
  })
})

describe('resolvePolicyRules con la decorrenza (versioni congelate)', () => {
  // La regola oggi ha tolleranza 15, ma prima del 15 agosto valeva 5:
  // la modifica è stata salvata con decorrenza 2026-08-15, congelando i
  // vecchi valori in una versione valida per i giorni precedenti.
  function versione(overrides: Record<string, unknown> = {}) {
    const { id: _id, ...senzaId } = policyRow()
    return {
      ...senzaId,
      effectiveUntil: new Date('2026-08-15T00:00:00Z'),
      roundingToleranceMinutes: 5,
      ...overrides,
    }
  }

  function contestoCon(row: ReturnType<typeof policyRow>) {
    return {
      defaultPolicy: row,
      userPolicyByUserId: new Map(),
      locationPolicyByLocationId: new Map(),
    }
  }

  it('un giorno prima della decorrenza usa i valori congelati', () => {
    const contesto = contestoCon(
      policyRow({ roundingToleranceMinutes: 15, versions: [versione()] })
    )

    const { rules } = resolvePolicyRules(contesto, 'user-1', null, null, '2026-08-10')

    expect(rules.entryRounding.toleranceMinutes).toBe(5)
  })

  it('dal giorno di decorrenza in poi valgono i valori attuali', () => {
    const contesto = contestoCon(
      policyRow({ roundingToleranceMinutes: 15, versions: [versione()] })
    )

    const { rules } = resolvePolicyRules(contesto, 'user-1', null, null, '2026-08-15')

    expect(rules.entryRounding.toleranceMinutes).toBe(15)
  })

  it('con più modifiche vince la versione in vigore quel giorno', () => {
    const contesto = contestoCon(
      policyRow({
        roundingToleranceMinutes: 15,
        versions: [
          versione({
            effectiveUntil: new Date('2026-08-10T00:00:00Z'),
            roundingToleranceMinutes: 0,
          }),
          versione({
            effectiveUntil: new Date('2026-08-20T00:00:00Z'),
            roundingToleranceMinutes: 5,
          }),
        ],
      })
    )

    const il = (giorno: string) =>
      resolvePolicyRules(contesto, 'user-1', null, null, giorno).rules
        .entryRounding.toleranceMinutes

    expect(il('2026-08-05')).toBe(0)
    expect(il('2026-08-12')).toBe(5)
    expect(il('2026-08-25')).toBe(15)
  })

  it('senza versioni la data non cambia nulla', () => {
    const contesto = contestoCon(policyRow({ roundingToleranceMinutes: 15 }))

    const { rules } = resolvePolicyRules(contesto, 'user-1', null, null, '2026-08-10')

    expect(rules.entryRounding.toleranceMinutes).toBe(15)
  })

  it('senza data vale la riga attuale, come sempre', () => {
    const contesto = contestoCon(
      policyRow({ roundingToleranceMinutes: 15, versions: [versione()] })
    )

    const { rules } = resolvePolicyRules(contesto, 'user-1', null, null)

    expect(rules.entryRounding.toleranceMinutes).toBe(15)
  })
})
