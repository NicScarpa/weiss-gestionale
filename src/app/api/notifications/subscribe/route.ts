import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
/**
 * Iscrizione del browser alle notifiche push (Web Push, VAPID).
 *
 * `endpoint` è l'indirizzo che il servizio di push del browser assegna al
 * dispositivo, `p256dh` e `auth` le chiavi con cui si cifra il contenuto.
 * Li produce `pushManager.subscribe()` sul client: qui si conservano e basta.
 */
const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
  deviceName: z.string().max(120).optional(),
  deviceType: z.enum(['ios', 'android', 'web']).optional(),
  browserName: z.string().max(80).optional(),
})

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
})

// POST /api/notifications/subscribe - Registra l'iscrizione push del browser
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const data = subscribeSchema.parse(body)

    // Lo stesso browser che si re-iscrive presenta lo stesso endpoint: si
    // aggiorna, non si duplica.
    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint: data.endpoint },
    })

    if (existing) {
      // Aggiorna la subscription esistente
      const updated = await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          userId: session.user.id,
          p256dh: data.p256dh,
          auth: data.auth,
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
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
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

    logger.error('Errore POST /api/notifications/subscribe', error)
    return NextResponse.json(
      { error: "Errore nella registrazione" },
      { status: 500 }
    )
  }
}

// DELETE /api/notifications/subscribe - Rimuovi l'iscrizione push
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
      where: { endpoint: data.endpoint },
    })

    if (!subscription) {
      return NextResponse.json({ success: true, message: 'Iscrizione non trovata' })
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

    logger.error('Errore DELETE /api/notifications/subscribe', error)
    return NextResponse.json(
      { error: "Errore nella rimozione" },
      { status: 500 }
    )
  }
}

// GET /api/notifications/subscribe - Lista subscriptions dell'utente
export async function GET(_request: NextRequest) {
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
    logger.error('Errore GET /api/notifications/subscribe', error)
    return NextResponse.json(
      { error: "Errore nel recupero" },
      { status: 500 }
    )
  }
}
