import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }
    if (session.user.role === 'staff') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!from || !to) {
      return NextResponse.json({ error: 'Parametri from e to obbligatori' }, { status: 400 })
    }

    const assignments = await prisma.shiftAssignment.findMany({
      where: {
        userId: id,
        date: {
          gte: new Date(from),
          lte: new Date(to),
        },
      },
      include: {
        shiftDefinition: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true,
            startTime: true,
            endTime: true,
            breakMinutes: true,
          },
        },
        venue: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { date: 'asc' },
    })

    return NextResponse.json({ assignments })
  } catch (error) {
    logger.error('Errore GET /api/staff/[id]/shifts', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei turni' },
      { status: 500 }
    )
  }
}
