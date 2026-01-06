// Parser CSV/XLS per estratti conto bancari

import * as XLSX from 'xlsx'
import type { CSVParserConfig, ImportError } from '@/types/reconciliation'

interface ParsedRow {
  transactionDate: Date
  valueDate: Date | null
  description: string
  amount: number
  balance: number | null
  reference: string | null
}

interface ParseResult {
  rows: ParsedRow[]
  errors: ImportError[]
}

/**
 * Configurazione per RelaxBanking (Banca della Marca)
 * Formato: Data contabile | Data valuta | Importo | Descrizione | Note
 */
export const RELAXBANKING_CONFIG: CSVParserConfig = {
  delimiter: ';',
  dateFormat: 'D/M/YY', // Formato flessibile
  decimalSeparator: ',',
  thousandSeparator: '.',
  hasHeader: true,
  columnMapping: {
    transactionDate: 0, // Data contabile
    valueDate: 1, // Data valuta
    amount: 2, // Importo
    description: 3, // Descrizione
    // Note in colonna 4 (non mappata)
  },
}

/**
 * Parsa una data in vari formati italiani
 * Supporta: D/M/YY, DD/MM/YY, D/M/YYYY, DD/MM/YYYY
 */
function parseDate(dateStr: string, _format?: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null

  const cleaned = dateStr.trim()

  // Prova parsing diretto per formato DD/MM/YYYY completo
  const partsSlash = cleaned.split('/')
  if (partsSlash.length === 3) {
    const day = parseInt(partsSlash[0], 10)
    const month = parseInt(partsSlash[1], 10) - 1 // 0-indexed
    let year = parseInt(partsSlash[2], 10)

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null

    // Gestisci anni a 2 cifre
    if (year < 100) {
      // Se l'anno è < 50, assumiamo 20xx, altrimenti 19xx
      year = year < 50 ? 2000 + year : 1900 + year
    }

    const date = new Date(year, month, day)
    if (isNaN(date.getTime())) return null

    return date
  }

  // Prova formato ISO YYYY-MM-DD
  if (cleaned.includes('-')) {
    const date = new Date(cleaned)
    if (!isNaN(date.getTime())) return date
  }

  return null
}

/**
 * Parsa un importo nel formato italiano (1.234,56)
 */
function parseAmount(
  amountStr: string,
  decimalSeparator: string,
  thousandSeparator: string
): number | null {
  if (!amountStr || amountStr.trim() === '') return null

  let cleaned = amountStr.trim()

  // Rimuovi simboli valuta
  cleaned = cleaned.replace(/[€$£]/g, '').trim()

  // Gestisci il separatore delle migliaia
  if (thousandSeparator) {
    cleaned = cleaned.split(thousandSeparator).join('')
  }

  // Sostituisci il separatore decimale con il punto
  if (decimalSeparator !== '.') {
    cleaned = cleaned.replace(decimalSeparator, '.')
  }

  const num = parseFloat(cleaned)
  if (isNaN(num)) return null

  return Math.round(num * 100) / 100 // 2 decimali
}

/**
 * Ottieni il valore di una colonna per indice o nome
 */
function getColumnValue(
  row: string[],
  headers: string[] | null,
  column: string | number
): string {
  if (typeof column === 'number') {
    return row[column] || ''
  }

  if (headers) {
    const idx = headers.findIndex(
      (h) => h.toLowerCase().trim() === column.toLowerCase().trim()
    )
    if (idx >= 0) {
      return row[idx] || ''
    }
  }

  return ''
}

/**
 * Parsa una stringa CSV
 */
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

/**
 * Processa le righe (comune a CSV e XLS)
 */
function processRows(
  data: string[][],
  config: CSVParserConfig
): ParseResult {
  const rows: ParsedRow[] = []
  const errors: ImportError[] = []

  if (data.length === 0) {
    errors.push({
      row: 0,
      field: 'file',
      message: 'Il file è vuoto',
    })
    return { rows, errors }
  }

  let headers: string[] | null = null
  let startRow = 0

  if (config.hasHeader) {
    headers = data[0]
    startRow = 1
  }

  for (let i = startRow; i < data.length; i++) {
    const rowNum = i + 1 // 1-indexed per messaggi errore
    const columns = data[i]

    // Salta righe vuote
    if (!columns || columns.every((c) => !c || c === '')) continue

    // Parse transaction date (obbligatoria)
    const transactionDateStr = getColumnValue(
      columns,
      headers,
      config.columnMapping.transactionDate
    )
    const transactionDate = parseDate(transactionDateStr, config.dateFormat)

    if (!transactionDate) {
      errors.push({
        row: rowNum,
        field: 'transactionDate',
        message: 'Data operazione non valida',
        value: transactionDateStr,
      })
      continue
    }

    // Parse value date (opzionale)
    let valueDate: Date | null = null
    if (config.columnMapping.valueDate !== undefined) {
      const valueDateStr = getColumnValue(
        columns,
        headers,
        config.columnMapping.valueDate
      )
      valueDate = parseDate(valueDateStr, config.dateFormat)
    }

    // Parse description (obbligatoria)
    const description = getColumnValue(
      columns,
      headers,
      config.columnMapping.description
    )

    if (!description) {
      errors.push({
        row: rowNum,
        field: 'description',
        message: 'Descrizione mancante',
      })
      continue
    }

    // Parse amount (obbligatorio)
    const amountStr = getColumnValue(columns, headers, config.columnMapping.amount)
    const amount = parseAmount(
      amountStr,
      config.decimalSeparator,
      config.thousandSeparator
    )

    if (amount === null) {
      errors.push({
        row: rowNum,
        field: 'amount',
        message: 'Importo non valido',
        value: amountStr,
      })
      continue
    }

    // Parse balance (opzionale)
    let balance: number | null = null
    if (config.columnMapping.balance !== undefined) {
      const balanceStr = getColumnValue(
        columns,
        headers,
        config.columnMapping.balance
      )
      balance = parseAmount(
        balanceStr,
        config.decimalSeparator,
        config.thousandSeparator
      )
    }

    // Parse reference (opzionale)
    let reference: string | null = null
    if (config.columnMapping.reference !== undefined) {
      reference = getColumnValue(columns, headers, config.columnMapping.reference)
      if (reference === '') reference = null
    }

    rows.push({
      transactionDate,
      valueDate,
      description,
      amount,
      balance,
      reference,
    })
  }

  return { rows, errors }
}

/**
 * Parsa un file CSV di estratto conto bancario
 */
export function parseCSV(content: string, config: CSVParserConfig): ParseResult {
  // Split per righe (gestisci sia \r\n che \n)
  const lines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => line.trim() !== '')

  const data = lines.map((line) => parseCSVLine(line, config.delimiter))
  return processRows(data, config)
}

/**
 * Parsa un file XLS/XLSX di estratto conto bancario
 */
export function parseXLS(
  buffer: ArrayBuffer,
  config: CSVParserConfig
): ParseResult {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' })

    // Prendi il primo foglio
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) {
      return {
        rows: [],
        errors: [{ row: 0, field: 'file', message: 'Il file non contiene fogli' }],
      }
    }

    const sheet = workbook.Sheets[firstSheetName]

    // Converti in array di array
    const data: string[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false, // Ottieni stringhe formattate
      defval: '', // Valore default per celle vuote
    })

    return processRows(data, config)
  } catch (error) {
    console.error('XLS parse error:', error)
    return {
      rows: [],
      errors: [
        {
          row: 0,
          field: 'file',
          message: `Errore nel parsing del file: ${error instanceof Error ? error.message : 'errore sconosciuto'}`,
        },
      ],
    }
  }
}

/**
 * Alias per retrocompatibilità
 */
export const parseXLSX = parseXLS

// =============================================================================
// CBI XML PARSER (ISO 20022 CAMT.053)
// =============================================================================

/**
 * Parsa un file CBI XML (ISO 20022 CAMT.053) di estratto conto bancario
 * Formato usato da molte banche italiane per export movimenti
 */
export function parseCBIXML(content: string): ParseResult {
  const rows: ParsedRow[] = []
  const errors: ImportError[] = []

  try {
    // Rimuovi BOM se presente
    const cleanContent = content.replace(/^\uFEFF/, '')

    // Estrai tutti gli elementi Ntry (transaction entries)
    // Usa regex per gestire diversi namespace (ns5, camt, etc.)
    const entryRegex = /<(?:\w+:)?Ntry>([\s\S]*?)<\/(?:\w+:)?Ntry>/gi
    const entries = cleanContent.match(entryRegex) || []

    if (entries.length === 0) {
      errors.push({
        row: 0,
        field: 'file',
        message: 'Nessuna transazione trovata nel file XML',
      })
      return { rows, errors }
    }

    entries.forEach((entry, index) => {
      const rowNum = index + 1

      try {
        // Estrai importo
        const amountMatch = entry.match(/<(?:\w+:)?Amt[^>]*>([^<]+)</)
        if (!amountMatch) {
          errors.push({
            row: rowNum,
            field: 'amount',
            message: 'Importo non trovato',
          })
          return
        }
        let amount = parseFloat(amountMatch[1].replace(',', '.'))

        // Estrai indicatore credito/debito
        const cdIndicatorMatch = entry.match(/<(?:\w+:)?CdtDbtInd>([^<]+)</)
        if (cdIndicatorMatch) {
          const indicator = cdIndicatorMatch[1].toUpperCase()
          // DBIT = Debito (uscita), CRDT = Credito (entrata)
          if (indicator === 'DBIT') {
            amount = -Math.abs(amount)
          } else {
            amount = Math.abs(amount)
          }
        }

        // Estrai data contabile (BookgDt)
        const bookingDateMatch = entry.match(
          /<(?:\w+:)?BookgDt>[\s\S]*?<(?:\w+:)?Dt>([^<]+)</
        )
        if (!bookingDateMatch) {
          errors.push({
            row: rowNum,
            field: 'transactionDate',
            message: 'Data contabile non trovata',
          })
          return
        }
        // Formato: 2026-01-05+01:00 o 2026-01-05
        const transactionDateStr = bookingDateMatch[1].split('+')[0].split('T')[0]
        const transactionDate = new Date(transactionDateStr)
        if (isNaN(transactionDate.getTime())) {
          errors.push({
            row: rowNum,
            field: 'transactionDate',
            message: 'Data contabile non valida',
            value: bookingDateMatch[1],
          })
          return
        }

        // Estrai data valuta (ValDt) - opzionale
        let valueDate: Date | null = null
        const valueDateMatch = entry.match(
          /<(?:\w+:)?ValDt>[\s\S]*?<(?:\w+:)?Dt>([^<]+)</
        )
        if (valueDateMatch) {
          const valueDateStr = valueDateMatch[1].split('+')[0].split('T')[0]
          valueDate = new Date(valueDateStr)
          if (isNaN(valueDate.getTime())) {
            valueDate = null
          }
        }

        // Estrai descrizione - prova diversi campi
        let description = ''

        // Prima prova AddtlTxInf (informazioni aggiuntive transazione)
        const addtlTxInfMatch = entry.match(/<(?:\w+:)?AddtlTxInf>([^<]+)</)
        if (addtlTxInfMatch) {
          description = addtlTxInfMatch[1].trim()
        }

        // Se vuota, prova AddtlNtryInf
        if (!description) {
          const addtlNtryInfMatch = entry.match(/<(?:\w+:)?AddtlNtryInf>([^<]+)</)
          if (addtlNtryInfMatch) {
            description = addtlNtryInfMatch[1].trim()
          }
        }

        // Se ancora vuota, prova Ustrd (non strutturato)
        if (!description) {
          const ustrdMatch = entry.match(/<(?:\w+:)?Ustrd>([^<]+)</)
          if (ustrdMatch) {
            description = ustrdMatch[1].trim()
          }
        }

        // Se ancora vuota, usa un placeholder
        if (!description) {
          description = 'Movimento bancario'
        }

        // Estrai saldo dopo operazione (opzionale)
        let balance: number | null = null
        // In CAMT.053, il saldo potrebbe essere in un elemento separato, non per ogni entry
        // Lo lasciamo null per ora

        // Estrai riferimento (AcctSvcrRef o NtryRef)
        let reference: string | null = null
        const refMatch = entry.match(/<(?:\w+:)?AcctSvcrRef>([^<]+)</) ||
          entry.match(/<(?:\w+:)?NtryRef>([^<]+)</)
        if (refMatch) {
          reference = refMatch[1].trim()
        }

        rows.push({
          transactionDate,
          valueDate,
          description,
          amount: Math.round(amount * 100) / 100,
          balance,
          reference,
        })
      } catch (err) {
        errors.push({
          row: rowNum,
          field: 'parsing',
          message: `Errore parsing entry: ${err instanceof Error ? err.message : 'errore sconosciuto'}`,
        })
      }
    })

    return { rows, errors }
  } catch (error) {
    console.error('CBI XML parse error:', error)
    return {
      rows: [],
      errors: [
        {
          row: 0,
          field: 'file',
          message: `Errore nel parsing del file XML: ${error instanceof Error ? error.message : 'errore sconosciuto'}`,
        },
      ],
    }
  }
}

// =============================================================================
// CBI TXT PARSER (Formato CBI a posizioni fisse)
// =============================================================================

/**
 * Parsa un file CBI TXT (formato a posizioni fisse)
 * Formato legacy usato dalle banche italiane
 *
 * Record 62: Movimento
 * - Pos 0-1: Tipo record "62"
 * - Pos 2-9: Identificativo
 * - Pos 9-15: Data valuta DDMMYY
 * - Pos 15-21: Data contabile DDMMYY
 * - Pos 21: Segno C/D (C=Credito, D=Debito)
 * - Pos 22-35: Importo (13 cifre + 2 decimali, virgola come separatore)
 * - Pos 35-39: Codice CBI
 * - Pos 39+: Descrizione (primi caratteri)
 *
 * Record 63: Continuazione descrizione
 * - Pos 0-1: Tipo record "63"
 * - Pos 2+: Testo descrizione
 */
export function parseCBITXT(content: string): ParseResult {
  const rows: ParsedRow[] = []
  const errors: ImportError[] = []

  try {
    // Normalizza line endings e split
    // IMPORTANTE: trim ogni linea perché il formato CBI può avere spazi iniziali
    const lines = content
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((line) => line.trimStart()) // Rimuovi spazi iniziali
      .filter((line) => line.trim() !== '')

    if (lines.length === 0) {
      errors.push({
        row: 0,
        field: 'file',
        message: 'Il file è vuoto',
      })
      return { rows, errors }
    }

    let currentTransaction: {
      transactionDate: Date | null
      valueDate: Date | null
      description: string
      amount: number | null
      sign: string
    } | null = null
    let rowNum = 0

    for (const line of lines) {
      rowNum++
      const recordType = line.substring(0, 2)

      if (recordType === '62') {
        // Salva transazione precedente se presente
        if (currentTransaction && currentTransaction.transactionDate && currentTransaction.amount !== null) {
          rows.push({
            transactionDate: currentTransaction.transactionDate,
            valueDate: currentTransaction.valueDate,
            description: currentTransaction.description.trim() || 'Movimento bancario',
            amount: currentTransaction.sign === 'D'
              ? -Math.abs(currentTransaction.amount)
              : Math.abs(currentTransaction.amount),
            balance: null,
            reference: null,
          })
        }

        // Parsa nuova transazione
        // Formato CBI RelaxBanking (Banca della Marca):
        // Pos 0-1: "62" (record type)
        // Pos 2-8: account sequence (7 chars)
        // Pos 9-11: line number (3 chars)
        // Pos 12-17: value date DDMMYY (6 chars)
        // Pos 18-23: booking date DDMMYY (6 chars)
        // Pos 24: sign C/D
        // Pos 25-40: amount with comma (15 chars)
        try {
          // Data valuta (DDMMYY) - posizione 12-18
          const valueDateStr = line.substring(12, 18)
          let valueDate: Date | null = null
          if (valueDateStr && valueDateStr.length === 6) {
            const vDay = parseInt(valueDateStr.substring(0, 2), 10)
            const vMonth = parseInt(valueDateStr.substring(2, 4), 10) - 1
            let vYear = parseInt(valueDateStr.substring(4, 6), 10)
            vYear = vYear < 50 ? 2000 + vYear : 1900 + vYear
            valueDate = new Date(vYear, vMonth, vDay)
            if (isNaN(valueDate.getTime())) valueDate = null
          }

          // Data contabile (DDMMYY) - posizione 18-24
          const bookingDateStr = line.substring(18, 24)
          let transactionDate: Date | null = null
          if (bookingDateStr && bookingDateStr.length === 6) {
            const bDay = parseInt(bookingDateStr.substring(0, 2), 10)
            const bMonth = parseInt(bookingDateStr.substring(2, 4), 10) - 1
            let bYear = parseInt(bookingDateStr.substring(4, 6), 10)
            bYear = bYear < 50 ? 2000 + bYear : 1900 + bYear
            transactionDate = new Date(bYear, bMonth, bDay)
            if (isNaN(transactionDate.getTime())) {
              errors.push({
                row: rowNum,
                field: 'transactionDate',
                message: 'Data contabile non valida',
                value: bookingDateStr,
              })
              currentTransaction = null
              continue
            }
          } else {
            errors.push({
              row: rowNum,
              field: 'transactionDate',
              message: 'Data contabile mancante',
            })
            currentTransaction = null
            continue
          }

          // Segno C/D - posizione 24
          const sign = line.charAt(24).toUpperCase()

          // Importo - posizione 25-40 (formato: 000000000033,86)
          const amountStr = line.substring(25, 40)
          let amount: number | null = null
          if (amountStr) {
            // Rimuovi zeri iniziali e converti
            // Il formato è: 13 cifre dove le ultime 2 sono decimali
            const cleanAmount = amountStr.replace(/^0+/, '') || '0'
            // Se contiene virgola, usala come decimale
            if (cleanAmount.includes(',')) {
              amount = parseFloat(cleanAmount.replace(',', '.'))
            } else {
              // Altrimenti, le ultime 2 cifre sono decimali
              const intPart = cleanAmount.slice(0, -2) || '0'
              const decPart = cleanAmount.slice(-2)
              amount = parseFloat(`${intPart}.${decPart}`)
            }
            if (isNaN(amount)) amount = null
          }

          if (amount === null) {
            errors.push({
              row: rowNum,
              field: 'amount',
              message: 'Importo non valido',
              value: amountStr,
            })
            currentTransaction = null
            continue
          }

          // Descrizione iniziale (dal carattere 88 in poi, dopo CBI code e riferimenti)
          // Se non c'è descrizione qui, verrà aggiunta dai record 63
          const description = line.length > 88 ? line.substring(88).trim() : ''

          currentTransaction = {
            transactionDate,
            valueDate,
            description,
            amount,
            sign,
          }
        } catch (err) {
          errors.push({
            row: rowNum,
            field: 'parsing',
            message: `Errore parsing record 62: ${err instanceof Error ? err.message : 'errore sconosciuto'}`,
          })
          currentTransaction = null
        }
      } else if (recordType === '63' && currentTransaction) {
        // Continuazione descrizione
        // Formato: 63 + account seq (7) + line num (3) + descrizione (da pos 12)
        const continuationText = line.length > 12 ? line.substring(12).trim() : line.substring(2).trim()
        if (continuationText) {
          currentTransaction.description += ' ' + continuationText
        }
      }
      // Ignora altri tipi di record (EF, RH, etc.)
    }

    // Non dimenticare l'ultima transazione
    if (currentTransaction && currentTransaction.transactionDate && currentTransaction.amount !== null) {
      rows.push({
        transactionDate: currentTransaction.transactionDate,
        valueDate: currentTransaction.valueDate,
        description: currentTransaction.description.trim() || 'Movimento bancario',
        amount: currentTransaction.sign === 'D'
          ? -Math.abs(currentTransaction.amount)
          : Math.abs(currentTransaction.amount),
        balance: null,
        reference: null,
      })
    }

    return { rows, errors }
  } catch (error) {
    console.error('CBI TXT parse error:', error)
    return {
      rows: [],
      errors: [
        {
          row: 0,
          field: 'file',
          message: `Errore nel parsing del file TXT: ${error instanceof Error ? error.message : 'errore sconosciuto'}`,
        },
      ],
    }
  }
}
