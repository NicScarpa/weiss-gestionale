import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const preferencesSchema = z.object({
  // Canali
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),

  // Tipi notifica - Turni
  newShiftPublished: z.boolean().optional(),
  shiftReminder: z.boolean().optional(),
  shiftReminderMinutes: z.number().min(15).max(1440).optional(), // 15min - 24h
  shiftSwapRequest: z.boolean().optional(),

  // Tipi notifica - Presenze
  anomalyCreated: z.boolean().optional(),
  anomalyResolved: z.boolean().optional(),

  // Tipi notifica - Ferie
  leaveApproved: z.boolean().optional(),
  leaveRejected: z.boolean().optional(),
  leaveReminder: z.boolean().optional(),

  // Tipi notifica - Manager
  newLeaveRequest: z.boolean().optional(),
  staffAnomaly: z.boolean().optional(),
})

// GET /api/notifications/preferences - Ottieni preferenze utente
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Ottieni o crea preferenze di default
    let preferences = await prisma.notificationPreference.findUnique({
      where: { userId: session.user.id },
    })

    if (!preferences) {
      preferences = await prisma.notificationPreference.create({
        data: { userId: session.user.id },
      })
    }

    // Rimuovi campi non necessari per il client
    const { id, userId, createdAt, updatedAt, ...prefs } = preferences

    return NextResponse.json({ preferences: prefs })
  } catch (error) {
    console.error('Errore GET /api/notifications/preferences:', error)
    return NextResponse.json(
      { error: "Errore nel recupero preferenze" },
      { status: 500 }
    )
  }
}

// PUT /api/notifications/preferences - Aggiorna preferenze utente
export async function PUT(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const data = preferencesSchema.parse(body)

    // Aggiorna o crea preferenze
    const preferences = await prisma.notificationPreference.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        ...data,
      },
      update: data,
    })

    // Rimuovi campi non necessari per il client
    const { id, userId, createdAt, updatedAt, ...prefs } = preferences

    return NextResponse.json({
      success: true,
      preferences: prefs,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore PUT /api/notifications/preferences:', error)
    return NextResponse.json(
      { error: "Errore nell'aggiornamento preferenze" },
      { status: 500 }
    )
  }
}

// PATCH /api/notifications/preferences - Aggiornamento parziale
export async function PATCH(request: NextRequest) {
  // Alias per PUT
  return PUT(request)
}
