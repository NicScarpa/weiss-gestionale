import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { PaymentType, PaymentStatus, Prisma } from '@prisma/client'
import { checkRequestRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/api-utils'

// GET /api/payments - Lista pagamenti con filtri
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const stato = searchParams.get('stato') as PaymentStatus | null
    const tipo = searchParams.get('tipo') as PaymentType | null
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const beneficiario = searchParams.get('beneficiario')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const venueId = await getVenueId()

    const where: Prisma.PaymentWhereInput = {
      venueId,
    }

    if (stato) where.stato = stato
    if (tipo) where.tipo = tipo
    if (beneficiario) {
      where.beneficiarioNome = { contains: beneficiario, mode: 'insensitive' }
    }
    if (dateFrom || dateTo) {
      where.dataEsecuzione = {}
      if (dateFrom) where.dataEsecuzione.gte = new Date(dateFrom)
      if (dateTo) where.dataEsecuzione.lte = new Date(dateTo)
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          venue: { select: { id: true, name: true, code: true } },
          journalEntry: { select: { id: true, description: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { dataEsecuzione: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.payment.count({ where }),
    ])

    // Calcolo summary
    const summary = await prisma.payment.groupBy({
      by: ['stato'],
      where: {
        venueId: venueId,
        ...(dateFrom || dateTo ? {
          dataEsecuzione: {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo && { lte: new Date(dateTo) }),
          }
        } : {}),
      },
      _sum: { importo: true },
    })

    const summaryMap = summary.reduce((acc, item) => {
      acc[item.stato] = item._sum.importo ? Number(item._sum.importo) : 0
      return acc
    }, {} as Record<string, number>)

    return NextResponse.json({
      data: payments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary: {
        totaleBozza: summaryMap.BOZZA || 0,
        totaleInAttesa: summaryMap.DA_APPROVARE || 0,
        totaleDisposto: summaryMap.DISPOSTO || 0,
        totaleCompletato: summaryMap.COMPLETATO || 0,
        count: total,
      },
    })
  } catch (error) {
    console.error('Error fetching payments:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/payments - Crea nuovo pagamento
export async function POST(request: NextRequest) {
  try {
    const rateCheck = checkRequestRateLimit(request, 'payments:create', RATE_LIMIT_CONFIGS.STRICT)
    if (!rateCheck.allowed) return rateCheck.response!

    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      tipo,
      dataEsecuzione,
      importo,
      beneficiarioNome,
      beneficiarioIban,
      causale,
      riferimentoInterno,
      note,
    } = body

    // Override venueId from session, not from body (IDOR prevention)
    const venueId = await getVenueId()

    if (!venueId || !tipo || !dataEsecuzione || !importo || !beneficiarioNome) {
      return NextResponse.json(
        { error: 'Campi obbligatori mancanti' },
        { status: 400 }
      )
    }

    const payment = await prisma.payment.create({
      data: {
        venueId,
        tipo,
        stato: PaymentStatus.BOZZA,
        dataEsecuzione: new Date(dataEsecuzione),
        importo: parseFloat(importo),
        beneficiarioNome,
        beneficiarioIban,
        causale,
        riferimentoInterno,
        note,
        createdById: session.user.id,
      },
      include: {
        venue: { select: { id: true, name: true, code: true } },
        journalEntry: { select: { id: true, description: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    return NextResponse.json(payment, { status: 201 })
  } catch (error) {
    console.error('Error creating payment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
