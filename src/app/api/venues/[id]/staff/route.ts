import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/venues/[id]/staff - Lista staff della sede
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

    // Verifica accesso (stessa sede o admin)
    if (session.user.role !== 'admin' && session.user.venueId !== id) {
      return NextResponse.json(
        { error: 'Accesso non autorizzato' },
        { status: 403 }
      )
    }

    // Recupera staff attivo della sede
    const staff = await prisma.user.findMany({
      where: {
        venueId: id,
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        isFixedStaff: true,
        role: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    const formattedStaff = staff.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      role: user.role.name,
      isFixedStaff: user.isFixedStaff,
    }))

    return NextResponse.json({ staff: formattedStaff })
  } catch (error) {
    console.error('Errore GET /api/venues/[id]/staff:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dello staff' },
      { status: 500 }
    )
  }
}
