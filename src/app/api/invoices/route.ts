import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseFatturaPASafe, calcolaImporti, estraiScadenze, estraiDatiEstesi } from '@/lib/sdi/parser'
import type { ParseWarning } from '@/lib/sdi/types'
import { matchSupplier, createSupplierFromData } from '@/lib/sdi/matcher'
import { trackPricesFromInvoice } from '@/lib/price-tracking'
import { Prisma, InvoiceStatus } from '@prisma/client'
import { z } from 'zod'

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

    // Manager vede solo fatture della propria sede
    if (session.user.role === 'manager') {
      where.venueId = session.user.venueId || undefined
    } else if (venueId) {
      where.venueId = venueId
    }

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
    console.error('Errore GET /api/invoices:', error)
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

    // Manager può importare solo per la propria sede
    if (
      session.user.role === 'manager' &&
      validatedData.venueId !== session.user.venueId
    ) {
      return NextResponse.json(
        { error: 'Non autorizzato per questa sede' },
        { status: 403 }
      )
    }

    // Verifica che la sede esista
    const venue = await prisma.venue.findUnique({
      where: { id: validatedData.venueId },
    })
    if (!venue) {
      return NextResponse.json({ error: 'Sede non trovata' }, { status: 404 })
    }

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
      const newSupplier = await createSupplierFromData(validatedData.supplierData)
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

    // Se c'è un accountId, status diventa CATEGORIZED
    if (validatedData.accountId) {
      // Verifica che il conto esista
      const account = await prisma.account.findUnique({
        where: { id: validatedData.accountId },
      })
      if (account) {
        status = 'CATEGORIZED'
      }
    }

    // Calcola importi
    const importi = calcolaImporti(fattura)

    // Estrai scadenze
    const scadenze = estraiScadenze(fattura)

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
      console.warn('Errore estrazione dati estesi:', extendedError)
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
        accountId: validatedData.accountId || null,
        xmlContent: validatedData.xmlContent,
        fileName: validatedData.fileName || null,
        venueId: validatedData.venueId,
        createdBy: session.user.id,
        // Nuovi campi estesi (Phase 1 PRD)
        documentType: datiEstesi?.documentType || fattura.tipoDocumento || 'TD01',
        lineItems: (datiEstesi?.lineItems ?? Prisma.DbNull) as any,
        references: (datiEstesi?.references ?? Prisma.DbNull) as any,
        vatSummary: (datiEstesi?.vatSummary ?? Prisma.DbNull) as any,
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
        console.error('Errore tracking prezzi:', priceError)
        // Non blocchiamo l'import se il tracking fallisce
      }
    }

    return NextResponse.json(
      {
        ...invoice,
        priceTracking: priceTrackingResult,
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

    console.error('Errore POST /api/invoices:', error)
    return NextResponse.json(
      { error: 'Errore nell\'importazione della fattura' },
      { status: 500 }
    )
  }
}
