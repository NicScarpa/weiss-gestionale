import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { logger } from '@/lib/logger'
// GET /api/attendance/policies - Lista policy per sede
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Verifica ruolo
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true },
    })

    if (!user || !['admin', 'manager'].includes(user.role.name)) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Recupera tutte le sedi con relative policy
    const venues = await prisma.venue.findMany({
      where: {
        isActive: true,
        // Se non admin, filtra per sede dell'utente
        ...(user.role.name !== 'admin' && user.venueId && { id: user.venueId }),
      },
      select: {
        id: true,
        name: true,
        code: true,
        latitude: true,
        longitude: true,
        attendancePolicy: true,
      },
      orderBy: { name: 'asc' },
    })

    // Formatta i dati
    const policies = venues.map((venue) => ({
      venue: {
        id: venue.id,
        name: venue.name,
        code: venue.code,
        hasCoordinates: venue.latitude !== null && venue.longitude !== null,
      },
      policy: venue.attendancePolicy ?? {
        // Valori default se non esiste policy
        geoFenceRadius: 100,
        requireGeolocation: true,
        blockOutsideLocation: false,
        earlyClockInMinutes: 15,
        lateClockInMinutes: 10,
        earlyClockOutMinutes: 5,
        lateClockOutMinutes: 30,
        autoClockOutEnabled: true,
        autoClockOutHours: 12,
        requireBreakPunch: false,
        minBreakMinutes: 30,
        notifyOnAnomaly: true,
        notifyManagerEmail: null,
      },
      exists: venue.attendancePolicy !== null,
    }))

    return NextResponse.json({ data: policies })
  } catch (error) {
    logger.error('Errore GET /api/attendance/policies', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle policy' },
      { status: 500 }
    )
  }
}
