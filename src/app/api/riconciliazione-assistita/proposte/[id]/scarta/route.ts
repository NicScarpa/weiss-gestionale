import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/api-utils'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { scartaProposta } from '@/lib/services/reconciliation-decision-service'

/**
 * POST — scarta una proposta: *salta per ora* (`perSempre: false`) segna solo
 * lo stato; *non propormelo mai più* (`perSempre: true`) scrive anche la
 * coppia in `ReconciliationExclusion`, così un lotto rigenerato non la
 * ripropone (spec A2, «Lo scarto ha due porte»).
 *
 * La rotta non decide nulla: traduce, come `approva`.
 */
const scartaSchema = z.object({
  perSempre: z.boolean(),
  motivo: z.string().trim().min(1).max(500).optional(),
})

export const POST = withAuth<{ id: string }>(
  async (request, { venueId, user, params }) => {
    try {
      const validato = scartaSchema.safeParse(await request.json())
      if (!validato.success) {
        return NextResponse.json(
          { error: 'Dati non validi', dettagli: validato.error.issues },
          { status: 400 }
        )
      }

      const esito = await scartaProposta({
        proposalId: params.id,
        venueId,
        userId: user.id ?? null,
        perSempre: validato.data.perSempre,
        motivo: validato.data.motivo,
      })

      switch (esito.outcome) {
        case 'ok':
          await createAuditLog({
            action: 'UPDATE',
            entityType: 'ReconciliationProposal',
            entityId: params.id,
            userId: user.id ?? null,
            venueId,
            newValues: { stato: 'scartata', perSempre: validato.data.perSempre },
          })
          return NextResponse.json({ ok: true })

        case 'proposta_non_trovata':
          return NextResponse.json({ error: 'Proposta non trovata' }, { status: 404 })

        case 'gia_decisa':
          // 409 e non 400: la richiesta era valida, è lo stato del mondo a
          // essere cambiato — di solito un doppio clic, o due schede aperte.
          return NextResponse.json(
            { error: `La proposta è già ${esito.stato}`, stato: esito.stato },
            { status: 409 }
          )
      }
    } catch (errore) {
      logger.error('Scarto della proposta fallito', errore)
      return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
