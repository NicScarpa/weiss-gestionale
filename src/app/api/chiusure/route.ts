import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Schema per creazione chiusura
const createClosureSchema = z.object({
  date: z.string().transform((s) => new Date(s)),
  venueId: z.string().min(1),
  isEvent: z.boolean().default(false),
  eventName: z.string().optional(),
  weatherMorning: z.string().optional(),
  weatherAfternoon: z.string().optional(),
  weatherEvening: z.string().optional(),
  notes: z.string().optional(),
  stations: z.array(z.object({
    name: z.string(),
    position: z.number().default(0),
    receiptAmount: z.number().default(0),
    receiptVat: z.number().default(0),
    invoiceAmount: z.number().default(0),
    invoiceVat: z.number().default(0),
    suspendedAmount: z.number().default(0),
    cashAmount: z.number().default(0),
    posAmount: z.number().default(0),
    floatAmount: z.number().default(114),
    cashCount: z.object({
      bills500: z.number().int().default(0),
      bills200: z.number().int().default(0),
      bills100: z.number().int().default(0),
      bills50: z.number().int().default(0),
      bills20: z.number().int().default(0),
      bills10: z.number().int().default(0),
      bills5: z.number().int().default(0),
      coins2: z.number().int().default(0),
      coins1: z.number().int().default(0),
      coins050: z.number().int().default(0),
      coins020: z.number().int().default(0),
      coins010: z.number().int().default(0),
      coins005: z.number().int().default(0),
      coins002: z.number().int().default(0),
      coins001: z.number().int().default(0),
    }).optional(),
  })).optional(),
  partials: z.array(z.object({
    timeSlot: z.string(),
    receiptProgressive: z.number().default(0),
    posProgressive: z.number().default(0),
    coffeeCounter: z.number().int().optional(),
    coffeeDelta: z.number().int().optional(),
    weather: z.string().optional(),
  })).optional(),
  expenses: z.array(z.object({
    payee: z.string(),
    description: z.string().optional(),
    documentRef: z.string().optional(),
    documentType: z.enum(['NONE', 'FATTURA', 'DDT', 'RICEVUTA', 'PERSONALE']).default('NONE'),
    amount: z.number(),
    vatAmount: z.number().optional(),
    accountId: z.string().optional(),
    isPaid: z.boolean().default(true),
    paidBy: z.string().optional(),
  })).optional(),
  attendance: z.array(z.object({
    userId: z.string(),
    shift: z.enum(['MORNING', 'EVENING']),
    hours: z.number().optional(),
    statusCode: z.string().optional(),
    hourlyRate: z.number().optional(),
    notes: z.string().optional(),
  })).optional(),
})

// GET /api/chiusure - Lista chiusure con filtri
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    // Filtri
    const venueId = searchParams.get('venueId') || session.user.venueId
    const status = searchParams.get('status')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

    // Costruisci where clause
    const where: any = {}

    if (venueId) {
      where.venueId = venueId
    }

    if (status) {
      where.status = status
    }

    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) {
        where.date.gte = new Date(dateFrom)
      }
      if (dateTo) {
        where.date.lte = new Date(dateTo)
      }
    }

    // Query con paginazione
    const [chiusure, total] = await Promise.all([
      prisma.dailyClosure.findMany({
        where,
        include: {
          venue: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          submittedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          validatedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          stations: {
            select: {
              id: true,
              name: true,
              totalAmount: true,
            },
          },
          expenses: {
            select: {
              amount: true,
            },
          },
          _count: {
            select: {
              stations: true,
              expenses: true,
            },
          },
        },
        orderBy: {
          date: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.dailyClosure.count({ where }),
    ])

    // Formatta risposta
    const formattedChiusure = chiusure.map((c) => {
      // Calcola totale vendite sommando le stazioni
      const salesTotal = c.stations.reduce(
        (sum, s) => sum + Number(s.totalAmount || 0),
        0
      )
      // Calcola totale uscite
      const expensesTotal = c.expenses.reduce(
        (sum, e) => sum + Number(e.amount || 0),
        0
      )
      // Totale Lordo = Vendite + Uscite
      const grossTotal = salesTotal + expensesTotal

      return {
        id: c.id,
        date: c.date,
        status: c.status,
        venue: c.venue,
        grossTotal,
        isEvent: c.isEvent,
        eventName: c.eventName,
        submittedBy: c.submittedBy
          ? `${c.submittedBy.firstName} ${c.submittedBy.lastName}`
          : null,
        submittedAt: c.submittedAt,
        validatedBy: c.validatedBy
          ? `${c.validatedBy.firstName} ${c.validatedBy.lastName}`
          : null,
        validatedAt: c.validatedAt,
        createdAt: c.createdAt,
        stationsCount: c._count.stations,
        expensesCount: c._count.expenses,
        stations: c.stations.map(s => ({
          id: s.id,
          name: s.name,
          totalAmount: Number(s.totalAmount),
        })),
      }
    })

    return NextResponse.json({
      data: formattedChiusure,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Errore GET /api/chiusure:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle chiusure' },
      { status: 500 }
    )
  }
}

// POST /api/chiusure - Crea nuova chiusura (DRAFT)
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createClosureSchema.parse(body)

    // Verifica accesso alla sede
    if (
      session.user.role !== 'admin' &&
      session.user.venueId !== validatedData.venueId
    ) {
      return NextResponse.json(
        { error: 'Non autorizzato per questa sede' },
        { status: 403 }
      )
    }

    // Verifica che non esista già una chiusura per questa data/sede
    const existingClosure = await prisma.dailyClosure.findUnique({
      where: {
        venueId_date: {
          venueId: validatedData.venueId,
          date: validatedData.date,
        },
      },
    })

    if (existingClosure) {
      return NextResponse.json(
        { error: 'Esiste già una chiusura per questa data', existingId: existingClosure.id },
        { status: 409 }
      )
    }

    // Crea la chiusura con tutte le relazioni
    const closure = await prisma.dailyClosure.create({
      data: {
        venueId: validatedData.venueId,
        date: validatedData.date,
        isEvent: validatedData.isEvent,
        eventName: validatedData.eventName,
        weatherMorning: validatedData.weatherMorning,
        weatherAfternoon: validatedData.weatherAfternoon,
        weatherEvening: validatedData.weatherEvening,
        notes: validatedData.notes,
        status: 'DRAFT',

        // Crea stazioni
        stations: validatedData.stations ? {
          create: validatedData.stations.map((station, index) => {
            // Calcola totale stazione
            const totalAmount = (station.cashAmount || 0) + (station.posAmount || 0)
            const nonReceiptAmount = totalAmount - (station.receiptAmount || 0)

            // Calcola totale conteggio
            let totalCounted = 0
            if (station.cashCount) {
              totalCounted =
                (station.cashCount.bills500 || 0) * 500 +
                (station.cashCount.bills200 || 0) * 200 +
                (station.cashCount.bills100 || 0) * 100 +
                (station.cashCount.bills50 || 0) * 50 +
                (station.cashCount.bills20 || 0) * 20 +
                (station.cashCount.bills10 || 0) * 10 +
                (station.cashCount.bills5 || 0) * 5 +
                (station.cashCount.coins2 || 0) * 2 +
                (station.cashCount.coins1 || 0) * 1 +
                (station.cashCount.coins050 || 0) * 0.5 +
                (station.cashCount.coins020 || 0) * 0.2 +
                (station.cashCount.coins010 || 0) * 0.1 +
                (station.cashCount.coins005 || 0) * 0.05 +
                (station.cashCount.coins002 || 0) * 0.02 +
                (station.cashCount.coins001 || 0) * 0.01
            }

            return {
              name: station.name,
              position: station.position ?? index,
              receiptAmount: station.receiptAmount || 0,
              receiptVat: station.receiptVat || 0,
              invoiceAmount: station.invoiceAmount || 0,
              invoiceVat: station.invoiceVat || 0,
              suspendedAmount: station.suspendedAmount || 0,
              cashAmount: station.cashAmount || 0,
              posAmount: station.posAmount || 0,
              totalAmount,
              nonReceiptAmount,
              floatAmount: station.floatAmount || 114,
              cashCount: station.cashCount ? {
                create: {
                  ...station.cashCount,
                  totalCounted,
                  expectedTotal: station.cashAmount || 0,
                  difference: totalCounted - (station.cashAmount || 0),
                },
              } : undefined,
            }
          }),
        } : undefined,

        // Crea parziali orari
        partials: validatedData.partials ? {
          create: validatedData.partials.map((partial) => ({
            timeSlot: partial.timeSlot,
            receiptProgressive: partial.receiptProgressive || 0,
            posProgressive: partial.posProgressive || 0,
            coffeeCounter: partial.coffeeCounter,
            coffeeDelta: partial.coffeeDelta,
            weather: partial.weather,
          })),
        } : undefined,

        // Crea uscite
        expenses: validatedData.expenses ? {
          create: validatedData.expenses.map((expense, index) => ({
            payee: expense.payee,
            description: expense.description,
            documentRef: expense.documentRef,
            documentType: expense.documentType || 'NONE',
            amount: expense.amount,
            vatAmount: expense.vatAmount,
            accountId: expense.accountId,
            isPaid: expense.isPaid ?? true,
            paidBy: expense.paidBy,
            position: index,
          })),
        } : undefined,

        // Crea presenze
        attendance: validatedData.attendance ? {
          create: validatedData.attendance.map((att) => ({
            user: { connect: { id: att.userId } },
            shift: att.shift,
            hours: att.hours,
            statusCode: att.statusCode,
            hourlyRate: att.hourlyRate,
            notes: att.notes,
          })),
        } : undefined,
      },
      include: {
        venue: {
          select: { id: true, name: true, code: true },
        },
        stations: true,
        _count: {
          select: { stations: true, expenses: true, attendance: true },
        },
      },
    })

    return NextResponse.json(closure, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore POST /api/chiusure:', error)
    return NextResponse.json(
      { error: 'Errore nella creazione della chiusura' },
      { status: 500 }
    )
  }
}
