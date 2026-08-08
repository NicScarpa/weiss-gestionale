import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handleApiError, notFound, ok, withAuth } from '@/lib/api-utils'
import { getMonthlyTimesheet } from '@/lib/attendance/timesheet'

const filtriSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
  userId: z.string().min(1).optional(),
})

/** Chi può leggere il cartellino di un'altra persona. */
const GESTORI = ['admin', 'manager']

// GET /api/cartellino?month=&year=&userId= - Il cartellino mensile di una persona
export const GET = withAuth(
  async (request: NextRequest, { user, venueId }) => {
    try {
      const { searchParams } = request.nextUrl
      const filtri = filtriSchema.parse({
        month: searchParams.get('month') ?? undefined,
        year: searchParams.get('year') ?? undefined,
        userId: searchParams.get('userId') ?? undefined,
      })

      // Lo staff vede solo sé stesso: il parametro userId si forza lato server,
      // non ci si fida di quello che arriva dal client.
      const targetUserId = GESTORI.includes(user.role)
        ? (filtri.userId ?? user.id)
        : user.id

      const cartellino = await getMonthlyTimesheet(
        targetUserId,
        filtri.month,
        filtri.year,
        venueId
      )

      if (!cartellino) {
        return notFound('Cartellino non disponibile per questa persona')
      }

      return ok({ data: cartellino })
    } catch (error) {
      return handleApiError(
        error,
        'GET /api/cartellino',
        'Errore nel recupero del cartellino'
      )
    }
  },
  { venueScoped: true }
)
