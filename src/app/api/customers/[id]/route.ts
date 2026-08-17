import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, notFound, ok, withAuth } from '@/lib/api-utils'

interface Params {
  id: string
}

/**
 * GET /api/customers/[id] - Un singolo cliente, con tutti i suoi campi.
 *
 * La lista ne restituisce tre (denominazione, partita IVA, codice fiscale) e
 * apre agli altri solo con `full=true`: la scheda in modifica ha bisogno di
 * *questo* cliente per intero, non dell'anagrafica completa a ogni apertura.
 *
 * Restituisce anche il codice fiscale in chiaro — l'estensione di cifratura lo
 * decifra in lettura — quindi è riservato a chi l'anagrafica la amministra.
 */
export const GET = withAuth<Params>(
  async (_request: NextRequest, { params }) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: params.id },
        include: {
          defaultAccount: {
            select: { id: true, code: true, name: true },
          },
        },
      })

      if (!customer) return notFound('Cliente non trovato')

      return ok({ customer })
    } catch (error) {
      return handleApiError(error, 'Errore nel recupero del cliente')
    }
  },
  { roles: ['admin', 'manager'] }
)
