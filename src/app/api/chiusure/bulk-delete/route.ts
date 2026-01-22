import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

import { logger } from '@/lib/logger'
const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1, 'Seleziona almeno una chiusura'),
})

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const userRole = session.user.role
    const userVenueId = session.user.venueId

    // Solo admin e manager possono eliminare
    if (userRole !== 'admin' && userRole !== 'manager') {
      return NextResponse.json(
        { error: 'Non hai i permessi per eliminare chiusure' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { ids } = bulkDeleteSchema.parse(body)

    // Recupera tutte le chiusure da eliminare
    const closures = await prisma.dailyClosure.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        status: true,
        venueId: true,
        date: true,
      },
    })

    if (closures.length === 0) {
      return NextResponse.json(
        { error: 'Nessuna chiusura trovata' },
        { status: 404 }
      )
    }

    // Verifica permessi per ogni chiusura
    const errors: string[] = []
    const toDelete: string[] = []

    for (const closure of closures) {
      // Manager può eliminare solo dalla propria sede
      if (userRole === 'manager' && closure.venueId !== userVenueId) {
        errors.push(`Chiusura ${closure.id}: non hai accesso a questa sede`)
        continue
      }

      // Solo admin può eliminare chiusure VALIDATED
      if (closure.status === 'VALIDATED' && userRole !== 'admin') {
        errors.push(`Chiusura ${closure.id}: solo admin può eliminare chiusure validate`)
        continue
      }

      // Solo admin può eliminare chiusure SUBMITTED
      if (closure.status === 'SUBMITTED' && userRole !== 'admin') {
        errors.push(`Chiusura ${closure.id}: solo admin può eliminare chiusure in attesa`)
        continue
      }

      toDelete.push(closure.id)
    }

    if (toDelete.length === 0) {
      return NextResponse.json(
        { error: 'Nessuna chiusura può essere eliminata', details: errors },
        { status: 400 }
      )
    }

    // Trova chiusure VALIDATED per eliminare anche le scritture contabili
    const validatedIds = closures
      .filter((c) => c.status === 'VALIDATED' && toDelete.includes(c.id))
      .map((c) => c.id)

    // Usa una transazione per garantire consistenza
    await prisma.$transaction(async (tx) => {
      // Elimina scritture contabili per chiusure VALIDATED
      if (validatedIds.length > 0) {
        await tx.journalEntry.deleteMany({
          where: { closureId: { in: validatedIds } },
        })
      }

      // Elimina le chiusure (cascade elimina stations, partials, expenses, attendance)
      await tx.dailyClosure.deleteMany({
        where: { id: { in: toDelete } },
      })
    })

    return NextResponse.json({
      success: true,
      deleted: toDelete.length,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    logger.error('Errore bulk delete chiusure', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore durante l\'eliminazione' },
      { status: 500 }
    )
  }
}
