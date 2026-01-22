import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { logger } from '@/lib/logger'
// GET /api/leave-types - Lista tipi assenza
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const whereClause: Record<string, unknown> = {}
    if (!includeInactive) {
      whereClause.isActive = true
    }

    const leaveTypes = await prisma.leaveType.findMany({
      where: whereClause,
      orderBy: [
        { code: 'asc' },
      ],
    })

    return NextResponse.json({ data: leaveTypes })
  } catch (error) {
    logger.error('Errore GET /api/leave-types', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei tipi assenza' },
      { status: 500 }
    )
  }
}
