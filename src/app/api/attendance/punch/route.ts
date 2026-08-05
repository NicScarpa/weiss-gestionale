import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { PunchType, PunchMethod } from '@prisma/client'
import { calculateDistance } from '@/lib/geolocation'
import { notifyAnomalyCreated } from '@/lib/notifications'
import { addDays, format, isValid, parseISO, startOfDay } from 'date-fns'
import { it } from 'date-fns/locale'

import { logger } from '@/lib/logger'
// Schema validazione input
const punchSchema = z.object({
  punchType: z.enum(['IN', 'OUT', 'BREAK_START', 'BREAK_END']),
  venueId: z.string().min(1, 'Sede richiesta'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracy: z.number().optional(),
  notes: z.string().optional(),
  // Orario reale della timbratura registrata offline (ISO 8601).
  // Validato manualmente per poter degradare all'ora corrente invece di
  // rifiutare l'intera timbratura quando il valore non è utilizzabile.
  offlineTimestamp: z.string().optional(),
})

// Il timestamp offline può precedere di poco l'ora del server (orologi non
// sincronizzati) ma non può arrivare dal futuro né da oltre 24h prima.
const OFFLINE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000
const OFFLINE_MAX_AGE_MS = 24 * 60 * 60 * 1000
const OFFLINE_SYNC_PREFIX = '[offline-sync]'

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

    const { latitude, longitude } = validatedData
    const hasCoordinates = latitude !== undefined && longitude !== undefined
    const venueHasCoordinates = venue.latitude !== null && venue.longitude !== null

    // La geolocalizzazione obbligatoria è una decisione del server: senza
    // coordinate la timbratura viene rifiutata, altrimenti basterebbe negare il
    // permesso GPS dal dispositivo per aggirare il geofencing.
    if (
      venue.attendancePolicy?.requireGeolocation &&
      venueHasCoordinates &&
      !hasCoordinates
    ) {
      return NextResponse.json(
        {
          error:
            'La tua sede richiede la posizione per timbrare. Attiva il GPS e riprova.',
          code: 'GEOLOCATION_REQUIRED',
        },
        { status: 422 }
      )
    }

    // Calcola distanza se coordinate fornite e sede ha coordinate
    let distanceFromVenue: number | null = null
    let isWithinRadius = true

    if (
      latitude !== undefined &&
      longitude !== undefined &&
      venue.latitude &&
      venue.longitude
    ) {
      distanceFromVenue = Math.round(
        calculateDistance(
          latitude,
          longitude,
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

    // Timbratura sincronizzata da offline: si conserva l'orario reale in cui il
    // dipendente ha timbrato, non quello in cui la coda è stata svuotata.
    const now = new Date()
    const isOfflineSync = validatedData.offlineTimestamp !== undefined
    let punchedAt = now
    let offlineTimestampRejected = false

    if (validatedData.offlineTimestamp) {
      const parsed = parseISO(validatedData.offlineTimestamp)
      const isInTheFuture =
        parsed.getTime() - now.getTime() > OFFLINE_FUTURE_TOLERANCE_MS
      const isTooOld = now.getTime() - parsed.getTime() > OFFLINE_MAX_AGE_MS

      if (!isValid(parsed) || isInTheFuture || isTooOld) {
        offlineTimestampRejected = true
        logger.warn('Timestamp offline non utilizzabile, uso ora corrente', {
          userId: session.user.id,
          venueId: validatedData.venueId,
          offlineTimestamp: validatedData.offlineTimestamp,
        })
      } else {
        punchedAt = parsed
      }
    }

    // La provenienza offline è tracciata su punchMethod (OFFLINE_SYNC); le note
    // riportano l'orario di sincronizzazione, utile in caso di verifica.
    const noteParts: string[] = []
    if (isOfflineSync) {
      noteParts.push(
        `${OFFLINE_SYNC_PREFIX} sincronizzata il ${format(now, 'dd/MM/yyyy HH:mm', { locale: it })}`
      )
      if (offlineTimestampRejected) {
        noteParts.push(
          `[timestamp-non-valido] orario dichiarato dal dispositivo: ${validatedData.offlineTimestamp}`
        )
      }
    }
    if (validatedData.notes) {
      noteParts.push(validatedData.notes)
    }

    // Le finestre temporali seguono il giorno della timbratura, non quello della
    // sincronizzazione (una timbratura di ieri va agganciata al turno di ieri).
    const punchDayStart = startOfDay(punchedAt)
    const punchDayEnd = addDays(punchDayStart, 1)

    const todayAssignment = await prisma.shiftAssignment.findFirst({
      where: {
        userId: session.user.id,
        venueId: validatedData.venueId,
        date: {
          gte: punchDayStart,
          lt: punchDayEnd,
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
        punchMethod: isOfflineSync ? PunchMethod.OFFLINE_SYNC : PunchMethod.APP,
        punchedAt,
        latitude: validatedData.latitude ?? null,
        longitude: validatedData.longitude ?? null,
        accuracy: validatedData.accuracy ?? null,
        distanceFromVenue: distanceFromVenue ?? null,
        isWithinRadius,
        deviceInfo: request.headers.get('user-agent') ?? null,
        ipAddress:
          request.headers.get('x-forwarded-for')?.split(',')[0] ?? null,
        notes: noteParts.length > 0 ? noteParts.join(' — ') : null,
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

    const punchTimeOnly = new Date(
      1970,
      0,
      1,
      punchedAt.getHours(),
      punchedAt.getMinutes(),
      punchedAt.getSeconds()
    )

    // Se timbrata IN, aggiorna actualStart sull'assignment
    if (todayAssignment && validatedData.punchType === 'IN') {
      await prisma.shiftAssignment.update({
        where: { id: todayAssignment.id },
        data: { actualStart: punchTimeOnly },
      })
    }

    // Se timbrata OUT, aggiorna actualEnd e calcola ore lavorate
    if (todayAssignment && validatedData.punchType === 'OUT') {
      // Trova l'entrata dello stesso giorno per calcolare le ore
      const clockIn = await prisma.attendanceRecord.findFirst({
        where: {
          userId: session.user.id,
          venueId: validatedData.venueId,
          punchType: 'IN',
          punchedAt: {
            gte: punchDayStart,
            lt: punchDayEnd,
          },
        },
        orderBy: { punchedAt: 'asc' },
      })

      let hoursWorked: number | null = null
      if (clockIn) {
        const diffMs = punchedAt.getTime() - clockIn.punchedAt.getTime()
        hoursWorked = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
      }

      await prisma.shiftAssignment.update({
        where: { id: todayAssignment.id },
        data: {
          actualEnd: punchTimeOnly,
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
          date: punchDayStart,
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

    // Orario dichiarato dal dispositivo non plausibile: la timbratura è stata
    // registrata con l'ora di arrivo, ma il responsabile deve poterlo sapere
    // perché l'orario reale del turno potrebbe essere un altro.
    if (offlineTimestampRejected) {
      const anomaly = await prisma.attendanceAnomaly.create({
        data: {
          userId: session.user.id,
          venueId: validatedData.venueId,
          recordId: record.id,
          assignmentId: todayAssignment?.id ?? null,
          anomalyType: 'INVALID_TIMESTAMP',
          status: 'PENDING',
          date: punchDayStart,
          description:
            'Timbratura sincronizzata da offline con un orario non plausibile: registrata con l\'ora di ricezione',
          actualValue: validatedData.offlineTimestamp ?? null,
          expectedValue: `tra ${format(new Date(now.getTime() - OFFLINE_MAX_AGE_MS), 'dd/MM/yyyy HH:mm', { locale: it })} e ora`,
        },
      })

      notifyAnomalyCreated(anomaly.id).catch((err) =>
        logger.error('Errore invio notifica anomalia timestamp', err)
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
        isOfflineSync,
        offlineTimestampRejected,
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
