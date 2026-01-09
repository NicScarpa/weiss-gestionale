import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  PERFORMANCE_THRESHOLDS,
  logSlowOperation,
  measureAsync,
  measureSync,
  createTimer,
  getStoredMetrics,
  clearStoredMetrics,
  getPerformanceSummary,
} from '../performance'

describe('performance', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearStoredMetrics()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('PERFORMANCE_THRESHOLDS', () => {
    it('should have correct threshold values', () => {
      expect(PERFORMANCE_THRESHOLDS.SLOW_QUERY).toBe(100)
      expect(PERFORMANCE_THRESHOLDS.VERY_SLOW_QUERY).toBe(500)
      expect(PERFORMANCE_THRESHOLDS.SLOW_API).toBe(1000)
      expect(PERFORMANCE_THRESHOLDS.VERY_SLOW_API).toBe(3000)
    })
  })

  describe('logSlowOperation', () => {
    it('should store metric', () => {
      logSlowOperation('query', 'User.findMany', 50)

      const metrics = getStoredMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].name).toBe('User.findMany')
      expect(metrics[0].type).toBe('query')
      expect(metrics[0].durationMs).toBe(50)
    })

    it('should warn for slow queries', () => {
      logSlowOperation('query', 'User.findMany', 150)

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Slow query'),
        expect.anything()
      )
    })

    it('should error for very slow queries', () => {
      logSlowOperation('query', 'User.findMany', 600)

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Very slow query'),
        expect.anything()
      )
    })

    it('should warn for slow API calls', () => {
      logSlowOperation('api', 'GET /api/chiusure', 1500)

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Slow api'),
        expect.anything()
      )
    })

    it('should error for very slow API calls', () => {
      logSlowOperation('api', 'GET /api/chiusure', 4000)

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Very slow api'),
        expect.anything()
      )
    })

    it('should not log for fast operations', () => {
      logSlowOperation('query', 'User.findFirst', 20)

      expect(console.warn).not.toHaveBeenCalled()
      expect(console.error).not.toHaveBeenCalled()
    })

    it('should include metadata in store', () => {
      logSlowOperation('operation', 'calculateTotals', 10, { itemCount: 100 })

      const metrics = getStoredMetrics()
      expect(metrics[0].metadata).toEqual({ itemCount: 100 })
    })
  })

  describe('measureAsync', () => {
    it('should measure async function execution', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')

      const result = await measureAsync('testOperation', mockFn)

      expect(result).toBe('result')
      expect(mockFn).toHaveBeenCalled()

      const metrics = getStoredMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].name).toBe('testOperation')
    })

    it('should log slow operations', async () => {
      const slowFn = async () => {
        vi.advanceTimersByTime(200)
        return 'slow result'
      }

      await measureAsync('slowQuery', slowFn, 'query')

      expect(console.warn).toHaveBeenCalled()
    })

    it('should re-throw errors', async () => {
      const errorFn = vi.fn().mockRejectedValue(new Error('Test error'))

      await expect(measureAsync('errorOperation', errorFn)).rejects.toThrow('Test error')

      const metrics = getStoredMetrics()
      expect(metrics[0].metadata?.error).toBe(true)
    })
  })

  describe('measureSync', () => {
    it('should measure sync function execution', () => {
      const mockFn = vi.fn().mockReturnValue(42)

      const result = measureSync('syncOperation', mockFn)

      expect(result).toBe(42)
      expect(mockFn).toHaveBeenCalled()

      const metrics = getStoredMetrics()
      expect(metrics).toHaveLength(1)
    })

    it('should re-throw errors', () => {
      const errorFn = () => {
        throw new Error('Sync error')
      }

      expect(() => measureSync('errorSync', errorFn)).toThrow('Sync error')
    })
  })

  describe('createTimer', () => {
    it('should create a timer', () => {
      const timer = createTimer('manualTimer')

      expect(timer.stop).toBeDefined()
      expect(timer.elapsed).toBeDefined()
    })

    it('should measure elapsed time', () => {
      const timer = createTimer('elapsedTest')

      vi.advanceTimersByTime(100)
      const elapsed = timer.elapsed()

      expect(elapsed).toBeGreaterThanOrEqual(100)
    })

    it('should stop and log metric', () => {
      const timer = createTimer('stopTest', 'query')

      vi.advanceTimersByTime(50)
      const duration = timer.stop()

      expect(duration).toBeGreaterThanOrEqual(50)

      const metrics = getStoredMetrics()
      expect(metrics).toHaveLength(1)
      expect(metrics[0].name).toBe('stopTest')
    })

    it('should accept metadata on stop', () => {
      const timer = createTimer('metadataTest')

      timer.stop({ custom: 'value' })

      const metrics = getStoredMetrics()
      expect(metrics[0].metadata).toEqual({ custom: 'value' })
    })
  })

  describe('getStoredMetrics', () => {
    it('should return empty array initially', () => {
      const metrics = getStoredMetrics()
      expect(metrics).toEqual([])
    })

    it('should return stored metrics', () => {
      logSlowOperation('query', 'test1', 10)
      logSlowOperation('api', 'test2', 20)

      const metrics = getStoredMetrics()

      expect(metrics).toHaveLength(2)
    })

    it('should return a copy (immutable)', () => {
      logSlowOperation('query', 'test', 10)

      const metrics1 = getStoredMetrics()
      const metrics2 = getStoredMetrics()

      expect(metrics1).not.toBe(metrics2)
    })
  })

  describe('clearStoredMetrics', () => {
    it('should clear all metrics', () => {
      logSlowOperation('query', 'test1', 10)
      logSlowOperation('query', 'test2', 20)

      clearStoredMetrics()

      const metrics = getStoredMetrics()
      expect(metrics).toHaveLength(0)
    })
  })

  describe('getPerformanceSummary', () => {
    it('should return empty summary for no metrics', () => {
      const summary = getPerformanceSummary()

      expect(summary.totalOperations).toBe(0)
      expect(summary.slowOperations).toBe(0)
      expect(summary.averageDuration).toBe(0)
      expect(summary.maxDuration).toBe(0)
    })

    it('should calculate correct summary', () => {
      logSlowOperation('query', 'fast', 50)
      logSlowOperation('query', 'slow', 200)
      logSlowOperation('api', 'api', 500)

      const summary = getPerformanceSummary()

      expect(summary.totalOperations).toBe(3)
      expect(summary.slowOperations).toBe(1) // Only query at 200ms is slow
      expect(summary.averageDuration).toBe(250) // (50+200+500)/3
      expect(summary.maxDuration).toBe(500)
    })

    it('should group by type', () => {
      logSlowOperation('query', 'q1', 100)
      logSlowOperation('query', 'q2', 200)
      logSlowOperation('api', 'a1', 300)

      const summary = getPerformanceSummary()

      expect(summary.byType['query'].count).toBe(2)
      expect(summary.byType['query'].avgDuration).toBe(150)
      expect(summary.byType['api'].count).toBe(1)
      expect(summary.byType['api'].avgDuration).toBe(300)
    })
  })
})
