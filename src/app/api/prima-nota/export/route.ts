import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { format } from 'date-fns'
import { renderToBuffer } from '@react-pdf/renderer'
import { PrimaNotaPdfDocument } from '@/lib/pdf/PrimaNotaPdfTemplate'
import ExcelJS from 'exceljs'
import { getVenueId } from '@/lib/venue'

import { logger } from '@/lib/logger'
const exportFiltersSchema = z.object({
  registerType: z.enum(['CASH', 'BANK']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  format: z.enum(['csv', 'json', 'pdf', 'xlsx']).default('csv'),
})

// GET /api/prima-nota/export - Esporta movimenti
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)

    const filters = exportFiltersSchema.parse({
      registerType: searchParams.get('registerType') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
      format: searchParams.get('format') || 'csv',
    })

    // Costruisci where clause
    const where: Prisma.JournalEntryWhereInput = {}

    // Filtra per sede
    where.venueId = await getVenueId()

    if (filters.registerType) {
      where.registerType = filters.registerType
    }

    if (filters.dateFrom || filters.dateTo) {
      where.date = {}
      if (filters.dateFrom) {
        where.date.gte = new Date(filters.dateFrom)
      }
      if (filters.dateTo) {
        where.date.lte = new Date(filters.dateTo)
      }
    }

    // Recupera tutti i movimenti
    const entries = await prisma.journalEntry.findMany({
      where,
      include: {
        venue: {
          select: {
            name: true,
            code: true,
          },
        },
        account: {
          select: {
            code: true,
            name: true,
          },
        },
        closure: {
          select: {
            date: true,
          },
        },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    })

    if (filters.format === 'json') {
      return NextResponse.json({
        data: entries.map((e) => ({
          ...e,
          debitAmount: e.debitAmount ? Number(e.debitAmount) : null,
          creditAmount: e.creditAmount ? Number(e.creditAmount) : null,
          vatAmount: e.vatAmount ? Number(e.vatAmount) : null,
          runningBalance: e.runningBalance ? Number(e.runningBalance) : null,
        })),
        exportedAt: new Date().toISOString(),
        filters,
      })
    }

    // Genera PDF
    if (filters.format === 'pdf') {
      // Calcola totali
      const totaleDebiti = entries.reduce((sum, e) => sum + (e.debitAmount ? Number(e.debitAmount) : 0), 0)
      const totaleCrediti = entries.reduce((sum, e) => sum + (e.creditAmount ? Number(e.creditAmount) : 0), 0)
      const saldoPeriodo = totaleDebiti - totaleCrediti

      // Prepara dati per PDF
      const pdfEntries = entries.map((e) => ({
        id: e.id,
        date: e.date,
        description: e.description,
        registerType: e.registerType as 'CASH' | 'BANK',
        debitAmount: e.debitAmount ? Number(e.debitAmount) : null,
        creditAmount: e.creditAmount ? Number(e.creditAmount) : null,
        documentRef: e.documentRef,
        account: e.account,
        venue: e.venue,
      }))

      const pdfBuffer = await renderToBuffer(
        PrimaNotaPdfDocument({
          entries: pdfEntries,
          registerType: filters.registerType ? filters.registerType as 'CASH' | 'BANK' : 'ALL',
          dateFrom: filters.dateFrom ? format(new Date(filters.dateFrom), 'dd/MM/yyyy') : undefined,
          dateTo: filters.dateTo ? format(new Date(filters.dateTo), 'dd/MM/yyyy') : undefined,
          totaleDebiti,
          totaleCrediti,
          saldoPeriodo,
        })
      )

      const filename = `prima-nota-${filters.registerType?.toLowerCase() || 'tutti'}-${format(new Date(), 'yyyy-MM-dd')}.pdf`

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    // Genera Excel
    if (filters.format === 'xlsx') {
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Prima Nota')

      // Calcola totali
      const totaleDebiti = entries.reduce((sum, e) => sum + (e.debitAmount ? Number(e.debitAmount) : 0), 0)
      const totaleCrediti = entries.reduce((sum, e) => sum + (e.creditAmount ? Number(e.creditAmount) : 0), 0)
      const saldoPeriodo = totaleDebiti - totaleCrediti

      // Header informazioni
      const registerLabel = filters.registerType === 'CASH' ? 'Cassa' : filters.registerType === 'BANK' ? 'Banca' : 'Tutti'
      const infoRows: (string | number)[][] = [
        ['PRIMA NOTA'],
        [],
        ['Registro', registerLabel],
        ['Periodo', `${filters.dateFrom ? format(new Date(filters.dateFrom), 'dd/MM/yyyy') : 'Inizio'} - ${filters.dateTo ? format(new Date(filters.dateTo), 'dd/MM/yyyy') : 'Oggi'}`],
        ['Movimenti', entries.length],
        [],
        ['RIEPILOGO'],
        ['Totale Dare', totaleDebiti],
        ['Totale Avere', totaleCrediti],
        ['Saldo Periodo', saldoPeriodo],
        [],
      ]

      // Tabella movimenti
      const tableHeader = ['Data', 'Registro', 'Sede', 'Descrizione', 'Rif. Documento', 'Dare', 'Avere', 'IVA', 'Conto', 'Da Chiusura']
      const tableRows: (string | number)[][] = entries.map((e) => [
        format(new Date(e.date), 'dd/MM/yyyy'),
        e.registerType === 'CASH' ? 'Cassa' : 'Banca',
        e.venue?.code || '',
        e.description,
        e.documentRef || '',
        e.debitAmount ? Number(e.debitAmount) : '',
        e.creditAmount ? Number(e.creditAmount) : '',
        e.vatAmount ? Number(e.vatAmount) : '',
        e.account ? `${e.account.code} - ${e.account.name}` : '',
        e.closure ? 'Sì' : 'No',
      ])

      // Riga totali
      tableRows.push([])
      tableRows.push(['TOTALE', '', '', '', '', totaleDebiti, totaleCrediti, '', '', ''])

      // Combina info + tabella e aggiungi righe
      const allRows = [...infoRows, tableHeader, ...tableRows]
      allRows.forEach(row => ws.addRow(row))

      // Larghezza colonne
      ws.columns = [
        { width: 12 }, { width: 10 }, { width: 8 }, { width: 35 }, { width: 15 },
        { width: 12 }, { width: 12 }, { width: 10 }, { width: 25 }, { width: 12 }
      ]

      const excelBuffer = await wb.xlsx.writeBuffer()
      const filename = `prima-nota-${filters.registerType?.toLowerCase() || 'tutti'}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`

      return new NextResponse(excelBuffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    // Genera CSV
    const csv = generateCSV(entries)
    const filename = `prima-nota-${filters.registerType || 'tutti'}-${format(new Date(), 'yyyy-MM-dd')}.csv`

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
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

    logger.error('Errore GET /api/prima-nota/export', error)
    return NextResponse.json(
      { error: 'Errore nell\'esportazione' },
      { status: 500 }
    )
  }
}

interface Entry {
  date: Date
  registerType: string
  description: string
  documentRef: string | null
  debitAmount: Prisma.Decimal | null
  creditAmount: Prisma.Decimal | null
  vatAmount: Prisma.Decimal | null
  venue: { name: string; code: string } | null
  account: { code: string; name: string } | null
  closure: { date: Date } | null
  createdAt: Date
}

function generateCSV(entries: Entry[]): string {
  const headers = [
    'Data',
    'Registro',
    'Sede',
    'Descrizione',
    'Riferimento Documento',
    'Dare',
    'Avere',
    'IVA',
    'Conto',
    'Da Chiusura',
    'Data Registrazione',
  ]

  const rows = entries.map((entry) => {
    const debit = entry.debitAmount ? Number(entry.debitAmount) : ''
    const credit = entry.creditAmount ? Number(entry.creditAmount) : ''
    const vat = entry.vatAmount ? Number(entry.vatAmount) : ''

    return [
      format(new Date(entry.date), 'dd/MM/yyyy'),
      entry.registerType === 'CASH' ? 'Cassa' : 'Banca',
      entry.venue?.code || '',
      escapeCSV(entry.description),
      entry.documentRef || '',
      formatNumber(debit),
      formatNumber(credit),
      formatNumber(vat),
      entry.account ? `${entry.account.code} - ${entry.account.name}` : '',
      entry.closure ? 'Sì' : 'No',
      format(new Date(entry.createdAt), 'dd/MM/yyyy HH:mm'),
    ]
  })

  // BOM per Excel
  const BOM = '\uFEFF'
  const csvContent = [
    headers.join(';'),
    ...rows.map((row) => row.join(';')),
  ].join('\n')

  return BOM + csvContent
}

function escapeCSV(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatNumber(value: number | string): string {
  if (value === '' || value === null || value === undefined) return ''
  const num = typeof value === 'string' ? parseFloat(value) : value
  // Formato italiano con virgola
  return num.toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
