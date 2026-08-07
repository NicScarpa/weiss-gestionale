import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import {
  salvaSottoscrizione,
  trovaPerEndpoint,
  rimuoviSottoscrizione,
} from '@/lib/notifications/subscriptions'

import { logger } from '@/lib/logger'

/**
 * Una sottoscrizione Web Push è la tripletta (endpoint, p256dh, auth) prodotta
 * dal browser con `pushManager.subscribe()`. Le due chiavi servono a cifrare il
 * payload: senza, non si può inviare nulla.
 */
const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  expirationTime: z.number().nullable().optional(),
  deviceName: z.string().optional(),
  deviceType: z.enum(['ios', 'android', 'web']).optional(),
  browserName: z.string().optional(),
})

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
})

// POST /api/notifications/subscribe - Registra la sottoscrizione di un dispositivo
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const data = subscribeSchema.parse(body)

    const subscription = await salvaSottoscrizione({
      userId: session.user.id,
      dati: {
        endpoint: data.endpoint,
        keys: data.keys,
        expirationTime: data.expirationTime,
      },
      deviceName: data.deviceName,
      deviceType: data.deviceType,
      browserName: data.browserName,
    })

    // Crea preferenze di default se non esistono
    await prisma.notificationPreference.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id },
      update: {},
    })

    return NextResponse.json({ success: true, subscription })
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

// DELETE /api/notifications/subscribe - Rimuovi la sottoscrizione di un dispositivo
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const data = unsubscribeSchema.parse(body)

    const subscription = await trovaPerEndpoint(data.endpoint)

    if (!subscription) {
      return NextResponse.json({ success: true, message: 'Sottoscrizione non trovata' })
    }

    // Verifica che appartenga all'utente corrente
    if (subscription.userId !== session.user.id) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
    }

    await rimuoviSottoscrizione(subscription.id)

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

// GET /api/notifications/subscribe - Lista dispositivi sottoscritti dell'utente
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
