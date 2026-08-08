import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { updateJournalEntrySchema } from '@/lib/validations/prima-nota'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { risolviCentroDiCosto } from '@/lib/services/cost-center-service'

// Un movimento generato da chiusura è dato contabile intoccabile (importi,
// date, registro, descrizione). L'unica eccezione ammessa, e solo per
// l'admin, è la riclassifica: correggere conto e/o centro di costo quando la
// chiusura è stata archiviata con l'imputazione sbagliata.
const CAMPI_RICLASSIFICABILI: readonly string[] = ['accountId', 'costCenterId']

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
      select: { id: true, closureId: true, accountId: true, costCenterId: true },
    })

    if (!existingEntry) {
      return NextResponse.json(
        { error: 'Movimento non trovato' },
        { status: 404 }
      )
    }

    // Eccezione stretta al blocco dei movimenti da chiusura: SOLO l'admin, e
    // SOLO per riclassificare conto/centro di costo. Importi, date, registro
    // e descrizione restano intoccabili anche per l'admin — non allentare
    // questo ramo per altri campi o altri ruoli.
    if (existingEntry.closureId) {
      if (session.user.role !== 'admin') {
        return NextResponse.json(
          { error: 'Solo un amministratore può riclassificare i movimenti generati da chiusura' },
          { status: 403 }
        )
      }

      const chiaviExtra = Object.keys(body).filter(
        (chiave) => !CAMPI_RICLASSIFICABILI.includes(chiave)
      )
      if (chiaviExtra.length > 0) {
        return NextResponse.json(
          {
            error: 'Sui movimenti generati da chiusura si possono modificare solo conto e centro di costo.',
            code: 'MOVIMENTO_DA_CHIUSURA_SOLO_RICLASSIFICA',
          },
          { status: 400 }
        )
      }

      const cambiaContoRiclassifica = validatedData.accountId !== undefined
      const cambiaCentroRiclassifica = validatedData.costCenterId !== undefined
      let costCenterIdRiclassificato = existingEntry.costCenterId ?? undefined
      let costCenterSourceRiclassificato: string | undefined

      if (cambiaContoRiclassifica || cambiaCentroRiclassifica) {
        const centro = await risolviCentroDiCosto(prisma, {
          accountId: cambiaContoRiclassifica ? validatedData.accountId : existingEntry.accountId,
          costCenterId: cambiaCentroRiclassifica ? validatedData.costCenterId : existingEntry.costCenterId,
        })
        if (centro.outcome === 'invalid') {
          return NextResponse.json(
            { error: centro.motivo, code: centro.code },
            { status: 400 }
          )
        }
        costCenterIdRiclassificato = centro.costCenterId
        costCenterSourceRiclassificato = centro.origine
      }

      const riclassificato = await prisma.journalEntry.update({
        where: { id },
        data: {
          accountId: cambiaContoRiclassifica ? validatedData.accountId : undefined,
          costCenterId: cambiaContoRiclassifica || cambiaCentroRiclassifica
            ? costCenterIdRiclassificato
            : undefined,
          costCenterSource: costCenterSourceRiclassificato,
        },
        select: { id: true, updatedAt: true },
      })

      await createAuditLog({
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'JournalEntry',
        entityId: id,
        venueId,
        oldValues: {
          accountId: existingEntry.accountId,
          costCenterId: existingEntry.costCenterId,
        },
        newValues: {
          accountId: cambiaContoRiclassifica ? validatedData.accountId : existingEntry.accountId,
          costCenterId: costCenterIdRiclassificato,
        },
      })

      return NextResponse.json(riclassificato)
    }

    // Cambiare conto o centro rimette in discussione la regola del centro di
    // costo: si rivaluta sullo stato risultante dall'aggiornamento, non su
    // quello attuale. Se nessuno dei due cambia, il movimento resta com'è.
    const cambiaConto = validatedData.accountId !== undefined
    const cambiaCentro = validatedData.costCenterId !== undefined
    let costCenterId: string | undefined
    let costCenterSource: string | undefined

    if (cambiaConto || cambiaCentro) {
      const centro = await risolviCentroDiCosto(prisma, {
        accountId: cambiaConto ? validatedData.accountId : existingEntry.accountId,
        costCenterId: cambiaCentro ? validatedData.costCenterId : existingEntry.costCenterId,
      })
      if (centro.outcome === 'invalid') {
        return NextResponse.json(
          { error: centro.motivo, code: centro.code },
          { status: 400 }
        )
      }
      costCenterId = centro.costCenterId
      costCenterSource = centro.origine
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
        costCenterId,
        costCenterSource,
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
      select: { id: true, closureId: true },
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

    // Non eliminabile se generato da chiusura
    if (existingEntry.closureId) {
      return NextResponse.json(
        { error: 'I movimenti generati da chiusure non sono eliminabili' },
        { status: 400 }
      )
    }

    // Cancellazione logica: le scritture contabili non vengono mai rimosse
    // dal database, restano tracciabili tramite deletedAt e l'audit log
    await prisma.journalEntry.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'DELETE',
      entityType: 'JournalEntry',
      entityId: id,
      venueId,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Errore DELETE /api/prima-nota/[id]', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione del movimento' },
      { status: 500 }
    )
  }
}
