import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { notifySwapApproved, notifySwapRejected } from '@/lib/notifications/triggers'

import { logger } from '@/lib/logger'
// Schema per risposta a scambio
const respondSwapSchema = z.object({
  action: z.enum(['accept', 'reject']),
  message: z.string().optional(),
})

// GET /api/shift-swaps/[id] - Dettaglio richiesta scambio
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

    const assignment = await prisma.shiftAssignment.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        schedule: {
          select: {
            id: true,
            name: true,
            startDate: true,
            endDate: true,
            status: true,
          },
        },
        shiftDefinition: {
          select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
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

    if (!assignment) {
      return NextResponse.json({ error: 'Turno non trovato' }, { status: 404 })
    }

    // Verifica accesso
    if (session.user.role === 'staff') {
      const canAccess =
        assignment.userId === session.user.id ||
        assignment.swapRequestedById === session.user.id ||
        assignment.swapWithUserId === session.user.id

      if (!canAccess) {
        return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
      }
    }

    // Arricchisci con info sull'utente target
    let targetUser = null
    let requestedByUser = null

    if (assignment.swapWithUserId) {
      targetUser = await prisma.user.findUnique({
        where: { id: assignment.swapWithUserId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      })
    }

    if (assignment.swapRequestedById) {
      requestedByUser = await prisma.user.findUnique({
        where: { id: assignment.swapRequestedById },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      })
    }

    return NextResponse.json({
      ...assignment,
      targetUser,
      requestedByUser,
    })
  } catch (error) {
    logger.error('Errore GET /api/shift-swaps/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero della richiesta di scambio' },
      { status: 500 }
    )
  }
}

// PUT /api/shift-swaps/[id] - Accetta o rifiuta scambio
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
    const body = await request.json()
    const validatedData = respondSwapSchema.parse(body)

    // Recupera il turno
    const assignment = await prisma.shiftAssignment.findUnique({
      where: { id },
      include: {
        schedule: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })

    if (!assignment) {
      return NextResponse.json({ error: 'Turno non trovato' }, { status: 404 })
    }

    // Verifica che ci sia una richiesta di scambio pendente
    if (assignment.swapStatus !== 'PENDING') {
      return NextResponse.json(
        { error: 'Nessuna richiesta di scambio pendente per questo turno' },
        { status: 400 }
      )
    }

    // Verifica che l'utente sia il destinatario dello scambio o un manager
    const isTarget = assignment.swapWithUserId === session.user.id
    const isManagerOrAdmin = session.user.role === 'manager' || session.user.role === 'admin'

    if (!isTarget && !isManagerOrAdmin) {
      return NextResponse.json(
        { error: 'Non sei autorizzato a rispondere a questa richiesta' },
        { status: 403 }
      )
    }

    if (validatedData.action === 'accept') {
      // Esegui lo scambio in una transazione
      const result = await prisma.$transaction(async (tx) => {
        // Trova il turno del collega per lo stesso giorno (se esiste)
        const targetAssignment = await tx.shiftAssignment.findFirst({
          where: {
            userId: assignment.swapWithUserId!,
            date: assignment.date,
            scheduleId: assignment.scheduleId,
            id: { not: assignment.id },
          },
        })

        // Scambia i turni
        if (targetAssignment) {
          // Scambio completo: entrambi hanno un turno
          await tx.shiftAssignment.update({
            where: { id: assignment.id },
            data: {
              userId: assignment.swapWithUserId!,
              swapStatus: 'APPROVED',
              status: 'SWAPPED',
            },
          })

          await tx.shiftAssignment.update({
            where: { id: targetAssignment.id },
            data: {
              userId: assignment.userId,
              status: 'SWAPPED',
            },
          })

          return { swapped: true, targetAssignment }
        } else {
          // Il collega non ha un turno, semplicemente trasferisci il turno
          await tx.shiftAssignment.update({
            where: { id: assignment.id },
            data: {
              userId: assignment.swapWithUserId!,
              swapStatus: 'APPROVED',
              status: 'SWAPPED',
            },
          })

          return { swapped: true, targetAssignment: null }
        }
      })

      // Notifica chi ha richiesto lo scambio
      notifySwapApproved(assignment.id).catch((err) => {
        logger.error('Errore invio notifica swap approved', err)
      })

      return NextResponse.json({
        message: 'Scambio turno completato con successo',
        ...result,
      })
    } else {
      // Salva i dati per la notifica prima di resettarli
      const requesterId = assignment.swapRequestedById

      // Rifiuta lo scambio
      await prisma.shiftAssignment.update({
        where: { id },
        data: {
          swapStatus: 'REJECTED',
          swapRequestedById: null,
          swapWithUserId: null,
        },
      })

      // Notifica chi ha richiesto lo scambio
      if (requesterId) {
        notifySwapRejected(id, session.user.id, requesterId).catch((err) => {
          logger.error('Errore invio notifica swap rejected', err)
        })
      }

      return NextResponse.json({
        message: 'Richiesta di scambio rifiutata',
      })
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PUT /api/shift-swaps/[id]', error)
    return NextResponse.json(
      { error: 'Errore nella gestione della richiesta di scambio' },
      { status: 500 }
    )
  }
}

// DELETE /api/shift-swaps/[id] - Annulla richiesta di scambio
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

    // Recupera il turno
    const assignment = await prisma.shiftAssignment.findUnique({
      where: { id },
    })

    if (!assignment) {
      return NextResponse.json({ error: 'Turno non trovato' }, { status: 404 })
    }

    // Verifica che ci sia una richiesta di scambio pendente
    if (assignment.swapStatus !== 'PENDING') {
      return NextResponse.json(
        { error: 'Nessuna richiesta di scambio pendente da annullare' },
        { status: 400 }
      )
    }

    // Solo chi ha richiesto lo scambio o un manager/admin può annullare
    const isRequester = assignment.swapRequestedById === session.user.id
    const isManagerOrAdmin = session.user.role === 'manager' || session.user.role === 'admin'

    if (!isRequester && !isManagerOrAdmin) {
      return NextResponse.json(
        { error: 'Non sei autorizzato ad annullare questa richiesta' },
        { status: 403 }
      )
    }

    // Annulla la richiesta
    await prisma.shiftAssignment.update({
      where: { id },
      data: {
        swapStatus: null,
        swapRequestedById: null,
        swapWithUserId: null,
      },
    })

    return NextResponse.json({
      message: 'Richiesta di scambio annullata',
    })
  } catch (error) {
    logger.error('Errore DELETE /api/shift-swaps/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'annullamento della richiesta' },
      { status: 500 }
    )
  }
}
