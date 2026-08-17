import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { logger } from '@/lib/logger'

/**
 * GET /api/customers/[id] - Un singolo cliente, con tutti i suoi campi.
 *
 * La lista ne restituisce tre (denominazione, partita IVA, codice fiscale) e
 * apre agli altri solo con `full=true`: la scheda in modifica ha bisogno di
 * *questo* cliente per intero, non dell'anagrafica completa a ogni apertura.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        defaultAccount: {
          select: { id: true, code: true, name: true },
        },
      },
    })

    if (!customer) {
      return NextResponse.json({ error: 'Cliente non trovato' }, { status: 404 })
    }

    return NextResponse.json({ customer })
  } catch (error) {
    logger.error('Errore GET /api/customers/[id]', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del cliente' },
      { status: 500 }
    )
  }
}
