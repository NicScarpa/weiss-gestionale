import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'

import { logger } from '@/lib/logger'
import { getVenueId } from '@/lib/venue'
import { buildStationCreateData } from '@/lib/closure-calculations'

const dateSchema = z
  .string()
  .min(1, 'Data richiesta')
  .transform((s) => new Date(s))
  .refine((d) => !Number.isNaN(d.getTime()), 'Data non valida')

const attendanceItemSchema = z.object({
  userId: z.string().min(1, 'Seleziona un dipendente'),
  shift: z.enum(['MORNING', 'EVENING'], { message: 'Seleziona un turno' }),
  hours: z.number().optional(),
  statusCode: z.string().optional(),
  hourlyRate: z.number().optional(),
  totalPay: z.number().optional(),
  isPaid: z.boolean().optional().default(false),
  notes: z.string().optional(),
})

const attendanceSchema = z.array(attendanceItemSchema).superRefine((items, ctx) => {
  const seen = new Set<string>()
  items.forEach((item, index) => {
    const key = `${item.userId}:${item.shift}`
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Dipendente duplicato nello stesso turno',
        path: [index, 'userId'],
      })
    } else {
      seen.add(key)
    }
  })
})

const partialItemSchema = z.object({
  timeSlot: z.string().min(1, 'Orario richiesto'),
  receiptProgressive: z.number().default(0),
  posProgressive: z.number().default(0),
  coffeeCounter: z.number().int().optional(),
  coffeeDelta: z.number().int().optional(),
  weather: z.string().optional(),
})

const partialsSchema = z.array(partialItemSchema).superRefine((items, ctx) => {
  const seen = new Set<string>()
  items.forEach((item, index) => {
    const key = item.timeSlot
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Orario duplicato',
        path: [index, 'timeSlot'],
      })
    } else {
      seen.add(key)
    }
  })
})

// Schema per creazione chiusura
const createClosureSchema = z.object({
  date: dateSchema,
  venueId: z.string().min(1, 'Sede richiesta'),
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
  partials: partialsSchema.optional(),
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
  attendance: attendanceSchema.optional(),
})

/**
 * @swagger
 * /api/chiusure:
 *   get:
 *     summary: Lista chiusure cassa
 *     description: Restituisce l'elenco delle chiusure cassa con filtri opzionali e paginazione
 *     tags:
 *       - Chiusure
 *     parameters:
 *       - in: query
 *         name: venueId
 *         schema:
 *           type: string
 *         description: Filtra per sede (UUID)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, SUBMITTED, VALIDATED]
 *         description: Filtra per stato
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Data inizio (YYYY-MM-DD)
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Data fine (YYYY-MM-DD)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Numero pagina
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Elementi per pagina
 *     responses:
 *       200:
 *         description: Lista chiusure con paginazione
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Closure'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Errore interno
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    // Filtri
    const venueId = searchParams.get('venueId') || await getVenueId()
    const status = searchParams.get('status')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

    // Costruisci where clause
    const where: Prisma.DailyClosureWhereInput = {}

    if (venueId) {
      where.venueId = venueId
    }

    if (status) {
      where.status = status as Prisma.EnumClosureStatusFilter
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
    logger.error('Errore GET /api/chiusure', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle chiusure' },
      { status: 500 }
    )
  }
}

/**
 * @swagger
 * /api/chiusure:
 *   post:
 *     summary: Crea nuova chiusura
 *     description: |
 *       Crea una nuova chiusura cassa in stato DRAFT.
 *       La chiusura può includere postazioni cassa, parziali orari, uscite e presenze.
 *       Non è possibile creare due chiusure per la stessa data/sede.
 *     tags:
 *       - Chiusure
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClosureCreate'
 *     responses:
 *       201:
 *         description: Chiusura creata con successo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Closure'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         description: Chiusura già esistente per questa data/sede
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Esiste già una chiusura per questa data
 *                 existingId:
 *                   type: string
 *                   format: uuid
 *       500:
 *         description: Errore interno
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createClosureSchema.parse(body)

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
          create: validatedData.stations.map((station, index) => buildStationCreateData(station, index)),
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
            totalPay: att.totalPay,
            isPaid: att.isPaid ?? false,
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

    logger.error('Errore POST /api/chiusure', error)
    return NextResponse.json(
      { error: 'Errore nella creazione della chiusura' },
      { status: 500 }
    )
  }
}
