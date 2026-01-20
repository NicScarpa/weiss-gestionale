import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseFatturaPASafe, calcolaImporti, estraiScadenze } from '@/lib/sdi/parser'
import { matchSupplier, suggestAccountForSupplier } from '@/lib/sdi/matcher'
import { TIPI_DOCUMENTO, MODALITA_PAGAMENTO } from '@/lib/sdi/types'
import { z } from 'zod'

import { logger } from '@/lib/logger'
const parseRequestSchema = z.object({
  xmlContent: z.string().min(100, 'Contenuto XML non valido'),
  fileName: z.string().optional(),
})

// POST /api/invoices/parse - Anteprima parsing fattura
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono vedere l'anteprima
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = parseRequestSchema.parse(body)

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

    // Calcola importi
    const importi = calcolaImporti(fattura)

    // Estrai scadenze
    const scadenze = estraiScadenze(fattura)

    // Cerca match fornitore
    const supplierMatch = await matchSupplier(fattura)

    // Suggerisci conto se fornitore trovato
    let suggestedAccountId: string | null = null
    let suggestedAccount = null
    if (supplierMatch.matched && supplierMatch.supplier) {
      suggestedAccountId = await suggestAccountForSupplier(supplierMatch.supplier.id)
      if (suggestedAccountId) {
        suggestedAccount = await prisma.account.findUnique({
          where: { id: suggestedAccountId },
          select: { id: true, code: true, name: true, type: true },
        })
      }
    }

    // Verifica se esiste già
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
      select: { id: true, status: true, importedAt: true },
    })

    // Prepara risposta
    return NextResponse.json({
      parsed: {
        // Documento
        tipoDocumento: fattura.tipoDocumento,
        tipoDocumentoDesc: TIPI_DOCUMENTO[fattura.tipoDocumento] || fattura.tipoDocumento,
        numero: fattura.numero,
        data: fattura.data,
        causale: fattura.causale?.join(' - '),

        // Fornitore
        fornitore: {
          denominazione: fattura.cedentePrestatore.denominazione,
          partitaIva: fattura.cedentePrestatore.partitaIva,
          codiceFiscale: fattura.cedentePrestatore.codiceFiscale,
          indirizzo: `${fattura.cedentePrestatore.sede.indirizzo}, ${fattura.cedentePrestatore.sede.cap} ${fattura.cedentePrestatore.sede.comune} (${fattura.cedentePrestatore.sede.provincia})`,
        },

        // Importi
        importi: {
          netAmount: importi.netAmount,
          vatAmount: importi.vatAmount,
          totalAmount: importi.totalAmount,
        },

        // Dettaglio linee
        linee: fattura.dettaglioLinee.map((l) => ({
          descrizione: l.descrizione,
          quantita: l.quantita,
          prezzoUnitario: l.prezzoUnitario,
          prezzoTotale: l.prezzoTotale,
          aliquotaIVA: l.aliquotaIVA,
        })),

        // Riepilogo IVA
        riepilogoIVA: fattura.datiRiepilogo.map((r) => ({
          aliquota: r.aliquotaIVA,
          imponibile: r.imponibileImporto,
          imposta: r.imposta,
          natura: r.natura,
        })),

        // Scadenze
        scadenze: scadenze.map((s) => ({
          dataScadenza: s.dueDate.toISOString(),
          importo: s.amount,
          modalita: s.paymentMethod,
          modalitaDesc: MODALITA_PAGAMENTO[s.paymentMethod] || s.paymentMethod,
        })),
      },

      // Match fornitore
      supplierMatch: {
        found: supplierMatch.matched,
        supplier: supplierMatch.supplier
          ? {
              id: supplierMatch.supplier.id,
              name: supplierMatch.supplier.name,
              vatNumber: supplierMatch.supplier.vatNumber,
            }
          : null,
        suggestedData: supplierMatch.suggestedData,
      },

      // Conto suggerito
      suggestedAccount,

      // Fattura esistente
      existingInvoice: existingInvoice
        ? {
            id: existingInvoice.id,
            status: existingInvoice.status,
            importedAt: existingInvoice.importedAt,
          }
        : null,

      // Warning dal parsing (tipo documento non riconosciuto, P.IVA non standard, etc.)
      parseWarnings: parseResult.warnings.length > 0 ? parseResult.warnings : undefined,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/invoices/parse', error)
    return NextResponse.json(
      { error: 'Errore nel parsing della fattura' },
      { status: 500 }
    )
  }
}
