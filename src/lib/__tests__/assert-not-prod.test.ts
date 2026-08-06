import { describe, it, expect } from 'vitest'
import {
  assertNotProd,
  extractHost,
  hasProductionOverride,
  isProductionUrl,
  ProductionGuardError,
  type GuardEnv,
} from '../../../scripts/guards/assert-not-prod'

const URL_PRODUZIONE =
  'postgresql://postgres.abcdef:segretissima@aws-1-eu-west-2.pooler.supabase.com:5432/postgres'
const URL_LOCALE = 'postgresql://nicolascarpa@127.0.0.1:5433/weiss_dev'

describe('isProductionUrl', () => {
  it('blocca il pooler Supabase, che è la produzione di questo progetto', () => {
    expect(isProductionUrl(URL_PRODUZIONE)).toBe(true)
  })

  it('lascia passare gli host locali', () => {
    expect(isProductionUrl(URL_LOCALE)).toBe(false)
    expect(isProductionUrl('postgresql://utente:pw@localhost:5432/weiss_dev')).toBe(false)
    expect(isProductionUrl('postgres://utente@127.0.0.1:5432/db?schema=public')).toBe(false)
    expect(isProductionUrl('postgresql://utente@[::1]:5432/db')).toBe(false)
  })

  it('blocca qualunque host remoto, non solo Supabase', () => {
    expect(isProductionUrl('postgresql://utente:pw@db.railway.internal:5432/railway')).toBe(true)
    expect(isProductionUrl('postgresql://utente:pw@10.0.0.7:5432/db')).toBe(true)
  })

  it('blocca quando DATABASE_URL manca o è vuota', () => {
    expect(isProductionUrl(undefined)).toBe(true)
    expect(isProductionUrl(null)).toBe(true)
    expect(isProductionUrl('')).toBe(true)
    expect(isProductionUrl('   ')).toBe(true)
  })

  it('blocca quando la stringa non è interpretabile come URL', () => {
    expect(isProductionUrl('non-un-url')).toBe(true)
    expect(isProductionUrl('postgresql://')).toBe(true)
  })

  it('non si fa ingannare da una password che somiglia a un host locale', () => {
    expect(isProductionUrl('postgresql://utente:localhost@db.esempio.com:5432/db')).toBe(true)
    expect(isProductionUrl('postgresql://utente:127.0.0.1@db.esempio.com:5432/db')).toBe(true)
  })
})

describe('extractHost', () => {
  it('estrae l’host anche con caratteri speciali nella password', () => {
    expect(extractHost('postgresql://utente:pa@ss@db.esempio.com:5432/db')).toBe('db.esempio.com')
  })

  it('normalizza IPv6 e maiuscole', () => {
    expect(extractHost('postgresql://utente@[::1]:5432/db')).toBe('::1')
    expect(extractHost('postgresql://utente@LOCALHOST:5432/db')).toBe('localhost')
  })

  it('restituisce null se non riesce a leggere un host', () => {
    expect(extractHost('non-un-url')).toBeNull()
  })
})

describe('hasProductionOverride', () => {
  it('riconosce solo il valore esatto 1', () => {
    expect(hasProductionOverride({ I_KNOW_THIS_IS_PROD: '1' })).toBe(true)
    expect(hasProductionOverride({ I_KNOW_THIS_IS_PROD: 'true' })).toBe(false)
    expect(hasProductionOverride({ I_KNOW_THIS_IS_PROD: '0' })).toBe(false)
    expect(hasProductionOverride({ I_KNOW_THIS_IS_PROD: '' })).toBe(false)
    expect(hasProductionOverride({})).toBe(false)
  })
})

describe('assertNotProd', () => {
  it('lascia passare un database locale', () => {
    expect(() => assertNotProd({ DATABASE_URL: URL_LOCALE })).not.toThrow()
  })

  it('ferma il comando quando DATABASE_URL punta alla produzione', () => {
    expect(() => assertNotProd({ DATABASE_URL: URL_PRODUZIONE })).toThrow(ProductionGuardError)
  })

  it('ferma il comando quando DATABASE_URL non è impostata', () => {
    expect(() => assertNotProd({})).toThrow(ProductionGuardError)
  })

  it('lascia passare la produzione solo con I_KNOW_THIS_IS_PROD=1', () => {
    const env: GuardEnv = { DATABASE_URL: URL_PRODUZIONE, I_KNOW_THIS_IS_PROD: '1' }
    expect(() => assertNotProd(env)).not.toThrow()
    expect(() => assertNotProd({ ...env, I_KNOW_THIS_IS_PROD: 'sì' })).toThrow(ProductionGuardError)
  })

  it('spiega nel messaggio quale host ha bloccato e come forzare', () => {
    let messaggio = ''
    try {
      assertNotProd({ DATABASE_URL: URL_PRODUZIONE })
    } catch (error) {
      messaggio = (error as Error).message
    }

    expect(messaggio).toContain('aws-1-eu-west-2.pooler.supabase.com')
    expect(messaggio).toContain('I_KNOW_THIS_IS_PROD=1')
    // La password non deve finire nei log del terminale né nella CI.
    expect(messaggio).not.toContain('segretissima')
  })
})
