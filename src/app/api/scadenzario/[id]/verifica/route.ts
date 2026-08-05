import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { getVenueId } from '@/lib/venue'

/**
 * PATCH /api/scadenzario/[id]/verifica - Toggle dello stato di verifica.
 *
 * "Verificata" significa "un umano ha guardato": è un asse ortogonale a
 * pagamento e riconciliazione, come il verificationStatus di Sibill. Speculare
 * a PATCH /api/prima-nota/[id]/verify sul movimento.
 */
export async function PATCH(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const venueId = await getVenueId()

    const current = await prisma.schedule.findFirst({
      where: { id, venueId },
      select: { id: true, verificata: true },
    })

    if (!current) {
      return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
    }

    const updated = await prisma.schedule.update({
      where: { id },
      data: { verificata: !current.verificata },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'Schedule',
      entityId: id,
      venueId,
      newValues: { verificata: updated.verificata },
    })

    return NextResponse.json({
      id: updated.id,
      verificata: updated.verificata,
    })
  } catch (error) {
    logger.error('Errore PATCH /api/scadenzario/[id]/verifica', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento dello stato di verifica' },
      { status: 500 }
    )
  }
}
