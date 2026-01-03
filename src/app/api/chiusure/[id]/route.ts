import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Schema per aggiornamento chiusura
const updateClosureSchema = z.object({
  isEvent: z.boolean().optional(),
  eventName: z.string().optional(),
  weatherMorning: z.string().optional(),
  weatherAfternoon: z.string().optional(),
  weatherEvening: z.string().optional(),
  notes: z.string().optional(),
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

    const chiusura = await prisma.dailyClosure.findUnique({
      where: { id },
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

    // Verifica accesso (stessa sede o admin)
    if (
      session.user.role !== 'admin' &&
      session.user.venueId !== chiusura.venueId
    ) {
      return NextResponse.json(
        { error: 'Accesso non autorizzato' },
        { status: 403 }
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
    console.error('Errore GET /api/chiusure/[id]:', error)
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

    // Verifica accesso
    if (
      session.user.role !== 'admin' &&
      session.user.venueId !== existingClosure.venueId
    ) {
      return NextResponse.json(
        { error: 'Non autorizzato' },
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

    // Aggiorna
    const updated = await prisma.dailyClosure.update({
      where: { id },
      data: validatedData,
      select: { id: true, updatedAt: true },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Errore PUT /api/chiusure/[id]:', error)
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

    if (
      session.user.role === 'manager' &&
      session.user.venueId !== existingClosure.venueId
    ) {
      return NextResponse.json(
        { error: 'Non autorizzato per questa sede' },
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
    console.error('Errore DELETE /api/chiusure/[id]:', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione della chiusura' },
      { status: 500 }
    )
  }
}
