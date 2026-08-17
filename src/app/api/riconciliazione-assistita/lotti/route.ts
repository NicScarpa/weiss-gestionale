import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { generaLotto } from '@/lib/services/reconciliation-batch-service'
import { SOGLIE } from '@/lib/reconciliation/punteggio'

/**
 * # Deroga dichiarata: queste rotte non hanno ancora un consumer
 *
 * `src/CLAUDE.md` vieta il codice irraggiungibile — «una route senza consumer
 * non è pronta per dopo: o si collega nella stessa sessione, o non si scrive».
 * Le quattro rotte della riconciliazione assistita (POST e GET qui, GET e
 * DELETE su `[id]`) hanno oggi come unico chiamante i propri test di
 * integrazione: nella Fase A1 non esiste schermata, per una scelta a sua volta
 * dichiarata — non si mostra una UI prima di aver misurato il motore che sta
 * dietro.
 *
 * **È una deroga consapevole, non una dimenticanza.** Queste quattro rotte
 * sono il contratto che la Fase A2 consuma: la coda di revisione si costruisce
 * sopra questa superficie, e cambiarla dopo averla scritta costa più che
 * scriverla ora. La deroga è scritta qui perché il costo di una regola con
 * eccezioni tacite è che la regola smette di valere.
 *
 * Va anche detto per intero: il piano della Fase A1 applica la regola opposta
 * a se stesso poche righe più in là, escludendo `raggruppaConflitti` proprio
 * con la motivazione «sarebbe codice esportato e mai chiamato». La differenza
 * che giustifica il diverso trattamento è che una funzione interna si può
 * aggiungere quando serve senza rompere nulla, mentre la forma di un endpoint
 * pubblico va decisa prima di costruirci sopra. Il debito è comunque reale, e
 * si chiude quando la A2 collega la schermata.
 *
 * ---
 *
 * Le regole implementate nella Fase A1. R1, R2 e R3 percorrono lo stesso
 * codice di punteggio — la sigla distingue verso e presenza di una fattura
 * elettronica dietro la scadenza, e **restringe le candidate**: chiedere il
 * solo R1 non produce proposte R2 o R3. R4 (banca ↔ prima nota) e R5
 * (giroconto) hanno una forma diversa e arrivano nella A2; R6-R8 nelle fasi C
 * e D.
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
