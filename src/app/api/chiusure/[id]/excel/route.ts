import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

import { logger } from '@/lib/logger'
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

    // Type assertion per campi Prisma Decimal
    type DecimalValue = { toNumber: () => number } | null
    const c = closure as typeof closure & {
      totalRevenue: DecimalValue
      totalCash: DecimalValue
      totalPos: DecimalValue
      totalExpenses: DecimalValue
      bankDeposit: DecimalValue
      cashDifference: DecimalValue
      netCash: DecimalValue
      coffeeMachineStart: DecimalValue
      coffeeMachineEnd: DecimalValue
      coffeeSold: DecimalValue
    }

    // Crea workbook Excel
    const wb = XLSX.utils.book_new()

    // === FOGLIO 1: RIEPILOGO ===
    const summaryData = [
      ['CHIUSURA CASSA'],
      [],
      ['Sede', closure.venue.name],
      ['Codice Sede', closure.venue.code],
      ['Data', format(new Date(closure.date), 'dd/MM/yyyy', { locale: it })],
      ['Stato', closure.status],
      [],
      ['RIEPILOGO INCASSI'],
      ['Totale Lordo', Number(c.totalRevenue)],
      ['Contanti', Number(c.totalCash)],
      ['POS', Number(c.totalPos)],
      ['Totale Uscite', Number(c.totalExpenses)],
      ['Versamento Banca', c.bankDeposit ? Number(c.bankDeposit) : 0],
      ['Differenza Cassa', Number(c.cashDifference)],
      ['Netto Cassa', Number(c.netCash)],
      [],
      ['MACCHINA CAFFE'],
      ['Inizio', c.coffeeMachineStart ? Number(c.coffeeMachineStart) : ''],
      ['Fine', c.coffeeMachineEnd ? Number(c.coffeeMachineEnd) : ''],
      ['Caffè Venduti', c.coffeeSold ? Number(c.coffeeSold) : ''],
      [],
      ['METEO'],
      ['Mattina', closure.weatherMorning || ''],
      ['Pomeriggio', closure.weatherAfternoon || ''],
      ['Sera', closure.weatherEvening || ''],
      [],
      ['NOTE'],
      [closure.notes || ''],
      [],
      ['WORKFLOW'],
      ['Inviato da', closure.submittedBy ? `${closure.submittedBy.firstName} ${closure.submittedBy.lastName}` : ''],
      ['Data invio', closure.submittedAt ? format(new Date(closure.submittedAt), 'dd/MM/yyyy HH:mm') : ''],
      ['Validato da', closure.validatedBy ? `${closure.validatedBy.firstName} ${closure.validatedBy.lastName}` : ''],
      ['Data validazione', closure.validatedAt ? format(new Date(closure.validatedAt), 'dd/MM/yyyy HH:mm') : ''],
    ]
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)

    // Imposta larghezza colonne
    wsSummary['!cols'] = [{ wch: 20 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Riepilogo')

    // === FOGLIO 2: POSTAZIONI ===
    const stationsWithData = closure.stations.filter(
      (s) => Number(s.cashAmount) > 0 || Number(s.posAmount) > 0
    )

    if (stationsWithData.length > 0) {
      const stationsHeader = ['Postazione', 'Contanti', 'POS', 'Totale', 'Corrispettivo', 'Fatture', 'Sospesi']
      const stationsRows = stationsWithData.map((s) => [
        s.name,
        Number(s.cashAmount),
        Number(s.posAmount),
        Number(s.cashAmount) + Number(s.posAmount),
        Number(s.receiptAmount),
        Number(s.invoiceAmount),
        Number(s.suspendedAmount),
      ])

      // Aggiungi riga totali
      const totalCash = stationsWithData.reduce((sum, s) => sum + Number(s.cashAmount), 0)
      const totalPos = stationsWithData.reduce((sum, s) => sum + Number(s.posAmount), 0)
      const totalReceipt = stationsWithData.reduce((sum, s) => sum + Number(s.receiptAmount), 0)
      const totalInvoice = stationsWithData.reduce((sum, s) => sum + Number(s.invoiceAmount), 0)
      const totalSuspended = stationsWithData.reduce((sum, s) => sum + Number(s.suspendedAmount), 0)

      stationsRows.push([])
      stationsRows.push(['TOTALE', totalCash, totalPos, totalCash + totalPos, totalReceipt, totalInvoice, totalSuspended])

      const wsStations = XLSX.utils.aoa_to_sheet([stationsHeader, ...stationsRows])
      wsStations['!cols'] = [
        { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
      ]
      XLSX.utils.book_append_sheet(wb, wsStations, 'Postazioni')
    }

    // === FOGLIO 3: CONTEGGIO BANCONOTE ===
    const stationsWithCount = closure.stations.filter((s) => s.cashCount)
    if (stationsWithCount.length > 0) {
      const countHeader = ['Postazione', '500€', '200€', '100€', '50€', '20€', '10€', '5€', '2€', '1€', '0.50€', '0.20€', '0.10€', '0.05€', '0.02€', '0.01€', 'Totale']
      const countRows = stationsWithCount.map((s) => {
        const cc = s.cashCount!
        const total =
          Number(cc.bills500) * 500 + Number(cc.bills200) * 200 + Number(cc.bills100) * 100 +
          Number(cc.bills50) * 50 + Number(cc.bills20) * 20 + Number(cc.bills10) * 10 +
          Number(cc.bills5) * 5 + Number(cc.coins2) * 2 + Number(cc.coins1) * 1 +
          Number(cc.coins050) * 0.5 + Number(cc.coins020) * 0.2 + Number(cc.coins010) * 0.1 +
          Number(cc.coins005) * 0.05 + Number(cc.coins002) * 0.02 + Number(cc.coins001) * 0.01
        return [
          s.name,
          Number(cc.bills500), Number(cc.bills200), Number(cc.bills100),
          Number(cc.bills50), Number(cc.bills20), Number(cc.bills10), Number(cc.bills5),
          Number(cc.coins2), Number(cc.coins1), Number(cc.coins050),
          Number(cc.coins020), Number(cc.coins010), Number(cc.coins005),
          Number(cc.coins002), Number(cc.coins001), total
        ]
      })

      const wsCount = XLSX.utils.aoa_to_sheet([countHeader, ...countRows])
      wsCount['!cols'] = Array(17).fill({ wch: 8 })
      wsCount['!cols'][0] = { wch: 15 }
      XLSX.utils.book_append_sheet(wb, wsCount, 'Conteggio')
    }

    // === FOGLIO 4: SPESE/USCITE ===
    if (closure.expenses.length > 0) {
      const expensesHeader = ['Beneficiario', 'Causale', 'Importo', 'Conto', 'Documento', 'Pagato']
      const expensesRows = closure.expenses.map((e) => [
        e.payee,
        e.description || '',
        Number(e.amount),
        e.account ? `${e.account.code} - ${e.account.name}` : '',
        e.documentRef || '',
        e.isPaid ? 'Sì' : 'No',
      ])

      // Totale spese
      const totalExpenses = closure.expenses.reduce((sum, e) => sum + Number(e.amount), 0)
      expensesRows.push([])
      expensesRows.push(['TOTALE', '', totalExpenses, '', '', ''])

      const wsExpenses = XLSX.utils.aoa_to_sheet([expensesHeader, ...expensesRows])
      wsExpenses['!cols'] = [
        { wch: 20 }, { wch: 25 }, { wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 8 }
      ]
      XLSX.utils.book_append_sheet(wb, wsExpenses, 'Uscite')
    }

    // === FOGLIO 5: PRESENZE ===
    if (closure.attendance.length > 0) {
      const attendanceHeader = ['Dipendente', 'Turno', 'Ore', 'Codice', 'Note']
      const attendanceRows = closure.attendance.map((a) => [
        `${a.user.firstName} ${a.user.lastName}`,
        a.shift,
        a.hours ? Number(a.hours) : '',
        a.statusCode || '',
        a.notes || '',
      ])

      const wsAttendance = XLSX.utils.aoa_to_sheet([attendanceHeader, ...attendanceRows])
      wsAttendance['!cols'] = [
        { wch: 25 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 30 }
      ]
      XLSX.utils.book_append_sheet(wb, wsAttendance, 'Presenze')
    }

    // === FOGLIO 6: PARZIALI ORARI ===
    if (closure.partials.length > 0) {
      const partialsHeader = ['Ora', 'Progressivo Corrispettivo', 'Progressivo POS', 'Contatore Caffè']
      const partialsRows = closure.partials.map((p) => [
        p.timeSlot,
        Number(p.receiptProgressive),
        Number(p.posProgressive),
        p.coffeeCounter || '',
      ])

      const wsPartials = XLSX.utils.aoa_to_sheet([partialsHeader, ...partialsRows])
      wsPartials['!cols'] = [
        { wch: 10 }, { wch: 25 }, { wch: 20 }, { wch: 18 }
      ]
      XLSX.utils.book_append_sheet(wb, wsPartials, 'Parziali')
    }

    // Genera buffer Excel
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    // Nome file
    const dateStr = format(new Date(closure.date), 'yyyy-MM-dd')
    const filename = `chiusura-${closure.venue.code}-${dateStr}.xlsx`

    // Ritorna il file Excel
    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    logger.error('Errore generazione Excel', error)
    return NextResponse.json(
      { error: 'Errore nella generazione del file Excel' },
      { status: 500 }
    )
  }
}
