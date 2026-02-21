import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

// PATCH /api/documents/[id]/assign - Riassegna documento a un altro dipendente
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId obbligatorio' }, { status: 400 })
    }

    // Verifica che il documento esista
    const document = await prisma.employeeDocument.findUnique({ where: { id } })
    if (!document) {
      return NextResponse.json({ error: 'Documento non trovato' }, { status: 404 })
    }

    // Verifica che il dipendente esista
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'Dipendente non trovato' }, { status: 404 })
    }

    const updated = await prisma.employeeDocument.update({
      where: { id },
      data: { userId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    return NextResponse.json({ document: updated })
  } catch (error) {
    logger.error('Errore PATCH /api/documents/[id]/assign', error)
    return NextResponse.json({ error: 'Errore nella riassegnazione' }, { status: 500 })
  }
}
