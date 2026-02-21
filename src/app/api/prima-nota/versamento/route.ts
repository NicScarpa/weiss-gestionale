import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { bankDepositSchema } from '@/lib/validations/prima-nota'
import { getVenueId } from '@/lib/venue'

import { logger } from '@/lib/logger'
// POST /api/prima-nota/versamento - Versamento cassa → banca
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const venueId = await getVenueId()

    const body = await request.json()
    const validatedData = bankDepositSchema.parse(body)

    const description =
      validatedData.description ||
      `Versamento in banca ${validatedData.date.toLocaleDateString('it-IT')}`

    // Crea entrambi i movimenti in una transazione
    const [cashEntry, bankEntry] = await prisma.$transaction([
      // Movimento CASSA: Avere (uscita verso banca)
      prisma.journalEntry.create({
        data: {
          venueId: venueId,
          date: validatedData.date,
          registerType: 'CASH',
          description: description,
          documentRef: validatedData.documentRef,
          creditAmount: validatedData.amount,
          createdById: session.user.id,
        },
        include: {
          venue: {
            select: { id: true, name: true, code: true },
          },
        },
      }),
      // Movimento BANCA: Dare (entrata da cassa)
      prisma.journalEntry.create({
        data: {
          venueId: venueId,
          date: validatedData.date,
          registerType: 'BANK',
          description: description,
          documentRef: validatedData.documentRef,
          debitAmount: validatedData.amount,
          createdById: session.user.id,
        },
        include: {
          venue: {
            select: { id: true, name: true, code: true },
          },
        },
      }),
    ])

    return NextResponse.json(
      {
        message: 'Versamento registrato con successo',
        cashEntry: {
          ...cashEntry,
          creditAmount: Number(cashEntry.creditAmount),
        },
        bankEntry: {
          ...bankEntry,
          debitAmount: Number(bankEntry.debitAmount),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/prima-nota/versamento', error)
    return NextResponse.json(
      { error: 'Errore nella registrazione del versamento' },
      { status: 500 }
    )
  }
}
