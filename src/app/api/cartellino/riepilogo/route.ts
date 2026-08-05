import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { getVenueId } from '@/lib/venue'
import { generatePayrollData } from '@/lib/attendance/payroll-calculator'

const filtriSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2020).max(2100),
})

// GET /api/cartellino/riepilogo?month=&year= - Le ore del mese di tutto il team
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const filtri = filtriSchema.parse({
      month: searchParams.get('month') ?? undefined,
      year: searchParams.get('year') ?? undefined,
    })

    const venueId = await getVenueId()
    const { summaries, warnings } = await generatePayrollData(
      filtri.month,
      filtri.year,
      venueId || undefined
    )

    return NextResponse.json({ data: { summaries, warnings } })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Parametri non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore GET /api/cartellino/riepilogo', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del riepilogo' },
      { status: 500 }
    )
  }
}
