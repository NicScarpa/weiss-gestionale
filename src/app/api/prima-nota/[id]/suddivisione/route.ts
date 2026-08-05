import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { getVenueId } from '@/lib/venue'
import { setEntryAllocations } from '@/lib/services/allocation-service'

const suddivisioneSchema = z.object({
  fette: z.array(
    z.object({
      accountId: z.string().min(1),
      importo: z.number().positive(),
      note: z.string().optional(),
    })
  ),
})

/**
 * PUT /api/prima-nota/[id]/suddivisione
 * Split manuale del movimento in fette per conto (setEntryAllocations, Task 6).
 * La `note` di ogni fetta non è gestita dal service: si scarta nel mapping.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validated = suddivisioneSchema.parse(body)
    const venueId = await getVenueId()

    const risultato = await setEntryAllocations({
      journalEntryId: id,
      venueId,
      userId: session.user.id,
      fette: validated.fette.map((f) => ({ accountId: f.accountId, importo: f.importo })),
    })

    return await rispondi(risultato, { id, session, venueId })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dati non validi', details: error.issues }, { status: 400 })
    }
    logger.error('Errore PUT /api/prima-nota/[id]/suddivisione', error)
    return NextResponse.json(
      { error: 'Errore nella suddivisione del movimento' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/prima-nota/[id]/suddivisione
 * Rimuove lo split manuale: equivale a un PUT con fette vuote, il movimento
 * torna alla categorizzazione semplice (setEntryAllocations se ne occupa).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const venueId = await getVenueId()

    const risultato = await setEntryAllocations({
      journalEntryId: id,
      venueId,
      userId: session.user.id,
      fette: [],
    })

    return await rispondi(risultato, { id, session, venueId })
  } catch (error) {
    logger.error('Errore DELETE /api/prima-nota/[id]/suddivisione', error)
    return NextResponse.json(
      { error: 'Errore nella rimozione della suddivisione' },
      { status: 500 }
    )
  }
}

async function rispondi(
  risultato: Awaited<ReturnType<typeof setEntryAllocations>>,
  ctx: { id: string; session: { user: { id: string } }; venueId: string }
) {
  if (risultato.outcome === 'entry_not_found') {
    return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })
  }
  if (risultato.outcome === 'invalid') {
    return NextResponse.json({ error: risultato.motivo }, { status: 400 })
  }

  await createAuditLog({
    userId: ctx.session.user.id,
    action: 'UPDATE',
    entityType: 'JournalEntry',
    entityId: ctx.id,
    venueId: ctx.venueId,
    newValues: { allocazioni: risultato.allocazioni },
  })

  return NextResponse.json({ esito: 'ok', allocazioni: risultato.allocazioni })
}
