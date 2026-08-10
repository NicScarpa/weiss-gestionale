import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { conflict, handleApiError, notFound, ok, withAuth } from '@/lib/api-utils'

type Params = { id: string }

// DELETE /api/richieste-correzione/[id] - Il proprietario annulla la propria
// richiesta, finché è in attesa. Non si cancella: diventa CANCELLED, così in
// coda resta visibile che c'era stata.
export const DELETE = withAuth<Params>(async (_request: NextRequest, { params, user }) => {
  try {
    const { id } = params

    const richiesta = await prisma.attendanceCorrectionRequest.findFirst({
      where: { id, userId: user.id },
      select: { id: true, status: true, venueId: true },
    })

    if (!richiesta) {
      return notFound('Richiesta non trovata')
    }

    if (richiesta.status !== 'PENDING') {
      return conflict('Si può annullare solo una richiesta ancora in attesa')
    }

    await prisma.attendanceCorrectionRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    await createAuditLog({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'AttendanceCorrectionRequest',
      entityId: id,
      venueId: richiesta.venueId,
      oldValues: { status: 'PENDING' },
      newValues: { status: 'CANCELLED' },
    })

    return ok({ success: true })
  } catch (error) {
    return handleApiError(
      error,
      'DELETE /api/richieste-correzione/[id]',
      "Errore nell'annullamento della richiesta"
    )
  }
})
