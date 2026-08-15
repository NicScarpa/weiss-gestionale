import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import type { InvoiceStatus } from '@prisma/client'

import { logger } from '@/lib/logger'
import {
  checkInvoicesDeletable,
  softDeleteSchedulesForInvoices,
} from '@/lib/services/invoice-schedule-service'

/**
 * Stati che rendono una fattura non eliminabile: il documento è già entrato in
 * contabilità o risulta pagato.
 */
const STATI_NON_ELIMINABILI: InvoiceStatus[] = ['RECORDED', 'PAID']

const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1, 'Seleziona almeno una fattura'),
  password: z.string().min(1, 'Password richiesta'),
})

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin può eliminare in blocco
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Solo gli amministratori possono eliminare in blocco' }, { status: 403 })
    }

    const body = await request.json()
    const validationResult = bulkDeleteSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      )
    }

    const { ids, password } = validationResult.data

    // Verifica password utente
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    })

    if (!user?.passwordHash) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash)
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Password non corretta' }, { status: 401 })
    }

    // Una query sola per tutta la selezione: si leggono anche gli stati che
    // escludono l'eliminazione, invece di filtrarli via nel `where`, così le
    // fatture scartate si possono contare e riferire a chi le aveva scelte.
    const invoices = await prisma.electronicInvoice.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    })

    const candidateIds = invoices
      .filter((i) => !STATI_NON_ELIMINABILI.includes(i.status))
      .map((i) => i.id)

    // Comprende sia le registrate/pagate sia gli id che non corrispondono più a
    // una fattura viva: in entrambi i casi l'utente ne aveva chiesta
    // l'eliminazione e non deve credere che sia avvenuta.
    const saltatePerStato = ids.length - candidateIds.length

    if (candidateIds.length === 0) {
      return NextResponse.json(
        { error: 'Nessuna fattura eliminabile. Le fatture registrate o pagate non possono essere eliminate.' },
        { status: 400 }
      )
    }

    // Escludi le fatture con pagamenti registrati sulle scadenze generate:
    // eliminarle scollegherebbe pagamenti reali dal documento che li giustifica
    const checks = await checkInvoicesDeletable(candidateIds)
    const blocked = candidateIds.filter((id) => !checks.get(id)?.canDelete)
    const idsToDelete = candidateIds.filter((id) => checks.get(id)?.canDelete)

    if (idsToDelete.length === 0) {
      return NextResponse.json(
        {
          error:
            'Nessuna fattura eliminabile: su tutte risultano pagamenti già registrati nello scadenzario.',
          bloccate: blocked,
        },
        { status: 409 }
      )
    }

    // Cancellazione logica in transazione: i documenti fiscali restano
    // conservati e le scadenze che ne derivavano spariscono dallo scadenzario.
    // Due aggiornamenti, non due per fattura: la transazione deve chiudersi
    // entro il timeout anche quando la selezione è di centinaia di documenti.
    const { deleted, schedules } = await prisma.$transaction(async (tx) => {
      const schedules = await softDeleteSchedulesForInvoices(
        idsToDelete,
        session.user.id,
        tx
      )

      const deleteResult = await tx.electronicInvoice.updateMany({
        where: { id: { in: idsToDelete } },
        data: { deletedAt: new Date() },
      })

      return { deleted: deleteResult.count, schedules }
    })

    const dettagli: string[] = []
    if (blocked.length > 0) {
      dettagli.push(`${blocked.length} non eliminate: hanno pagamenti registrati`)
    }
    if (saltatePerStato > 0) {
      dettagli.push(`${saltatePerStato} non eliminate: già registrate o pagate`)
    }

    return NextResponse.json({
      deleted,
      scadenzeAnnullate: schedules,
      bloccate: blocked.length > 0 ? blocked : undefined,
      saltatePerStato: saltatePerStato > 0 ? saltatePerStato : undefined,
      message: [`${deleted} fatture eliminate`, ...dettagli].join('. '),
    })
  } catch (error) {
    logger.error('Errore eliminazione in blocco', error)
    return NextResponse.json(
      { error: 'Errore durante l\'eliminazione delle fatture' },
      { status: 500 }
    )
  }
}
