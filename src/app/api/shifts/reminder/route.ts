import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notifyShiftReminder } from '@/lib/notifications'

// Header segreto per autorizzare il cron job
const CRON_SECRET = process.env.CRON_SECRET || 'default-cron-secret'

// POST /api/shifts/reminder - Job per promemoria turni (1h prima)
export async function POST(request: NextRequest) {
  try {
    // Verifica autorizzazione cron
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const now = new Date()
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)

    // Finestra temporale: turni che iniziano tra 55 e 65 minuti da adesso
    // Questo permette un margine per evitare duplicati se il job viene eseguito ogni 10 minuti
    const windowStart = new Date(now.getTime() + 55 * 60 * 1000)
    const windowEnd = new Date(now.getTime() + 65 * 60 * 1000)

    // Estrai solo l'orario per il confronto (1970-01-01 base)
    const windowStartTime = new Date(1970, 0, 1, windowStart.getHours(), windowStart.getMinutes())
    const windowEndTime = new Date(1970, 0, 1, windowEnd.getHours(), windowEnd.getMinutes())

    // Trova tutti i turni assegnati per oggi che iniziano nella finestra
    const assignments = await prisma.shiftAssignment.findMany({
      where: {
        date: {
          gte: today,
          lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        },
        startTime: {
          gte: windowStartTime,
          lt: windowEndTime,
        },
        // Solo turni non ancora iniziati (no actualStart)
        actualStart: null,
        // Solo schedules pubblicati
        schedule: {
          status: 'PUBLISHED',
        },
        // Solo utenti con notifiche abilitate e token push
        user: {
          portalEnabled: true,
          appToken: { not: null },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            appToken: true,
          },
        },
        shiftDefinition: {
          select: {
            name: true,
          },
        },
        schedule: {
          select: {
            status: true,
          },
        },
      },
    })

    let totalSent = 0
    let totalFailed = 0
    const results: { assignmentId: string; userId: string; success: boolean; error?: string }[] = []

    for (const assignment of assignments) {
      try {
        // Verifica preferenze notifiche dell'utente
        const prefs = await prisma.notificationPreference.findUnique({
          where: { userId: assignment.userId },
        })

        // Se le preferenze esistono e shiftReminder è disabilitato, salta
        if (prefs && !prefs.shiftReminder) {
          results.push({
            assignmentId: assignment.id,
            userId: assignment.userId,
            success: false,
            error: 'Notifica disabilitata dall\'utente',
          })
          continue
        }

        // Invia notifica
        await notifyShiftReminder(assignment.id)

        totalSent++
        results.push({
          assignmentId: assignment.id,
          userId: assignment.userId,
          success: true,
        })
      } catch (error) {
        totalFailed++
        results.push({
          assignmentId: assignment.id,
          userId: assignment.userId,
          success: false,
          error: error instanceof Error ? error.message : 'Errore sconosciuto',
        })
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      summary: {
        assignmentsFound: assignments.length,
        notificationsSent: totalSent,
        notificationsFailed: totalFailed,
      },
      details: results,
    })
  } catch (error) {
    console.error('Errore shift reminder job:', error)
    return NextResponse.json(
      { error: 'Errore nel job promemoria turni' },
      { status: 500 }
    )
  }
}

// GET per verificare lo stato del job (solo info)
export async function GET() {
  return NextResponse.json({
    name: 'Shift Reminder Job',
    description: 'Invia promemoria ai dipendenti 1 ora prima dell\'inizio del turno',
    endpoint: 'POST /api/shifts/reminder',
    authorization: 'Bearer CRON_SECRET',
    schedule: 'Consigliato: ogni 10 minuti',
    window: 'Turni che iniziano tra 55 e 65 minuti da adesso',
  })
}
