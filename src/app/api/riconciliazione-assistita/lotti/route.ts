import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { generaLotto } from '@/lib/services/reconciliation-batch-service'
import { SOGLIE } from '@/lib/reconciliation/punteggio'

/**
 * Le regole implementate nella Fase A1. R1, R2 e R3 percorrono lo stesso
 * codice — la sigla distingue solo se dietro la scadenza c'è una fattura
 * elettronica. R4 (banca ↔ prima nota) e R5 (giroconto) hanno una forma
 * diversa e arrivano nella A2; R6-R8 nelle fasi C e D.
 */
const REGOLE_NOTE = ['R1', 'R2', 'R3'] as const

const creaSchema = z
  .object({
    dateFrom: z.coerce.date(),
    dateTo: z.coerce.date(),
    regole: z.array(z.enum(REGOLE_NOTE)).min(1, 'Almeno una regola'),
    sogliaMinima: z.number().int().min(0).max(100).optional(),
  })
  .refine((valore) => valore.dateFrom <= valore.dateTo, {
    message: 'La data iniziale deve precedere quella finale',
    path: ['dateFrom'],
  })

/** POST — genera un lotto di proposte sul periodo indicato. */
export const POST = withAuth(
  async (request, { venueId, user }) => {
    try {
      const validato = creaSchema.safeParse(await request.json())
      if (!validato.success) {
        return NextResponse.json(
          { error: 'Dati non validi', dettagli: validato.error.issues },
          { status: 400 }
        )
      }

      const { dateFrom, dateTo, regole, sogliaMinima } = validato.data

      const esito = await generaLotto({
        venueId,
        dateFrom,
        dateTo,
        regole: [...regole],
        userId: user.id ?? null,
        sogliaMinima: sogliaMinima ?? SOGLIE.MINIMA,
      })

      // La firma è `AuditLogParams` in src/lib/audit.ts: il campo è
      // `entityType`, non `entity`, e non esiste alcun `metadata` — i dati
      // dell'evento vanno in `newValues`.
      await createAuditLog({
        action: 'CREATE',
        entityType: 'ReconciliationBatch',
        entityId: esito.batchId,
        userId: user.id ?? null,
        venueId,
        newValues: { contaProposte: esito.contaProposte, regole: [...regole] },
      })

      return NextResponse.json(esito, { status: 201 })
    } catch (errore) {
      logger.error('Generazione del lotto di riconciliazione fallita', errore)
      return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)

/** GET — lo storico delle analisi, dalla più recente. */
export const GET = withAuth(
  async (_request, { venueId }) => {
    try {
      const lotti = await prisma.reconciliationBatch.findMany({
        where: { venueId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          dateFrom: true,
          dateTo: true,
          stato: true,
          contaProposte: true,
          contaApprovate: true,
          contaScartate: true,
          contaSuperate: true,
          aiRefertoAt: true,
          createdAt: true,
        },
      })

      return NextResponse.json({ lotti })
    } catch (errore) {
      logger.error('Lettura dello storico dei lotti fallita', errore)
      return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
