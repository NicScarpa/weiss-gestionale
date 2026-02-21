import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { notifyNewLeaveRequest } from '@/lib/notifications'

import { logger } from '@/lib/logger'
// Schema per creazione richiesta ferie
const createLeaveRequestSchema = z.object({
  leaveTypeId: z.string(),
  startDate: z.string(), // ISO date
  endDate: z.string(), // ISO date
  isPartialDay: z.boolean().default(false),
  startTime: z.string().optional(), // HH:MM
  endTime: z.string().optional(), // HH:MM
  notes: z.string().optional(),
  userId: z.string().optional(), // Solo admin può specificare per creare ferie per altri
})

// Calcola giorni lavorativi tra due date
function calculateWorkDays(startDate: Date, endDate: Date): number {
  let count = 0
  const current = new Date(startDate)

  while (current <= endDate) {
    const dayOfWeek = current.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++
    }
    current.setDate(current.getDate() + 1)
  }

  return count
}

// GET /api/leave-requests - Lista richieste
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const userId = searchParams.get('userId')
    const pendingApproval = searchParams.get('pendingApproval') === 'true'

    const whereClause: Record<string, unknown> = {}

    // Staff può vedere solo le proprie richieste
    if (session.user.role === 'staff') {
      whereClause.userId = session.user.id
    } else if (userId) {
      whereClause.userId = userId
    }

    // Filtra per sede
    if (session.user.role === 'manager') {
      whereClause.user = {
        venueId: await getVenueId(),
      }
    }

    if (status) {
      whereClause.status = status
    }

    if (pendingApproval) {
      whereClause.status = 'PENDING'
    }

    const leaveRequests = await prisma.leaveRequest.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            venue: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        leaveType: {
          select: {
            id: true,
            code: true,
            name: true,
            color: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [
        { requestedAt: 'desc' },
      ],
    })

    return NextResponse.json({ data: leaveRequests })
  } catch (error) {
    logger.error('Errore GET /api/leave-requests', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle richieste' },
      { status: 500 }
    )
  }
}

// POST /api/leave-requests - Crea nuova richiesta
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createLeaveRequestSchema.parse(body)

    // Solo admin può creare ferie per altri utenti
    if (validatedData.userId && session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Solo gli admin possono creare ferie per altri utenti' },
        { status: 403 }
      )
    }

    // Determina l'utente target
    const isAdminCreatingForOther = session.user.role === 'admin' && !!validatedData.userId
    const targetUserId = (validatedData.userId && session.user.role === 'admin')
      ? validatedData.userId
      : session.user.id

    // Se admin sta creando per un altro utente, verifica che esista
    if (isAdminCreatingForOther) {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
      })
      if (!targetUser) {
        return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
      }
    }

    // Verifica che il tipo assenza esista
    const leaveType = await prisma.leaveType.findUnique({
      where: { id: validatedData.leaveTypeId },
    })

    if (!leaveType) {
      return NextResponse.json({ error: 'Tipo assenza non trovato' }, { status: 404 })
    }

    const startDate = new Date(validatedData.startDate)
    const endDate = new Date(validatedData.endDate)

    if (endDate < startDate) {
      return NextResponse.json(
        { error: 'La data fine deve essere successiva alla data inizio' },
        { status: 400 }
      )
    }

    // Verifica sovrapposizioni con altre richieste
    const overlapping = await prisma.leaveRequest.findFirst({
      where: {
        userId: targetUserId,
        status: { in: ['PENDING', 'APPROVED'] },
        OR: [
          {
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
        ],
      },
    })

    if (overlapping) {
      return NextResponse.json(
        { error: 'Esiste già una richiesta per questo periodo' },
        { status: 400 }
      )
    }

    // Calcola giorni/ore richieste
    let daysRequested = 0
    let hoursRequested = 0

    if (validatedData.isPartialDay && validatedData.startTime && validatedData.endTime) {
      // Calcola ore per giornata parziale
      const [startH, startM] = validatedData.startTime.split(':').map(Number)
      const [endH, endM] = validatedData.endTime.split(':').map(Number)
      hoursRequested = (endH + endM / 60) - (startH + startM / 60)
      daysRequested = hoursRequested / 8 // Assumendo 8 ore = 1 giorno
    } else {
      daysRequested = calculateWorkDays(startDate, endDate)
    }

    // Determina stato iniziale
    // Se admin crea per altri → sempre approvato
    // Altrimenti segue la logica normale (requiresApproval)
    const initialStatus = isAdminCreatingForOther
      ? 'APPROVED'
      : (leaveType.requiresApproval ? 'PENDING' : 'APPROVED')

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        userId: targetUserId,
        leaveTypeId: validatedData.leaveTypeId,
        startDate,
        endDate,
        isPartialDay: validatedData.isPartialDay,
        startTime: validatedData.startTime
          ? new Date(`1970-01-01T${validatedData.startTime}:00`)
          : null,
        endTime: validatedData.endTime
          ? new Date(`1970-01-01T${validatedData.endTime}:00`)
          : null,
        daysRequested,
        hoursRequested: hoursRequested || null,
        status: initialStatus,
        notes: validatedData.notes || null,
        // Se approvato (admin crea per altri o non richiede approvazione)
        ...(initialStatus === 'APPROVED' && {
          approvedById: session.user.id,
          approvedAt: new Date(),
        }),
      },
      include: {
        leaveType: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })

    // Aggiorna saldo se approvato automaticamente
    if (initialStatus === 'APPROVED' && leaveType.affectsAccrual) {
      await updateLeaveBalance(
        targetUserId,
        validatedData.leaveTypeId,
        daysRequested,
        'used'
      )
    } else if (initialStatus === 'PENDING') {
      // Aggiorna pending nel saldo
      await updateLeaveBalance(
        targetUserId,
        validatedData.leaveTypeId,
        daysRequested,
        'pending'
      )

      // Notifica ai manager della nuova richiesta (async)
      notifyNewLeaveRequest(leaveRequest.id).catch((err) =>
        logger.error('Errore invio notifica nuova richiesta ferie', err)
      )
    }

    return NextResponse.json(leaveRequest, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/leave-requests', error)
    return NextResponse.json(
      { error: 'Errore nella creazione della richiesta' },
      { status: 500 }
    )
  }
}

// Helper per aggiornare il saldo ferie
async function updateLeaveBalance(
  userId: string,
  leaveTypeId: string,
  days: number,
  type: 'used' | 'pending'
) {
  const year = new Date().getFullYear()

  const existing = await prisma.leaveBalance.findUnique({
    where: {
      userId_leaveTypeId_year: {
        userId,
        leaveTypeId,
        year,
      },
    },
  })

  if (existing) {
    await prisma.leaveBalance.update({
      where: { id: existing.id },
      data: {
        [type]: { increment: days },
      },
    })
  } else {
    await prisma.leaveBalance.create({
      data: {
        userId,
        leaveTypeId,
        year,
        [type]: days,
      },
    })
  }
}
