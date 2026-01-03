import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/chiusure/previous-coffee?date=YYYY-MM-DD&venueId=xxx
// Recupera l'ultimo contatore caffè dalla chiusura precedente
export async function GET(request: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const dateStr = searchParams.get('date')
  const venueId = searchParams.get('venueId')

  if (!dateStr || !venueId) {
    return NextResponse.json(
      { error: 'Parametri mancanti: date e venueId richiesti' },
      { status: 400 }
    )
  }

  try {
    const currentDate = new Date(dateStr)

    // Trova la chiusura più recente precedente alla data corrente per questa venue
    const previousClosure = await prisma.dailyClosure.findFirst({
      where: {
        venueId,
        date: {
          lt: currentDate,
        },
        status: {
          in: ['VALIDATED', 'SUBMITTED', 'DRAFT'],
        },
      },
      orderBy: {
        date: 'desc',
      },
      include: {
        partials: {
          orderBy: {
            timeSlot: 'desc',
          },
          take: 1, // Prendi solo l'ultimo parziale della giornata
        },
      },
    })

    if (!previousClosure || previousClosure.partials.length === 0) {
      return NextResponse.json({
        previousCoffeeCount: null,
        previousDate: null,
        message: 'Nessuna chiusura precedente trovata',
      })
    }

    // Prendi l'ultimo contatore caffè del giorno precedente
    const lastPartial = previousClosure.partials[0]

    return NextResponse.json({
      previousCoffeeCount: lastPartial.coffeeCounter,
      previousDate: previousClosure.date.toISOString().split('T')[0],
    })
  } catch (error) {
    console.error('Errore nel recupero caffè precedente:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dati' },
      { status: 500 }
    )
  }
}
