import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getVenueId } from '@/lib/venue'
import { z } from 'zod'

const createPagamentoSchema = z.object({
  tipo: z.enum(['BONIFICO', 'F24', 'ALTRO']),
  riferimentoInterno: z.string().optional(),
  /**
   * Obbligatoria, e validata prima di diventare una `Date`.
   *
   * `payments.data_esecuzione` è NOT NULL: finché questo campo era
   * `z.string().optional()`, una POST che lo ometteva arrivava a Prisma con
   * `null` e usciva come 500 non gestito (questa handler non ha try/catch),
   * mentre una stringa non parsabile diventava un `Invalid Date` che finiva
   * allo stesso modo. Il form manda sempre la data — chi non è il form deve
   * ricevere un 400 che dice cosa manca.
   *
   * Come in `[id]/route.ts`: niente `z.coerce.date()`, che accetterebbe anche
   * booleani e numeri.
   */
  dataEsecuzione: z
    .string()
    .refine((valore) => !Number.isNaN(Date.parse(valore)), { message: 'Data non valida' })
    .transform((valore) => new Date(valore)),
  importo: z.number(),
  beneficiarioNome: z.string().min(1),
  beneficiarioIban: z.string().optional(),
  causale: z.string().optional(),
})

// GET /api/pagamenti - Lista pagamenti con filtri
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!['admin', 'manager'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const venueId = await getVenueId()

  // Filtri
  const stato = searchParams.get('stato') as
    | 'BOZZA'
    | 'DA_APPROVARE'
    | 'DISPOSTO'
    | 'COMPLETATO'
    | 'FALLITO'
    | 'ANNULLATO'
    | null
  const tipo = searchParams.get('tipo') as 'BONIFICO' | 'F24' | 'ALTRO' | null
  const fromDate = searchParams.get('from')
  const toDate = searchParams.get('to')

  const where: Prisma.PaymentWhereInput = { venueId }

  if (stato) where.stato = stato
  if (tipo) where.tipo = tipo
  if (fromDate || toDate) {
    where.dataEsecuzione = {}
    if (fromDate) where.dataEsecuzione.gte = new Date(fromDate)
    if (toDate) where.dataEsecuzione.lte = new Date(toDate)
  }

  const pagamenti = await prisma.payment.findMany({
    where,
    orderBy: { dataEsecuzione: 'desc' },
    take: 100,
  })

  return NextResponse.json(pagamenti)
}

// POST /api/pagamenti - Crea nuovo pagamento
export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!['admin', 'manager'].includes(session.user.role || '')) {
    return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = createPagamentoSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dati non validi', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Force venueId from session, not from body (IDOR prevention)
  const venueId = await getVenueId()
  const data = parsed.data

  const pagamento = await prisma.payment.create({
    data: {
      venueId,
      tipo: data.tipo,
      stato: 'BOZZA',
      riferimentoInterno: data.riferimentoInterno,
      dataEsecuzione: data.dataEsecuzione,
      importo: data.importo,
      beneficiarioNome: data.beneficiarioNome,
      beneficiarioIban: data.beneficiarioIban,
      causale: data.causale,
      createdById: session.user.id,
    },
  })

  return NextResponse.json(pagamento, { status: 201 })
}
