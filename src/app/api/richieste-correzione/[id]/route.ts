import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'

// DELETE /api/richieste-correzione/[id] - Il proprietario annulla la propria
// richiesta, finché è in attesa. Non si cancella: diventa CANCELLED, così in
// coda resta visibile che c'era stata.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

    const richiesta = await prisma.attendanceCorrectionRequest.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true, status: true, venueId: true },
    })

    if (!richiesta) {
      return NextResponse.json({ error: 'Richiesta non trovata' }, { status: 404 })
    }

    if (richiesta.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Si può annullare solo una richiesta ancora in attesa' },
        { status: 409 }
      )
    }

    await prisma.attendanceCorrectionRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'AttendanceCorrectionRequest',
      entityId: id,
      venueId: richiesta.venueId,
      oldValues: { status: 'PENDING' },
      newValues: { status: 'CANCELLED' },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Errore DELETE /api/richieste-correzione/[id]', error)
    return NextResponse.json(
      { error: "Errore nell'annullamento della richiesta" },
      { status: 500 }
    )
  }
}
