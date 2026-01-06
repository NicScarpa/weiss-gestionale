import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseFatturaPA, calcolaImporti, estraiScadenze } from '@/lib/sdi/parser'
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

    if (fromDate || toDate) {
      where.invoiceDate = {}
      if (fromDate) {
        where.invoiceDate.gte = new Date(fromDate)
      }
      if (toDate) {
        where.invoiceDate.lte = new Date(toDate)
      }
    }

    // Query con paginazione
    const [invoices, total] = await Promise.all([
      prisma.electronicInvoice.findMany({
        where,
        include: {
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
        orderBy: [{ invoiceDate: 'desc' }, { importedAt: 'desc' }],
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

    // Parse XML
    let fattura
    try {
      fattura = parseFatturaPA(validatedData.xmlContent, validatedData.fileName)
    } catch (parseError) {
      const message =
        parseError instanceof Error ? parseError.message : 'Errore parsing XML'
      return NextResponse.json(
        { error: `Errore nel parsing della fattura: ${message}` },
        { status: 400 }
      )
    }

    // Verifica se la fattura esiste già
    const existingInvoice = await prisma.electronicInvoice.findFirst({
      where: {
        invoiceNumber: fattura.numero,
        supplierVat: fattura.cedentePrestatore.partitaIva,
        invoiceDate: new Date(fattura.data),
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
    let status: InvoiceStatus = 'IMPORTED'

    if (validatedData.supplierId) {
      // Fornitore specificato dall'utente
      const supplier = await prisma.supplier.findUnique({
        where: { id: validatedData.supplierId },
      })
      if (supplier) {
        supplierId = supplier.id
        status = 'MATCHED'
      }
    } else if (validatedData.createSupplier && validatedData.supplierData) {
      // Crea nuovo fornitore
      const newSupplier = await createSupplierFromData(validatedData.supplierData)
      supplierId = newSupplier.id
      status = 'MATCHED'
    } else {
      // Cerca match automatico
      const match = await matchSupplier(fattura)
      if (match.matched && match.supplier) {
        supplierId = match.supplier.id
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

    // Crea la fattura con le scadenze
    const invoice = await prisma.electronicInvoice.create({
      data: {
        invoiceNumber: fattura.numero,
        invoiceDate: new Date(fattura.data),
        supplierVat: fattura.cedentePrestatore.partitaIva,
        supplierName: fattura.cedentePrestatore.denominazione,
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
        deadlines: {
          create: scadenze.map((s) => ({
            dueDate: s.dueDate,
            amount: new Prisma.Decimal(s.amount.toFixed(2)),
            paymentMethod: s.paymentMethod,
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
