import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { PunchType, PunchMethod } from '@prisma/client'
import { calculateDistance } from '@/lib/geolocation'
import { notifyAnomalyCreated } from '@/lib/notifications'

import { logger } from '@/lib/logger'
// Schema validazione input
const punchSchema = z.object({
  punchType: z.enum(['IN', 'OUT', 'BREAK_START', 'BREAK_END']),
  venueId: z.string().min(1, 'Sede richiesta'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracy: z.number().optional(),
  notes: z.string().optional(),
})

// POST /api/attendance/punch - Registra timbratura
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Verifica che l'utente abbia accesso al portale
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, portalEnabled: true, venueId: true },
    })

    if (!user?.portalEnabled) {
      return NextResponse.json(
        { error: 'Accesso al portale non abilitato' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = punchSchema.parse(body)

    // Recupera la sede con policy e coordinate
    const venue = await prisma.venue.findUnique({
      where: { id: validatedData.venueId },
      include: {
        attendancePolicy: true,
      },
    })

    if (!venue) {
      return NextResponse.json({ error: 'Sede non trovata' }, { status: 404 })
    }

    // Calcola distanza se coordinate fornite e sede ha coordinate
    let distanceFromVenue: number | null = null
    let isWithinRadius = true

    if (
      validatedData.latitude !== undefined &&
      validatedData.longitude !== undefined &&
      venue.latitude &&
      venue.longitude
    ) {
      distanceFromVenue = Math.round(
        calculateDistance(
          validatedData.latitude,
          validatedData.longitude,
          Number(venue.latitude),
          Number(venue.longitude)
        )
      )

      const policyRadius = venue.attendancePolicy?.geoFenceRadius ?? 100
      isWithinRadius = distanceFromVenue <= policyRadius

      // Se la policy blocca le timbrature fuori sede
      if (venue.attendancePolicy?.blockOutsideLocation && !isWithinRadius) {
        return NextResponse.json(
          {
            error: 'Sei fuori dal raggio della sede',
            distance: distanceFromVenue,
            maxRadius: policyRadius,
          },
          { status: 400 }
        )
      }
    }

    // Trova il turno schedulato per oggi (opzionale)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const todayAssignment = await prisma.shiftAssignment.findFirst({
      where: {
        userId: session.user.id,
        venueId: validatedData.venueId,
        date: {
          gte: today,
          lt: tomorrow,
        },
        schedule: {
          status: 'PUBLISHED',
        },
      },
    })

    // Crea la timbratura
    const record = await prisma.attendanceRecord.create({
      data: {
        userId: session.user.id,
        venueId: validatedData.venueId,
        assignmentId: todayAssignment?.id ?? null,
        punchType: validatedData.punchType as PunchType,
        punchMethod: PunchMethod.APP,
        punchedAt: new Date(),
        latitude: validatedData.latitude ?? null,
        longitude: validatedData.longitude ?? null,
        accuracy: validatedData.accuracy ?? null,
        distanceFromVenue: distanceFromVenue ?? null,
        isWithinRadius,
        deviceInfo: request.headers.get('user-agent') ?? null,
        ipAddress:
          request.headers.get('x-forwarded-for')?.split(',')[0] ?? null,
        notes: validatedData.notes ?? null,
      },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    })

    // Se timbrata IN, aggiorna actualStart sull'assignment
    if (todayAssignment && validatedData.punchType === 'IN') {
      const now = new Date()
      const timeOnly = new Date(1970, 0, 1, now.getHours(), now.getMinutes(), now.getSeconds())
      await prisma.shiftAssignment.update({
        where: { id: todayAssignment.id },
        data: { actualStart: timeOnly },
      })
    }

    // Se timbrata OUT, aggiorna actualEnd e calcola ore lavorate
    if (todayAssignment && validatedData.punchType === 'OUT') {
      const now = new Date()
      const timeOnly = new Date(1970, 0, 1, now.getHours(), now.getMinutes(), now.getSeconds())

      // Trova l'entrata di oggi per calcolare le ore
      const clockIn = await prisma.attendanceRecord.findFirst({
        where: {
          userId: session.user.id,
          venueId: validatedData.venueId,
          punchType: 'IN',
          punchedAt: {
            gte: today,
            lt: tomorrow,
          },
        },
        orderBy: { punchedAt: 'asc' },
      })

      let hoursWorked: number | null = null
      if (clockIn) {
        const diffMs = now.getTime() - clockIn.punchedAt.getTime()
        hoursWorked = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
      }

      await prisma.shiftAssignment.update({
        where: { id: todayAssignment.id },
        data: {
          actualEnd: timeOnly,
          hoursWorked: hoursWorked ?? null,
          status: 'WORKED',
        },
      })
    }

    // Crea anomalia se fuori sede
    if (!isWithinRadius && distanceFromVenue !== null) {
      const anomaly = await prisma.attendanceAnomaly.create({
        data: {
          userId: session.user.id,
          venueId: validatedData.venueId,
          recordId: record.id,
          assignmentId: todayAssignment?.id ?? null,
          anomalyType: 'OUTSIDE_LOCATION',
          status: 'PENDING',
          date: today,
          description: `Timbratura effettuata a ${distanceFromVenue}m dalla sede (raggio: ${venue.attendancePolicy?.geoFenceRadius ?? 100}m)`,
          actualValue: `${distanceFromVenue}m`,
          expectedValue: `<${venue.attendancePolicy?.geoFenceRadius ?? 100}m`,
        },
      })

      // Notifica anomalia creata (async)
      notifyAnomalyCreated(anomaly.id).catch((err) =>
        logger.error('Errore invio notifica anomalia creata', err)
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        id: record.id,
        punchType: record.punchType,
        punchedAt: record.punchedAt,
        venue: record.venue,
        isWithinRadius: record.isWithinRadius,
        distanceFromVenue: distanceFromVenue,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/attendance/punch', error)
    return NextResponse.json(
      { error: 'Errore nella registrazione della timbratura' },
      { status: 500 }
    )
  }
}
