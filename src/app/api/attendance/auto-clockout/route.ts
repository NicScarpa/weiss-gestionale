import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notifyAnomalyCreated } from '@/lib/notifications'

import { logger } from '@/lib/logger'
import { romeDateKey, toDateOnlyUtc } from '@/lib/timezone'
import {
  FINESTRA_RECUPERO_GIORNI,
  fineTurnoInMinuti,
  orarioChiusuraAutomatica,
} from '@/lib/attendance/auto-clockout'
import { AUTORE_SISTEMA, createManualPunch } from '@/lib/attendance/manual-punch'
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

      // L'interruttore delle Impostazioni presenze ora conta davvero. Prima
      // veniva letto solo `autoClockOutHours` e mai `autoClockOutEnabled`:
      // spegnere la chiusura automatica dalla pagina non fermava niente, e
      // nessuna schermata lo diceva.
      if (policy && !policy.autoClockOutEnabled) {
        continue
      }

      const maxHours = policy?.autoClockOutHours ?? 12

      // Trova tutte le timbrature IN senza corrispondente OUT
      // che sono più vecchie di maxHours
      const cutoffTime = new Date(now.getTime() - maxHours * 60 * 60 * 1000)

      const openPunches = await prisma.attendanceRecord.findMany({
        where: {
          venueId: venue.id,
          punchType: 'IN',
          punchedAt: {
            // La finestra all'indietro è larga di proposito: con le 24 ore di
            // prima, se il servizio restava fermo mezza giornata l'entrata ne
            // usciva e nessun giro futuro la guardava più. Vedi il commento
            // di FINESTRA_RECUPERO_GIORNI.
            gte: new Date(
              now.getTime() - FINESTRA_RECUPERO_GIORNI * 24 * 60 * 60 * 1000
            ),
            lt: cutoffTime, // Più vecchie di maxHours
          },
        },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      })

      // I turni pianificati delle giornate coinvolte, in una query sola: è la
      // fine del turno a dire quando chiudere, non un orario inventato.
      const giornateCoinvolte = [
        ...new Set(openPunches.map((p) => romeDateKey(p.punchedAt))),
      ]
      const turni = giornateCoinvolte.length
        ? await prisma.shiftAssignment.findMany({
            where: {
              venueId: venue.id,
              userId: { in: [...new Set(openPunches.map((p) => p.userId))] },
              date: { in: giornateCoinvolte.map(toDateOnlyUtc) },
              schedule: { status: 'PUBLISHED' },
            },
            select: { userId: true, date: true, startTime: true, endTime: true },
          })
        : []

      const turniPerUtenteGiorno = new Map<
        string,
        { startTime: Date | null; endTime: Date | null }[]
      >()
      for (const turno of turni) {
        const chiave = `${turno.userId}_${turno.date.toISOString().slice(0, 10)}`
        const elenco = turniPerUtenteGiorno.get(chiave) ?? []
        elenco.push({ startTime: turno.startTime, endTime: turno.endTime })
        turniPerUtenteGiorno.set(chiave, elenco)
      }

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
          // L'uscita si scrive alla fine del turno pianificato. Prima erano
          // sempre dodici ore dopo l'entrata — un orario che nessuno ha mai
          // lavorato: turno 07:00-13:00 dimenticato, uscita scritta alle
          // 18:58, 12 ore pagate invece di 6.
          const dateKeyEntrata = romeDateKey(clockIn.punchedAt)
          const chiave = `${clockIn.userId}_${dateKeyEntrata}`

          const chiusura = orarioChiusuraAutomatica({
            entrataAlle: clockIn.punchedAt,
            dateKeyEntrata,
            fineTurnoMinuti: fineTurnoInMinuti(turniPerUtenteGiorno.get(chiave) ?? []),
            maxHours,
          })

          const oreChiuse =
            (chiusura.orario.getTime() - clockIn.punchedAt.getTime()) / (60 * 60 * 1000)

          const motivo =
            chiusura.origine === 'turno'
              ? 'Uscita non timbrata: chiusa alla fine del turno pianificato'
              : `Uscita non timbrata e nessun turno pianificato: chiusa dopo ${maxHours}h`

          // La data è il giorno italiano dell'entrata: il cron gira in UTC e
          // per un'entrata serale segnerebbe il giorno dopo.
          const dateForAnomaly = toDateOnlyUtc(dateKeyEntrata)

          // L'uscita nasce da `createManualPunch` e non da una `create`
          // diretta. Non è un dettaglio di stile: quella funzione è l'unico
          // punto in cui, con le regole che seguono il turno pianificato,
          // nasce l'anomalia di scostamento. Senza, i minuti fuori dal turno
          // restavano SOSPESI nel calcolo delle paghe — né pagati né persi —
          // con l'export del mese bloccato e nessuna riga da approvare in
          // nessuna schermata. Ore sparite dal cedolino senza che nessuno
          // avesse deciso di toglierle.
          //
          // `revisioneScostamento: 'PENDING'` perché qui non ha deciso
          // nessuno: l'orario è una supposizione del programma, e chi guarda
          // le anomalie deve poterla confermare o rifiutare.
          const { anomaly, scostamenti } = await prisma.$transaction(async (tx) => {
            const uscita = await createManualPunch(tx, {
              userId: clockIn.userId,
              venueId: venue.id,
              workLocationId: clockIn.workLocationId,
              punchType: 'OUT',
              punchedAt: chiusura.orario,
              enteredById: AUTORE_SISTEMA,
              reason: motivo,
              notes: 'Generato automaticamente dal sistema',
              // L'uscita del turno serale cade dopo la mezzanotte, ma la
              // giornata lavorativa resta quella dell'entrata.
              workdayKey: dateKeyEntrata,
              revisioneScostamento: 'PENDING',
            })

            const anomaly = await tx.attendanceAnomaly.create({
              data: {
                userId: clockIn.userId,
                venueId: venue.id,
                recordId: clockIn.id,
                assignmentId: clockIn.assignmentId,
                anomalyType: 'MISSING_CLOCK_OUT',
                status: 'PENDING',
                date: dateForAnomaly,
                description:
                  `${clockIn.user.firstName} ${clockIn.user.lastName} non ha timbrato ` +
                  `l'uscita. ${motivo}: ${oreChiuse.toFixed(2)} ore.`,
                expectedValue: 'Timbratura uscita',
                actualValue: 'Mancante',
                hoursAffected: oreChiuse,
              },
            })

            const scostamenti = await tx.attendanceAnomaly.count({
              where: { recordId: uscita.id },
            })

            return { anomaly, scostamenti }
          })

          // Notifica anomalia creata (async)
          notifyAnomalyCreated(anomaly.id).catch((err) =>
            logger.error('Errore invio notifica anomalia auto-clockout', err)
          )

          venueAutoClockouts++
          totalAutoClockouts++
          // Anche gli scostamenti dal turno entrano nel conteggio: il
          // riepilogo del cron è ciò che si guarda per capire cosa ha fatto
          // il giro di stanotte, e deve dire il vero.
          totalAnomalies += 1 + scostamenti
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
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'Errore di configurazione server' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  return NextResponse.json({
    name: 'Auto Clock-Out Job',
    description: 'Crea automaticamente clock-out per dipendenti che hanno dimenticato di timbrare l\'uscita',
    endpoint: 'POST /api/attendance/auto-clockout',
    authorization: 'Bearer CRON_SECRET',
    schedule: 'Consigliato: ogni ora o a mezzanotte',
  })
}
