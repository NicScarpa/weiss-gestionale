import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getVenueId } from '@/lib/venue'
import { getMonthlyTimesheet } from '@/lib/attendance/timesheet'

const filtriSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
  userId: z.string().min(1).optional(),
})

// GET /api/cartellino?month=&year=&userId= - Il cartellino mensile di una persona
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const filtri = filtriSchema.parse({
      month: searchParams.get('month') ?? undefined,
      year: searchParams.get('year') ?? undefined,
      userId: searchParams.get('userId') ?? undefined,
    })

    // Lo staff vede solo sé stesso: il parametro userId si forza lato server,
    // non ci si fida di quello che arriva dal client.
    const isGestore = ['admin', 'manager'].includes(session.user.role || '')
    const targetUserId = isGestore
      ? (filtri.userId ?? session.user.id)
      : session.user.id

    const venueId = await getVenueId()
    const cartellino = await getMonthlyTimesheet(
      targetUserId,
      filtri.month,
      filtri.year,
      venueId || undefined
    )

    if (!cartellino) {
      return NextResponse.json(
        { error: 'Cartellino non disponibile per questa persona' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: cartellino })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Parametri non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore GET /api/cartellino', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del cartellino' },
      { status: 500 }
    )
  }
}
