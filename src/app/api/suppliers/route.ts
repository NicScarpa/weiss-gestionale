import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/suppliers - Lista fornitori
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    const where: any = {
      isActive: true,
    }

    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { vatNumber: { contains: query, mode: 'insensitive' } },
      ]
    }

    const suppliers = await prisma.supplier.findMany({
      where,
      select: {
        id: true,
        name: true,
        vatNumber: true,
      },
      orderBy: {
        name: 'asc',
      },
      take: 50,
    })

    return NextResponse.json({ suppliers })
  } catch (error) {
    console.error('Errore GET /api/suppliers:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei fornitori' },
      { status: 500 }
    )
  }
}
