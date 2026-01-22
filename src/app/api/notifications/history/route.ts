import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
const historyQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
  type: z.string().optional(),
  unreadOnly: z.coerce.boolean().optional().default(false),
})

// GET /api/notifications/history - Storico notifiche utente
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = historyQuerySchema.parse({
      limit: searchParams.get('limit') || 20,
      offset: searchParams.get('offset') || 0,
      type: searchParams.get('type') || undefined,
      unreadOnly: searchParams.get('unreadOnly') || false,
    })

    // Costruisci filtri
    const where: any = {
      userId: session.user.id,
    }

    if (query.type) {
      where.type = query.type
    }

    if (query.unreadOnly) {
      where.readAt = null
    }

    // Ottieni notifiche
    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notificationLog.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          data: true,
          channel: true,
          status: true,
          sentAt: true,
          readAt: true,
          referenceId: true,
          referenceType: true,
        },
      }),
      prisma.notificationLog.count({ where }),
      prisma.notificationLog.count({
        where: {
          userId: session.user.id,
          readAt: null,
        },
      }),
    ])

    return NextResponse.json({
      notifications,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + notifications.length < total,
      },
      unreadCount,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Parametri non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore GET /api/notifications/history', error)
    return NextResponse.json(
      { error: "Errore nel recupero storico" },
      { status: 500 }
    )
  }
}

// PATCH /api/notifications/history - Segna notifiche come lette
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const { notificationIds, markAllAsRead } = body

    if (markAllAsRead) {
      // Segna tutte come lette
      const result = await prisma.notificationLog.updateMany({
        where: {
          userId: session.user.id,
          readAt: null,
        },
        data: {
          readAt: new Date(),
          status: 'READ',
        },
      })

      return NextResponse.json({
        success: true,
        updated: result.count,
      })
    }

    if (notificationIds && Array.isArray(notificationIds)) {
      // Segna specifiche notifiche come lette
      const result = await prisma.notificationLog.updateMany({
        where: {
          id: { in: notificationIds },
          userId: session.user.id,
          readAt: null,
        },
        data: {
          readAt: new Date(),
          status: 'READ',
        },
      })

      return NextResponse.json({
        success: true,
        updated: result.count,
      })
    }

    return NextResponse.json(
      { error: 'Specificare notificationIds o markAllAsRead' },
      { status: 400 }
    )
  } catch (error) {
    logger.error('Errore PATCH /api/notifications/history', error)
    return NextResponse.json(
      { error: "Errore nell'aggiornamento" },
      { status: 500 }
    )
  }
}

// DELETE /api/notifications/history - Elimina notifiche lette
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const olderThanDays = parseInt(searchParams.get('olderThanDays') || '30')

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    // Elimina notifiche vecchie e lette
    const result = await prisma.notificationLog.deleteMany({
      where: {
        userId: session.user.id,
        readAt: { not: null },
        sentAt: { lt: cutoffDate },
      },
    })

    return NextResponse.json({
      success: true,
      deleted: result.count,
    })
  } catch (error) {
    logger.error('Errore DELETE /api/notifications/history', error)
    return NextResponse.json(
      { error: "Errore nell'eliminazione" },
      { status: 500 }
    )
  }
}
