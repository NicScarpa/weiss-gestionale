import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notifyAnomalyCreated } from '@/lib/notifications'

import { logger } from '@/lib/logger'
// POST /api/attendance/auto-clockout - Job automatico per clock-out mancanti
export async function POST(request: NextRequest) {
  try {
    // Verifica che CRON_SECRET sia configurato
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      logger.error('CRON_SECRET environment variable is not set')
      return NextResponse.json(
        { error: 'Errore di configurazione server' },
        { status: 500 }
      )
    }

    // Verifica autorizzazione cron
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const now = new Date()
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)

    // Trova tutte le sedi con le loro policy
    const venues = await prisma.venue.findMany({
      where: { isActive: true },
      include: {
        attendancePolicy: true,
      },
    })

    let totalProcessed = 0
    let totalAutoClockouts = 0
    let totalAnomalies = 0
    const results: { venueId: string; venueName: string; autoClockouts: number }[] = []

    for (const venue of venues) {
      const policy = venue.attendancePolicy
      const maxHours = policy?.autoClockOutHours ?? 12

      // Trova tutte le timbrature IN senza corrispondente OUT
      // che sono più vecchie di maxHours
      const cutoffTime = new Date(now.getTime() - maxHours * 60 * 60 * 1000)

      // Trova utenti con IN ma senza OUT per oggi
      const openPunches = await prisma.attendanceRecord.findMany({
        where: {
          venueId: venue.id,
          punchType: 'IN',
          punchedAt: {
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Ultime 24h
            lt: cutoffTime, // Più vecchie di maxHours
          },
        },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      })

      let venueAutoClockouts = 0

      for (const clockIn of openPunches) {
        // Verifica se esiste già un clock-out dopo questo clock-in
        const existingOut = await prisma.attendanceRecord.findFirst({
          where: {
            userId: clockIn.userId,
            venueId: venue.id,
            punchType: 'OUT',
            punchedAt: {
              gt: clockIn.punchedAt,
            },
          },
        })

        if (!existingOut) {
          // Crea auto clock-out
          const autoClockoutTime = new Date(
            clockIn.punchedAt.getTime() + maxHours * 60 * 60 * 1000
          )

          await prisma.attendanceRecord.create({
            data: {
              userId: clockIn.userId,
              venueId: venue.id,
              assignmentId: clockIn.assignmentId,
              punchType: 'OUT',
              punchMethod: 'WEB',
              punchedAt: autoClockoutTime,
              isManual: true,
              manualEntryBy: 'SYSTEM',
              manualEntryReason: `Auto clock-out dopo ${maxHours}h senza uscita`,
              notes: 'Generato automaticamente dal sistema',
            },
          })

          // Crea anomalia
          const dateForAnomaly = new Date(clockIn.punchedAt)
          dateForAnomaly.setHours(0, 0, 0, 0)

          const anomaly = await prisma.attendanceAnomaly.create({
            data: {
              userId: clockIn.userId,
              venueId: venue.id,
              recordId: clockIn.id,
              assignmentId: clockIn.assignmentId,
              anomalyType: 'MISSING_CLOCK_OUT',
              status: 'PENDING',
              date: dateForAnomaly,
              description: `${clockIn.user.firstName} ${clockIn.user.lastName} non ha timbrato l'uscita. Auto clock-out dopo ${maxHours}h.`,
              expectedValue: 'Timbratura uscita',
              actualValue: 'Mancante',
              hoursAffected: maxHours,
            },
          })

          // Notifica anomalia creata (async)
          notifyAnomalyCreated(anomaly.id).catch((err) =>
            logger.error('Errore invio notifica anomalia auto-clockout', err)
          )

          venueAutoClockouts++
          totalAutoClockouts++
          totalAnomalies++
        }

        totalProcessed++
      }

      if (venueAutoClockouts > 0) {
        results.push({
          venueId: venue.id,
          venueName: venue.name,
          autoClockouts: venueAutoClockouts,
        })
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      summary: {
        venuesProcessed: venues.length,
        recordsChecked: totalProcessed,
        autoClockoutsCreated: totalAutoClockouts,
        anomaliesCreated: totalAnomalies,
      },
      details: results,
    })
  } catch (error) {
    logger.error('Errore auto-clockout job', error)
    return NextResponse.json(
      { error: 'Errore nel job auto-clockout' },
      { status: 500 }
    )
  }
}

// GET per verificare lo stato del job (solo info)
export async function GET() {
  return NextResponse.json({
    name: 'Auto Clock-Out Job',
    description: 'Crea automaticamente clock-out per dipendenti che hanno dimenticato di timbrare l\'uscita',
    endpoint: 'POST /api/attendance/auto-clockout',
    authorization: 'Bearer CRON_SECRET',
    schedule: 'Consigliato: ogni ora o a mezzanotte',
  })
}
