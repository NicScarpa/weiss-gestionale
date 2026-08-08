import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { updateJournalEntrySchema } from '@/lib/validations/prima-nota'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
// GET /api/prima-nota/[id] - Dettaglio singolo movimento
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
    const venueId = await getVenueId()

    const entry = await prisma.journalEntry.findFirst({
      where: { id, venueId },
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        account: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        counterpart: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        closure: {
          select: {
            id: true,
            date: true,
            status: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })

    if (!entry) {
      return NextResponse.json(
        { error: 'Movimento non trovato' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ...entry,
      debitAmount: entry.debitAmount ? Number(entry.debitAmount) : null,
      creditAmount: entry.creditAmount ? Number(entry.creditAmount) : null,
      vatAmount: entry.vatAmount ? Number(entry.vatAmount) : null,
      runningBalance: entry.runningBalance ? Number(entry.runningBalance) : null,
    })
  } catch (error) {
    logger.error('Errore GET /api/prima-nota/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del movimento' },
      { status: 500 }
    )
  }
}

// PUT /api/prima-nota/[id] - Aggiorna movimento
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
    const venueId = await getVenueId()
    const body = await request.json()
    const validatedData = updateJournalEntrySchema.parse(body)

    // Verifica che il movimento esista e appartenga al venue
    const existingEntry = await prisma.journalEntry.findFirst({
      where: { id, venueId },
      select: { id: true, closureId: true },
    })

    if (!existingEntry) {
      return NextResponse.json(
        { error: 'Movimento non trovato' },
        { status: 404 }
      )
    }

    // Non modificabile se generato da chiusura
    if (existingEntry.closureId) {
      return NextResponse.json(
        { error: 'I movimenti generati da chiusure non sono modificabili' },
        { status: 400 }
      )
    }

    // Aggiorna
    const updated = await prisma.journalEntry.update({
      where: { id },
      data: {
        date: validatedData.date,
        description: validatedData.description,
        documentRef: validatedData.documentRef,
        documentType: validatedData.documentType,
        accountId: validatedData.accountId,
        vatAmount: validatedData.vatAmount,
      },
      select: { id: true, updatedAt: true },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      entityType: 'JournalEntry',
      entityId: id,
      venueId,
      newValues: validatedData,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore PUT /api/prima-nota/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento del movimento' },
      { status: 500 }
    )
  }
}

/**
 * Ciò che può trattenere un movimento dalla cancellazione. Sta in una costante
 * perché la stessa domanda va posta anche all'altra riga di un trasferimento.
 */
const LEGAMI_DA_VERIFICARE = {
  closureId: true,
  paymentId: true,
  scheduleReconciliations: {
    where: { status: 'VERIFIED' as const },
    select: { id: true, scheduleId: true },
  },
  bankTransaction: { select: { id: true } },
  payment: { select: { id: true } },
}

interface RigaConLegami {
  closureId: string | null
  paymentId: string | null
  scheduleReconciliations: Array<{ id: string; scheduleId: string }>
  bankTransaction: { id: string } | null
  payment: { id: string } | null
}

interface Blocco {
  status: number
  corpo: Record<string, unknown>
}

/**
 * Perché questo movimento non si può cancellare, se non si può.
 *
 * `gemella` distingue la riga richiesta dall'altra riga dello stesso
 * trasferimento: senza quella precisazione l'utente cercherebbe l'aggancio
 * sulla riga che ha in mano, che ne è priva, e il messaggio sembrerebbe falso.
 */
function motivoDelBlocco(riga: RigaConLegami, gemella: boolean): Blocco | null {
  const dove = gemella ? ' (l\'altra riga del trasferimento)' : ''

  // Non eliminabile se generato da chiusura
  if (riga.closureId) {
    return {
      status: 400,
      corpo: { error: `I movimenti generati da chiusure non sono eliminabili${dove}` },
    }
  }

  // Il caso che fa più danno è la riconciliazione: cancellando il movimento la
  // scadenza resta "pagata" verso qualcosa che non esiste più, e il residuo del
  // fornitore sparisce dal previsionale senza che sia uscito un euro. La
  // risposta dice cosa sganciare prima, perché l'operazione resti possibile in
  // due passi.
  if (riga.scheduleReconciliations.length > 0) {
    return {
      status: 409,
      corpo: {
        error:
          `Il movimento${dove} è riconciliato con una o più scadenze: annulla prima le ` +
          'riconciliazioni, poi elimina il movimento',
        scadenze: riga.scheduleReconciliations.map((r) => r.scheduleId),
      },
    }
  }

  if (riga.payment || riga.paymentId) {
    return {
      status: 409,
      corpo: {
        error:
          `Il movimento${dove} è collegato a un pagamento: annulla prima il pagamento, poi ` +
          'elimina il movimento',
      },
    }
  }

  if (riga.bankTransaction) {
    return {
      status: 409,
      corpo: {
        error:
          `Il movimento${dove} è abbinato a una transazione bancaria: sgancia prima ` +
          'l\'abbinamento, poi elimina il movimento',
      },
    }
  }

  return null
}

// DELETE /api/prima-nota/[id] - Elimina movimento
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
    const venueId = await getVenueId()

    // Verifica che il movimento esista e appartenga al venue
    const existingEntry = await prisma.journalEntry.findFirst({
      where: { id, venueId },
      select: { id: true, transferId: true, ...LEGAMI_DA_VERIFICARE },
    })

    if (!existingEntry) {
      return NextResponse.json(
        { error: 'Movimento non trovato' },
        { status: 404 }
      )
    }

    // Verifica accesso (solo admin o manager)
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json(
        { error: 'Solo admin e manager possono eliminare movimenti' },
        { status: 403 }
      )
    }

    // Un trasferimento è una scrittura sola in due righe: cancellarne una
    // lascerebbe il denaro uscito da un registro senza essere entrato
    // nell'altro, e il saldo complessivo si sposterebbe dell'intero importo.
    // Si cancella l'operazione, non la riga — e la si rifiuta se *una
    // qualsiasi* delle due è agganciata a qualcosa, perché il blocco protegge
    // l'operazione intera. I trasferimenti scritti prima che esistesse
    // `transferId` non hanno il legame e si comportano come movimenti singoli:
    // per loro il vecchio rischio resta, ma non lo si può indovinare a
    // posteriori (vedi il commento sulla colonna in schema.prisma).
    const daCancellare = existingEntry.transferId
      ? await prisma.journalEntry.findMany({
          where: { transferId: existingEntry.transferId, venueId },
          select: { id: true, ...LEGAMI_DA_VERIFICARE },
        })
      : [existingEntry]

    for (const riga of daCancellare) {
      const blocco = motivoDelBlocco(riga, riga.id !== id)
      if (blocco) {
        return NextResponse.json(blocco.corpo, { status: blocco.status })
      }
    }

    // Cancellazione logica: le scritture contabili non vengono mai rimosse
    // dal database, restano tracciabili tramite deletedAt e l'audit log
    const adesso = new Date()
    await prisma.$transaction(
      daCancellare.map((riga) =>
        prisma.journalEntry.update({
          where: { id: riga.id },
          data: { deletedAt: adesso },
        })
      )
    )

    // Un log per riga: la seconda è cancellata quanto la prima, e un registro
    // che ne nomina una sola racconta metà dell'operazione.
    for (const riga of daCancellare) {
      await createAuditLog({
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'JournalEntry',
        entityId: riga.id,
        venueId,
      })
    }

    return NextResponse.json({ success: true, eliminati: daCancellare.length })
  } catch (error) {
    logger.error('Errore DELETE /api/prima-nota/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione del movimento' },
      { status: 500 }
    )
  }
}
