import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { format } from 'date-fns'

interface RouteContext {
  params: Promise<{ id: string }>
}

// POST /api/invoices/[id]/record - Registra fattura in prima nota
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono registrare fatture
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await context.params

    // Trova fattura con tutte le relazioni
    const invoice = await prisma.electronicInvoice.findUnique({
      where: { id },
      include: {
        supplier: true,
        account: true,
        venue: true,
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Fattura non trovata' }, { status: 404 })
    }

    // Manager può registrare solo fatture della propria sede
    if (session.user.role === 'manager' && invoice.venueId !== session.user.venueId) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Verifica stato
    if (invoice.status === 'RECORDED') {
      return NextResponse.json(
        { error: 'Fattura già registrata in prima nota' },
        { status: 400 }
      )
    }

    // Verifica che sia categorizzata
    if (!invoice.accountId) {
      return NextResponse.json(
        { error: 'Assegna prima un conto alla fattura' },
        { status: 400 }
      )
    }

    // Trova conto CASSA o BANCA per il credito
    // Di default usiamo BANCA per i pagamenti a fornitori
    const bankAccount = await prisma.account.findFirst({
      where: {
        OR: [{ code: 'BANCA' }, { code: '1001' }, { name: { contains: 'Banca' } }],
        isActive: true,
      },
    })

    if (!bankAccount) {
      return NextResponse.json(
        { error: 'Conto Banca non trovato nel piano dei conti' },
        { status: 400 }
      )
    }

    // Descrizione movimento
    const invoiceDateStr = format(invoice.invoiceDate, 'dd/MM/yyyy')
    const description = `Fattura ${invoice.invoiceNumber} del ${invoiceDateStr} - ${invoice.supplierName}`

    // Crea movimento in prima nota (registro BANCA)
    // DEBITO: conto spesa/costo (accountId)
    // CREDITO: conto banca
    const journalEntry = await prisma.journalEntry.create({
      data: {
        venueId: invoice.venueId,
        date: invoice.invoiceDate,
        registerType: 'BANK',
        documentRef: invoice.invoiceNumber,
        documentType: 'FATTURA',
        description,
        debitAmount: null,
        creditAmount: invoice.totalAmount,
        vatAmount: invoice.vatAmount,
        accountId: invoice.accountId,
        counterpartId: bankAccount.id,
        createdById: session.user.id,
      },
    })

    // Aggiorna fattura con riferimento al movimento
    const updatedInvoice = await prisma.electronicInvoice.update({
      where: { id },
      data: {
        status: 'RECORDED',
        journalEntryId: journalEntry.id,
        recordedAt: new Date(),
      },
      include: {
        supplier: true,
        account: true,
        venue: true,
        journalEntry: true,
        deadlines: true,
      },
    })

    return NextResponse.json({
      invoice: updatedInvoice,
      journalEntry,
      message: 'Fattura registrata in prima nota con successo',
    })
  } catch (error) {
    console.error('Errore POST /api/invoices/[id]/record:', error)
    return NextResponse.json(
      { error: 'Errore nella registrazione della fattura' },
      { status: 500 }
    )
  }
}
