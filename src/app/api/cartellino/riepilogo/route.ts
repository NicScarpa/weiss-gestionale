import { NextRequest } from 'next/server'
import { z } from 'zod'
import { handleApiError, ok, withAuth } from '@/lib/api-utils'
import { generatePayrollData } from '@/lib/attendance/payroll-calculator'

const filtriSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
})

// GET /api/cartellino/riepilogo?month=&year= - Le ore del mese di tutto il team
// Sono le ore, e quindi le retribuzioni, di tutti: resta a chi prepara le paghe.
export const GET = withAuth(
  async (request: NextRequest, { venueId }) => {
    try {
      const { searchParams } = request.nextUrl
      const filtri = filtriSchema.parse({
        month: searchParams.get('month') ?? undefined,
        year: searchParams.get('year') ?? undefined,
      })

      const { summaries, warnings } = await generatePayrollData(
        filtri.month,
        filtri.year,
        venueId
      )

      return ok({ data: { summaries, warnings } })
    } catch (error) {
      return handleApiError(
        error,
        'GET /api/cartellino/riepilogo',
        'Errore nel recupero del riepilogo'
      )
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
