import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { PunchType } from '@prisma/client'

import { logger } from '@/lib/logger'
import { createManualPunch } from '@/lib/attendance/manual-punch'
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

    // La creazione vera sta in `createManualPunch`, condivisa con
    // l'approvazione delle richieste di correzione. In transazione: record e
    // consuntivo del turno o entrano insieme o non entrano.
    const record = await prisma.$transaction((tx) =>
      createManualPunch(tx, {
        userId: validatedData.userId,
        venueId: validatedData.venueId,
        punchType: validatedData.punchType as PunchType,
        punchedAt: validatedData.punchedAt,
        enteredById: session.user.id,
        reason: validatedData.reason,
        notes: validatedData.notes ?? null,
      })
    )

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
