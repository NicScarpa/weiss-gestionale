import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { findMatchCandidates } from '@/lib/reconciliation'
import { getVenueId } from '@/lib/venue'
import { withAuth } from '@/lib/api-utils'
import { patchBankTransactionSchema, CAMPI_SOLO_MANUALI } from '@/lib/validations/reconciliation'
import { differenze, registraModifiche } from '@/lib/banca/cronologia'
import { SELEZIONE_RIGA, mappaRiga } from '@/lib/banca/query-estratto-conto'

import { logger } from '@/lib/logger'
// GET /api/bank-transactions/[id] - Dettaglio transazione con candidati match
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

    const transaction = await prisma.bankTransaction.findFirst({
      where: { id, venueId },
      include: {
        venue: {
          select: { id: true, name: true, code: true },
        },
        matchedEntry: {
          select: {
            id: true,
            date: true,
            description: true,
            debitAmount: true,
            creditAmount: true,
            documentRef: true,
            account: {
              select: { id: true, code: true, name: true },
            },
          },
        },
        importBatch: {
          select: {
            id: true,
            filename: true,
            source: true,
            importedAt: true,
          },
        },
      },
    })

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transazione non trovata' },
        { status: 404 }
      )
    }

    // Se la transazione non è ancora matchata, cerca candidati
    let matchCandidates: Awaited<ReturnType<typeof findMatchCandidates>> = []
    if (
      transaction.status === 'PENDING' ||
      transaction.status === 'UNMATCHED' ||
      transaction.status === 'TO_REVIEW'
    ) {
      matchCandidates = await findMatchCandidates(
        {
          id: transaction.id,
          transactionDate: transaction.transactionDate,
          description: transaction.description,
          amount: Number(transaction.amount),
        },
        transaction.venueId,
        10
      )
    }

    return NextResponse.json({
      ...transaction,
      amount: Number(transaction.amount),
      balanceAfter: transaction.balanceAfter
        ? Number(transaction.balanceAfter)
        : null,
      matchConfidence: transaction.matchConfidence
        ? Number(transaction.matchConfidence)
        : null,
      matchedEntry: transaction.matchedEntry
        ? {
            ...transaction.matchedEntry,
            debitAmount: transaction.matchedEntry.debitAmount
              ? Number(transaction.matchedEntry.debitAmount)
              : null,
            creditAmount: transaction.matchedEntry.creditAmount
              ? Number(transaction.matchedEntry.creditAmount)
              : null,
          }
        : null,
      matchCandidates,
    })
  } catch (error) {
    logger.error('GET /api/bank-transactions/[id] error', error)
    return NextResponse.json(
      { error: 'Errore nel recupero della transazione' },
      { status: 500 }
    )
  }
}

// DELETE /api/bank-transactions/[id] - Elimina transazione
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

    const transaction = await prisma.bankTransaction.findFirst({
      where: { id, venueId },
    })

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transazione non trovata' },
        { status: 404 }
      )
    }

    // Una riga con una scrittura collegata non si cestina: prima si scollega,
    // altrimenti la scrittura resterebbe appesa a un movimento invisibile.
    if (transaction.matchedEntryId) {
      return NextResponse.json(
        { error: 'Il movimento ha una scrittura collegata: prima scollegala, poi spostalo nel Cestino' },
        { status: 409 }
      )
    }

    // Cancellazione logica (tracciabilità dei movimenti bancari)
    await prisma.bankTransaction.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: session.user.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('DELETE /api/bank-transactions/[id] error', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione della transazione' },
      { status: 500 }
    )
  }
}

// PATCH /api/bank-transactions/[id] - Modifica descrizione, causale e note
// (anche data/importo/verso sulle sole righe MANUAL), con la cronologia.
export const PATCH = withAuth<{ id: string }>(
  async (request, { venueId, user, params }) => {
    let corpo: unknown
    try {
      corpo = await request.json()
    } catch {
      return NextResponse.json({ error: 'Corpo non valido' }, { status: 400 })
    }
    const parsed = patchBankTransactionSchema.safeParse(corpo)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dati non validi', details: parsed.error.issues }, { status: 400 })
    }
    const dati = parsed.data

    const riga = await prisma.bankTransaction.findFirst({ where: { id: params.id, venueId } })
    if (!riga) return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })

    // Data, importo e verso vengono dalla banca: non è un permesso, è la forma
    // del dato (spec, decisione 2). Solo la riga inserita a mano li cambia.
    const toccaCampiDellaBanca = CAMPI_SOLO_MANUALI.some((c) => dati[c] !== undefined)
    if (toccaCampiDellaBanca && riga.importSource !== 'MANUAL') {
      return NextResponse.json(
        { error: 'Data e importo vengono dalla banca e non si modificano' },
        { status: 400 }
      )
    }

    const pulisci = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null)
    const dopo = {
      ...(dati.descrizione !== undefined ? { descrizione: pulisci(dati.descrizione) ?? null } : {}),
      ...(dati.causale !== undefined ? { causale: pulisci(dati.causale) ?? null } : {}),
      ...(dati.note !== undefined ? { note: pulisci(dati.note) ?? null } : {}),
    }
    const modifiche = differenze(
      { descrizione: riga.descrizione, causale: riga.causale, note: riga.note, sezione: riga.sezione },
      dopo
    )

    const aggiornata = await prisma.$transaction(async (tx) => {
      await tx.bankTransaction.update({
        where: { id: riga.id },
        data: {
          ...dopo,
          ...(dati.transactionDate ? { transactionDate: new Date(`${dati.transactionDate}T00:00:00.000Z`) } : {}),
          ...(dati.valueDate !== undefined
            ? { valueDate: dati.valueDate ? new Date(`${dati.valueDate}T00:00:00.000Z`) : null }
            : {}),
          ...(dati.amount !== undefined ? { amount: dati.amount } : {}),
        },
      })
      await registraModifiche(tx, { bankTransactionId: riga.id, userId: user.id ?? null, modifiche })
      return tx.bankTransaction.findUniqueOrThrow({ where: { id: riga.id }, ...SELEZIONE_RIGA })
    })

    return NextResponse.json(mappaRiga(aggiornata))
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
