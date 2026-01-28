import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { logger } from '@/lib/logger'
// GET /api/roles - Lista ruoli
export async function GET(_request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin può vedere i ruoli
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const roles = await prisma.role.findMany({
      select: {
        id: true,
        name: true,
        description: true,
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ data: roles })
  } catch (error) {
    logger.error('Errore GET /api/roles', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei ruoli' },
      { status: 500 }
    )
  }
}
