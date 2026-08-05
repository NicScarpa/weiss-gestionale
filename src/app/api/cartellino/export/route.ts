import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import ExcelJS from 'exceljs'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getVenueId } from '@/lib/venue'
import {
  getMonthlyTimesheet,
  formatHoursMinutes,
  type MonthlyTimesheet,
} from '@/lib/attendance/timesheet'

const filtriSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
  userId: z.string().min(1).optional(),
})

const MESI_IT = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
]

// GET /api/cartellino/export?month=&year=&userId= - XLSX del singolo cartellino.
// L'export aggregato per le paghe resta in /api/attendance/export/payroll:
// questo è il documento di una persona sola, che anche lo staff può scaricare
// per sé.
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const filtri = filtriSchema.parse({
      month: searchParams.get('month') ?? undefined,
      year: searchParams.get('year') ?? undefined,
      userId: searchParams.get('userId') ?? undefined,
    })

    const isGestore = ['admin', 'manager'].includes(session.user.role || '')
    const targetUserId = isGestore
      ? (filtri.userId ?? session.user.id)
      : session.user.id

    const venueId = await getVenueId()
    const cartellino = await getMonthlyTimesheet(
      targetUserId,
      filtri.month,
      filtri.year,
      venueId || undefined
    )

    if (!cartellino) {
      return NextResponse.json(
        { error: 'Cartellino non disponibile per questa persona' },
        { status: 404 }
      )
    }

    const buffer = await generaExcel(cartellino)
    const nomeFile =
      `cartellino-${cartellino.lastName.toLowerCase()}-` +
      `${filtri.year}-${String(filtri.month).padStart(2, '0')}.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nomeFile}"`,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Parametri non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore GET /api/cartellino/export', error)
    return NextResponse.json(
      { error: "Errore nell'esportazione del cartellino" },
      { status: 500 }
    )
  }
}

async function generaExcel(cartellino: MonthlyTimesheet): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet('Cartellino')

  const intestazione = [
    [`CARTELLINO ${MESI_IT[cartellino.month - 1].toUpperCase()} ${cartellino.year}`],
    [`${cartellino.lastName} ${cartellino.firstName}`],
    cartellino.contractHoursWeek
      ? [`Contratto: ${cartellino.contractHoursWeek} ore settimanali`]
      : [],
    cartellino.policyNames.length > 0
      ? [`Regola oraria: ${cartellino.policyNames.join(', ')}`]
      : ['Regola oraria: nessuna (ore come timbrate)'],
    [],
  ]

  const colonne = [
    'Data',
    'Giorno',
    'Luogo',
    'Entrata',
    'Uscita',
    'Ore Ord.',
    'Ore Str.',
    'Ore Nott.',
    'Ore Fest.',
    'Totale',
    'Assenza',
    'Note',
  ]

  const righe = cartellino.days.map((giorno) => [
    giorno.date.split('-').reverse().join('/'),
    giorno.weekdayLabel,
    giorno.workLocationName ?? '',
    giorno.clockIn ?? '',
    giorno.clockOut ?? '',
    giorno.hours.ordinary > 0 ? giorno.hours.ordinary.toFixed(2) : '',
    giorno.hours.overtime > 0 ? giorno.hours.overtime.toFixed(2) : '',
    giorno.hours.night > 0 ? giorno.hours.night.toFixed(2) : '',
    giorno.hours.holiday > 0 ? giorno.hours.holiday.toFixed(2) : '',
    giorno.hours.total > 0 ? giorno.hours.total.toFixed(2) : '',
    giorno.leaveCode ?? '',
    giorno.notes.join(' | '),
  ])

  const totali = [
    [],
    [
      'TOTALE',
      '',
      '',
      '',
      '',
      cartellino.totals.ordinary.toFixed(2),
      cartellino.totals.overtime.toFixed(2),
      cartellino.totals.night.toFixed(2),
      cartellino.totals.holiday.toFixed(2),
      cartellino.totals.total.toFixed(2),
      String(cartellino.totals.leaveDays || ''),
      `Ore del mese: ${formatHoursMinutes(cartellino.totals.total)}`,
    ],
  ]

  for (const riga of [...intestazione, colonne, ...righe, ...totali]) {
    sheet.addRow(riga)
  }

  const larghezze = [12, 12, 16, 8, 8, 9, 9, 9, 9, 9, 9, 40]
  larghezze.forEach((width, i) => {
    sheet.getColumn(i + 1).width = width
  })

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
