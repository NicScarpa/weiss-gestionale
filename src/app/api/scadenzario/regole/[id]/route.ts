import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { getVenueId } from '@/lib/venue'

const updateRuleSchema = z.object({
  tipoDocumento: z.string().nullable().optional(),
  tipoPagamento: z.string().nullable().optional(),
  azione: z.string().optional(),
  contoId: z.string().nullable().optional(),
  /** Conto bancario su cui creare il movimento quando la regola si applica.
   *  Mancava in questo schema: il form di modifica lo invia sempre, ma zod
   *  lo scartava in silenzio e l'aggiornamento non arrivava mai al DB. */
  bankAccountId: z.string().min(1, 'Conto bancario obbligatorio').optional(),
  /** Centro di costo esplicito e opzionale (Task 13). */
  costCenterId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

// GET /api/scadenzario/regole/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params

    const rule = await prisma.scheduleRule.findUnique({
      where: { id },
      include: {
        conto: {
          select: { id: true, code: true, name: true, type: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    })

    if (!rule) {
      return NextResponse.json({ error: 'Regola non trovata' }, { status: 404 })
    }

    // Venue isolation check
    const venueId = await getVenueId()

    if (rule.venueId !== venueId) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
    }

    return NextResponse.json({ rule })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/regole/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero della regola' },
      { status: 500 }
    )
  }
}

// PATCH /api/scadenzario/regole/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const validated = updateRuleSchema.parse(body)

    const existing = await prisma.scheduleRule.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Regola non trovata' }, { status: 404 })
    }

    // Post-merge validation: almeno un criterio deve restare
    const mergedTipoDoc = validated.tipoDocumento !== undefined
      ? validated.tipoDocumento
      : existing.tipoDocumento
    const mergedTipoPag = validated.tipoPagamento !== undefined
      ? validated.tipoPagamento
      : existing.tipoPagamento

    if (!mergedTipoDoc && !mergedTipoPag) {
      return NextResponse.json(
        { error: 'Almeno un criterio (tipo documento o tipo pagamento) è obbligatorio' },
        { status: 400 }
      )
    }

    // Se contoId cambia, verifica esistenza conto
    if (validated.contoId && validated.contoId !== existing.contoId) {
      const conto = await prisma.account.findUnique({ where: { id: validated.contoId } })
      if (!conto) {
        return NextResponse.json({ error: 'Conto non trovato' }, { status: 404 })
      }
    }

    // Se bankAccountId cambia, verifica esistenza e appartenenza alla sede
    if (validated.bankAccountId && validated.bankAccountId !== existing.bankAccountId) {
      const venueId = await getVenueId()
      const bankAccount = await prisma.bankAccount.findFirst({
        where: { id: validated.bankAccountId, venueId, isActive: true },
      })
      if (!bankAccount) {
        return NextResponse.json({ error: 'Conto bancario non trovato' }, { status: 404 })
      }
    }

    // Se costCenterId cambia (e non viene azzerato), verifica esistenza centro
    if (validated.costCenterId && validated.costCenterId !== existing.costCenterId) {
      const costCenter = await prisma.costCenter.findFirst({
        where: { id: validated.costCenterId, isActive: true },
      })
      if (!costCenter) {
        return NextResponse.json({ error: 'Centro di costo non trovato' }, { status: 404 })
      }
    }

    const rule = await prisma.scheduleRule.update({
      where: { id },
      data: validated,
      include: {
        conto: {
          select: { id: true, code: true, name: true, type: true },
        },
        costCenter: {
          select: { id: true, code: true, name: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'ScheduleRule',
      entityId: id,
      newValues: validated,
    })

    return NextResponse.json({ rule })
  } catch (error) {
    logger.error('Errore PATCH /api/scadenzario/regole/[id]', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: "Errore nell'aggiornamento della regola" },
      { status: 500 }
    )
  }
}

// DELETE /api/scadenzario/regole/[id] - Hard delete + compattazione ordini
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params

    const existing = await prisma.scheduleRule.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Regola non trovata' }, { status: 404 })
    }

    // Hard delete + compattazione ordini in transazione
    await prisma.$transaction([
      prisma.scheduleRule.delete({ where: { id } }),
      prisma.scheduleRule.updateMany({
        where: {
          venueId: existing.venueId,
          direzione: existing.direzione,
          ordine: { gt: existing.ordine },
        },
        data: { ordine: { decrement: 1 } },
      }),
    ])

    await createAuditLog({
      userId: session.user.id,
      action: 'DELETE',
      entityType: 'ScheduleRule',
      entityId: id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Errore DELETE /api/scadenzario/regole/[id]', error)
    return NextResponse.json(
      { error: "Errore nell'eliminazione della regola" },
      { status: 500 }
    )
  }
}
