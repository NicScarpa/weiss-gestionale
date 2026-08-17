import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-utils'
import { createAuditLog } from '@/lib/audit'
import { scollegaRigaBancaria } from '@/lib/services/promozione-riga-bancaria-service'

/** Scollega: ritira ciò che la promozione ha creato, o slega la R4 (spec, «promuoviRigaBancaria»). */
export const POST = withAuth<{ id: string }>(
  async (_request, { venueId, user, params }) => {
    const esito = await scollegaRigaBancaria({ bankTransactionId: params.id, venueId, userId: user.id ?? null })
    if (esito.outcome === 'riga_non_trovata') {
      return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })
    }
    await createAuditLog({
      userId: user.id ?? null,
      action: 'UPDATE',
      entityType: 'BankTransaction',
      entityId: params.id,
      venueId,
      newValues: { scollegata: true, scritturaRitirata: esito.scritturaRitirata, riconciliazioniAnnullate: esito.riconciliazioniAnnullate },
    })
    return NextResponse.json({ ok: true, scritturaRitirata: esito.scritturaRitirata, riconciliazioniAnnullate: esito.riconciliazioniAnnullate })
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
