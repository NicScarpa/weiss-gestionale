import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseFatturaPASafe, calcolaImporti, estraiScadenze, estraiDatiEstesi } from '@/lib/sdi/parser'
import type { ParseWarning } from '@/lib/sdi/types'
import { matchSupplier, createSupplierFromData, type SuggestedSupplierData } from '@/lib/sdi/matcher'
import { trackPricesFromInvoice } from '@/lib/price-tracking'
import {
  risolviContoDaRegole,
  tipoDocumentoDaCodiceSdi,
  tipoPagamentoDaCodiceSdi,
} from '@/lib/schedule-rules/engine'
import { ScheduleRuleDirection } from '@/types/schedule'
import { Prisma, InvoiceStatus } from '@prisma/client'
import { z } from 'zod'
import { getVenueId } from '@/lib/venue'
import { createAuditLog } from '@/lib/audit'

import { logger } from '@/lib/logger'
import { generateSchedulesFromInvoice } from '@/lib/services/invoice-schedule-service'
// Schema validazione import
const importInvoiceSchema = z.object({
  xmlContent: z.string().min(100, 'Contenuto XML non valido'),
  fileName: z.string().optional(),
  venueId: z.string().min(1, 'Sede richiesta'),
  // Dati fornitore (per conferma/creazione)
  createSupplier: z.boolean().default(false),
  supplierData: z
    .object({
      name: z.string(),
      vatNumber: z.string().nullable(),
      fiscalCode: z.string().nullable(),
      address: z.string().nullable(),
      city: z.string().nullable(),
      province: z.string().nullable(),
      postalCode: z.string().nullable(),
    })
    .optional(),
  supplierId: z.string().optional(),
  // Categorizzazione opzionale
  accountId: z.string().optional(),
})

// GET /api/invoices - Lista fatture
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono vedere le fatture
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    const status = searchParams.get('status') as InvoiceStatus | null
    const supplierId = searchParams.get('supplierId')
    const fromDate = searchParams.get('from')
    const toDate = searchParams.get('to')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    // Nuovi parametri per ricerca, filtro anno/mese, tipo documento e ordinamento
    const search = searchParams.get('search')
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    const lastMonths = searchParams.get('lastMonths')
    const documentType = searchParams.get('documentType')
    const sortBy = searchParams.get('sortBy') || 'invoiceDate'
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc'

    // Costruisci filtri
    const where: Prisma.ElectronicInvoiceWhereInput = {}

    // Single-venue mode: filter by venue
    const resolvedVenueId = await getVenueId()
    where.venueId = resolvedVenueId

    if (status) {
      where.status = status
    }

    if (supplierId) {
      where.supplierId = supplierId
    }

    // Filtro per tipo documento
    if (documentType) {
      where.documentType = documentType
    }

    // Ricerca globale su nome fornitore, numero fattura e P.IVA
    if (search && search.length >= 2) {
      where.OR = [
        { supplierName: { contains: search, mode: 'insensitive' } },
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { supplierVat: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Filtro per ultimi N mesi (ha priorità)
    if (lastMonths) {
      const monthsNum = parseInt(lastMonths)
      const now = new Date()
      const startDate = new Date(now.getFullYear(), now.getMonth() - monthsNum + 1, 1)
      where.invoiceDate = {
        gte: startDate,
      }
    }
    // Filtro per anno e mese (priorità su from/to)
    else if (year && year !== 'all') {
      const yearNum = parseInt(year)
      if (month && month !== 'all') {
        const monthNum = parseInt(month)
        // Filtro per anno e mese specifico
        const startDate = new Date(yearNum, monthNum - 1, 1)
        const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999)
        where.invoiceDate = {
          gte: startDate,
          lte: endDate,
        }
      } else {
        // Solo anno
        const startDate = new Date(yearNum, 0, 1)
        const endDate = new Date(yearNum, 11, 31, 23, 59, 59, 999)
        where.invoiceDate = {
          gte: startDate,
          lte: endDate,
        }
      }
    } else if (fromDate || toDate) {
      // Fallback ai filtri from/to esistenti
      where.invoiceDate = {}
      if (fromDate) {
        where.invoiceDate.gte = new Date(fromDate)
      }
      if (toDate) {
        where.invoiceDate.lte = new Date(toDate)
      }
    }

    // Costruisci ordinamento dinamico
    const validSortFields = ['documentType', 'invoiceDate', 'invoiceNumber', 'supplierName', 'totalAmount', 'status', 'importedAt']
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'invoiceDate'
    const orderBy: Prisma.ElectronicInvoiceOrderByWithRelationInput[] = [
      { [sortField]: sortOrder },
    ]
    // Aggiungi ordinamento secondario se non è già invoiceDate
    if (sortField !== 'invoiceDate') {
      orderBy.push({ invoiceDate: 'desc' })
    }

    // Query con paginazione
    const [invoices, total] = await Promise.all([
      prisma.electronicInvoice.findMany({
        where,
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          supplierVat: true,
          supplierName: true,
          totalAmount: true,
          vatAmount: true,
          netAmount: true,
          status: true,
          fileName: true,
          importedAt: true,
          // Nuovi campi (PRD Phase 1)
          documentType: true,
          lineItems: true,
          references: true,
          vatSummary: true,
          causale: true,
          // Relazioni
          supplier: {
            select: {
              id: true,
              name: true,
              vatNumber: true,
            },
          },
          account: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          venue: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          deadlines: {
            orderBy: { dueDate: 'asc' },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.electronicInvoice.count({ where }),
    ])

    return NextResponse.json({
      data: invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        search,
        year,
        month,
        documentType,
        sortBy: sortField,
        sortOrder,
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/invoices', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle fatture' },
      { status: 500 }
    )
  }
}

// POST /api/invoices - Import fattura XML
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono importare fatture
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = importInvoiceSchema.parse(body)

    // Override venueId with single-venue value
    validatedData.venueId = await getVenueId()

    // Parse XML con error handling strutturato
    const parseResult = parseFatturaPASafe(validatedData.xmlContent, validatedData.fileName)

    if (!parseResult.success || !parseResult.data) {
      // Restituisci errori strutturati
      const errorMessages = parseResult.errors
        .map(e => `[${e.code}] ${e.field}: ${e.message}`)
        .join('; ')
      return NextResponse.json(
        {
          error: `Errore nel parsing della fattura: ${errorMessages}`,
          parseErrors: parseResult.errors,
        },
        { status: 400 }
      )
    }

    const fattura = parseResult.data
    const parseWarnings: ParseWarning[] = parseResult.warnings

    // Verifica se la fattura esiste già
    // Usa varianti P.IVA per retrocompatibilità con dati esistenti non normalizzati
    const normalizedSupplierVat = fattura.cedentePrestatore.partitaIva
    const vatWithoutLeadingZeros = normalizedSupplierVat.replace(/^0+/, '')

    const existingInvoice = await prisma.electronicInvoice.findFirst({
      where: {
        invoiceNumber: fattura.numero,
        invoiceDate: new Date(fattura.data),
        OR: [
          // Match esatto con P.IVA normalizzata (nuove fatture)
          { supplierVat: normalizedSupplierVat },
          // Match senza zeri iniziali (fatture pre-fix)
          { supplierVat: vatWithoutLeadingZeros },
        ],
      },
    })

    if (existingInvoice) {
      return NextResponse.json(
        {
          error: 'Fattura già importata',
          existingId: existingInvoice.id,
        },
        { status: 409 }
      )
    }

    // Gestione fornitore
    let supplierId: string | null = null
    let supplierNameForInvoice = fattura.cedentePrestatore.denominazione // Default name from XML
    let status: InvoiceStatus = 'IMPORTED'

    if (validatedData.supplierId) {
      // Fornitore specificato dall'utente
      const supplier = await prisma.supplier.findUnique({
        where: { id: validatedData.supplierId },
      })
      if (supplier) {
        supplierId = supplier.id
        supplierNameForInvoice = supplier.name // Use DB name
        status = 'MATCHED'
      }
    } else if (validatedData.createSupplier && validatedData.supplierData) {
      // Crea nuovo fornitore
      const newSupplier = await createSupplierFromData(validatedData.supplierData as SuggestedSupplierData)
      supplierId = newSupplier.id
      supplierNameForInvoice = newSupplier.name // Use new supplier name
      status = 'MATCHED'
    } else {
      // Cerca match automatico
      const match = await matchSupplier(fattura)
      if (match.matched && match.supplier) {
        supplierId = match.supplier.id
        supplierNameForInvoice = match.supplier.name // Use matched DB name
        status = 'MATCHED'
      }
    }

    // Categorizzazione: la scelta dell'utente ha sempre la precedenza sulle regole
    let accountId: string | null = validatedData.accountId || null
    let regolaApplicata: { ruleId: string; azione: string } | null = null

    if (accountId) {
      // Verifica che il conto esista
      const account = await prisma.account.findUnique({
        where: { id: accountId },
      })
      if (account) {
        status = 'CATEGORIZED'
      }
    } else {
      // Nessun conto indicato: decidono le regole dello scadenzario.
      // Le fatture elettroniche importate qui sono documenti ricevuti
      // (il cedente/prestatore è il fornitore).
      const direzione = ScheduleRuleDirection.RICEVUTI
      // Con più rate si usa la modalità della prima: le regole ragionano sul
      // documento, non sulla singola scadenza.
      const modalitaPagamento = fattura.datiPagamento?.dettagliPagamento?.[0]?.modalitaPagamento

      const contoDaRegola = await risolviContoDaRegole({
        venueId: validatedData.venueId,
        direzione,
        tipoDocumento: tipoDocumentoDaCodiceSdi(fattura.tipoDocumento, direzione),
        tipoPagamento: tipoPagamentoDaCodiceSdi(modalitaPagamento),
      })

      if (contoDaRegola) {
        accountId = contoDaRegola.contoId
        status = 'CATEGORIZED'
        regolaApplicata = { ruleId: contoDaRegola.ruleId, azione: contoDaRegola.azione }
        logger.info('Conto assegnato da regola scadenzario', {
          invoiceNumber: fattura.numero,
          ruleId: contoDaRegola.ruleId,
          contoId: contoDaRegola.contoId,
          azione: contoDaRegola.azione,
        })
      }
    }

    // Calcola importi
    const importi = calcolaImporti(fattura)

    // Estrai scadenze usando i termini di pagamento del fornitore, se noti:
    // senza, la stima ricade sul termine ordinario di 30 giorni
    const terminiFornitore = supplierId
      ? (
          await prisma.supplier.findUnique({
            where: { id: supplierId },
            select: { paymentTermsDays: true },
          })
        )?.paymentTermsDays ?? undefined
      : undefined

    const scadenze = estraiScadenze(fattura, {
      giorniPagamento: terminiFornitore ?? undefined,
    })

    // Estrai IBAN dai dati pagamento (se disponibile)
    const extractIban = (index: number): string | null => {
      const dettagli = fattura.datiPagamento?.dettagliPagamento
      if (dettagli && dettagli[index]) {
        return dettagli[index].iban || null
      }
      return null
    }

    // Estrai dati estesi per salvataggio JSON
    let datiEstesi
    try {
      datiEstesi = estraiDatiEstesi(validatedData.xmlContent)
    } catch (extendedError) {
      logger.warn('Errore estrazione dati estesi', { error: extendedError })
      // Non blocchiamo l'import se l'estrazione estesa fallisce
      datiEstesi = null
    }

    // Crea la fattura con le scadenze
    const invoice = await prisma.electronicInvoice.create({
      data: {
        invoiceNumber: fattura.numero,
        invoiceDate: new Date(fattura.data),
        supplierVat: fattura.cedentePrestatore.partitaIva,
        supplierName: supplierNameForInvoice, // Use normalized name
        totalAmount: new Prisma.Decimal(importi.totalAmount.toFixed(2)),
        vatAmount: new Prisma.Decimal(importi.vatAmount.toFixed(2)),
        netAmount: new Prisma.Decimal(importi.netAmount.toFixed(2)),
        status,
        supplierId,
        accountId,
        xmlContent: validatedData.xmlContent,
        fileName: validatedData.fileName || null,
        venueId: validatedData.venueId,
        createdBy: session.user.id,
        // Nuovi campi estesi (Phase 1 PRD)
        documentType: datiEstesi?.documentType || fattura.tipoDocumento || 'TD01',
        lineItems: (datiEstesi?.lineItems ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue,
        references: (datiEstesi?.references ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue,
        vatSummary: (datiEstesi?.vatSummary ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue,
        causale: datiEstesi?.causale || null,
        deadlines: {
          create: scadenze.map((s, index) => ({
            dueDate: s.dueDate,
            amount: new Prisma.Decimal(s.amount.toFixed(2)),
            paymentMethod: s.paymentMethod,
            iban: extractIban(index),
          })),
        },
      },
      include: {
        supplier: true,
        account: true,
        venue: true,
        deadlines: true,
      },
    })

    // Porta le rate della fattura nello scadenzario: senza questo passaggio
    // resterebbero dentro il documento e non comparirebbero nel calendario,
    // nel saldo scalare o nell'aging.
    let schedulesResult: { created: number; skipped: number } | null = null
    try {
      schedulesResult = await generateSchedulesFromInvoice(
        {
          id: invoice.id,
          venueId: invoice.venueId,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          documentType: invoice.documentType,
          supplierId: invoice.supplierId,
          supplierName: invoice.supplierName,
          deadlines: invoice.deadlines.map((d) => ({
            id: d.id,
            dueDate: d.dueDate,
            amount: d.amount,
            paymentMethod: d.paymentMethod,
            // InvoiceDeadline non ha una colonna per la stima: la nota si
            // recupera dalle rate appena estratte, correlate per data e importo
            notaStima: scadenze.find(
              (s) =>
                s.dueDate.getTime() === d.dueDate.getTime() &&
                Math.abs(s.amount - Number(d.amount)) < 0.01
            )?.notaStima,
          })),
        },
        session.user.id
      )
    } catch (scheduleError) {
      // La fattura è già stata importata: un errore qui non deve annullarla,
      // ma va segnalato perché lo scadenzario resta incompleto.
      logger.error('Errore generazione scadenze da fattura', scheduleError, {
        invoiceId: invoice.id,
      })
    }

    // Traccia l'automatismo: il conto non è stato scelto da chi ha importato
    if (regolaApplicata) {
      await createAuditLog({
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'ElectronicInvoice',
        entityId: invoice.id,
        venueId: validatedData.venueId,
        newValues: {
          accountId,
          appliedScheduleRuleId: regolaApplicata.ruleId,
          azione: regolaApplicata.azione,
          origine: 'regola_scadenzario',
        },
      })
    }

    // Track prezzi articoli dalla fattura (se c'è un fornitore associato)
    let priceTrackingResult = null
    if (supplierId && fattura.dettaglioLinee.length > 0) {
      try {
        priceTrackingResult = await trackPricesFromInvoice({
          venueId: validatedData.venueId,
          supplierId,
          invoiceId: invoice.id,
          invoiceNumber: fattura.numero,
          invoiceDate: new Date(fattura.data),
          lineItems: fattura.dettaglioLinee.map((line) => ({
            description: line.descrizione,
            code: null, // FatturaPA non ha sempre un codice articolo
            quantity: line.quantita || 1,
            unitPrice: line.prezzoUnitario,
            totalPrice: line.prezzoTotale,
            unit: line.unitaMisura || null,
          })),
        })
      } catch (priceError) {
        logger.error('Errore tracking prezzi', priceError)
        // Non blocchiamo l'import se il tracking fallisce
      }
    }

    return NextResponse.json(
      {
        ...invoice,
        priceTracking: priceTrackingResult,
        scadenzeGenerate: schedulesResult?.created ?? 0,
        // Warning dal parsing (tipo documento non riconosciuto, P.IVA non standard, etc.)
        parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined,
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/invoices', error)
    return NextResponse.json(
      { error: 'Errore nell\'importazione della fattura' },
      { status: 500 }
    )
  }
}
