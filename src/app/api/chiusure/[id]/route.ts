import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

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

// Schema per aggiornamento chiusura (metadati + dati relazionali opzionali)
const updateClosureSchema = z.object({
  date: dateSchema.optional(),
  isEvent: z.boolean().optional(),
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

// GET /api/chiusure/[id] - Dettaglio singola chiusura
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params
    const venueId = await getVenueId()

    const chiusura = await prisma.dailyClosure.findFirst({
      where: { id, venueId },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
            vatRate: true,
            defaultFloat: true,
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
          include: {
            cashCount: true,
          },
          orderBy: {
            position: 'asc',
          },
        },
        partials: {
          orderBy: {
            timeSlot: 'asc',
          },
        },
        expenses: {
          include: {
            account: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
          orderBy: {
            position: 'asc',
          },
        },
        attendance: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    })

    if (!chiusura) {
      return NextResponse.json(
        { error: 'Chiusura non trovata' },
        { status: 404 }
      )
    }

    // Calcola totali
    const grossTotal = chiusura.stations.reduce(
      (sum, s) => sum + Number(s.totalAmount || 0),
      0
    )
    const expensesTotal = chiusura.expenses.reduce(
      (sum, e) => sum + Number(e.amount || 0),
      0
    )

    // Formatta risposta
    const response = {
      id: chiusura.id,
      date: chiusura.date,
      status: chiusura.status,
      venue: chiusura.venue,
      isEvent: chiusura.isEvent,
      eventName: chiusura.eventName,
      weather: {
        morning: chiusura.weatherMorning,
        afternoon: chiusura.weatherAfternoon,
        evening: chiusura.weatherEvening,
      },

      // Postazioni con conteggi
      stations: chiusura.stations.map((station) => ({
        id: station.id,
        name: station.name,
        position: station.position,
        receiptAmount: station.receiptAmount,
        receiptVat: station.receiptVat,
        invoiceAmount: station.invoiceAmount,
        invoiceVat: station.invoiceVat,
        suspendedAmount: station.suspendedAmount,
        cashAmount: station.cashAmount,
        posAmount: station.posAmount,
        totalAmount: station.totalAmount,
        floatAmount: station.floatAmount,
        cashCount: station.cashCount
          ? {
              bills500: station.cashCount.bills500,
              bills200: station.cashCount.bills200,
              bills100: station.cashCount.bills100,
              bills50: station.cashCount.bills50,
              bills20: station.cashCount.bills20,
              bills10: station.cashCount.bills10,
              bills5: station.cashCount.bills5,
              coins2: station.cashCount.coins2,
              coins1: station.cashCount.coins1,
              coins050: station.cashCount.coins050,
              coins020: station.cashCount.coins020,
              coins010: station.cashCount.coins010,
              coins005: station.cashCount.coins005,
              coins002: station.cashCount.coins002,
              coins001: station.cashCount.coins001,
            }
          : null,
      })),

      // Parziali orari
      partials: chiusura.partials.map((partial) => ({
        id: partial.id,
        timeSlot: partial.timeSlot,
        receiptProgressive: partial.receiptProgressive,
        posProgressive: partial.posProgressive,
        coffeeCounter: partial.coffeeCounter,
        coffeeDelta: partial.coffeeDelta,
        weather: partial.weather,
      })),

      // Uscite
      expenses: chiusura.expenses.map((expense) => ({
        id: expense.id,
        payee: expense.payee,
        description: expense.description,
        amount: expense.amount,
        vatAmount: expense.vatAmount,
        account: expense.account,
        documentRef: expense.documentRef,
        documentType: expense.documentType,
        isPaid: expense.isPaid,
        paidBy: expense.paidBy,
      })),

      // Presenze
      attendance: chiusura.attendance.map((att) => ({
        id: att.id,
        userId: att.userId,
        userName: `${att.user.firstName} ${att.user.lastName}`,
        shift: att.shift,
        hours: att.hours,
        statusCode: att.statusCode,
        hourlyRate: att.hourlyRate,
        totalPay: att.totalPay,
        isPaid: att.isPaid,
        notes: att.notes,
      })),

      // Totali calcolati
      grossTotal,
      expensesTotal,

      // Metadata
      notes: chiusura.notes,
      submittedBy: chiusura.submittedBy
        ? {
            id: chiusura.submittedBy.id,
            name: `${chiusura.submittedBy.firstName} ${chiusura.submittedBy.lastName}`,
          }
        : null,
      submittedAt: chiusura.submittedAt,
      validatedBy: chiusura.validatedBy
        ? {
            id: chiusura.validatedBy.id,
            name: `${chiusura.validatedBy.firstName} ${chiusura.validatedBy.lastName}`,
          }
        : null,
      validatedAt: chiusura.validatedAt,
      rejectionNotes: chiusura.rejectionNotes,
      createdAt: chiusura.createdAt,
      updatedAt: chiusura.updatedAt,
    }

    return NextResponse.json(response)
  } catch (error) {
    logger.error('Errore GET /api/chiusure/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero della chiusura' },
      { status: 500 }
    )
  }
}

// PUT /api/chiusure/[id] - Aggiorna chiusura (solo DRAFT)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const validatedData = updateClosureSchema.parse(body)

    const venueId = await getVenueId()

    // Verifica che la chiusura esista
    const existingClosure = await prisma.dailyClosure.findUnique({
      where: { id },
      select: { id: true, status: true, venueId: true },
    })

    if (!existingClosure) {
      return NextResponse.json(
        { error: 'Chiusura non trovata' },
        { status: 404 }
      )
    }

    if (existingClosure.venueId !== venueId) {
      return NextResponse.json(
        { error: 'Accesso negato' },
        { status: 403 }
      )
    }

    // Solo DRAFT può essere modificata (admin può modificare qualsiasi stato)
    if (existingClosure.status !== 'DRAFT' && session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Solo le chiusure in bozza possono essere modificate' },
        { status: 400 }
      )
    }

    // Separa metadati dai dati relazionali
    const { stations, partials, expenses, attendance, ...metadata } = validatedData

    // Aggiorna in transazione: metadati + delete/recreate relazioni
    const updated = await prisma.$transaction(async (tx) => {
      // 1. Aggiorna metadati DailyClosure
      const closure = await tx.dailyClosure.update({
        where: { id },
        data: metadata,
        select: { id: true, updatedAt: true },
      })

      // 2. Se stations fornite: delete + recreate (cascade elimina CashCount)
      if (stations !== undefined) {
        await tx.cashStation.deleteMany({ where: { closureId: id } })
        if (stations.length > 0) {
          for (const [index, station] of stations.entries()) {
            const stationData = buildStationCreateData(station, index)
            await tx.cashStation.create({
              data: {
                closureId: id,
                ...stationData,
              },
            })
          }
        }
      }

      // 3. Se partials fornite: delete + recreate
      if (partials !== undefined) {
        await tx.hourlyPartial.deleteMany({ where: { closureId: id } })
        if (partials.length > 0) {
          await tx.hourlyPartial.createMany({
            data: partials.map((partial) => ({
              closureId: id,
              timeSlot: partial.timeSlot,
              receiptProgressive: partial.receiptProgressive || 0,
              posProgressive: partial.posProgressive || 0,
              coffeeCounter: partial.coffeeCounter,
              coffeeDelta: partial.coffeeDelta,
              weather: partial.weather,
            })),
          })
        }
      }

      // 4. Se expenses fornite: delete + recreate
      if (expenses !== undefined) {
        await tx.dailyExpense.deleteMany({ where: { closureId: id } })
        if (expenses.length > 0) {
          await tx.dailyExpense.createMany({
            data: expenses.map((expense, index) => ({
              closureId: id,
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
          })
        }
      }

      // 5. Se attendance fornite: delete + recreate
      if (attendance !== undefined) {
        await tx.dailyAttendance.deleteMany({ where: { closureId: id } })
        if (attendance.length > 0) {
          await tx.dailyAttendance.createMany({
            data: attendance.map((att) => ({
              closureId: id,
              userId: att.userId,
              shift: att.shift,
              hours: att.hours,
              statusCode: att.statusCode,
              hourlyRate: att.hourlyRate,
              totalPay: att.totalPay,
              isPaid: att.isPaid ?? false,
              notes: att.notes,
            })),
          })
        }
      }

      return closure
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PUT /api/chiusure/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento della chiusura' },
      { status: 500 }
    )
  }
}

// DELETE /api/chiusure/[id] - Elimina chiusura (solo DRAFT)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

    const venueId = await getVenueId()

    // Verifica che la chiusura esista
    const existingClosure = await prisma.dailyClosure.findUnique({
      where: { id },
      select: { id: true, status: true, venueId: true },
    })

    if (!existingClosure) {
      return NextResponse.json(
        { error: 'Chiusura non trovata' },
        { status: 404 }
      )
    }

    if (existingClosure.venueId !== venueId) {
      return NextResponse.json(
        { error: 'Accesso negato' },
        { status: 403 }
      )
    }

    // Verifica accesso (solo admin o manager della sede)
    if (
      session.user.role !== 'admin' &&
      session.user.role !== 'manager'
    ) {
      return NextResponse.json(
        { error: 'Solo admin e manager possono eliminare chiusure' },
        { status: 403 }
      )
    }

    // Solo DRAFT può essere eliminata (admin può eliminare qualsiasi stato)
    if (existingClosure.status !== 'DRAFT' && session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Solo le chiusure in bozza possono essere eliminate' },
        { status: 400 }
      )
    }

    // Per chiusure VALIDATED, elimina anche le scritture contabili generate
    if (existingClosure.status === 'VALIDATED') {
      await prisma.journalEntry.deleteMany({
        where: { closureId: id },
      })
    }

    // Elimina (cascade elimina anche stazioni, parziali, uscite, presenze)
    await prisma.dailyClosure.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Errore DELETE /api/chiusure/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione della chiusura' },
      { status: 500 }
    )
  }
}
