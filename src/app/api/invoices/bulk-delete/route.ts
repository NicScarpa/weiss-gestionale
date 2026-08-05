import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

import { logger } from '@/lib/logger'
import {
  checkInvoiceDeletable,
  softDeleteSchedulesForInvoice,
} from '@/lib/services/invoice-schedule-service'
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

    // Verifica che le fatture non siano già registrate o pagate
    const invoicesToDelete = await prisma.electronicInvoice.findMany({
      where: {
        id: { in: ids },
        status: { notIn: ['RECORDED', 'PAID'] },
      },
      select: { id: true },
    })

    if (invoicesToDelete.length === 0) {
      return NextResponse.json(
        { error: 'Nessuna fattura eliminabile. Le fatture registrate o pagate non possono essere eliminate.' },
        { status: 400 }
      )
    }

    const candidateIds = invoicesToDelete.map((i) => i.id)

    // Escludi le fatture con pagamenti registrati sulle scadenze generate:
    // eliminarle scollegherebbe pagamenti reali dal documento che li giustifica
    const checks = await Promise.all(
      candidateIds.map(async (id) => ({ id, check: await checkInvoiceDeletable(id) }))
    )
    const blocked = checks.filter((c) => !c.check.canDelete).map((c) => c.id)
    const idsToDelete = checks.filter((c) => c.check.canDelete).map((c) => c.id)

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
    // conservati e le scadenze che ne derivavano spariscono dallo scadenzario
    const { deleted, schedules } = await prisma.$transaction(async (tx) => {
      let schedules = 0
      for (const id of idsToDelete) {
        schedules += await softDeleteSchedulesForInvoice(id, session.user.id, tx)
      }

      const deleteResult = await tx.electronicInvoice.updateMany({
        where: { id: { in: idsToDelete } },
        data: { deletedAt: new Date() },
      })

      return { deleted: deleteResult.count, schedules }
    })

    return NextResponse.json({
      deleted,
      scadenzeAnnullate: schedules,
      bloccate: blocked.length > 0 ? blocked : undefined,
      message:
        blocked.length > 0
          ? `${deleted} fatture eliminate. ${blocked.length} non eliminate: hanno pagamenti registrati.`
          : `${deleted} fatture eliminate con successo`,
    })
  } catch (error) {
    logger.error('Errore eliminazione in blocco', error)
    return NextResponse.json(
      { error: 'Errore durante l\'eliminazione delle fatture' },
      { status: 500 }
    )
  }
}
