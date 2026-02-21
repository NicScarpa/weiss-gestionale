import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { updateJournalEntrySchema } from '@/lib/validations/prima-nota'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'
// GET /api/prima-nota/[id] - Dettaglio singolo movimento
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params
    const venueId = await getVenueId()

    const entry = await prisma.journalEntry.findFirst({
      where: { id, venueId },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        account: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        counterpart: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        closure: {
          select: {
            id: true,
            date: true,
            status: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })

    if (!entry) {
      return NextResponse.json(
        { error: 'Movimento non trovato' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ...entry,
      debitAmount: entry.debitAmount ? Number(entry.debitAmount) : null,
      creditAmount: entry.creditAmount ? Number(entry.creditAmount) : null,
      vatAmount: entry.vatAmount ? Number(entry.vatAmount) : null,
      runningBalance: entry.runningBalance ? Number(entry.runningBalance) : null,
    })
  } catch (error) {
    logger.error('Errore GET /api/prima-nota/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del movimento' },
      { status: 500 }
    )
  }
}

// PUT /api/prima-nota/[id] - Aggiorna movimento
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params
    const venueId = await getVenueId()
    const body = await request.json()
    const validatedData = updateJournalEntrySchema.parse(body)

    // Verifica che il movimento esista e appartenga al venue
    const existingEntry = await prisma.journalEntry.findFirst({
      where: { id, venueId },
      select: { id: true, closureId: true },
    })

    if (!existingEntry) {
      return NextResponse.json(
        { error: 'Movimento non trovato' },
        { status: 404 }
      )
    }

    // Non modificabile se generato da chiusura
    if (existingEntry.closureId) {
      return NextResponse.json(
        { error: 'I movimenti generati da chiusure non sono modificabili' },
        { status: 400 }
      )
    }

    // Aggiorna
    const updated = await prisma.journalEntry.update({
      where: { id },
      data: {
        date: validatedData.date,
        description: validatedData.description,
        documentRef: validatedData.documentRef,
        documentType: validatedData.documentType,
        accountId: validatedData.accountId,
        vatAmount: validatedData.vatAmount,
      },
      select: { id: true, updatedAt: true },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PUT /api/prima-nota/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento del movimento' },
      { status: 500 }
    )
  }
}

// DELETE /api/prima-nota/[id] - Elimina movimento
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params
    const venueId = await getVenueId()

    // Verifica che il movimento esista e appartenga al venue
    const existingEntry = await prisma.journalEntry.findFirst({
      where: { id, venueId },
      select: { id: true, closureId: true },
    })

    if (!existingEntry) {
      return NextResponse.json(
        { error: 'Movimento non trovato' },
        { status: 404 }
      )
    }

    // Verifica accesso (solo admin o manager)
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json(
        { error: 'Solo admin e manager possono eliminare movimenti' },
        { status: 403 }
      )
    }

    // Non eliminabile se generato da chiusura
    if (existingEntry.closureId) {
      return NextResponse.json(
        { error: 'I movimenti generati da chiusure non sono eliminabili' },
        { status: 400 }
      )
    }

    // Elimina
    await prisma.journalEntry.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Errore DELETE /api/prima-nota/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione del movimento' },
      { status: 500 }
    )
  }
}
