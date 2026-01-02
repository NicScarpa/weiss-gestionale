import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/accounts - Lista conti (per uscite)
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') // EXPENSE, REVENUE, ASSET, LIABILITY

    const where: any = {
      isActive: true,
    }

    if (type) {
      where.type = type
    }

    const accounts = await prisma.account.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        parentId: true,
      },
      orderBy: {
        code: 'asc',
      },
    })

    return NextResponse.json({ accounts })
  } catch (error) {
    console.error('Errore GET /api/accounts:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei conti' },
      { status: 500 }
    )
  }
}
