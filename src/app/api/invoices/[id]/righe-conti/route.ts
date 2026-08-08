import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { getVenueId } from '@/lib/venue'
import { createAuditLog } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { parseFatturaPA } from '@/lib/sdi/parser'
import { alimentaMemoriaFornitore } from '@/lib/line-categorization/memoria'

interface RouteContext {
  params: Promise<{ id: string }>
}

const rigaSchema = z.object({
  numeroLinea: z.number().int().positive(),
  accountId: z.string().min(1),
})

const righeContiSchema = z.object({
  righe: z.array(rigaSchema).optional(),
  confermaTutte: z.boolean().optional(),
})

// PATCH /api/invoices/[id]/righe-conti - Conferma l'imputazione per conto delle righe fattura
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await context.params
    const body = await request.json()
    const validated = righeContiSchema.parse(body)
    const venueId = await getVenueId()

    const invoice = await prisma.electronicInvoice.findFirst({
      where: { id, venueId },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Fattura non trovata' }, { status: 404 })
    }

    let righeConfermate = 0
    let tutteConfermate = 0

    if (validated.righe && validated.righe.length > 0) {
      if (!invoice.xmlContent) {
        return NextResponse.json(
          { error: 'Fattura senza XML: impossibile ricavare le righe' },
          { status: 400 }
        )
      }

      // Un solo parse per la richiesta: le righe riparsate danno lo snapshot
      // (descrizione, importo) da salvare insieme all'imputazione manuale.
      const fattura = parseFatturaPA(invoice.xmlContent)
      const righeXml = new Map(
        (fattura.dettaglioLinee || []).map((linea) => [linea.numeroLinea, linea])
      )

      // Valida tutte le righe richieste PRIMA di scrivere: un numeroLinea
      // inesistente nell'XML non deve produrre scritture parziali.
      for (const riga of validated.righe) {
        if (!righeXml.has(riga.numeroLinea)) {
          return NextResponse.json(
            { error: `La riga ${riga.numeroLinea} non esiste nella fattura` },
            { status: 400 }
          )
        }
      }

      // Solo conti di tipo COSTO possono ricevere l'imputazione di una riga
      // fattura: via API si potrebbe altrimenti imputare a un conto RICAVO,
      // inquinando anche la memoria fornitore-prodotto e le future proposte.
      const accountIds = new Set(validated.righe.map((riga) => riga.accountId))
      const conti = await prisma.account.findMany({
        where: { id: { in: [...accountIds] }, isActive: true, type: 'COSTO' },
        select: { id: true },
      })
      if (conti.length !== accountIds.size) {
        return NextResponse.json(
          { error: 'Uno o più conti non esistono, non sono attivi o non sono di tipo COSTO' },
          { status: 400 }
        )
      }

      const adesso = new Date()

      for (const riga of validated.righe) {
        const linea = righeXml.get(riga.numeroLinea)!
        await prisma.invoiceLineAccount.upsert({
          where: {
            invoiceId_numeroLinea: { invoiceId: id, numeroLinea: riga.numeroLinea },
          },
          create: {
            invoiceId: id,
            numeroLinea: riga.numeroLinea,
            descrizione: linea.descrizione,
            codiceArticolo: linea.codiceArticolo ?? null,
            importo: linea.prezzoTotale,
            accountId: riga.accountId,
            stato: 'confermata',
            fonte: 'manuale',
            confirmedById: session.user.id,
            confirmedAt: adesso,
          },
          update: {
            descrizione: linea.descrizione,
            codiceArticolo: linea.codiceArticolo ?? null,
            importo: linea.prezzoTotale,
            accountId: riga.accountId,
            stato: 'confermata',
            fonte: 'manuale',
            confirmedById: session.user.id,
            confirmedAt: adesso,
          },
        })
        righeConfermate++

        // Un'imputazione manuale con fornitore noto alimenta la memoria
        // fornitore-prodotto, riproposta in futuro per lo stesso articolo.
        if (invoice.supplierId) {
          await alimentaMemoriaFornitore({
            venueId,
            supplierId: invoice.supplierId,
            descrizione: linea.descrizione,
            codiceArticolo: linea.codiceArticolo ?? null,
            accountId: riga.accountId,
          })
        }
      }
    }

    if (validated.confermaTutte) {
      // Le proposte si leggono PRIMA di confermarle: subito dopo non sono più
      // in stato 'proposta' e non ci sarebbe più modo di sapere quali erano.
      // Bastano lo snapshot (descrizione, codice) già salvato sulla riga e il
      // conto: la fattura non va riparsata.
      const proposte = await prisma.invoiceLineAccount.findMany({
        where: { invoiceId: id, stato: 'proposta' },
        select: { descrizione: true, codiceArticolo: true, accountId: true },
      })

      const risultato = await prisma.invoiceLineAccount.updateMany({
        where: { invoiceId: id, stato: 'proposta' },
        data: {
          stato: 'confermata',
          confirmedById: session.user.id,
          confirmedAt: new Date(),
        },
      })
      tutteConfermate = risultato.count

      // «Conferma tutte» insegna quanto la conferma riga per riga (F2-ALL-008).
      // È l'approvazione in blocco di proposte che l'utente ha guardato: il
      // segnale è lo stesso, e prima andava perduto proprio nel percorso più
      // usato — l'AI ricominciava da capo a ogni fattura dello stesso fornitore.
      if (invoice.supplierId) {
        for (const proposta of proposte) {
          await alimentaMemoriaFornitore({
            venueId,
            supplierId: invoice.supplierId,
            descrizione: proposta.descrizione,
            codiceArticolo: proposta.codiceArticolo,
            accountId: proposta.accountId,
          })
        }
      }
    }

    // Audit solo se è stata scritta almeno una riga: niente rumore sui no-op
    // (body vuoto, o confermaTutte senza righe in stato 'proposta').
    if (righeConfermate > 0 || tutteConfermate > 0) {
      await createAuditLog({
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'ElectronicInvoice',
        entityId: id,
        venueId,
        newValues: { righe: validated.righe, confermaTutte: validated.confermaTutte },
      })
    }

    return NextResponse.json({ esito: 'ok', righeConfermate, tutteConfermate })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PATCH /api/invoices/[id]/righe-conti', error)
    return NextResponse.json(
      { error: 'Errore nella conferma delle righe' },
      { status: 500 }
    )
  }
}
