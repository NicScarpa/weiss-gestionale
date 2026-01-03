import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { renderToBuffer } from '@react-pdf/renderer'
import { ClosurePdfDocument } from '@/lib/pdf/ClosurePdfTemplate'
import { format } from 'date-fns'

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

    // Type assertion per accesso ai campi (Prisma include tutti i campi base)
    const c = closure as typeof closure & {
      totalRevenue: any
      totalCash: any
      totalPos: any
      totalExpenses: any
      bankDeposit: any
      cashDifference: any
      netCash: any
      coffeeMachineStart: any
      coffeeMachineEnd: any
      coffeeSold: any
    }

    // Filtra solo le postazioni con dati
    const stationsWithData = closure.stations.filter(
      (s) => Number(s.cashAmount) > 0 || Number(s.posAmount) > 0
    )

    // Prepara i dati per il PDF
    const pdfData = {
      ...closure,
      totalRevenue: Number(c.totalRevenue),
      totalCash: Number(c.totalCash),
      totalPos: Number(c.totalPos),
      totalExpenses: Number(c.totalExpenses),
      bankDeposit: c.bankDeposit ? Number(c.bankDeposit) : null,
      cashDifference: Number(c.cashDifference),
      netCash: Number(c.netCash),
      coffeeMachineStart: c.coffeeMachineStart ? Number(c.coffeeMachineStart) : null,
      coffeeMachineEnd: c.coffeeMachineEnd ? Number(c.coffeeMachineEnd) : null,
      coffeeSold: c.coffeeSold ? Number(c.coffeeSold) : null,
      stations: stationsWithData.map((s) => ({
        ...s,
        totalCash: Number(s.cashAmount),
        totalPos: Number(s.posAmount),
        cashCount: s.cashCount ? {
          bill500: Number(s.cashCount.bills500),
          bill200: Number(s.cashCount.bills200),
          bill100: Number(s.cashCount.bills100),
          bill50: Number(s.cashCount.bills50),
          bill20: Number(s.cashCount.bills20),
          bill10: Number(s.cashCount.bills10),
          bill5: Number(s.cashCount.bills5),
          coin2: Number(s.cashCount.coins2),
          coin1: Number(s.cashCount.coins1),
          coin050: Number(s.cashCount.coins050),
          coin020: Number(s.cashCount.coins020),
          coin010: Number(s.cashCount.coins010),
          coin005: Number(s.cashCount.coins005),
          coin002: Number(s.cashCount.coins002),
          coin001: Number(s.cashCount.coins001),
        } : null,
      })),
      expenses: closure.expenses.map((e) => ({
        description: e.payee + (e.description ? ` - ${e.description}` : ''),
        amount: Number(e.amount),
        account: e.account,
      })),
      partials: closure.partials.map((p) => ({
        timeSlot: p.timeSlot,
        amount: Number(p.receiptProgressive) + Number(p.posProgressive),
      })),
      attendance: closure.attendance.map((a) => ({
        status: a.statusCode || a.shift || '-',
        hoursWorked: a.hours ? Number(a.hours) : null,
        user: a.user,
      })),
    }

    // Genera il PDF
    const pdfBuffer = await renderToBuffer(
      ClosurePdfDocument({ closure: pdfData })
    )

    // Nome file
    const dateStr = format(new Date(closure.date), 'yyyy-MM-dd')
    const filename = `chiusura-${closure.venue.code}-${dateStr}.pdf`

    // Ritorna il PDF (converti Buffer a Uint8Array per Next.js 16)
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Errore generazione PDF:', error)
    return NextResponse.json(
      { error: 'Errore nella generazione del PDF' },
      { status: 500 }
    )
  }
}
