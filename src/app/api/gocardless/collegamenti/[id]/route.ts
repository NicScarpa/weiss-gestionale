/**
 * Scollegare la banca.
 *
 * I movimenti già importati restano: sono scritture contabili, non una cache.
 * Si spegne la connessione, i conti tornano senza collegamento e con
 * l'interruttore giù. Un ricollegamento riparte dalla configurazione, non dai
 * dati.
 */
import { NextResponse } from 'next/server'

import { withAuth } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { rispostaErroreGoCardless } from '@/lib/gocardless/risposte'

async function connessioneDellaSede(id: string, venueId: string) {
  return prisma.bankConnection.findFirst({ where: { id, venueId, deletedAt: null } })
}

export const DELETE = withAuth<{ id: string }>(
  async (_request, { venueId, params }) => {
    try {
      const connessione = await connessioneDellaSede(params.id, venueId)
      if (!connessione) return NextResponse.json({ error: 'Collegamento non trovato' }, { status: 404 })

      await prisma.$transaction([
        prisma.bankAccount.updateMany({
          where: { connectionId: connessione.id },
          data: { connectionId: null, providerAccountId: null, syncEnabled: false },
        }),
        prisma.bankConnection.update({
          where: { id: connessione.id },
          data: { deletedAt: new Date() },
        }),
      ])

      return NextResponse.json({ scollegato: true })
    } catch (errore) {
      return rispostaErroreGoCardless(errore, 'DELETE /api/gocardless/collegamenti/[id]')
    }
  },
  { roles: ['admin'], venueScoped: true }
)
