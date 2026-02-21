import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

// GET /api/portal/documents - Lista documenti del dipendente autenticato
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const period = searchParams.get('period')

    const where: Record<string, unknown> = {
      userId: session.user.id,
    }
    if (category) where.category = category
    if (period) where.period = period

    const documents = await prisma.employeeDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        category: true,
        originalFilename: true,
        fileSize: true,
        period: true,
        periodLabel: true,
        description: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ documents })
  } catch (error) {
    logger.error('Errore GET /api/portal/documents', error)
    return NextResponse.json({ error: 'Errore nel recupero documenti' }, { status: 500 })
  }
}
