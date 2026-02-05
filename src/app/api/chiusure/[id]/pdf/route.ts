import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { renderToBuffer } from '@react-pdf/renderer'
import { ClosurePdfDocument } from '@/lib/pdf/ClosurePdfTemplate'
import { format } from 'date-fns'

import { logger } from '@/lib/logger'

function getWeatherForTimeSlot(
  timeSlot: string,
  weatherMorning: string | null,
  weatherAfternoon: string | null,
  weatherEvening: string | null
): string | null {
  const hour = parseInt(timeSlot.split(':')[0], 10)
  if (isNaN(hour)) return null
  if (hour < 14) return weatherMorning
  if (hour < 18) return weatherAfternoon
  return weatherEvening
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    const { id } = await params

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Recupera la chiusura con tutti i dati necessari
    const closure = await prisma.dailyClosure.findUnique({
      where: { id },
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
          include: {
            cashCount: true,
          },
          orderBy: { position: 'asc' },
        },
        partials: {
          orderBy: { timeSlot: 'asc' },
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
          orderBy: { position: 'asc' },
        },
        attendance: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                isFixedStaff: true,
              },
            },
          },
          orderBy: { user: { firstName: 'asc' } },
        },
      },
    })

    if (!closure) {
      return NextResponse.json({ error: 'Chiusura non trovata' }, { status: 404 })
    }

    // Calcola totali dalle stazioni
    const stations = closure.stations.map((s) => ({
      name: s.name,
      receiptAmount: Number(s.receiptAmount),
      receiptVat: Number(s.receiptVat),
      invoiceAmount: Number(s.invoiceAmount),
      suspendedAmount: Number(s.suspendedAmount),
      cashAmount: Number(s.cashAmount),
      posAmount: Number(s.posAmount),
      totalAmount: Number(s.totalAmount),
      cashCount: s.cashCount ? {
        bills500: Number(s.cashCount.bills500),
        bills200: Number(s.cashCount.bills200),
        bills100: Number(s.cashCount.bills100),
        bills50: Number(s.cashCount.bills50),
        bills20: Number(s.cashCount.bills20),
        bills10: Number(s.cashCount.bills10),
        bills5: Number(s.cashCount.bills5),
        coins2: Number(s.cashCount.coins2),
        coins1: Number(s.cashCount.coins1),
        coins050: Number(s.cashCount.coins050),
        coins020: Number(s.cashCount.coins020),
        coins010: Number(s.cashCount.coins010),
        coins005: Number(s.cashCount.coins005),
        coins002: Number(s.cashCount.coins002),
        coins001: Number(s.cashCount.coins001),
        totalCounted: Number(s.cashCount.totalCounted),
        expectedTotal: Number(s.cashCount.expectedTotal),
        difference: Number(s.cashCount.difference),
      } : null,
    }))

    const totalCash = stations.reduce((sum, s) => sum + s.cashAmount, 0)
    const totalPos = stations.reduce((sum, s) => sum + s.posAmount, 0)
    const totalExpenses = closure.expenses.reduce((sum, e) => sum + Number(e.amount), 0)

    // Prepara i dati per il PDF
    const pdfData = {
      id: closure.id,
      date: closure.date,
      status: closure.status,
      notes: closure.notes,
      isEvent: closure.isEvent,
      eventName: closure.eventName,
      weatherMorning: closure.weatherMorning,
      weatherAfternoon: closure.weatherAfternoon,
      weatherEvening: closure.weatherEvening,
      venue: closure.venue,
      submittedBy: closure.submittedBy,
      validatedBy: closure.validatedBy,
      totalCash,
      totalPos,
      totalRevenue: totalCash + totalPos,
      totalExpenses,
      netCash: totalCash - totalExpenses,
      stations,
      expenses: closure.expenses.map((e) => ({
        payee: e.payee,
        description: e.description,
        documentType: e.documentType,
        documentRef: e.documentRef,
        vatAmount: e.vatAmount ? Number(e.vatAmount) : null,
        isPaid: e.isPaid,
        paidBy: e.paidBy,
        amount: Number(e.amount),
      })),
      partials: closure.partials.map((p) => ({
        timeSlot: p.timeSlot,
        receiptProgressive: Number(p.receiptProgressive),
        posProgressive: Number(p.posProgressive),
        total: Number(p.receiptProgressive) + Number(p.posProgressive),
        coffeeCounter: p.coffeeCounter,
        coffeeDelta: p.coffeeDelta,
        weather: p.weather ?? getWeatherForTimeSlot(
          p.timeSlot,
          closure.weatherMorning,
          closure.weatherAfternoon,
          closure.weatherEvening
        ),
      })),
      attendance: closure.attendance.map((a) => ({
        userName: `${a.user.firstName} ${a.user.lastName}`,
        shift: a.shift,
        statusCode: a.statusCode || null,
        hours: a.hours ? Number(a.hours) : null,
        hourlyRate: a.hourlyRate ? Number(a.hourlyRate) : null,
        totalPay: a.totalPay ? Number(a.totalPay) : null,
        isPaid: a.isPaid,
        isExtra: !a.user.isFixedStaff,
      })),
    }

    // Genera il PDF
    const pdfBuffer = await renderToBuffer(
      ClosurePdfDocument({ closure: pdfData })
    )

    // Nome file
    const dateStr = format(new Date(closure.date), 'yyyy-MM-dd')
    const filename = `chiusura-${closure.venue.code}-${dateStr}.pdf`

    // Supporto inline per apertura in browser
    const viewMode = request.nextUrl.searchParams.get('view')
    const disposition = viewMode === 'inline' ? 'inline' : 'attachment'

    // Ritorna il PDF (converti Buffer a Uint8Array per Next.js 16)
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${filename}"`,
      },
    })
  } catch (error) {
    logger.error('Errore generazione PDF', error)
    return NextResponse.json(
      { error: 'Errore nella generazione del PDF' },
      { status: 500 }
    )
  }
}
