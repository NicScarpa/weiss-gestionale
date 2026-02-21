import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getVenueId } from '@/lib/venue'

// GET /api/pagamenti - Lista pagamenti con filtri
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  const body = await request.json()
  const venueId = await getVenueId()

  const pagamento = await prisma.payment.create({
    data: {
      venueId,
      tipo: body.tipo,
      stato: 'BOZZA',
      riferimentoInterno: body.riferimentoInterno,
      dataEsecuzione: body.dataEsecuzione ? new Date(body.dataEsecuzione) : null,
      importo: body.importo,
      beneficiarioNome: body.beneficiarioNome,
      beneficiarioIban: body.beneficiarioIban,
      causale: body.causale,
      createdById: session.user.id,
    },
  })

  return NextResponse.json(pagamento, { status: 201 })
}
