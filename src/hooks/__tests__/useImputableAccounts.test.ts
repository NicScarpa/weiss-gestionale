import { describe, it, expect } from 'vitest'
import { buildCostCenterRuleMap, buildAccountsQueryString } from '../useImputableAccounts'
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

describe('buildAccountsQueryString', () => {
  it('senza argomenti non produce alcun parametro', () => {
    expect(buildAccountsQueryString()).toBe('')
  })

  it('unisce più types in un CSV ordinato dal chiamante', () => {
    expect(buildAccountsQueryString(['COSTO', 'RICAVO'])).toBe('types=COSTO%2CRICAVO')
  })

  it('imputableOnly false non aggiunge il parametro imputable', () => {
    expect(buildAccountsQueryString(undefined, false)).toBe('')
  })

  it('imputableOnly true aggiunge imputable=true', () => {
    expect(buildAccountsQueryString(undefined, true)).toContain('imputable=true')
  })

  it('includeInactive true aggiunge includeInactive=true accanto agli altri filtri', () => {
    const qs = buildAccountsQueryString(['COSTO'], false, true)
    expect(qs).toContain('types=COSTO')
    expect(qs).toContain('includeInactive=true')
  })

  it('includeInactive false (default) non aggiunge il parametro', () => {
    expect(buildAccountsQueryString(undefined, undefined, false)).toBe('')
  })
})
