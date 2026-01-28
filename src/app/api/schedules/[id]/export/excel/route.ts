import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import ExcelJS from 'exceljs'
import { format, eachDayOfInterval } from 'date-fns'
import { it } from 'date-fns/locale'

import { logger } from '@/lib/logger'
// GET /api/schedules/[id]/export/excel - Export Excel turni
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

    // Crea workbook Excel
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Weiss Gestionale'
    workbook.created = new Date()

    const worksheet = workbook.addWorksheet('Turni', {
      pageSetup: { orientation: 'landscape', fitToPage: true },
    })

    // Genera lista giorni
    const days = eachDayOfInterval({
      start: new Date(schedule.startDate),
      end: new Date(schedule.endDate),
    })

    // Prepara dati per griglia
    const userMap = new Map<string, { name: string; shifts: Map<string, string> }>()

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
        })
      }

      const existingShift = userMap.get(userId)!.shifts.get(dateKey)
      const shiftText = `${shiftCode}\n${startTime}-${endTime}`
      userMap.get(userId)!.shifts.set(
        dateKey,
        existingShift ? `${existingShift}\n${shiftText}` : shiftText
      )
    })

    // Header
    const headerRow = ['Dipendente']
    days.forEach((d) => {
      headerRow.push(format(d, 'EEE dd/MM', { locale: it }))
    })
    headerRow.push('Tot. Ore')

    worksheet.addRow(headerRow)

    // Stile header
    const header = worksheet.getRow(1)
    header.font = { bold: true }
    header.alignment = { horizontal: 'center', vertical: 'middle' }
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' },
    }
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } }

    // Righe dipendenti
    userMap.forEach((userData, userId) => {
      const row: (string | number)[] = [userData.name]
      let totalHours = 0

      days.forEach((d) => {
        const dateKey = format(d, 'yyyy-MM-dd')
        const shiftText = userData.shifts.get(dateKey) || ''
        row.push(shiftText)

        // Calcola ore da assignments
        const dayAssignments = schedule.assignments.filter(
          (a) =>
            a.userId === userId &&
            format(new Date(a.date), 'yyyy-MM-dd') === dateKey
        )
        dayAssignments.forEach((a) => {
          const start = new Date(a.startTime)
          const end = new Date(a.endTime)
          totalHours += (end.getTime() - start.getTime()) / (1000 * 60 * 60)
          totalHours -= (a.breakMinutes || 0) / 60
        })
      })

      row.push(totalHours.toFixed(1))
      worksheet.addRow(row)
    })

    // Formatta colonne
    worksheet.getColumn(1).width = 25
    worksheet.columns.slice(1).forEach((col) => {
      col.width = 12
      col.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    })

    // Altezza righe
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.height = 40
      }
    })

    // Bordi
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        }
      })
    })

    // Genera buffer
    const buffer = await workbook.xlsx.writeBuffer()

    // Nome file
    const fileName = `Turni_${schedule.venue?.code || 'WC'}_${format(
      new Date(schedule.startDate),
      'dd-MM-yyyy'
    )}_${format(new Date(schedule.endDate), 'dd-MM-yyyy')}.xlsx`

    return new NextResponse(buffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (error) {
    logger.error('Errore export Excel turni', error)
    return NextResponse.json(
      { error: 'Errore nell\'export Excel' },
      { status: 500 }
    )
  }
}
