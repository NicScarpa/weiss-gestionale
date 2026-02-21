import { prisma } from './prisma'
import { headers } from 'next/headers'

interface AuditLogParams {
  userId?: string | null
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'PASSWORD_CHANGE'
  entityType: string
  entityId?: string
  venueId?: string | null
  oldValues?: Record<string, unknown>
  newValues?: Record<string, unknown>
}

export async function createAuditLog(params: AuditLogParams) {
  try {
    let ipAddress: string | null = null
    let userAgent: string | null = null

    try {
      const headersList = await headers()
      ipAddress = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
        || headersList.get('x-real-ip')
        || null
      userAgent = headersList.get('user-agent') || null
    } catch {
      // headers() may not be available outside request context
    }

    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? undefined,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        venueId: params.venueId ?? undefined,
        oldValues: params.oldValues ?? undefined,
        newValues: params.newValues ?? undefined,
        ipAddress,
        userAgent,
      },
    })
  } catch (error) {
    // Don't let audit logging failures break the main operation
    console.error('Failed to create audit log:', error)
  }
}
