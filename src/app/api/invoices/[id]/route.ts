import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { InvoiceStatus } from '@prisma/client'
import { z } from 'zod'
import { parseFatturaPA, TIPI_DOCUMENTO } from '@/lib/sdi/parser'
import { righeDiSistema } from '@/lib/sdi/righe-di-sistema'
import { imputazioniDivergenti } from '@/lib/invoices/riallineamento'
import { getVenueId } from '@/lib/venue'

import { logger } from '@/lib/logger'
import {
  checkInvoiceDeletable,
  softDeleteSchedulesForInvoice,
} from '@/lib/services/invoice-schedule-service'
// Schema per aggiornamento fattura
const updateInvoiceSchema = z.object({
  // Categorizzazione
  accountId: z.string().nullable().optional(),
  // Fornitore
  supplierId: z.string().nullable().optional(),
  // Note
  notes: z.string().nullable().optional(),
  // Status manuale
  status: z.enum(['IMPORTED', 'MATCHED', 'CATEGORIZED', 'PAID']).optional(),
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

    const invoice = await prisma.electronicInvoice.findFirst({
      where: { id, venueId: await getVenueId() },
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
        // Le scadenze generate nello scadenzario sono la fonte di verità sui
        // pagamenti: InvoiceDeadline.isPaid resta al valore iniziale
        schedules: {
          select: {
            id: true,
            invoiceDeadlineId: true,
            stato: true,
            importoTotale: true,
            importoPagato: true,
            dataPagamento: true,
          },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Fattura non trovata' }, { status: 404 })
    }

    // Parse XML per dati completi (causale, linee, riepilogo, pagamenti, etc.)
    let parsedData = null
    if (invoice.xmlContent) {
      try {
        const fattura = parseFatturaPA(invoice.xmlContent)

        // Imputazioni per conto già salvate sulle righe: merge per numeroLinea
        // (chiave stabile, indipendente dal riparsing dell'XML).
        //
        // orderBy progressivo asc, e non un findMany senza ordine: dal Task 5
        // una riga può avere più quote (un fornitore che accorpa voci
        // diverse in una riga sola), e senza un ordine esplicito la quota
        // "vincente" nella mappa sotto sarebbe l'ultima che Postgres
        // restituisce in ordine fisico — non deterministico, e cambia dopo
        // un update. Un dato sbagliato senza alcun segnale è peggio di un
        // dato mancante.
        const lineAccounts = await prisma.invoiceLineAccount.findMany({
          where: { invoiceId: id },
          orderBy: { progressivo: 'asc' },
        })
        const quotePerLinea = new Map<number, typeof lineAccounts>()
        for (const la of lineAccounts) {
          const quote = quotePerLinea.get(la.numeroLinea)
          if (quote) quote.push(la)
          else quotePerLinea.set(la.numeroLinea, [la])
        }

        // Un solo modo di raccontare le quote di una riga, riusato sia dalle
        // righe vere sia da quelle di sistema: prima esisteva anche un campo
        // `imputazione` singolare (solo la quota col progressivo più basso,
        // senza importo) accanto a questo array — un'asimmetria lasciata alla
        // task 8. Portava meno informazione della stessa quota già presente
        // in `imputazioni[0]` e nessun consumatore lo distingueva da questo,
        // quindi è stato tolto invece di mantenere due copie che potevano
        // disallinearsi: chi vuole "la" imputazione principale della riga
        // legge `imputazioni[0]`, ordinato per progressivo dall'orderBy sopra.
        const mappaImputazioni = (quote: typeof lineAccounts) =>
          quote.map((q) => ({
            progressivo: q.progressivo,
            accountId: q.accountId,
            importo: Number(q.importo),
            stato: q.stato,
            fonte: q.fonte,
            confidence: q.confidence,
            motivazioneAi: q.motivazioneAi,
          }))

        // Bollo e arrotondamento (Task 4) sono righe imputabili ma vivono
        // fuori da `dettaglioLinee`: senza esporle qui il conto scelto per il
        // bollo si salverebbe (righe-conti/route.ts già accetta LINEA_BOLLO)
        // ma non si rileggerebbe mai — l'asimmetria che la task 8 doveva
        // chiudere. `quotePerLinea` le contiene già, perché la query sopra
        // non filtra per numeroLinea positivo.
        const righeSistema = righeDiSistema(fattura)

        parsedData = {
          tipoDocumento: fattura.tipoDocumento,
          tipoDocumentoDesc: TIPI_DOCUMENTO[fattura.tipoDocumento] || fattura.tipoDocumento,
          causale: fattura.causale || [],
          cedentePrestatore: fattura.cedentePrestatore,
          cessionarioCommittente: fattura.cessionarioCommittente,
          dettaglioLinee: (fattura.dettaglioLinee || []).map((linea) => ({
            ...linea,
            imputazioni: mappaImputazioni(quotePerLinea.get(linea.numeroLinea) ?? []),
          })),
          righeSistema: righeSistema.map((riga) => ({
            ...riga,
            imputazioni: mappaImputazioni(quotePerLinea.get(riga.numeroLinea) ?? []),
          })),
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

    // Task 10 (fuori piano, spec sez. 2): il pulsante "Riallinea" ha bisogno
    // di sapere se un movimento collegato a questa fattura porta ancora
    // fette nate da un'imputazione superata. `imputazioniDivergenti` lavora
    // per MOVIMENTO, non per fattura — quindi si trovano prima i movimenti
    // collegati attraverso le scadenze riconciliate di questa fattura (di
    // norma uno solo, salvo pagamenti frazionati su più bonifici) e si
    // interroga ciascuno.
    //
    // Costo: una query per i movimenti collegati, più 1+K query per ciascun
    // movimento distinto — K è quante riconciliazioni con fette ha QUEL
    // movimento (non questa fattura: un bonifico cumulativo che salda anche
    // altre fatture le conta tutte). Una fattura rateizzata pagata da N
    // bonifici distinti costerebbe N×(1+K) round-trip in sequenza: le
    // chiamate sui movimenti distinti corrono invece in parallelo
    // (`Promise.all`). Resta comunque limitato al grafo di riconciliazioni di
    // QUESTA fattura: non cresce con una lista, perché gira solo qui, sul
    // dettaglio di una singola fattura — mai su ogni riga di un elenco.
    //
    // Accessoria quanto il parsing XML qui sopra (un avviso, non il
    // documento): un errore in queste query — le più esposte della rotta,
    // proprio perché sono 1+K — non deve poter far sparire l'intera fattura
    // dietro un 500. Stesso principio, stessa forma di quel `try/catch`.
    const divergenze: Array<{ journalEntryId: string; movimentoData: string }> = []
    try {
      const movimentiCollegati = await prisma.scheduleReconciliation.findMany({
        where: { status: 'VERIFIED', schedule: { invoiceId: id } },
        select: { journalEntryId: true, journalEntry: { select: { date: true } } },
      })
      const dataPerMovimento = new Map(
        movimentiCollegati.map((m) => [m.journalEntryId, m.journalEntry.date])
      )

      const esiti = await Promise.all(
        [...dataPerMovimento.keys()].map(async (journalEntryId) => ({
          journalEntryId,
          esito: await imputazioniDivergenti(journalEntryId),
        }))
      )

      for (const { journalEntryId, esito } of esiti) {
        // Un bonifico cumulativo può saldare più fatture: `imputazioniDivergenti`
        // riporta la divergenza più recente di TUTTO il movimento, non
        // necessariamente quella di questa fattura. Mostrarla comunque
        // attribuirebbe a questa fattura un problema che è di un'altra —
        // si verifica che l'`invoiceId` tornato sia proprio il nostro.
        if (esito.divergente && esito.invoiceId === id) {
          const data = dataPerMovimento.get(journalEntryId)
          if (data) divergenze.push({ journalEntryId, movimentoData: data.toISOString() })
        }
      }
    } catch (divergenzaError) {
      // Non blocchiamo la risposta se il calcolo della divergenza fallisce:
      // sparisce l'avviso su questo caricamento, non la fattura.
      logger.error('Errore nel calcolo delle divergenze per il dettaglio fattura', divergenzaError)
    }

    return NextResponse.json({ ...invoice, parsedData, divergenze })
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
    const existingInvoice = await prisma.electronicInvoice.findFirst({
      where: { id, venueId: await getVenueId() },
    })

    if (!existingInvoice) {
      return NextResponse.json({ error: 'Fattura non trovata' }, { status: 404 })
    }

    // Non permettere modifiche a fatture già saldate: cambiarne conto o
    // fornitore dopo che il pagamento è stato riconciliato scollegherebbe il
    // documento dal movimento che lo giustifica.
    if (existingInvoice.status === 'PAID' && !validatedData.status) {
      return NextResponse.json(
        { error: 'Fattura già pagata, non modificabile' },
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

      // Non retrocedere da PAID
      if (existingInvoice.status !== 'PAID') {
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

    const invoice = await prisma.electronicInvoice.findFirst({
      where: { id, venueId: await getVenueId() },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Fattura non trovata' }, { status: 404 })
    }

    // Non permettere eliminazione di fatture già saldate
    if (invoice.status === 'PAID') {
      return NextResponse.json(
        { error: 'Impossibile eliminare una fattura già pagata' },
        { status: 400 }
      )
    }

    // Blocca se sulle scadenze generate risultano pagamenti registrati:
    // cancellare la fattura scollegherebbe un pagamento realmente uscito dal
    // conto dal documento che lo giustifica.
    const deletionCheck = await checkInvoiceDeletable(id)
    if (!deletionCheck.canDelete) {
      return NextResponse.json(
        {
          error:
            'Impossibile eliminare: su questa fattura risultano pagamenti già registrati nello scadenzario. Annulla prima i pagamenti, oppure lascia la fattura e annulla la scadenza.',
          scadenzeConPagamenti: deletionCheck.schedulesWithPayments,
        },
        { status: 409 }
      )
    }

    // Cancellazione logica in transazione: il documento fiscale resta
    // conservato e le scadenze che ne derivavano spariscono dallo scadenzario
    const deletedSchedules = await prisma.$transaction(async (tx) => {
      const count = await softDeleteSchedulesForInvoice(id, session.user.id, tx)

      await tx.electronicInvoice.update({
        where: { id },
        data: { deletedAt: new Date() },
      })

      return count
    })

    return NextResponse.json({ success: true, scadenzeAnnullate: deletedSchedules })
  } catch (error) {
    logger.error('Errore DELETE /api/invoices/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione della fattura' },
      { status: 500 }
    )
  }
}
