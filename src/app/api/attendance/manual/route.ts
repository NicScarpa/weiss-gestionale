import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { PunchType, PunchMethod } from '@prisma/client'

import { logger } from '@/lib/logger'
// Schema validazione input
const manualPunchSchema = z.object({
  userId: z.string().min(1, 'Utente richiesto'),
  venueId: z.string().min(1, 'Sede richiesta'),
  punchType: z.enum(['IN', 'OUT', 'BREAK_START', 'BREAK_END']),
  punchedAt: z.string().transform((val) => new Date(val)),
  reason: z.string().min(1, 'Motivazione richiesta'),
  notes: z.string().optional(),
})

// POST /api/attendance/manual - Inserimento manuale timbratura
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Verifica ruolo manager/admin
    const manager = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { role: true },
    })

    if (!manager || !['admin', 'manager'].includes(manager.role.name)) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = manualPunchSchema.parse(body)

    // Verifica che l'utente esista
    const targetUser = await prisma.user.findUnique({
      where: { id: validatedData.userId },
      select: { id: true, firstName: true, lastName: true, venueId: true },
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: 'Utente non trovato' },
        { status: 404 }
      )
    }

    // Se manager, verifica che sia della stessa sede
    if (
      manager.role.name === 'manager' &&
      manager.venueId !== validatedData.venueId
    ) {
      return NextResponse.json(
        { error: 'Non puoi inserire timbrature per altre sedi' },
        { status: 403 }
      )
    }

    // Trova eventuale turno associato
    const punchDate = validatedData.punchedAt
    const dateStart = new Date(punchDate)
    dateStart.setHours(0, 0, 0, 0)
    const dateEnd = new Date(dateStart)
    dateEnd.setDate(dateEnd.getDate() + 1)

    const assignment = await prisma.shiftAssignment.findFirst({
      where: {
        userId: validatedData.userId,
        venueId: validatedData.venueId,
        date: {
          gte: dateStart,
          lt: dateEnd,
        },
        schedule: {
          status: 'PUBLISHED',
        },
      },
    })

    // Crea la timbratura manuale
    const record = await prisma.attendanceRecord.create({
      data: {
        userId: validatedData.userId,
        venueId: validatedData.venueId,
        assignmentId: assignment?.id ?? null,
        punchType: validatedData.punchType as PunchType,
        punchMethod: PunchMethod.MANUAL,
        punchedAt: validatedData.punchedAt,
        isManual: true,
        manualEntryBy: session.user.id,
        manualEntryReason: validatedData.reason,
        notes: validatedData.notes ?? null,
        isWithinRadius: true, // Manuale = sempre valido
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    })

    // Se è un'entrata/uscita, aggiorna i dati dell'assignment
    if (assignment) {
      const timeOnly = new Date(
        1970,
        0,
        1,
        punchDate.getHours(),
        punchDate.getMinutes(),
        punchDate.getSeconds()
      )

      if (validatedData.punchType === 'IN') {
        await prisma.shiftAssignment.update({
          where: { id: assignment.id },
          data: { actualStart: timeOnly },
        })
      } else if (validatedData.punchType === 'OUT') {
        // Trova l'entrata per calcolare le ore
        const clockIn = await prisma.attendanceRecord.findFirst({
          where: {
            userId: validatedData.userId,
            venueId: validatedData.venueId,
            punchType: 'IN',
            punchedAt: {
              gte: dateStart,
              lt: dateEnd,
            },
          },
          orderBy: { punchedAt: 'asc' },
        })

        let hoursWorked: number | null = null
        if (clockIn) {
          const diffMs =
            validatedData.punchedAt.getTime() - clockIn.punchedAt.getTime()
          hoursWorked = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
        }

        await prisma.shiftAssignment.update({
          where: { id: assignment.id },
          data: {
            actualEnd: timeOnly,
            hoursWorked: hoursWorked,
            status: 'WORKED',
          },
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: record.id,
        punchType: record.punchType,
        punchedAt: record.punchedAt,
        user: record.user,
        venue: record.venue,
        isManual: true,
        insertedBy: {
          id: session.user.id,
          name: `${manager.firstName} ${manager.lastName}`,
        },
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/attendance/manual', error)
    return NextResponse.json(
      { error: 'Errore nell\'inserimento della timbratura' },
      { status: 500 }
    )
  }
}
