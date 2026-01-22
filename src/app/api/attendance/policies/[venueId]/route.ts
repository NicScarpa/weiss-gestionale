import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
interface RouteParams {
  params: Promise<{ venueId: string }>
}

// GET /api/attendance/policies/[venueId] - Policy singola sede
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    const { venueId } = await params

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: {
        attendancePolicy: true,
      },
    })

    if (!venue) {
      return NextResponse.json({ error: 'Sede non trovata' }, { status: 404 })
    }

    return NextResponse.json({
      venue: {
        id: venue.id,
        name: venue.name,
        code: venue.code,
        latitude: venue.latitude ? Number(venue.latitude) : null,
        longitude: venue.longitude ? Number(venue.longitude) : null,
      },
      policy: venue.attendancePolicy ?? null,
    })
  } catch (error) {
    logger.error('Errore GET /api/attendance/policies/[venueId]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero della policy' },
      { status: 500 }
    )
  }
}

// Schema validazione policy
const policySchema = z.object({
  geoFenceRadius: z.number().min(10).max(1000).default(100),
  requireGeolocation: z.boolean().default(true),
  blockOutsideLocation: z.boolean().default(false),
  earlyClockInMinutes: z.number().min(0).max(120).default(15),
  lateClockInMinutes: z.number().min(0).max(120).default(10),
  earlyClockOutMinutes: z.number().min(0).max(60).default(5),
  lateClockOutMinutes: z.number().min(0).max(180).default(30),
  autoClockOutEnabled: z.boolean().default(true),
  autoClockOutHours: z.number().min(4).max(24).default(12),
  requireBreakPunch: z.boolean().default(false),
  minBreakMinutes: z.number().min(0).max(120).default(30),
  notifyOnAnomaly: z.boolean().default(true),
  notifyManagerEmail: z.string().email().nullable().optional(),
})

// PUT /api/attendance/policies/[venueId] - Aggiorna policy sede
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth()
    const { venueId } = await params

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Verifica ruolo admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true },
    })

    if (!user || user.role.name !== 'admin') {
      return NextResponse.json(
        { error: 'Solo gli admin possono modificare le policy' },
        { status: 403 }
      )
    }

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
    })

    if (!venue) {
      return NextResponse.json({ error: 'Sede non trovata' }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = policySchema.parse(body)

    // Upsert policy
    const policy = await prisma.attendancePolicy.upsert({
      where: { venueId },
      update: validatedData,
      create: {
        venueId,
        ...validatedData,
      },
    })

    return NextResponse.json({
      success: true,
      data: policy,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PUT /api/attendance/policies/[venueId]', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento della policy' },
      { status: 500 }
    )
  }
}
