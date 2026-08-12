import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { getVenueId } from '@/lib/venue'
import { createAuditLog } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { parseFatturaPA } from '@/lib/sdi/parser'
import { alimentaMemoriaFornitore } from '@/lib/line-categorization/memoria'
import { righeDiSistema, LINEA_BOLLO, LINEA_ARROTONDAMENTO } from '@/lib/sdi/righe-di-sistema'

interface RouteContext {
  params: Promise<{ id: string }>
}

const rigaSchema = z.object({
  // Un numeroLinea vero è sempre positivo (indice in DettaglioLinee), ma
  // bollo e arrotondamento vivono fuori dall'XML e usano i due numeri
  // riservati negativi: .int() da solo accetterebbe qualunque intero, quindi
  // serve l'elenco esplicito di ciò che oltre ai positivi è ammesso.
  numeroLinea: z
    .number()
    .int()
    .refine(
      (n) => n > 0 || n === LINEA_BOLLO || n === LINEA_ARROTONDAMENTO,
      'numeroLinea deve essere positivo, oppure uno dei numeri riservati (bollo, arrotondamento)'
    ),
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
      // Bollo e arrotondamento non stanno in DettaglioLinee ma sono
      // imputabili quanto le righe vere: senza contarli qui, una fattura che
      // li porta non potrebbe mai coprire l'intero documento (vedi
      // righe-di-sistema.ts).
      const righeSistema = new Map(righeDiSistema(fattura).map((riga) => [riga.numeroLinea, riga]))

      // Valida tutte le righe richieste PRIMA di scrivere: un numeroLinea
      // inesistente nell'XML (né fra le righe vere né fra quelle di sistema)
      // non deve produrre scritture parziali.
      for (const riga of validated.righe) {
        if (!righeXml.has(riga.numeroLinea) && !righeSistema.has(riga.numeroLinea)) {
          return NextResponse.json(
            { error: `La riga ${riga.numeroLinea} non esiste nella fattura` },
            { status: 400 }
          )
        }
      }

      // Conti di tipo COSTO o PATRIMONIALE possono ricevere l'imputazione di
      // una riga fattura: un frigorifero acquistato con fattura è un bene
      // patrimoniale, non un costo, e prima di questo cambiamento non poteva
      // essere imputato. RICAVO, ATTIVO e PASSIVO restano esclusi: via API si
      // potrebbe altrimenti imputare a un conto RICAVO, inquinando anche la
      // memoria fornitore-prodotto e le future proposte.
      const accountIds = new Set(validated.righe.map((riga) => riga.accountId))
      const conti = await prisma.account.findMany({
        where: { id: { in: [...accountIds] }, isActive: true, type: { in: ['COSTO', 'PATRIMONIALE'] } },
        select: { id: true },
      })
      if (conti.length !== accountIds.size) {
        return NextResponse.json(
          {
            error:
              'Uno o più conti non esistono, non sono attivi o non sono di tipo COSTO o PATRIMONIALE',
          },
          { status: 400 }
        )
      }

      const adesso = new Date()

      for (const riga of validated.righe) {
        // Una riga vera e una di sistema non condividono forma: la prima ha
        // prezzoTotale e un eventuale codiceArticolo, la seconda solo
        // descrizione e importo (il bollo non ha mai un codice articolo). La
        // validazione sopra garantisce che almeno una delle due esista.
        const dettaglio = righeXml.get(riga.numeroLinea)
        const sistema = righeSistema.get(riga.numeroLinea)
        const descrizione = dettaglio?.descrizione ?? sistema!.descrizione
        const codiceArticolo = dettaglio?.codiceArticolo ?? null
        const importo = dettaglio ? dettaglio.prezzoTotale : sistema!.importo

        await prisma.invoiceLineAccount.upsert({
          where: {
            invoiceId_numeroLinea: { invoiceId: id, numeroLinea: riga.numeroLinea },
          },
          create: {
            invoiceId: id,
            numeroLinea: riga.numeroLinea,
            descrizione,
            codiceArticolo,
            importo,
            accountId: riga.accountId,
            stato: 'confermata',
            fonte: 'manuale',
            confirmedById: session.user.id,
            confirmedAt: adesso,
          },
          update: {
            descrizione,
            codiceArticolo,
            importo,
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
            descrizione,
            codiceArticolo,
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
      //
      // COSTO, ed è una scelta deliberata: due query per riga — una lettura per
      // sapere se il conto è cambiato (serve a tenere onesto il contatore delle
      // conferme, vedi alimentaMemoriaFornitore) e l'upsert. Su una fattura da
      // cento righe sono circa duecento query, stimate 0,4-2 s su un'azione
      // interattiva: al limite del percepibile, non oltre. Si dimezzerebbero
      // con una sola lettura in blocco prima del ciclo — un `findMany` sui
      // `nomeNormalizzato` di queste righe, da cui una mappa nome → conto
      // precedente da passare alla scrittura. Non è stato fatto perché
      // l'ottimizzazione non era chiesta e il ciclo per riga, con il suo
      // try/catch, garantisce che una riga che non si scrive non fermi le
      // altre. Chi ci torna sappia che la strada è questa.
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
