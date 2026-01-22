import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { logger } from '@/lib/logger'
// GET /api/leave-balance - Saldo ferie/permessi
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const year = searchParams.get('year')
      ? parseInt(searchParams.get('year')!)
      : new Date().getFullYear()

    // Staff può vedere solo il proprio saldo
    let targetUserId = session.user.id
    if (userId && session.user.role !== 'staff') {
      targetUserId = userId
    }

    // Manager può vedere solo dipendenti della propria sede
    if (session.user.role === 'manager' && userId && userId !== session.user.id) {
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { venueId: true },
      })

      if (targetUser?.venueId !== session.user.venueId) {
        return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
      }
      targetUserId = userId
    }

    // Recupera tutti i saldi per l'utente e l'anno
    const balances = await prisma.leaveBalance.findMany({
      where: {
        userId: targetUserId,
        year,
      },
      include: {
        leaveType: {
          select: {
            id: true,
            code: true,
            name: true,
            color: true,
          },
        },
      },
      orderBy: {
        leaveType: {
          code: 'asc',
        },
      },
    })

    // Recupera tutti i tipi assenza attivi per mostrare anche quelli senza saldo
    const leaveTypes = await prisma.leaveType.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    })

    // Combina i dati
    const result = leaveTypes.map((lt) => {
      const balance = balances.find((b) => b.leaveTypeId === lt.id)
      return {
        leaveType: {
          id: lt.id,
          code: lt.code,
          name: lt.name,
          color: lt.color,
        },
        year,
        accrued: balance?.accrued ? Number(balance.accrued) : 0,
        used: balance?.used ? Number(balance.used) : 0,
        pending: balance?.pending ? Number(balance.pending) : 0,
        carriedOver: balance?.carriedOver ? Number(balance.carriedOver) : 0,
        available:
          (balance?.accrued ? Number(balance.accrued) : 0) +
          (balance?.carriedOver ? Number(balance.carriedOver) : 0) -
          (balance?.used ? Number(balance.used) : 0) -
          (balance?.pending ? Number(balance.pending) : 0),
      }
    })

    return NextResponse.json({ data: result })
  } catch (error) {
    logger.error('Errore GET /api/leave-balance', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del saldo' },
      { status: 500 }
    )
  }
}

// POST /api/leave-balance - Aggiorna saldo (solo admin)
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const { userId, leaveTypeId, year, accrued, carriedOver } = body

    if (!userId || !leaveTypeId || !year) {
      return NextResponse.json(
        { error: 'userId, leaveTypeId e year sono obbligatori' },
        { status: 400 }
      )
    }

    // Verifica utente e tipo assenza esistano
    const [user, leaveType] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.leaveType.findUnique({ where: { id: leaveTypeId } }),
    ])

    if (!user) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    if (!leaveType) {
      return NextResponse.json({ error: 'Tipo assenza non trovato' }, { status: 404 })
    }

    // Upsert del saldo
    const balance = await prisma.leaveBalance.upsert({
      where: {
        userId_leaveTypeId_year: {
          userId,
          leaveTypeId,
          year,
        },
      },
      update: {
        ...(accrued !== undefined && { accrued }),
        ...(carriedOver !== undefined && { carriedOver }),
      },
      create: {
        userId,
        leaveTypeId,
        year,
        accrued: accrued || 0,
        carriedOver: carriedOver || 0,
      },
      include: {
        leaveType: true,
      },
    })

    return NextResponse.json(balance)
  } catch (error) {
    logger.error('Errore POST /api/leave-balance', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento del saldo' },
      { status: 500 }
    )
  }
}
