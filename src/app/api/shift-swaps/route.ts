import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Schema per richiesta scambio turno
const createSwapRequestSchema = z.object({
  assignmentId: z.string().min(1, 'assignmentId richiesto'),
  targetUserId: z.string().min(1, 'targetUserId richiesto'),
  targetAssignmentId: z.string().optional(), // Opzionale: turno specifico da scambiare
  message: z.string().optional(),
})

// GET /api/shift-swaps - Lista richieste di scambio
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const direction = searchParams.get('direction') // 'sent' | 'received' | 'all'

    // Costruisci filtro
    const where: Record<string, unknown> = {
      swapStatus: { not: null },
    }

    // Filtra per status
    if (status) {
      where.swapStatus = status
    }

    // Per staff, mostra solo i propri scambi
    if (session.user.role === 'staff') {
      if (direction === 'sent') {
        where.swapRequestedById = session.user.id
      } else if (direction === 'received') {
        where.swapWithUserId = session.user.id
      } else {
        where.OR = [
          { swapRequestedById: session.user.id },
          { swapWithUserId: session.user.id },
        ]
      }
    } else if (session.user.role === 'manager') {
      // Manager vede scambi della propria sede
      where.venueId = session.user.venueId
    }
    // Admin vede tutto

    const swapRequests = await prisma.shiftAssignment.findMany({
      where,
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
      orderBy: { date: 'asc' },
    })

    // Arricchisci con info sull'utente target
    const enrichedSwaps = await Promise.all(
      swapRequests.map(async (swap) => {
        let targetUser = null
        let targetAssignment = null

        if (swap.swapWithUserId) {
          targetUser = await prisma.user.findUnique({
            where: { id: swap.swapWithUserId },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          })

          // Cerca se l'utente target ha un turno lo stesso giorno
          targetAssignment = await prisma.shiftAssignment.findFirst({
            where: {
              userId: swap.swapWithUserId,
              date: swap.date,
              scheduleId: swap.scheduleId,
              id: { not: swap.id },
            },
            include: {
              shiftDefinition: {
                select: {
                  id: true,
                  name: true,
                  startTime: true,
                  endTime: true,
                },
              },
            },
          })
        }

        return {
          ...swap,
          targetUser,
          targetAssignment,
        }
      })
    )

    return NextResponse.json({ swapRequests: enrichedSwaps })
  } catch (error) {
    console.error('Errore GET /api/shift-swaps:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle richieste di scambio' },
      { status: 500 }
    )
  }
}

// POST /api/shift-swaps - Crea richiesta di scambio
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createSwapRequestSchema.parse(body)

    // Recupera il turno da scambiare
    const assignment = await prisma.shiftAssignment.findUnique({
      where: { id: validatedData.assignmentId },
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

    // Verifica che l'utente sia il proprietario del turno
    if (assignment.userId !== session.user.id && session.user.role === 'staff') {
      return NextResponse.json(
        { error: 'Non puoi richiedere scambio per turni non tuoi' },
        { status: 403 }
      )
    }

    // Verifica che il turno sia pubblicato (non in bozza)
    if (assignment.schedule.status !== 'PUBLISHED') {
      return NextResponse.json(
        { error: 'Puoi scambiare solo turni pubblicati' },
        { status: 400 }
      )
    }

    // Verifica che non ci sia già una richiesta pendente
    if (assignment.swapStatus === 'PENDING') {
      return NextResponse.json(
        { error: 'Esiste già una richiesta di scambio pendente per questo turno' },
        { status: 409 }
      )
    }

    // Verifica che il turno non sia già scambiato
    if (assignment.status === 'SWAPPED') {
      return NextResponse.json(
        { error: 'Questo turno è già stato scambiato' },
        { status: 400 }
      )
    }

    // Verifica che l'utente target esista
    const targetUser = await prisma.user.findUnique({
      where: { id: validatedData.targetUserId },
      select: { id: true, firstName: true, lastName: true, venueId: true },
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'Utente destinatario non trovato' }, { status: 404 })
    }

    // Verifica che l'utente target sia della stessa sede
    if (targetUser.venueId !== assignment.venueId) {
      return NextResponse.json(
        { error: 'Puoi scambiare solo con colleghi della stessa sede' },
        { status: 400 }
      )
    }

    // Non puoi scambiare con te stesso
    if (validatedData.targetUserId === session.user.id) {
      return NextResponse.json(
        { error: 'Non puoi scambiare un turno con te stesso' },
        { status: 400 }
      )
    }

    // Aggiorna il turno con la richiesta di scambio
    const updatedAssignment = await prisma.shiftAssignment.update({
      where: { id: validatedData.assignmentId },
      data: {
        swapRequestedById: session.user.id,
        swapWithUserId: validatedData.targetUserId,
        swapStatus: 'PENDING',
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        schedule: {
          select: {
            id: true,
            name: true,
          },
        },
        shiftDefinition: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // TODO: Inviare notifica push all'utente target
    // await notifySwapRequest(updatedAssignment.id)

    return NextResponse.json({
      message: 'Richiesta di scambio inviata',
      assignment: updatedAssignment,
      targetUser,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore POST /api/shift-swaps:', error)
    return NextResponse.json(
      { error: 'Errore nella creazione della richiesta di scambio' },
      { status: 500 }
    )
  }
}
