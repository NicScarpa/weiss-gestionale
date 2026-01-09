/**
 * Performance Monitoring Utilities
 *
 * Provides tools for:
 * - Slow query detection
 * - Request timing
 * - Performance metrics collection
 */

// Thresholds for slow operations (in milliseconds)
export const PERFORMANCE_THRESHOLDS = {
  /** Slow database query threshold */
  SLOW_QUERY: 100,
  /** Very slow database query threshold (warning level) */
  VERY_SLOW_QUERY: 500,
  /** Slow API response threshold */
  SLOW_API: 1000,
  /** Very slow API response threshold (warning level) */
  VERY_SLOW_API: 3000,
} as const

// Log levels for performance issues
export type PerformanceLogLevel = 'info' | 'warn' | 'error'

export interface PerformanceMetric {
  type: 'query' | 'api' | 'operation'
  name: string
  durationMs: number
  timestamp: Date
  metadata?: Record<string, unknown>
}

// In-memory metrics store (for development/debugging)
const metricsStore: PerformanceMetric[] = []
const MAX_STORED_METRICS = 1000

/**
 * Store a performance metric
 */
function storeMetric(metric: PerformanceMetric): void {
  metricsStore.push(metric)
  // Keep only the last N metrics
  if (metricsStore.length > MAX_STORED_METRICS) {
    metricsStore.shift()
  }
}

/**
 * Get stored metrics for analysis
 */
export function getStoredMetrics(): readonly PerformanceMetric[] {
  return [...metricsStore]
}

/**
 * Clear stored metrics
 */
export function clearStoredMetrics(): void {
  metricsStore.length = 0
}

/**
 * Log a slow operation with appropriate severity
 */
export function logSlowOperation(
  type: PerformanceMetric['type'],
  name: string,
  durationMs: number,
  metadata?: Record<string, unknown>
): void {
  const metric: PerformanceMetric = {
    type,
    name,
    durationMs,
    timestamp: new Date(),
    metadata,
  }

  // Store metric
  storeMetric(metric)

  // Determine threshold based on type
  const slowThreshold = type === 'query'
    ? PERFORMANCE_THRESHOLDS.SLOW_QUERY
    : PERFORMANCE_THRESHOLDS.SLOW_API
  const verySlowThreshold = type === 'query'
    ? PERFORMANCE_THRESHOLDS.VERY_SLOW_QUERY
    : PERFORMANCE_THRESHOLDS.VERY_SLOW_API

  // Log based on severity
  if (durationMs >= verySlowThreshold) {
    console.error(
      `[PERF] Very slow ${type}: ${name} took ${durationMs}ms`,
      metadata || ''
    )
  } else if (durationMs >= slowThreshold) {
    console.warn(
      `[PERF] Slow ${type}: ${name} took ${durationMs}ms`,
      metadata || ''
    )
  }
}

/**
 * Measure execution time of an async function
 */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  type: PerformanceMetric['type'] = 'operation',
  metadata?: Record<string, unknown>
): Promise<T> {
  const start = performance.now()
  try {
    const result = await fn()
    const duration = performance.now() - start
    logSlowOperation(type, name, duration, metadata)
    return result
  } catch (error) {
    const duration = performance.now() - start
    logSlowOperation(type, name, duration, { ...metadata, error: true })
    throw error
  }
}

/**
 * Measure execution time of a sync function
 */
export function measureSync<T>(
  name: string,
  fn: () => T,
  type: PerformanceMetric['type'] = 'operation',
  metadata?: Record<string, unknown>
): T {
  const start = performance.now()
  try {
    const result = fn()
    const duration = performance.now() - start
    logSlowOperation(type, name, duration, metadata)
    return result
  } catch (error) {
    const duration = performance.now() - start
    logSlowOperation(type, name, duration, { ...metadata, error: true })
    throw error
  }
}

/**
 * Create a timer for manual measurement
 */
export function createTimer(name: string, type: PerformanceMetric['type'] = 'operation') {
  const start = performance.now()

  return {
    stop: (metadata?: Record<string, unknown>) => {
      const duration = performance.now() - start
      logSlowOperation(type, name, duration, metadata)
      return duration
    },
    elapsed: () => performance.now() - start,
  }
}

/**
 * Prisma query logging middleware
 * Use this with prisma.$use() to log slow queries
 *
 * Example:
 * ```typescript
 * import { createPrismaQueryLogger } from '@/lib/performance'
 *
 * prisma.$use(createPrismaQueryLogger())
 * ```
 */
export function createPrismaQueryLogger(
  slowThreshold: number = PERFORMANCE_THRESHOLDS.SLOW_QUERY
) {
  return async (
    params: { model?: string; action: string; args: unknown },
    next: (params: { model?: string; action: string; args: unknown }) => Promise<unknown>
  ): Promise<unknown> => {
    const start = performance.now()
    const result = await next(params)
    const duration = performance.now() - start

    const queryName = params.model
      ? `${params.model}.${params.action}`
      : params.action

    if (duration > slowThreshold) {
      logSlowOperation('query', queryName, duration, {
        model: params.model,
        action: params.action,
      })
    }

    return result
  }
}

/**
 * Get performance summary for stored metrics
 */
export function getPerformanceSummary(): {
  totalOperations: number
  slowOperations: number
  averageDuration: number
  maxDuration: number
  byType: Record<string, { count: number; avgDuration: number }>
} {
  if (metricsStore.length === 0) {
    return {
      totalOperations: 0,
      slowOperations: 0,
      averageDuration: 0,
      maxDuration: 0,
      byType: {},
    }
  }

  const slowCount = metricsStore.filter((m) => {
    const threshold = m.type === 'query'
      ? PERFORMANCE_THRESHOLDS.SLOW_QUERY
      : PERFORMANCE_THRESHOLDS.SLOW_API
    return m.durationMs >= threshold
  }).length

  const totalDuration = metricsStore.reduce((sum, m) => sum + m.durationMs, 0)
  const maxDuration = Math.max(...metricsStore.map((m) => m.durationMs))

  // Group by type
  const byType: Record<string, { count: number; totalDuration: number }> = {}
  for (const metric of metricsStore) {
    if (!byType[metric.type]) {
      byType[metric.type] = { count: 0, totalDuration: 0 }
    }
    byType[metric.type].count++
    byType[metric.type].totalDuration += metric.durationMs
  }

  const byTypeSummary: Record<string, { count: number; avgDuration: number }> = {}
  for (const [type, data] of Object.entries(byType)) {
    byTypeSummary[type] = {
      count: data.count,
      avgDuration: data.totalDuration / data.count,
    }
  }

  return {
    totalOperations: metricsStore.length,
    slowOperations: slowCount,
    averageDuration: totalDuration / metricsStore.length,
    maxDuration,
    byType: byTypeSummary,
  }
}
