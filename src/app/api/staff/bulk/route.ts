import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { logger } from '@/lib/logger'

const bulkActionSchema = z.object({
  ids: z.array(z.string()).min(1, 'Seleziona almeno un dipendente'),
  action: z.enum(['activate', 'deactivate', 'delete', 'invite']),
})

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
    const { ids, action } = bulkActionSchema.parse(body)

    switch (action) {
      case 'activate': {
        const result = await prisma.user.updateMany({
          where: { id: { in: ids } },
          data: { isActive: true },
        })
        return NextResponse.json({ count: result.count, action: 'activate' })
      }

      case 'deactivate': {
        const result = await prisma.user.updateMany({
          where: { id: { in: ids } },
          data: { isActive: false },
        })
        return NextResponse.json({ count: result.count, action: 'deactivate' })
      }

      case 'delete': {
        // Soft delete: disattiva i dipendenti
        const result = await prisma.user.updateMany({
          where: { id: { in: ids } },
          data: { isActive: false },
        })
        return NextResponse.json({ count: result.count, action: 'delete' })
      }

      case 'invite': {
        // Placeholder: imposta mustChangePassword e portalEnabled
        const result = await prisma.user.updateMany({
          where: { id: { in: ids } },
          data: { mustChangePassword: true },
        })
        return NextResponse.json({ count: result.count, action: 'invite' })
      }

      default:
        return NextResponse.json({ error: 'Azione non valida' }, { status: 400 })
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/staff/bulk', error)
    return NextResponse.json(
      { error: 'Errore nell\'esecuzione dell\'azione bulk' },
      { status: 500 }
    )
  }
}
