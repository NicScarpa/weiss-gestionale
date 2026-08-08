import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * Data in formato ISO. Non si usa `z.coerce.date()` perché quella coercerebbe
 * anche booleani e numeri in date plausibili: qui una data o è una stringa
 * valida o non è.
 */
const dataIso = z
  .string()
  .refine((valore) => !Number.isNaN(Date.parse(valore)), { message: 'Data non valida' })
  .transform((valore) => new Date(valore))

/**
 * I soli campi che il client può scrivere, elencati uno per uno.
 *
 * `strictObject` rifiuta tutto il resto invece di ignorarlo: chi prova a
 * scrivere `venueId`, `journalEntryId` o `deletedAt` deve ricevere un errore,
 * non un successo che non ha fatto quello che gli era stato chiesto.
 */
const aggiornaPagamentoSchema = z.strictObject({
  tipo: z.enum(['BONIFICO', 'F24', 'ALTRO']).optional(),
  stato: z
    .enum(['BOZZA', 'DA_APPROVARE', 'DISPOSTO', 'COMPLETATO', 'FALLITO', 'ANNULLATO'])
    .optional(),
  dataEsecuzione: dataIso.optional(),
  importo: z.number().positive().optional(),
  beneficiarioNome: z.string().min(1).optional(),
  beneficiarioIban: z.string().nullish(),
  riferimentoInterno: z.string().nullish(),
  causale: z.string().nullish(),
  note: z.string().nullish(),
})

/**
 * Campi che diventano immutabili quando il pagamento entra in prima nota: il
 * movimento contabile conserva l'importo e la data di allora, e cambiarli qui
 * farebbe raccontare due storie diverse alle due tabelle.
 */
const CAMPI_CONGELATI = ['importo', 'dataEsecuzione'] as const

/**
 * GET /api/pagamenti/[id]
 * Recupera un pagamento specifico
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const payment = await prisma.payment.findUnique({
      where: { id: id },
      include: {
        venue: {
          select: { id: true, name: true },
        },
        journalEntry: {
          select: { id: true, date: true, description: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Pagamento non trovato' }, { status: 404 })
    }

    return NextResponse.json(payment)
  } catch (error) {
    logger.error('Errore GET /api/pagamenti/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del pagamento' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/pagamenti/[id]
 * Aggiorna un pagamento
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const parsed = aggiornaPagamentoSchema.safeParse(await request.json())

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dati non validi', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const current = await prisma.payment.findFirst({
      where: { id: id, deletedAt: null },
      select: { journalEntryId: true },
    })

    if (!current) {
      return NextResponse.json({ error: 'Pagamento non trovato' }, { status: 404 })
    }

    const toccaCampiCongelati = CAMPI_CONGELATI.some(
      (campo) => parsed.data[campo] !== undefined
    )

    if (toccaCampiCongelati && current.journalEntryId) {
      return NextResponse.json(
        {
          error:
            'Pagamento già registrato in prima nota: importo e data di esecuzione non sono più modificabili',
        },
        { status: 409 }
      )
    }

    // `updateMany` e non `update`: quest'ultima legge il `where` come chiave
    // univoca, e `journalEntryId` è unique — Prisma rifiuterebbe di cercarlo
    // a null. Qui invece serve un filtro, perché fra il controllo qui sopra e
    // questa scrittura il pagamento può essere stato eseguito da un'altra
    // richiesta: la condizione ripetuta fa fallire l'aggiornamento invece di
    // scavalcarlo.
    const aggiornati = await prisma.payment.updateMany({
      where: {
        id: id,
        deletedAt: null,
        ...(toccaCampiCongelati ? { journalEntryId: null } : {}),
      },
      data: parsed.data,
    })

    if (aggiornati.count === 0) {
      return NextResponse.json(
        { error: 'Pagamento modificato da un\'altra operazione: ricarica e riprova' },
        { status: 409 }
      )
    }

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: id } })

    return NextResponse.json(updated)
  } catch (error) {
    // P2025: la rilettura non ha trovato il pagamento, cioè è sparito fra
    // l'aggiornamento e la risposta.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Pagamento modificato da un\'altra operazione: ricarica e riprova' },
        { status: 409 }
      )
    }

    logger.error('Errore PATCH /api/pagamenti/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento del pagamento' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/pagamenti/[id]
 * Elimina un pagamento
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const current = await prisma.payment.findFirst({
      where: { id: id, deletedAt: null },
      select: { stato: true, journalEntryId: true },
    })

    if (!current) {
      return NextResponse.json({ error: 'Pagamento non trovato' }, { status: 404 })
    }

    // Un pagamento che ha già un movimento in prima nota non si cancella,
    // qualunque sia il suo stato: lo stato è modificabile con una PATCH,
    // il legame col movimento no.
    if (current.journalEntryId) {
      return NextResponse.json(
        { error: 'Pagamento già registrato in prima nota: non è eliminabile' },
        { status: 409 }
      )
    }

    // Permetti eliminazione solo in BOZZA
    if (current.stato !== 'BOZZA') {
      return NextResponse.json(
        { error: 'Possibile eliminare solo pagamenti in stato BOZZA' },
        { status: 400 }
      )
    }

    // Cancellazione logica (tracciabilità dei pagamenti)
    await prisma.payment.update({
      where: { id: id },
      data: { deletedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Errore DELETE /api/pagamenti/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione del pagamento' },
      { status: 500 }
    )
  }
}
