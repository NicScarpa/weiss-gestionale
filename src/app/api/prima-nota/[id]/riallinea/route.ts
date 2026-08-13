import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { imputazioniDivergenti, riallineaFette, RiallineamentoNonRigenerabile } from '@/lib/invoices/riallineamento'

/**
 * POST /api/prima-nota/[id]/riallinea
 *
 * Cancella le fette ereditate divergenti del movimento e le rigenera dalle
 * imputazioni correnti della fattura (Task 7, spec sezione 2). Risponde 409
 * se non c'è nessuna divergenza da riallineare: riallineare qualcosa che è
 * già allineato deve essere un errore esplicito, non un no-op silenzioso.
 * Risponde 422 se il riallineamento non può rigenerare le fette (una
 * guardia di `ereditaFetteDaFattura` blocca la fattura oggi): in quel caso
 * `riallineaFette` ha già fatto fare rollback alla transazione, nessuna
 * fetta è andata persa.
 */
export async function POST(
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

    const movimento = await prisma.journalEntry.findFirst({
      where: { id, venueId },
      select: { id: true },
    })
    if (!movimento) {
      return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })
    }

    const divergenza = await imputazioniDivergenti(id)
    if (!divergenza.divergente) {
      // Due cause diverse dietro lo stesso "niente da riallineare qui", e solo
      // una è davvero "tutto a posto": una riconciliazione che non ha MAI
      // scritto fette ereditate (la fattura non era coperta per intero
      // all'epoca) non compare mai nella rilevazione, quindi risponderebbe lo
      // stesso 409 di un movimento davvero allineato — ma qui non c'è nessun
      // pulsante che aiuti: va completata l'imputazione sulla fattura.
      const senzaFette = await prisma.scheduleReconciliation.findFirst({
        where: {
          journalEntryId: id,
          status: 'VERIFIED',
          schedule: { invoiceId: { not: null } },
          allocations: { none: {} },
        },
        select: { id: true },
      })

      return NextResponse.json(
        {
          error: senzaFette
            ? 'Questa riconciliazione non ha mai generato fette ereditate: completa prima le imputazioni sulla fattura'
            : 'Il movimento non ha imputazioni divergenti da riallineare',
        },
        { status: 409 }
      )
    }

    const eseguiti = await prisma.$transaction((tx) => riallineaFette(tx, id))

    // Scritto DOPO che la transazione è risolta: `createAuditLog` usa il
    // client globale, non `tx`, quindi scriverlo prima si committerebbe anche
    // se il resto facesse rollback (vedi il docblock di `riallineaFette`).
    for (const esito of eseguiti) {
      await createAuditLog({
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'ScheduleReconciliation',
        entityId: esito.reconciliationId,
        venueId,
        oldValues: { fette: esito.fetteRimosse },
        newValues: { fette: esito.fetteScritte, invoiceId: esito.invoiceId, riallineamento: true },
      })
    }

    return NextResponse.json({
      fette: eseguiti.reduce((somma, esito) => somma + esito.fetteScritte, 0),
      invoiceId: divergenza.invoiceId,
      message: 'Fette riallineate alle imputazioni correnti della fattura',
    })
  } catch (error) {
    if (error instanceof RiallineamentoNonRigenerabile) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }

    logger.error('Errore POST /api/prima-nota/[id]/riallinea', error)
    return NextResponse.json(
      { error: 'Errore nel riallineamento delle fette' },
      { status: 500 }
    )
  }
}
