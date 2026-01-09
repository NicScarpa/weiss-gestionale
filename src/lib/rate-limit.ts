/**
 * In-memory rate limiter with sliding window algorithm
 *
 * Note: This implementation stores data in-memory, which means:
 * - Rate limits are not shared across serverless function instances
 * - Limits reset on server restart
 *
 * For production with multiple instances, consider upgrading to:
 * - @upstash/ratelimit with Redis
 * - Redis-based implementation
 */

interface RateLimitRecord {
  count: number
  resetAt: number
}

// In-memory store (per-instance)
const store = new Map<string, RateLimitRecord>()

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of store.entries()) {
    if (record.resetAt < now) {
      store.delete(key)
    }
  }
}, 60000) // Cleanup every minute

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
} as const

/**
 * Check rate limit for a given identifier
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
