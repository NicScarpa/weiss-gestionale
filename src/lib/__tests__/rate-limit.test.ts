import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  checkRateLimit,
  createRateLimiter,
  getClientIp,
  getRateLimitKey,
  getRateLimitHeaders,
  RATE_LIMIT_CONFIGS,
} from '../rate-limit'

describe('rate-limit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('checkRateLimit', () => {
    it('should allow first request', () => {
      const result = checkRateLimit('test-key-1', { limit: 5, windowMs: 1000 })

      expect(result.success).toBe(true)
      expect(result.remaining).toBe(4)
      expect(result.limit).toBe(5)
    })

    it('should decrement remaining count', () => {
      const config = { limit: 5, windowMs: 60000 }

      checkRateLimit('test-key-2', config)
      checkRateLimit('test-key-2', config)
      const result = checkRateLimit('test-key-2', config)

      expect(result.success).toBe(true)
      expect(result.remaining).toBe(2)
    })

    it('should block requests over limit', () => {
      const config = { limit: 3, windowMs: 60000 }

      checkRateLimit('test-key-3', config)
      checkRateLimit('test-key-3', config)
      checkRateLimit('test-key-3', config)
      const result = checkRateLimit('test-key-3', config)

      expect(result.success).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('should reset after window expires', () => {
      const config = { limit: 2, windowMs: 1000 }

      checkRateLimit('test-key-4', config)
      checkRateLimit('test-key-4', config)

      // Advance time past the window
      vi.advanceTimersByTime(1100)

      const result = checkRateLimit('test-key-4', config)

      expect(result.success).toBe(true)
      expect(result.remaining).toBe(1) // Reset to limit - 1
    })

    it('should track different keys separately', () => {
      const config = { limit: 2, windowMs: 60000 }

      checkRateLimit('key-a', config)
      checkRateLimit('key-a', config)
      checkRateLimit('key-b', config)

      const resultA = checkRateLimit('key-a', config)
      const resultB = checkRateLimit('key-b', config)

      expect(resultA.success).toBe(false)
      expect(resultB.success).toBe(true)
    })

    it('should include reset timestamp', () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const config = { limit: 5, windowMs: 60000 }
      const result = checkRateLimit('test-key-5', config)

      expect(result.reset).toBe(now + 60000)
    })
  })

  describe('createRateLimiter', () => {
    it('should create a rate limiter with predefined config', () => {
      const limiter = createRateLimiter({ limit: 10, windowMs: 1000 })

      const result1 = limiter('limiter-test-1')
      const result2 = limiter('limiter-test-1')

      expect(result1.remaining).toBe(9)
      expect(result2.remaining).toBe(8)
    })
  })

  describe('RATE_LIMIT_CONFIGS', () => {
    it('should have AUTH config', () => {
      expect(RATE_LIMIT_CONFIGS.AUTH).toEqual({
        limit: 5,
        windowMs: 60000,
      })
    })

    it('should have API config', () => {
      expect(RATE_LIMIT_CONFIGS.API).toEqual({
        limit: 100,
        windowMs: 60000,
      })
    })

    it('should have STRICT config', () => {
      expect(RATE_LIMIT_CONFIGS.STRICT).toEqual({
        limit: 10,
        windowMs: 60000,
      })
    })

    it('should have GENEROUS config', () => {
      expect(RATE_LIMIT_CONFIGS.GENEROUS).toEqual({
        limit: 200,
        windowMs: 60000,
      })
    })
  })

  describe('getClientIp', () => {
    it('should extract IP from x-forwarded-for', () => {
      const headers = new Headers()
      headers.set('x-forwarded-for', '192.168.1.1, 10.0.0.1')

      const ip = getClientIp(headers)

      expect(ip).toBe('192.168.1.1')
    })

    it('should extract IP from cf-connecting-ip', () => {
      const headers = new Headers()
      headers.set('cf-connecting-ip', '203.0.113.1')

      const ip = getClientIp(headers)

      expect(ip).toBe('203.0.113.1')
    })

    it('should extract IP from x-real-ip', () => {
      const headers = new Headers()
      headers.set('x-real-ip', '198.51.100.1')

      const ip = getClientIp(headers)

      expect(ip).toBe('198.51.100.1')
    })

    it('should prioritize x-forwarded-for over other headers', () => {
      const headers = new Headers()
      headers.set('x-forwarded-for', '192.168.1.1')
      headers.set('cf-connecting-ip', '203.0.113.1')
      headers.set('x-real-ip', '198.51.100.1')

      const ip = getClientIp(headers)

      expect(ip).toBe('192.168.1.1')
    })

    it('should return unknown if no IP headers present', () => {
      const headers = new Headers()

      const ip = getClientIp(headers)

      expect(ip).toBe('unknown')
    })
  })

  describe('getRateLimitKey', () => {
    it('should create IP-based key without userId', () => {
      const key = getRateLimitKey('auth', '192.168.1.1')

      expect(key).toBe('auth:ip:192.168.1.1')
    })

    it('should create user-based key with userId', () => {
      const key = getRateLimitKey('api', '192.168.1.1', 'user-123')

      expect(key).toBe('api:user:user-123')
    })

    it('should use prefix correctly', () => {
      const keyAuth = getRateLimitKey('auth', '1.2.3.4')
      const keyApi = getRateLimitKey('api', '1.2.3.4')

      expect(keyAuth).toBe('auth:ip:1.2.3.4')
      expect(keyApi).toBe('api:ip:1.2.3.4')
    })
  })

  describe('getRateLimitHeaders', () => {
    it('should return correct headers', () => {
      const result = {
        success: true,
        remaining: 95,
        reset: 1704067200000,
        limit: 100,
      }

      const headers = getRateLimitHeaders(result)

      expect(headers).toEqual({
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '95',
        'X-RateLimit-Reset': '1704067200000',
      })
    })
  })
})
