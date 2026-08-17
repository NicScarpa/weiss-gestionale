import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-utils'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { approvaProposta } from '@/lib/services/reconciliation-decision-service'

/**
 * POST — approva una proposta: la riga bancaria diventa un movimento di prima
 * nota e le scadenze indicate risultano pagate (spec A2, decisione 3).
 *
 * La rotta non decide nulla: traduce. Ogni esito del servizio ha uno stato
 * HTTP e un messaggio che dice cosa è successo, perché è quel messaggio che
 * l'utente legge nel toast.
 */
export const POST = withAuth<{ id: string }>(
  async (_request, { venueId, user, params }) => {
    try {
      const esito = await approvaProposta({
        proposalId: params.id,
        venueId,
        userId: user.id ?? null,
      })

      switch (esito.outcome) {
        case 'ok':
          // Chi ha approvato e cosa ne è nato: la proposta porta già
          // `decisoDaId`, ma il registro è il posto in cui si guarda quando ci
          // si chiede da dove venga una scrittura.
          await createAuditLog({
            action: 'UPDATE',
            entityType: 'ReconciliationProposal',
            entityId: params.id,
            userId: user.id ?? null,
            venueId,
            newValues: {
              stato: 'approvata',
              journalEntryId: esito.journalEntryId,
              riconciliazioni: esito.reconciliationIds,
            },
          })
          return NextResponse.json({
            ok: true,
            journalEntryId: esito.journalEntryId,
            reconciliationIds: esito.reconciliationIds,
          })

        case 'proposta_non_trovata':
          return NextResponse.json({ error: 'Proposta non trovata' }, { status: 404 })

        case 'gia_decisa':
          // 409 e non 400: la richiesta era valida, è lo stato del mondo a
          // essere cambiato — di solito un doppio clic, o due schede aperte.
          return NextResponse.json(
            { error: `La proposta è già ${esito.stato}`, stato: esito.stato },
            { status: 409 }
          )

        case 'superata':
          return NextResponse.json({ error: esito.motivo, stato: 'superata' }, { status: 409 })

        case 'riconciliazione_rifiutata':
          return NextResponse.json({ error: esito.motivo }, { status: 422 })
      }
    } catch (errore) {
      logger.error('Approvazione della proposta fallita', errore)
      return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
