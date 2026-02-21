import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { getVenueId } from '@/lib/venue'

const createRuleSchema = z.object({
  direzione: z.enum(['emessi', 'ricevuti']),
  tipoDocumento: z.string().optional(),
  tipoPagamento: z.string().optional(),
  azione: z.string().default('crea_riconcilia_movimento'),
  contoId: z.string().min(1, 'Conto obbligatorio'),
}).refine(
  (data) => data.tipoDocumento || data.tipoPagamento,
  { message: 'Almeno un criterio (tipo documento o tipo pagamento) è obbligatorio' }
)

// GET /api/scadenzario/regole - Lista regole filtrate per direzione
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const direzione = searchParams.get('direzione')

    const venueId = await getVenueId()

    const where: Record<string, unknown> = {
      venueId,
      isActive: true,
    }

    if (direzione) {
      where.direzione = direzione
    }

    const rules = await prisma.scheduleRule.findMany({
      where,
      orderBy: { ordine: 'asc' },
      include: {
        conto: {
          select: { id: true, code: true, name: true, type: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    })

    return NextResponse.json({ data: rules })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario/regole', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle regole' },
      { status: 500 }
    )
  }
}

// POST /api/scadenzario/regole - Crea nuova regola
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const validated = createRuleSchema.parse(body)

    const venueId = await getVenueId()

    // Verifica esistenza conto
    const conto = await prisma.account.findUnique({ where: { id: validated.contoId } })
    if (!conto) {
      return NextResponse.json({ error: 'Conto non trovato' }, { status: 404 })
    }

    // Auto-assegna ordine = max + 1
    const maxOrdine = await prisma.scheduleRule.aggregate({
      where: { venueId, direzione: validated.direzione },
      _max: { ordine: true },
    })
    const ordine = (maxOrdine._max.ordine ?? -1) + 1

    const rule = await prisma.scheduleRule.create({
      data: {
        venueId,
        direzione: validated.direzione,
        tipoDocumento: validated.tipoDocumento || null,
        tipoPagamento: validated.tipoPagamento || null,
        azione: validated.azione,
        contoId: validated.contoId,
        ordine,
        createdById: session.user.id,
      },
      include: {
        conto: {
          select: { id: true, code: true, name: true, type: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    })

    return NextResponse.json({ rule }, { status: 201 })
  } catch (error) {
    logger.error('Errore POST /api/scadenzario/regole', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore nella creazione della regola' },
      { status: 500 }
    )
  }
}
