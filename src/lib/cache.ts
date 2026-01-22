/**
 * Cache Layer per Dati Statici
 * Cache in-memory per dati che cambiano raramente (venues, accounts, roles)
 */

import { prisma } from './prisma'
import { logger } from './logger'

// ========== TYPES ==========

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

interface VenueCache {
  id: string
  name: string
  code: string
  isActive: boolean
}

interface AccountCache {
  id: string
  code: string
  name: string
  type: string
  category: string | null
  isActive: boolean
}

interface ShiftDefinitionCache {
  id: string
  name: string
  code: string
  startTime: Date
  endTime: Date
  breakMinutes: number
}

// ========== CACHE CONFIG ==========

const CACHE_TTL = {
  VENUES: 5 * 60 * 1000, // 5 minuti
  ACCOUNTS: 5 * 60 * 1000, // 5 minuti
  SHIFT_DEFINITIONS: 5 * 60 * 1000, // 5 minuti
  SHORT: 1 * 60 * 1000, // 1 minuto
  LONG: 30 * 60 * 1000, // 30 minuti
} as const

// ========== IN-MEMORY CACHE STORE ==========

class CacheStore {
  private cache = new Map<string, CacheEntry<unknown>>()

  set<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    })
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    // Verifica se la cache è scaduta
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  invalidate(key: string): void {
    this.cache.delete(key)
  }

  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern)
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key)
      }
    }
  }

  clear(): void {
    this.cache.clear()
  }

  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    }
  }
}

// Singleton instance
export const cacheStore = new CacheStore()

// ========== CACHED DATA FETCHERS ==========

/**
 * Ottiene tutte le sedi attive (cached)
 */
export async function getCachedVenues(): Promise<VenueCache[]> {
  const cacheKey = 'venues:active'
  const cached = cacheStore.get<VenueCache[]>(cacheKey)

  if (cached) {
    return cached
  }

  try {
    const venues = await prisma.venue.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    })

    cacheStore.set(cacheKey, venues, CACHE_TTL.VENUES)
    return venues
  } catch (error) {
    logger.error('Errore caricamento venues', error)
    return []
  }
}

/**
 * Ottiene una sede per ID (cached)
 */
export async function getCachedVenueById(id: string): Promise<VenueCache | null> {
  const venues = await getCachedVenues()
  return venues.find((v) => v.id === id) || null
}

/**
 * Ottiene tutti i conti attivi (cached)
 */
export async function getCachedAccounts(type?: 'RICAVO' | 'COSTO' | 'ATTIVO' | 'PASSIVO'): Promise<AccountCache[]> {
  const cacheKey = type ? `accounts:${type}` : 'accounts:all'
  const cached = cacheStore.get<AccountCache[]>(cacheKey)

  if (cached) {
    return cached
  }

  try {
    const accounts = await prisma.account.findMany({
      where: {
        isActive: true,
        ...(type && { type }),
      },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        category: true,
        isActive: true,
      },
      orderBy: { code: 'asc' },
    })

    cacheStore.set(cacheKey, accounts, CACHE_TTL.ACCOUNTS)
    return accounts
  } catch (error) {
    logger.error('Errore caricamento accounts', error)
    return []
  }
}

/**
 * Ottiene tutte le definizioni turni (cached)
 */
export async function getCachedShiftDefinitions(venueId?: string): Promise<ShiftDefinitionCache[]> {
  const cacheKey = venueId ? `shifts:${venueId}` : 'shifts:all'
  const cached = cacheStore.get<ShiftDefinitionCache[]>(cacheKey)

  if (cached) {
    return cached
  }

  try {
    const shifts = await prisma.shiftDefinition.findMany({
      where: {
        isActive: true,
        ...(venueId && { venueId }),
      },
      select: {
        id: true,
        name: true,
        code: true,
        startTime: true,
        endTime: true,
        breakMinutes: true,
      },
      orderBy: { startTime: 'asc' },
    })

    cacheStore.set(cacheKey, shifts, CACHE_TTL.SHIFT_DEFINITIONS)
    return shifts
  } catch (error) {
    logger.error('Errore caricamento shift definitions', error)
    return []
  }
}

// ========== CACHE INVALIDATION ==========

/**
 * Invalida la cache delle sedi
 */
export function invalidateVenuesCache(): void {
  cacheStore.invalidatePattern('^venues:')
  logger.info('Cache venues invalidata')
}

/**
 * Invalida la cache dei conti
 */
export function invalidateAccountsCache(): void {
  cacheStore.invalidatePattern('^accounts:')
  logger.info('Cache accounts invalidata')
}

/**
 * Invalida la cache delle definizioni turni
 */
export function invalidateShiftsCache(): void {
  cacheStore.invalidatePattern('^shifts:')
  logger.info('Cache shifts invalidata')
}

/**
 * Invalida tutta la cache
 */
export function invalidateAllCache(): void {
  cacheStore.clear()
  logger.info('Tutta la cache invalidata')
}

// ========== GENERIC CACHE WRAPPER ==========

/**
 * Wrapper generico per cachare risultati di funzioni async
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CACHE_TTL.SHORT
): Promise<T> {
  const cached = cacheStore.get<T>(key)

  if (cached) {
    return cached
  }

  const data = await fetcher()
  cacheStore.set(key, data, ttl)
  return data
}

// ========== NEXT.JS UNSTABLE_CACHE WRAPPER ==========

// Per utilizzo con unstable_cache di Next.js (se necessario)
export const CACHE_TAGS = {
  VENUES: 'venues',
  ACCOUNTS: 'accounts',
  SHIFTS: 'shifts',
  CLOSURES: 'closures',
  JOURNAL: 'journal',
} as const

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS]

// ========== PRELOAD CACHE ==========

/**
 * Precarica la cache con dati statici comuni
 * Chiamare all'avvio dell'applicazione o periodicamente
 */
export async function preloadCache(): Promise<void> {
  logger.info('Preloading cache...')

  await Promise.all([
    getCachedVenues(),
    getCachedAccounts(),
    getCachedShiftDefinitions(),
  ])

  logger.info('Cache preloaded', cacheStore.getStats())
}
