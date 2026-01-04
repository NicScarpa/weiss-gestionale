import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { format, eachDayOfInterval } from 'date-fns'
import { it } from 'date-fns/locale'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'

// Extend jsPDF type
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: unknown) => void
    lastAutoTable: {
      finalY: number
    }
  }
}

// GET /api/schedules/[id]/export/pdf - Export PDF turni
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params

    // Carica schedule con assignments
    const schedule = await prisma.shiftSchedule.findUnique({
      where: { id },
      include: {
        venue: true,
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            shiftDefinition: {
              select: {
                name: true,
                code: true,
                color: true,
              },
            },
          },
          orderBy: [
            { date: 'asc' },
            { startTime: 'asc' },
          ],
        },
      },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Pianificazione non trovata' }, { status: 404 })
    }

    // Genera lista giorni
    const days = eachDayOfInterval({
      start: new Date(schedule.startDate),
      end: new Date(schedule.endDate),
    })

    // Prepara dati per tabella
    const userMap = new Map<
      string,
      { name: string; shifts: Map<string, string>; totalHours: number }
    >()

    schedule.assignments.forEach((a) => {
      const userId = a.userId
      const dateKey = format(new Date(a.date), 'yyyy-MM-dd')
      const startTime = format(new Date(a.startTime), 'HH:mm')
      const endTime = format(new Date(a.endTime), 'HH:mm')
      const shiftCode = a.shiftDefinition?.code || ''

      if (!userMap.has(userId)) {
        userMap.set(userId, {
          name: `${a.user.firstName} ${a.user.lastName}`,
          shifts: new Map(),
          totalHours: 0,
        })
      }

      const userData = userMap.get(userId)!
      const existingShift = userData.shifts.get(dateKey)
      const shiftText = `${shiftCode} ${startTime}-${endTime}`
      userData.shifts.set(
        dateKey,
        existingShift ? `${existingShift}\n${shiftText}` : shiftText
      )

      // Calcola ore
      const start = new Date(a.startTime)
      const end = new Date(a.endTime)
      let hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
      hours -= (a.breakMinutes || 0) / 60
      userData.totalHours += hours
    })

    // Crea PDF
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    })

    // Header
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(
      `Turni ${schedule.venue?.name || 'Weiss Cafè'}`,
      doc.internal.pageSize.getWidth() / 2,
      15,
      { align: 'center' }
    )

    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `${format(new Date(schedule.startDate), 'd MMMM', { locale: it })} - ${format(
        new Date(schedule.endDate),
        'd MMMM yyyy',
        { locale: it }
      )}`,
      doc.internal.pageSize.getWidth() / 2,
      22,
      { align: 'center' }
    )

    // Prepara dati tabella
    const headers = ['Dipendente']
    days.forEach((d) => {
      headers.push(format(d, 'EEE\ndd/MM', { locale: it }))
    })
    headers.push('Tot.')

    const tableData: string[][] = []
    userMap.forEach((userData) => {
      const row: string[] = [userData.name]
      days.forEach((d) => {
        const dateKey = format(d, 'yyyy-MM-dd')
        row.push(userData.shifts.get(dateKey) || '-')
      })
      row.push(`${userData.totalHours.toFixed(1)}h`)
      tableData.push(row)
    })

    // Genera tabella
    doc.autoTable({
      startY: 28,
      head: [headers],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 58, 95],
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
      },
      bodyStyles: {
        fontSize: 7,
        halign: 'center',
        valign: 'middle',
        cellPadding: 2,
      },
      columnStyles: {
        0: { halign: 'left', cellWidth: 35 },
      },
      styles: {
        lineWidth: 0.1,
        lineColor: [200, 200, 200],
      },
      margin: { left: 5, right: 5 },
      tableWidth: 'auto',
    })

    // Footer
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(128)
      doc.text(
        `Generato il ${format(new Date(), "d/MM/yyyy 'alle' HH:mm", { locale: it })} - Pagina ${i} di ${pageCount}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 5,
        { align: 'center' }
      )
    }

    // Output
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    const fileName = `Turni_${schedule.venue?.code || 'WC'}_${format(
      new Date(schedule.startDate),
      'dd-MM-yyyy'
    )}_${format(new Date(schedule.endDate), 'dd-MM-yyyy')}.pdf`

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (error) {
    console.error('Errore export PDF turni:', error)
    return NextResponse.json(
      { error: 'Errore nell\'export PDF' },
      { status: 500 }
    )
  }
}
