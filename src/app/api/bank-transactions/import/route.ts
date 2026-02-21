import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseCSV, parseXLS, parseCBIXML, parseCBITXT, RELAXBANKING_CONFIG } from '@/lib/reconciliation'
import { importBatchSchema } from '@/lib/validations/reconciliation'
import type { ImportResult, CSVParserConfig, ImportSource } from '@/types/reconciliation'
import { getVenueId } from '@/lib/venue'

import { logger } from '@/lib/logger'
// POST /api/bank-transactions/import - Import CSV/XLS
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const venueId = await getVenueId()
    const configJson = formData.get('config') as string | null

    if (!file) {
      return NextResponse.json(
        { error: 'Nessun file caricato' },
        { status: 400 }
      )
    }

    // Determina tipo file
    const fileName = file.name.toLowerCase()
    const isXLS = fileName.endsWith('.xls') || fileName.endsWith('.xlsx')
    const isCSV = fileName.endsWith('.csv')
    const isXML = fileName.endsWith('.xml')
    const isTXT = fileName.endsWith('.txt')

    if (!isXLS && !isCSV && !isXML && !isTXT) {
      return NextResponse.json(
        { error: 'Formato file non supportato. Usa CSV, XLS, XLSX, XML o TXT.' },
        { status: 400 }
      )
    }

    // Determina source type
    let sourceType: ImportSource
    if (isXLS) {
      sourceType = 'XLSX'
    } else if (isXML) {
      sourceType = 'CBI_XML'
    } else if (isTXT) {
      sourceType = 'CBI_TXT'
    } else {
      sourceType = 'CSV'
    }

    // Validazione parametri
    const params = importBatchSchema.parse({
      venueId,
      source: sourceType,
      config: configJson ? JSON.parse(configJson) : undefined,
    })

    // Usa configurazione custom o default RelaxBanking
    const config: CSVParserConfig = (params.config || RELAXBANKING_CONFIG) as CSVParserConfig

    // Parsa il file
    let rows: Array<{
      transactionDate: Date
      valueDate: Date | null
      description: string
      amount: number
      balance: number | null
      reference: string | null
    }> = []
    let errors: Array<{ row: number; field: string; message: string; value?: string }> = []

    if (isXLS) {
      // Parsa XLS/XLSX
      const buffer = await file.arrayBuffer()
      const result = parseXLS(buffer, config)
      rows = result.rows
      errors = result.errors
    } else if (isXML) {
      // Parsa CBI XML (ISO 20022 CAMT.053)
      const content = await file.text()
      const result = parseCBIXML(content)
      rows = result.rows
      errors = result.errors
    } else if (isTXT) {
      // Parsa CBI TXT (formato a posizioni fisse)
      const content = await file.text()
      const result = parseCBITXT(content)
      rows = result.rows
      errors = result.errors
    } else {
      // Parsa CSV
      const content = await file.text()
      const result = parseCSV(content, config)
      rows = result.rows
      errors = result.errors
    }

    if (rows.length === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          error: 'Nessuna transazione valida trovata',
          errors,
        },
        { status: 400 }
      )
    }

    // Crea batch di import
    const batch = await prisma.importBatch.create({
      data: {
        venueId,
        filename: file.name,
        source: sourceType,
        recordCount: 0, // Aggiornato dopo
        duplicatesSkipped: 0,
        errorsCount: errors.length,
        importedBy: session.user.id,
      },
    })

    let recordsImported = 0
    let duplicatesSkipped = 0

    // Importa ogni riga
    for (const row of rows) {
      // Genera un riferimento univoco basato su data + importo + descrizione
      const bankReference = `${row.transactionDate.toISOString().slice(0, 10)}_${row.amount}_${row.description.slice(0, 50)}`
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 100)

      // Controlla duplicati
      const existing = await prisma.bankTransaction.findFirst({
        where: {
          venueId,
          transactionDate: row.transactionDate,
          amount: row.amount,
          description: row.description,
        },
      })

      if (existing) {
        duplicatesSkipped++
        continue
      }

      // Crea transazione
      await prisma.bankTransaction.create({
        data: {
          venueId,
          transactionDate: row.transactionDate,
          valueDate: row.valueDate,
          description: row.description,
          amount: row.amount,
          balanceAfter: row.balance,
          bankReference: row.reference || bankReference,
          importBatchId: batch.id,
          importSource: sourceType,
          status: 'PENDING',
        },
      })

      recordsImported++
    }

    // Aggiorna batch con conteggi finali
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        recordCount: recordsImported,
        duplicatesSkipped,
      },
    })

    const result: ImportResult = {
      batchId: batch.id,
      recordsImported,
      duplicatesSkipped,
      errors,
    }

    return NextResponse.json(result)
  } catch (error) {
    logger.error('POST /api/bank-transactions/import error', error)
    return NextResponse.json(
      { error: 'Errore nell\'import del file' },
      { status: 500 }
    )
  }
}
