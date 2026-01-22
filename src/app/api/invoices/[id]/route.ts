import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { InvoiceStatus } from '@prisma/client'
import { z } from 'zod'
import { parseFatturaPA, TIPI_DOCUMENTO } from '@/lib/sdi/parser'

import { logger } from '@/lib/logger'
// Schema per aggiornamento fattura
const updateInvoiceSchema = z.object({
  // Categorizzazione
  accountId: z.string().nullable().optional(),
  // Fornitore
  supplierId: z.string().nullable().optional(),
  // Note
  notes: z.string().nullable().optional(),
  // Status manuale
  status: z.enum(['IMPORTED', 'MATCHED', 'CATEGORIZED', 'RECORDED', 'PAID']).optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET /api/invoices/[id] - Dettaglio fattura
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono vedere le fatture
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await context.params

    const invoice = await prisma.electronicInvoice.findUnique({
      where: { id },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            vatNumber: true,
            fiscalCode: true,
            address: true,
            city: true,
            province: true,
            defaultAccountId: true,
          },
        },
        account: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        journalEntry: {
          select: {
            id: true,
            date: true,
            description: true,
            debitAmount: true,
            creditAmount: true,
          },
        },
        deadlines: {
          orderBy: { dueDate: 'asc' },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Fattura non trovata' }, { status: 404 })
    }

    // Manager vede solo fatture della propria sede
    if (session.user.role === 'manager' && invoice.venueId !== session.user.venueId) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Parse XML per dati completi (causale, linee, riepilogo, pagamenti, etc.)
    let parsedData = null
    if (invoice.xmlContent) {
      try {
        const fattura = parseFatturaPA(invoice.xmlContent)
        parsedData = {
          tipoDocumento: fattura.tipoDocumento,
          tipoDocumentoDesc: TIPI_DOCUMENTO[fattura.tipoDocumento] || fattura.tipoDocumento,
          causale: fattura.causale || [],
          cedentePrestatore: fattura.cedentePrestatore,
          cessionarioCommittente: fattura.cessionarioCommittente,
          dettaglioLinee: fattura.dettaglioLinee || [],
          datiRiepilogo: fattura.datiRiepilogo || [],
          datiPagamento: fattura.datiPagamento,
          datiBollo: fattura.datiBollo,
          progressivoInvio: fattura.progressivoInvio,
          formatoTrasmissione: fattura.formatoTrasmissione,
          pecDestinatario: fattura.pecDestinatario,
          codiceDestinatario: fattura.codiceDestinatario,
          importoTotaleDocumento: fattura.importoTotaleDocumento,
          arrotondamento: fattura.arrotondamento,
        }
      } catch (parseError) {
        logger.error('Errore parsing XML per dettaglio', parseError)
        // Non blocchiamo la risposta se il parsing fallisce
      }
    }

    return NextResponse.json({ ...invoice, parsedData })
  } catch (error) {
    logger.error('Errore GET /api/invoices/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero della fattura' },
      { status: 500 }
    )
  }
}

// PUT /api/invoices/[id] - Aggiorna fattura (categorizzazione)
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono modificare fatture
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await context.params
    const body = await request.json()
    const validatedData = updateInvoiceSchema.parse(body)

    // Trova fattura esistente
    const existingInvoice = await prisma.electronicInvoice.findUnique({
      where: { id },
    })

    if (!existingInvoice) {
      return NextResponse.json({ error: 'Fattura non trovata' }, { status: 404 })
    }

    // Manager vede solo fatture della propria sede
    if (
      session.user.role === 'manager' &&
      existingInvoice.venueId !== session.user.venueId
    ) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Non permettere modifiche a fatture già registrate in prima nota
    if (existingInvoice.status === 'RECORDED' && !validatedData.status) {
      return NextResponse.json(
        { error: 'Fattura già registrata in prima nota, non modificabile' },
        { status: 400 }
      )
    }

    // Prepara dati da aggiornare
    const updateData: Record<string, unknown> = {}

    // Aggiorna fornitore
    if (validatedData.supplierId !== undefined) {
      if (validatedData.supplierId) {
        const supplier = await prisma.supplier.findUnique({
          where: { id: validatedData.supplierId },
        })
        if (!supplier) {
          return NextResponse.json({ error: 'Fornitore non trovato' }, { status: 404 })
        }
        updateData.supplierId = validatedData.supplierId
      } else {
        updateData.supplierId = null
      }
    }

    // Aggiorna conto
    if (validatedData.accountId !== undefined) {
      if (validatedData.accountId) {
        const account = await prisma.account.findUnique({
          where: { id: validatedData.accountId },
        })
        if (!account) {
          return NextResponse.json({ error: 'Conto non trovato' }, { status: 404 })
        }
        updateData.accountId = validatedData.accountId
      } else {
        updateData.accountId = null
      }
    }

    // Aggiorna note
    if (validatedData.notes !== undefined) {
      updateData.notes = validatedData.notes
    }

    // Calcola nuovo status automaticamente se non specificato
    if (!validatedData.status) {
      const newSupplierId =
        validatedData.supplierId !== undefined
          ? validatedData.supplierId
          : existingInvoice.supplierId
      const newAccountId =
        validatedData.accountId !== undefined
          ? validatedData.accountId
          : existingInvoice.accountId

      let newStatus: InvoiceStatus = existingInvoice.status

      if (newAccountId) {
        newStatus = 'CATEGORIZED'
      } else if (newSupplierId) {
        newStatus = 'MATCHED'
      } else {
        newStatus = 'IMPORTED'
      }

      // Non retrocedere da RECORDED o PAID
      if (existingInvoice.status !== 'RECORDED' && existingInvoice.status !== 'PAID') {
        updateData.status = newStatus
      }
    } else {
      updateData.status = validatedData.status
    }

    // Aggiorna timestamp
    if (updateData.status === 'CATEGORIZED' && !existingInvoice.processedAt) {
      updateData.processedAt = new Date()
    }

    const invoice = await prisma.electronicInvoice.update({
      where: { id },
      data: updateData,
      include: {
        supplier: true,
        account: true,
        venue: true,
        deadlines: true,
      },
    })

    // Se è stato assegnato un conto e il fornitore ha un conto default, aggiornalo
    if (validatedData.accountId && invoice.supplierId) {
      const supplier = await prisma.supplier.findUnique({
        where: { id: invoice.supplierId },
      })
      if (supplier && !supplier.defaultAccountId) {
        await prisma.supplier.update({
          where: { id: invoice.supplierId },
          data: { defaultAccountId: validatedData.accountId },
        })
      }
    }

    return NextResponse.json(invoice)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PUT /api/invoices/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento della fattura' },
      { status: 500 }
    )
  }
}

// DELETE /api/invoices/[id] - Elimina fattura
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin può eliminare fatture
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await context.params

    const invoice = await prisma.electronicInvoice.findUnique({
      where: { id },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Fattura non trovata' }, { status: 404 })
    }

    // Non permettere eliminazione di fatture registrate
    if (invoice.status === 'RECORDED') {
      return NextResponse.json(
        { error: 'Impossibile eliminare una fattura già registrata in prima nota' },
        { status: 400 }
      )
    }

    await prisma.electronicInvoice.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Errore DELETE /api/invoices/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione della fattura' },
      { status: 500 }
    )
  }
}
