import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/regole-categorizzazione - Lista regole
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const venueId = session.user.venueId!

  const direction = searchParams.get('direction') as 'inflow' | 'outflow' | null
  const isActive = searchParams.get('isActive') !== 'false'

  const where: any = { venueId, isActive }
  if (direction) where.direction = direction === 'inflow' ? 'INFLOW' : 'OUTFLOW'

  const regole = await prisma.categorizationRule.findMany({
    where,
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    take: 100,
  })

  return NextResponse.json(regole)
}

// POST /api/regole-categorizzazione - Crea nuova regola
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const venueId = session.user.venueId!

  const regola = await prisma.categorizationRule.create({
    data: {
      venueId,
      name: body.name,
      direction: body.direction.toUpperCase(),
      keywords: body.keywords || [],
      priority: body.priority ?? 5,
      budgetCategoryId: body.budgetCategoryId,
      accountId: body.accountId,
      autoVerify: body.autoVerify ?? false,
      autoHide: body.autoHide ?? false,
    },
  })

  return NextResponse.json(regola, { status: 201 })
}
