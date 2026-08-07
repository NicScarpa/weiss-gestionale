import { describe, it, expect } from 'vitest'
import { buildCostCenterRuleMap } from '../useImputableAccounts'
import type { ComboboxAccount } from '../useImputableAccounts'

function account(overrides: Partial<ComboboxAccount>): ComboboxAccount {
  return {
    id: 'default-id',
    code: '60.1.01',
    name: 'Conto di test',
    type: 'COSTO',
    mastroCode: '60',
    mastroNome: 'Mastro',
    gruppoCode: '60.1',
    gruppoNome: 'Gruppo',
    costCenterRule: 'DEFAULT_STR',
    ...overrides,
  }
}

describe('buildCostCenterRuleMap', () => {
  it('mappa ogni accountId sulla propria costCenterRule', () => {
    const accounts = [
      account({ id: 'a1', costCenterRule: 'DEFAULT_STR' }),
      account({ id: 'a2', costCenterRule: 'OBBLIGATORIO' }),
    ]
    const map = buildCostCenterRuleMap(accounts)
    expect(map.get('a1')).toBe('DEFAULT_STR')
    expect(map.get('a2')).toBe('OBBLIGATORIO')
  })

  it('lista vuota produce una mappa vuota', () => {
    expect(buildCostCenterRuleMap([]).size).toBe(0)
  })

  it('un accountId assente dalla lista non è nella mappa', () => {
    const map = buildCostCenterRuleMap([account({ id: 'a1' })])
    expect(map.has('conto-non-caricato')).toBe(false)
  })
})
