import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import { z } from 'zod'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import ExcelJS from 'exceljs'
import {
  generatePayrollData,
  PayrollRecord,
  PayrollSummary,
} from '@/lib/attendance/payroll-calculator'

import { logger } from '@/lib/logger'
const exportFiltersSchema = z.object({
  month: z.coerce.number().min(1).max(12),
  year: z.coerce.number().min(2020).max(2100),
  venueId: z.string().optional(),
  format: z.enum(['csv', 'xlsx']).default('xlsx'),
  includeLeaves: z.coerce.boolean().default(true),
  includeSummary: z.coerce.boolean().default(true),
})

// GET /api/attendance/export/payroll - Export presenze per paghe
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono esportare
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)

    const filters = exportFiltersSchema.parse({
      month: searchParams.get('month') || new Date().getMonth() + 1,
      year: searchParams.get('year') || new Date().getFullYear(),
      venueId: searchParams.get('venueId') || undefined,
      format: searchParams.get('format') || 'xlsx',
      includeLeaves: searchParams.get('includeLeaves') !== 'false',
      includeSummary: searchParams.get('includeSummary') !== 'false',
    })

    // Filtra per sede
    const venueId = filters.venueId || await getVenueId()

    // Genera dati payroll
    const { records, summaries, warnings } = await generatePayrollData(
      filters.month,
      filters.year,
      venueId || undefined
    )

    // Nome mese
    const monthDate = new Date(filters.year, filters.month - 1)
    const monthName = format(monthDate, 'MMMM yyyy', { locale: it })

    // Genera file in base al formato
    if (filters.format === 'csv') {
      const csv = generateCSV(records, filters.includeLeaves)
      const filename = `presenze-${format(monthDate, 'yyyy-MM')}.csv`

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    // Excel
    const excelBuffer = await generateExcel(
      records,
      summaries,
      monthName,
      warnings,
      filters.includeLeaves,
      filters.includeSummary
    )
    const filename = `presenze-${format(monthDate, 'yyyy-MM')}.xlsx`

    return new NextResponse(new Uint8Array(excelBuffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Parametri non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore GET /api/attendance/export/payroll', error)
    return NextResponse.json(
      { error: 'Errore nell\'esportazione' },
      { status: 500 }
    )
  }
}

/**
 * Genera CSV per software paghe
 */
function generateCSV(records: PayrollRecord[], includeLeaves: boolean): string {
  const headers = [
    'MATRICOLA',
    'COGNOME',
    'NOME',
    'DATA',
    'ENTRATA',
    'USCITA',
    'ORE_ORD',
    'ORE_STR',
    'ORE_NOTT',
    'ORE_FEST',
    'COD_ASS',
    'NOTE',
  ]

  const rows = records
    .filter((r) => {
      // Filtra giorni vuoti se non include assenze
      if (!includeLeaves && r.leaveCode) return false
      // Mostra solo giorni con dati
      return r.hours.total > 0 || r.leaveCode
    })
    .map((r) => [
      r.employeeCode,
      r.lastName,
      r.firstName,
      format(new Date(r.date), 'dd/MM/yyyy'),
      r.clockIn ? format(new Date(r.clockIn), 'HH:mm') : '',
      r.clockOut ? format(new Date(r.clockOut), 'HH:mm') : '',
      formatNumber(r.hours.ordinary),
      formatNumber(r.hours.overtime),
      formatNumber(r.hours.night),
      formatNumber(r.hours.holiday),
      r.leaveCode || '',
      r.notes.join(' | '),
    ])

  // BOM per Excel
  const BOM = '\uFEFF'
  const csvContent = [headers.join(';'), ...rows.map((row) => row.join(';'))].join(
    '\n'
  )

  return BOM + csvContent
}

/**
 * Genera Excel con dettaglio e riepilogo
 */
async function generateExcel(
  records: PayrollRecord[],
  summaries: PayrollSummary[],
  monthName: string,
  warnings: string[],
  includeLeaves: boolean,
  includeSummary: boolean
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()

  // === Foglio 1: Dettaglio giornaliero ===
  const detailHeader = [
    'Matricola',
    'Cognome',
    'Nome',
    'Data',
    'Giorno',
    'Entrata',
    'Uscita',
    'Ore Ord.',
    'Ore Str.',
    'Ore Nott.',
    'Ore Fest.',
    'Totale',
    'Cod. Assenza',
    'Note',
  ]

  const detailRows = records
    .filter((r) => {
      if (!includeLeaves && r.leaveCode) return false
      return r.hours.total > 0 || r.leaveCode
    })
    .map((r) => [
      r.employeeCode,
      r.lastName,
      r.firstName,
      format(new Date(r.date), 'dd/MM/yyyy'),
      format(new Date(r.date), 'EEEE', { locale: it }),
      r.clockIn ? format(new Date(r.clockIn), 'HH:mm') : '',
      r.clockOut ? format(new Date(r.clockOut), 'HH:mm') : '',
      r.hours.ordinary > 0 ? r.hours.ordinary.toFixed(2) : '',
      r.hours.overtime > 0 ? r.hours.overtime.toFixed(2) : '',
      r.hours.night > 0 ? r.hours.night.toFixed(2) : '',
      r.hours.holiday > 0 ? r.hours.holiday.toFixed(2) : '',
      r.hours.total > 0 ? r.hours.total.toFixed(2) : '',
      r.leaveCode || '',
      r.notes.join(' | '),
    ])

  // Info header
  const infoRows: (string | number)[][] = [
    [`PRESENZE ${monthName.toUpperCase()}`],
    [],
    ['Esportato il', format(new Date(), 'dd/MM/yyyy HH:mm')],
    ['Righe', detailRows.length],
    [],
  ]

  const detailSheet = wb.addWorksheet('Dettaglio')

  // Add info rows, header, and data rows
  for (const row of [...infoRows, detailHeader, ...detailRows]) {
    detailSheet.addRow(row)
  }

  // Larghezza colonne
  const detailColWidths = [10, 15, 15, 12, 12, 8, 8, 10, 10, 10, 10, 10, 12, 30]
  detailColWidths.forEach((width, i) => {
    detailSheet.getColumn(i + 1).width = width
  })

  // === Foglio 2: Riepilogo mensile ===
  if (includeSummary) {
    const summaryHeader = [
      'Matricola',
      'Cognome',
      'Nome',
      'Ore Ord.',
      'Ore Str.',
      'Ore Nott.',
      'Ore Fest.',
      'Totale Ore',
      'Gg. Assenza',
      'Dettaglio Assenze',
      'Costo Stimato',
    ]

    const summaryRows: (string | number)[][] = summaries
      .filter((s) => s.totalHours > 0 || s.totalLeaveDays > 0)
      .map((s) => [
        s.employeeCode,
        s.lastName,
        s.firstName,
        s.totalOrdinary.toFixed(2),
        s.totalOvertime.toFixed(2),
        s.totalNight.toFixed(2),
        s.totalHoliday.toFixed(2),
        s.totalHours.toFixed(2),
        s.totalLeaveDays,
        Object.entries(s.leaveSummary)
          .map(([code, days]) => `${code}: ${days}`)
          .join(', '),
        s.estimatedCost > 0 ? `€ ${s.estimatedCost.toFixed(2)}` : '',
      ])

    // Totali
    const totals = summaries.reduce(
      (acc, s) => ({
        ordinary: acc.ordinary + s.totalOrdinary,
        overtime: acc.overtime + s.totalOvertime,
        night: acc.night + s.totalNight,
        holiday: acc.holiday + s.totalHoliday,
        total: acc.total + s.totalHours,
        leaveDays: acc.leaveDays + s.totalLeaveDays,
        cost: acc.cost + s.estimatedCost,
      }),
      {
        ordinary: 0,
        overtime: 0,
        night: 0,
        holiday: 0,
        total: 0,
        leaveDays: 0,
        cost: 0,
      }
    )

    summaryRows.push([])
    summaryRows.push([
      'TOTALE',
      '',
      '',
      totals.ordinary.toFixed(2),
      totals.overtime.toFixed(2),
      totals.night.toFixed(2),
      totals.holiday.toFixed(2),
      totals.total.toFixed(2),
      totals.leaveDays,
      '',
      `€ ${totals.cost.toFixed(2)}`,
    ])

    const summaryInfoRows: (string | number)[][] = [
      [`RIEPILOGO ${monthName.toUpperCase()}`],
      [],
      ['Dipendenti', summaries.length],
      ['Ore totali', totals.total.toFixed(2)],
      ['Costo stimato', `€ ${totals.cost.toFixed(2)}`],
      [],
    ]

    const summarySheet = wb.addWorksheet('Riepilogo')

    for (const row of [...summaryInfoRows, summaryHeader, ...summaryRows]) {
      summarySheet.addRow(row)
    }

    const summaryColWidths = [10, 15, 15, 10, 10, 10, 10, 12, 12, 25, 15]
    summaryColWidths.forEach((width, i) => {
      summarySheet.getColumn(i + 1).width = width
    })
  }

  // === Foglio 3: Avvisi (se presenti) ===
  if (warnings.length > 0) {
    const warningRows = [
      ['AVVISI E ANOMALIE'],
      [],
      ...warnings.map((w) => [w]),
    ]

    const warningSheet = wb.addWorksheet('Avvisi')

    for (const row of warningRows) {
      warningSheet.addRow(row)
    }

    warningSheet.getColumn(1).width = 80
  }

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

function formatNumber(value: number): string {
  if (!value || value === 0) return ''
  return value.toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
