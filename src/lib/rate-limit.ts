/**
 * Rate Limiting con Upstash Redis (o fallback in-memory)
 * Protegge gli endpoint da abusi e attacchi brute force
 */
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { logger } from './logger'

// ========== UPSTASH REDIS RATE LIMITER ==========

// Inizializza Redis solo se le env vars sono configurate
let redis: Redis | null = null
let isUpstashConfigured = false

try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    isUpstashConfigured = true
    logger.info('Upstash Redis configurato per rate limiting')
  } else {
    logger.warn('Upstash Redis non configurato - usando rate limiting in-memory')
  }
} catch (error) {
  logger.error('Errore inizializzazione Redis', error)
}

/**
 * Rate limiter generico - 100 richieste per minuto
 */
export const ratelimit = isUpstashConfigured && redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, '60 s'),
      analytics: true,
      prefix: 'ratelimit:api',
    })
  : null

/**
 * Rate limiter per autenticazione - 5 tentativi per minuto
 * Protegge da attacchi brute force
 */
export const authRateLimit = isUpstashConfigured && redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '60 s'),
      analytics: true,
      prefix: 'ratelimit:auth',
    })
  : null

/**
 * Rate limiter per import - 3 import per minuto
 * Protegge da upload massivi
 */
export const importRateLimit = isUpstashConfigured && redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '60 s'),
      analytics: true,
      prefix: 'ratelimit:import',
    })
  : null

/**
 * Rate limiter per operazioni critiche - 10 per minuto
 * Per delete, validate, etc.
 */
export const criticalRateLimit = isUpstashConfigured && redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '60 s'),
      analytics: true,
      prefix: 'ratelimit:critical',
    })
  : null

// ========== IN-MEMORY FALLBACK ==========

interface RateLimitRecord {
  count: number
  resetAt: number
}

// In-memory store (per-instance fallback)
const store = new Map<string, RateLimitRecord>()

// Cleanup old entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, record] of store.entries()) {
      if (record.resetAt < now) {
        store.delete(key)
      }
    }
  }, 60000)
}

export interface RateLimitConfig {
  /** Maximum number of requests allowed */
  limit: number
  /** Time window in milliseconds */
  windowMs: number
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean
  /** Number of requests remaining */
  remaining: number
  /** When the rate limit resets (Unix timestamp) */
  reset: number
  /** Total limit */
  limit: number
}

// Default configurations
export const RATE_LIMIT_CONFIGS = {
  /** Auth endpoints: 5 requests per minute */
  AUTH: { limit: 5, windowMs: 60 * 1000 },
  /** API endpoints: 100 requests per minute */
  API: { limit: 100, windowMs: 60 * 1000 },
  /** Strict: 10 requests per minute (for sensitive operations) */
  STRICT: { limit: 10, windowMs: 60 * 1000 },
  /** Generous: 200 requests per minute (for read-heavy endpoints) */
  GENEROUS: { limit: 200, windowMs: 60 * 1000 },
  /** Import: 3 requests per minute */
  IMPORT: { limit: 3, windowMs: 60 * 1000 },
} as const

/**
 * Check rate limit using Upstash or fallback to in-memory
 */
export async function checkRateLimitAsync(
  identifier: string,
  limiter: Ratelimit | null,
  fallbackConfig: RateLimitConfig = RATE_LIMIT_CONFIGS.API
): Promise<RateLimitResult> {
  // Try Upstash first
  if (limiter) {
    try {
      const result = await limiter.limit(identifier)
      return {
        success: result.success,
        remaining: result.remaining,
        reset: result.reset,
        limit: result.limit,
      }
    } catch (error) {
      logger.error('Errore Upstash rate limit', error)
      // Fall through to in-memory
    }
  }

  // In-memory fallback
  return checkRateLimit(identifier, fallbackConfig)
}

/**
 * In-memory rate limit check (synchronous)
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.API
): RateLimitResult {
  const now = Date.now()
  const key = identifier
  const record = store.get(key)

  // If no record or window expired, start fresh
  if (!record || record.resetAt < now) {
    const newRecord: RateLimitRecord = {
      count: 1,
      resetAt: now + config.windowMs,
    }
    store.set(key, newRecord)

    return {
      success: true,
      remaining: config.limit - 1,
      reset: newRecord.resetAt,
      limit: config.limit,
    }
  }

  // Increment count
  record.count++

  // Check if over limit
  if (record.count > config.limit) {
    return {
      success: false,
      remaining: 0,
      reset: record.resetAt,
      limit: config.limit,
    }
  }

  return {
    success: true,
    remaining: config.limit - record.count,
    reset: record.resetAt,
    limit: config.limit,
  }
}

/**
 * Create a rate limiter function with predefined config
 */
export function createRateLimiter(config: RateLimitConfig) {
  return (identifier: string) => checkRateLimit(identifier, config)
}

/**
 * Get client IP from request headers
 * Works with Vercel, Cloudflare, and standard proxies
 */
export function getClientIp(headers: Headers): string {
  // Vercel
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }

  // Cloudflare
  const cfConnectingIp = headers.get('cf-connecting-ip')
  if (cfConnectingIp) {
    return cfConnectingIp
  }

  // Real IP (nginx)
  const realIp = headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  // Fallback
  return 'unknown'
}

/**
 * Generate rate limit key based on IP and optional user ID
 */
export function getRateLimitKey(
  prefix: string,
  ip: string,
  userId?: string
): string {
  if (userId) {
    return `${prefix}:user:${userId}`
  }
  return `${prefix}:ip:${ip}`
}

/**
 * Rate limit response headers
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toString(),
  }
}

/**
 * Check if Upstash is configured
 */
export function isUpstashEnabled(): boolean {
  return isUpstashConfigured
}
