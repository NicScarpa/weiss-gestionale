import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { validateFCMToken } from '@/lib/notifications/fcm'

const subscribeSchema = z.object({
  fcmToken: z.string().min(1),
  deviceName: z.string().optional(),
  deviceType: z.enum(['ios', 'android', 'web']).optional(),
  browserName: z.string().optional(),
})

const unsubscribeSchema = z.object({
  fcmToken: z.string().min(1),
})

// POST /api/notifications/subscribe - Registra token FCM
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const data = subscribeSchema.parse(body)

    // Verifica se il token esiste già
    const existing = await prisma.pushSubscription.findUnique({
      where: { fcmToken: data.fcmToken },
    })

    if (existing) {
      // Aggiorna la subscription esistente
      const updated = await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          userId: session.user.id,
          deviceName: data.deviceName,
          deviceType: data.deviceType,
          browserName: data.browserName,
          isActive: true,
          lastUsedAt: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        subscription: {
          id: updated.id,
          deviceName: updated.deviceName,
          deviceType: updated.deviceType,
        },
      })
    }

    // Crea nuova subscription
    const subscription = await prisma.pushSubscription.create({
      data: {
        userId: session.user.id,
        fcmToken: data.fcmToken,
        deviceName: data.deviceName,
        deviceType: data.deviceType,
        browserName: data.browserName,
        isActive: true,
        lastUsedAt: new Date(),
      },
    })

    // Crea preferenze di default se non esistono
    await prisma.notificationPreference.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id },
      update: {},
    })

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription.id,
        deviceName: subscription.deviceName,
        deviceType: subscription.deviceType,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore POST /api/notifications/subscribe:', error)
    return NextResponse.json(
      { error: "Errore nella registrazione" },
      { status: 500 }
    )
  }
}

// DELETE /api/notifications/subscribe - Rimuovi token FCM
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const data = unsubscribeSchema.parse(body)

    // Trova e disattiva la subscription
    const subscription = await prisma.pushSubscription.findUnique({
      where: { fcmToken: data.fcmToken },
    })

    if (!subscription) {
      return NextResponse.json({ success: true, message: 'Token non trovato' })
    }

    // Verifica che appartenga all'utente corrente
    if (subscription.userId !== session.user.id) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
    }

    await prisma.pushSubscription.delete({
      where: { id: subscription.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore DELETE /api/notifications/subscribe:', error)
    return NextResponse.json(
      { error: "Errore nella rimozione" },
      { status: 500 }
    )
  }
}

// GET /api/notifications/subscribe - Lista subscriptions dell'utente
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        userId: session.user.id,
        isActive: true,
      },
      select: {
        id: true,
        deviceName: true,
        deviceType: true,
        browserName: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    })

    return NextResponse.json({ subscriptions })
  } catch (error) {
    console.error('Errore GET /api/notifications/subscribe:', error)
    return NextResponse.json(
      { error: "Errore nel recupero" },
      { status: 500 }
    )
  }
}
