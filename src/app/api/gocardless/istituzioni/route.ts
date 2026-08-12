/**
 * L'elenco delle banche di un paese, per la ricerca nel wizard.
 *
 * Si restituiscono solo i cinque campi che servono a scegliere: l'API ne manda
 * molti di più (loghi, elenchi di paesi, identificativi interni) e passarli al
 * client sarebbe rumore che qualcuno prima o poi userebbe.
 */
import { NextResponse } from 'next/server'

import { withAuth } from '@/lib/api-utils'
import { clientDaAmbiente } from '@/lib/gocardless/servizio'

/** I giorni arrivano come stringa o come numero a seconda del campo. */
function giorni(valore: unknown): number | null {
  const n = typeof valore === 'string' ? Number.parseInt(valore, 10) : typeof valore === 'number' ? valore : NaN
  return Number.isFinite(n) ? n : null
}

export const GET = withAuth(
  async (request) => {
    const paese = new URL(request.url).searchParams.get('paese') ?? 'it'
    const esito = await clientDaAmbiente().istituzioni(paese)

    return NextResponse.json({
      istituzioni: esito.dati.map((i) => ({
        id: i.id,
        nome: i.name,
        bic: i.bic ?? null,
        giorniStorico: giorni(i.transaction_total_days),
        giorniAccesso: giorni(i.max_access_valid_for_days),
      })),
    })
  },
  { roles: ['admin'], venueScoped: true }
)
