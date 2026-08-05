import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { logger } from '@/lib/logger'
import { getVenueId } from '@/lib/venue'
import { romeDateKey, romeDayRange, toDateOnlyUtc } from '@/lib/timezone'
// GET /api/attendance/current - Stato timbratura attuale
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')

    // Giornata italiana di oggi: sul server, che gira in UTC, il confine
    // cadrebbe altrimenti alle 02:00 e il turno serale sparirebbe a metà notte.
    const oggi = romeDayRange(romeDateKey(new Date()))

    // Recupera tutte le timbrature di oggi per questo utente
    const todayPunches = await prisma.attendanceRecord.findMany({
      where: {
        userId: session.user.id,
        punchedAt: {
          gte: oggi.start,
          lt: oggi.end,
        },
        ...(venueId && { venueId }),
      },
      orderBy: { punchedAt: 'asc' },
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

    // Determina lo stato attuale
    let status: 'NOT_CLOCKED_IN' | 'CLOCKED_IN' | 'ON_BREAK' | 'CLOCKED_OUT' =
      'NOT_CLOCKED_IN'
    let lastPunch = null
    let clockInTime: Date | null = null
    let clockOutTime: Date | null = null
    let breakStartTime: Date | null = null

    if (todayPunches.length > 0) {
      lastPunch = todayPunches[todayPunches.length - 1]

      // Trova l'ultimo clock in e clock out
      const clockIn = todayPunches.filter((p) => p.punchType === 'IN').pop()
      const clockOut = todayPunches.filter((p) => p.punchType === 'OUT').pop()
      const breakStart = todayPunches
        .filter((p) => p.punchType === 'BREAK_START')
        .pop()
      const breakEnd = todayPunches
        .filter((p) => p.punchType === 'BREAK_END')
        .pop()

      if (clockIn) clockInTime = clockIn.punchedAt
      if (clockOut) clockOutTime = clockOut.punchedAt
      if (breakStart) breakStartTime = breakStart.punchedAt

      // Logica stato
      if (clockOut && (!clockIn || clockOut.punchedAt > clockIn.punchedAt)) {
        status = 'CLOCKED_OUT'
      } else if (
        breakStart &&
        (!breakEnd || breakStart.punchedAt > breakEnd.punchedAt)
      ) {
        status = 'ON_BREAK'
      } else if (clockIn) {
        status = 'CLOCKED_IN'
      }
    }

    // Recupera il turno di oggi: `date` è una colonna @db.Date, si confronta
    // con la mezzanotte UTC del giorno italiano.
    const todayAssignment = await prisma.shiftAssignment.findFirst({
      where: {
        userId: session.user.id,
        date: toDateOnlyUtc(romeDateKey(new Date())),
        schedule: {
          status: 'PUBLISHED',
        },
        ...(venueId && { venueId }),
      },
      include: {
        shiftDefinition: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true,
          },
        },
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
            latitude: true,
            longitude: true,
            attendancePolicy: {
              select: {
                geoFenceRadius: true,
                requireGeolocation: true,
                blockOutsideLocation: true,
              },
            },
          },
        },
      },
    })

    // La nota obbligatoria all'uscita è una regola della sede, non del turno:
    // va letta anche quando non c'è un turno programmato — è il caso di chi
    // viene chiamato all'ultimo momento, e sarebbe l'unico a scoprire l'obbligo
    // dal rifiuto del server invece che dal dialogo che chiede la nota.
    const policySede = await prisma.attendancePolicy.findUnique({
      where: {
        venueId: venueId ?? todayAssignment?.venue.id ?? (await getVenueId()),
      },
      select: { requireExitNote: true },
    })

    // Luoghi di lavoro su cui la persona è abilitata. Servono al portale: il
    // semaforo della distanza deve misurare dallo stesso punto da cui misura la
    // route di timbratura, altrimenti dice "nel raggio" mentre il server
    // registra una timbratura fuori sede.
    const assegnazioni = await prisma.workLocationAssignment.findMany({
      where: {
        userId: session.user.id,
        endedAt: null,
        workLocation: {
          isActive: true,
          ...(venueId && { venueId }),
        },
      },
      select: {
        trackingMode: true,
        workLocation: {
          select: {
            id: true,
            name: true,
            latitude: true,
            longitude: true,
            geofenceRadiusMeters: true,
          },
        },
      },
      orderBy: { workLocation: { name: 'asc' } },
    })

    // I Decimal di Prisma finiscono in JSON come stringhe: si convertono qui,
    // così il client riceve numeri già utilizzabili nel calcolo della distanza.
    const workLocations = assegnazioni.map((a) => ({
      id: a.workLocation.id,
      name: a.workLocation.name,
      latitude:
        a.workLocation.latitude === null ? null : Number(a.workLocation.latitude),
      longitude:
        a.workLocation.longitude === null ? null : Number(a.workLocation.longitude),
      geofenceRadiusMeters: a.workLocation.geofenceRadiusMeters,
      trackingMode: a.trackingMode,
    }))

    // Calcola ore lavorate finora
    let hoursWorkedToday = 0
    if (clockInTime) {
      const endTime = clockOutTime ?? new Date()
      hoursWorkedToday =
        Math.round(
          ((endTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60)) * 100
        ) / 100
    }

    return NextResponse.json({
      status,
      clockInTime,
      clockOutTime,
      breakStartTime,
      lastPunch: lastPunch
        ? {
            type: lastPunch.punchType,
            time: lastPunch.punchedAt,
            venue: lastPunch.venue,
          }
        : null,
      todayAssignment: todayAssignment
        ? {
            id: todayAssignment.id,
            startTime: todayAssignment.startTime,
            endTime: todayAssignment.endTime,
            shiftDefinition: todayAssignment.shiftDefinition,
            venue: todayAssignment.venue,
          }
        : null,
      workLocations,
      requireExitNote: policySede?.requireExitNote ?? false,
      hoursWorkedToday,
      punchCount: todayPunches.length,
    })
  } catch (error) {
    logger.error('Errore GET /api/attendance/current', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dello stato timbratura' },
      { status: 500 }
    )
  }
}
