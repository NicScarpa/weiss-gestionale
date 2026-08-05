import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { PunchType, PunchMethod } from '@prisma/client'
import { calculateDistance } from '@/lib/geolocation'
import {
  pickWorkLocation,
  type AssignedLocation,
} from '@/lib/attendance/work-location'
import { notifyAnomalyCreated } from '@/lib/notifications'
import { format, isValid, parseISO } from 'date-fns'
import {
  romeDateKey,
  toDateOnlyUtc,
  toRomeParts,
} from '@/lib/timezone'
import { getEffectiveTimekeepingPolicy } from '@/lib/attendance/policy-resolver'
import { it } from 'date-fns/locale'

import { logger } from '@/lib/logger'
// Schema validazione input
// I limiti numerici ricalcano le colonne del database (Decimal(9,6) per le
// coordinate, Decimal(6,2) per l'accuratezza): un valore fuori scala andrebbe
// in overflow su Postgres e produrrebbe un 500 opaco.
const punchSchema = z.object({
  punchType: z.enum(['IN', 'OUT', 'BREAK_START', 'BREAK_END']),
  venueId: z.string().min(1, 'Sede richiesta'),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).max(9999).optional(),
  notes: z.string().max(500).optional(),
  // Orario reale della timbratura registrata offline (ISO 8601).
  // Validato manualmente per poter degradare all'ora corrente invece di
  // rifiutare l'intera timbratura quando il valore non è utilizzabile.
  offlineTimestamp: z.string().max(64).optional(),
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
    const coordinates = hasCoordinates
      ? { latitude: latitude!, longitude: longitude! }
      : null

    // Luoghi di lavoro su cui questa persona è abilitata. Chi non ne ha
    // nessuno ricade sul comportamento precedente ai luoghi: geofence sulle
    // coordinate della sede.
    const assegnazioni = await prisma.workLocationAssignment.findMany({
      where: {
        userId: session.user.id,
        endedAt: null,
        workLocation: { venueId: validatedData.venueId, isActive: true },
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
    })

    const luoghiAssegnati: AssignedLocation[] = assegnazioni.map((a) => ({
      id: a.workLocation.id,
      name: a.workLocation.name,
      latitude: a.workLocation.latitude === null ? null : Number(a.workLocation.latitude),
      longitude:
        a.workLocation.longitude === null ? null : Number(a.workLocation.longitude),
      geofenceRadiusMeters: a.workLocation.geofenceRadiusMeters,
      trackingMode: a.trackingMode,
    }))

    const usaLuoghi = luoghiAssegnati.length > 0
    const scelta = usaLuoghi
      ? pickWorkLocation(luoghiAssegnati, coordinates)
      : { location: null, distanceMeters: null, isWithinRadius: true }

    // Con più luoghi assegnati e nessuna posizione non si può stabilire né il
    // luogo né la modalità con cui la persona è abilitata a timbrare: si
    // rifiuta, non si accetta al buio. Accettare qui aprirebbe la porta a chi
    // ha solo luoghi in sola visualizzazione e timbra spegnendo il GPS.
    if (usaLuoghi && !scelta.location) {
      return NextResponse.json(
        {
          error:
            'Non riesco a stabilire in quale luogo stai timbrando. Attiva il GPS e riprova.',
          code: 'GEOLOCATION_REQUIRED',
        },
        { status: 422 }
      )
    }

    // Chi ha un luogo in sola visualizzazione, o dichiara le ore invece di
    // timbrarle, non passa da qui.
    if (scelta.location) {
      const modalita = scelta.location.trackingMode

      if (modalita === 'VIEW_ONLY') {
        return NextResponse.json(
          {
            error: `Non sei abilitato a timbrare presso ${scelta.location.name}.`,
            code: 'TRACKING_VIEW_ONLY',
          },
          { status: 403 }
        )
      }

      if (modalita === 'MANUAL_HOURS') {
        return NextResponse.json(
          {
            error: `Presso ${scelta.location.name} le ore si dichiarano, non si timbrano.`,
            code: 'TRACKING_MANUAL_HOURS',
          },
          { status: 422 }
        )
      }

      // La modalità GPS con geofence configurato richiede la posizione per
      // definizione: senza, il controllo del raggio non si può eseguire.
      // La decisione non dipende da AttendancePolicy, che potrebbe non essere
      // mai stata salvata: qui il default è chiudere, non aprire.
      if (
        modalita === 'GPS_GEOFENCE' &&
        scelta.location.latitude !== null &&
        scelta.location.longitude !== null &&
        !hasCoordinates
      ) {
        return NextResponse.json(
          {
            error: `Per timbrare presso ${scelta.location.name} serve la posizione. Attiva il GPS e riprova.`,
            code: 'GEOLOCATION_REQUIRED',
          },
          { status: 422 }
        )
      }
    }

    const puntoDiRiferimentoHaCoordinate = usaLuoghi
      ? luoghiAssegnati.some((l) => l.latitude !== null && l.longitude !== null)
      : venue.latitude !== null && venue.longitude !== null

    // La geolocalizzazione obbligatoria è una decisione del server: senza
    // coordinate la timbratura viene rifiutata, altrimenti basterebbe negare il
    // permesso GPS dal dispositivo per aggirare il geofencing.
    if (
      venue.attendancePolicy?.requireGeolocation &&
      puntoDiRiferimentoHaCoordinate &&
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

    // Distanza dal punto di riferimento: il luogo di lavoro se ce n'è uno,
    // altrimenti la sede.
    let distanceFromVenue: number | null = null
    let isWithinRadius = true
    let maxRadius = venue.attendancePolicy?.geoFenceRadius ?? 100

    if (usaLuoghi) {
      distanceFromVenue = scelta.distanceMeters
      // Distanza ignota con un luogo scelto significa geofence non
      // configurato (luogo senza coordinate): non c'è un raggio da violare.
      // Il caso "coordinate non inviate" non arriva qui: è già stato rifiutato.
      isWithinRadius = scelta.distanceMeters === null ? true : scelta.isWithinRadius
      maxRadius = scelta.location?.geofenceRadiusMeters ?? maxRadius
    } else if (coordinates && venue.latitude && venue.longitude) {
      distanceFromVenue = Math.round(
        calculateDistance(
          coordinates.latitude,
          coordinates.longitude,
          Number(venue.latitude),
          Number(venue.longitude)
        )
      )
      isWithinRadius = distanceFromVenue <= maxRadius
    }

    // La colonna è Decimal(8,2): una distanza intercontinentale la manderebbe
    // in overflow. Oltre i 999 km il numero esatto non aggiunge informazione.
    if (distanceFromVenue !== null) {
      distanceFromVenue = Math.min(distanceFromVenue, 999999)
    }

    // Se la policy blocca le timbrature fuori sede
    if (
      venue.attendancePolicy?.blockOutsideLocation &&
      !isWithinRadius &&
      distanceFromVenue !== null
    ) {
      return NextResponse.json(
        {
          error: scelta.location
            ? `Sei fuori dal raggio di ${scelta.location.name}`
            : 'Sei fuori dal raggio della sede',
          distance: distanceFromVenue,
          maxRadius,
        },
        { status: 400 }
      )
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
    // Il giorno è quello civile italiano: sul server, che gira in UTC, le
    // timbrature serali cadrebbero altrimenti nel giorno successivo.
    const punchDateKey = romeDateKey(punchedAt)

    // Riposo domenicale: se la regola in vigore lo prevede, la domenica non si
    // timbra. Il controllo sta sul server perché è una regola, non un consiglio.
    if (toRomeParts(punchedAt).weekday === 0) {
      const { blockSunday } = await getEffectiveTimekeepingPolicy(
        session.user.id,
        validatedData.venueId,
        scelta.location?.id ?? null
      )

      if (blockSunday) {
        return NextResponse.json(
          {
            error: 'La regola oraria in vigore non consente di timbrare la domenica.',
            code: 'SUNDAY_BLOCKED',
          },
          { status: 422 }
        )
      }
    }

    // La giornata lavorativa di un'uscita è quella dell'entrata che l'ha
    // aperta: per il turno 18:00-01:00 l'uscita dopo mezzanotte appartiene al
    // giorno prima, e il turno pianificato va cercato lì — altrimenti
    // l'uscita non troverebbe il suo turno e nascerebbe una "mancata uscita"
    // inesistente.
    let matchingClockIn: { id: string; punchedAt: Date } | null = null
    let workdayKey = punchDateKey
    if (validatedData.punchType === 'OUT') {
      matchingClockIn = await prisma.attendanceRecord.findFirst({
        where: {
          userId: session.user.id,
          venueId: validatedData.venueId,
          punchType: 'IN',
          punchedAt: {
            gte: new Date(punchedAt.getTime() - 24 * 60 * 60 * 1000),
            lt: punchedAt,
          },
        },
        orderBy: { punchedAt: 'desc' },
        select: { id: true, punchedAt: true },
      })

      if (matchingClockIn) {
        workdayKey = romeDateKey(matchingClockIn.punchedAt)
      }
    }

    const todayAssignment = await prisma.shiftAssignment.findFirst({
      where: {
        userId: session.user.id,
        venueId: validatedData.venueId,
        // `date` è una colonna @db.Date: si confronta con la mezzanotte UTC
        // del giorno, non con l'istante in cui inizia la giornata italiana.
        date: toDateOnlyUtc(workdayKey),
        schedule: {
          status: 'PUBLISHED',
        },
      },
    })

    // Una timbratura sincronizzata da offline può arrivare due volte: la coda
    // del dispositivo ritenta e il server potrebbe aver già registrato il
    // primo invio. Stessa persona, stesso tipo, stesso istante: è la stessa
    // timbratura, si risponde con quella senza crearne un doppione.
    if (isOfflineSync && !offlineTimestampRejected) {
      const esistente = await prisma.attendanceRecord.findFirst({
        where: {
          userId: session.user.id,
          venueId: validatedData.venueId,
          punchType: validatedData.punchType as PunchType,
          punchedAt,
        },
        include: {
          venue: { select: { id: true, name: true, code: true } },
        },
      })

      if (esistente) {
        return NextResponse.json({
          success: true,
          data: {
            id: esistente.id,
            punchType: esistente.punchType,
            punchedAt: esistente.punchedAt,
            venue: esistente.venue,
            workLocation: scelta.location
              ? { id: scelta.location.id, name: scelta.location.name }
              : null,
            isWithinRadius: esistente.isWithinRadius,
            distanceFromVenue: esistente.distanceFromVenue,
            isOfflineSync,
            offlineTimestampRejected,
          },
        })
      }
    }

    // Crea la timbratura
    const record = await prisma.attendanceRecord.create({
      data: {
        userId: session.user.id,
        venueId: validatedData.venueId,
        assignmentId: todayAssignment?.id ?? null,
        workLocationId: scelta.location?.id ?? null,
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

    // `actualStart`/`actualEnd` sono colonne @db.Time: contengono un orario
    // senza data, e dev'essere l'orario italiano — lo stesso metro con cui sono
    // stati inseriti gli orari dei turni.
    const punchMinutes = toRomeParts(punchedAt).minutesFromMidnight
    const punchTimeOnly = new Date(
      Date.UTC(
        1970,
        0,
        1,
        Math.floor(punchMinutes / 60),
        punchMinutes % 60,
        punchedAt.getUTCSeconds()
      )
    )

    // Se timbrata IN, aggiorna actualStart sull'assignment
    if (todayAssignment && validatedData.punchType === 'IN') {
      await prisma.shiftAssignment.update({
        where: { id: todayAssignment.id },
        data: { actualStart: punchTimeOnly },
      })
    }

    // Se timbrata OUT, aggiorna actualEnd e calcola ore lavorate
    // sull'entrata che ha aperto la giornata, anche se era ieri.
    if (todayAssignment && validatedData.punchType === 'OUT') {
      let hoursWorked: number | null = null
      if (matchingClockIn) {
        const diffMs = punchedAt.getTime() - matchingClockIn.punchedAt.getTime()
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
          date: toDateOnlyUtc(punchDateKey),
          description: `Timbratura effettuata a ${distanceFromVenue}m da ${scelta.location?.name ?? 'la sede'} (raggio: ${maxRadius}m)`,
          actualValue: `${distanceFromVenue}m`,
          expectedValue: `<${maxRadius}m`,
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
          date: toDateOnlyUtc(punchDateKey),
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
        workLocation: scelta.location
          ? { id: scelta.location.id, name: scelta.location.name }
          : null,
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
