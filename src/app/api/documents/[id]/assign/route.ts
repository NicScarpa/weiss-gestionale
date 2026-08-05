import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { sendNotification } from '@/lib/notifications/send'

const assignSchema = z.object({
  userId: z.string().min(1, 'Dipendente obbligatorio'),
})

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

    const parsed = assignSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dati non validi' },
        { status: 400 }
      )
    }
    const { userId } = parsed.data

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

    // Se il documento era in attesa di assegnazione, l'assegnazione lo trasforma
    // in un cedolino normale: la descrizione e lo snippet servivano solo a far
    // capire all'admin di chi fosse, e il dipendente non deve vederli.
    const wasPending = document.needsAssignment

    const updated = await prisma.employeeDocument.update({
      where: { id },
      data: {
        userId,
        ...(wasPending
          ? {
              needsAssignment: false,
              unmatchedText: null,
              description: null,
            }
          : {}),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    // Il dipendente riceve la stessa notifica dell'upload bulk: prima
    // dell'assegnazione non poteva sapere che il cedolino esisteva.
    if (wasPending) {
      try {
        await sendNotification({
          userId,
          payload: {
            type: 'NEW_DOCUMENT',
            title: 'Nuovo documento disponibile',
            body: updated.periodLabel
              ? `Il tuo cedolino di ${updated.periodLabel} è disponibile`
              : 'Un nuovo cedolino è stato caricato',
            url: '/portale/documenti',
            referenceType: 'document',
            referenceId: updated.id,
          },
        })
      } catch (err) {
        logger.error('Errore invio notifica documento assegnato', err)
      }
    }

    return NextResponse.json({ document: updated })
  } catch (error) {
    logger.error('Errore PATCH /api/documents/[id]/assign', error)
    return NextResponse.json({ error: 'Errore nella riassegnazione' }, { status: 500 })
  }
}
