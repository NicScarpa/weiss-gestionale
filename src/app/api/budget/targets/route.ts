import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { MONTH_NUMBER_TO_KEY, MONTH_KEYS } from '@/types/budget'

// Schema validazione
const getTargetsSchema = z.object({
  venueId: z.string(),
  year: z.coerce.number().int().min(2020).max(2100),
})

const updateTargetsSchema = z.object({
  venueId: z.string(),
  year: z.number().int().min(2020).max(2100),
  targets: z.object({
    jan: z.number().min(0),
    feb: z.number().min(0),
    mar: z.number().min(0),
    apr: z.number().min(0),
    may: z.number().min(0),
    jun: z.number().min(0),
    jul: z.number().min(0),
    aug: z.number().min(0),
    sep: z.number().min(0),
    oct: z.number().min(0),
    nov: z.number().min(0),
    dec: z.number().min(0),
  }),
})

// Mapping MonthKey -> numero mese (1-12)
const MONTH_KEY_TO_NUMBER: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

// GET /api/budget/targets - Recupera target mensili
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)

    const validationResult = getTargetsSchema.safeParse({
      venueId: searchParams.get('venueId'),
      year: searchParams.get('year') || new Date().getFullYear(),
    })

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Parametri non validi', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { venueId, year } = validationResult.data

    // Verifica accesso sede
    if (session.user.role !== 'admin' && venueId !== session.user.venueId) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Recupera i target
    const targets = await prisma.budgetTarget.findMany({
      where: { venueId, year },
      orderBy: { month: 'asc' },
    })

    // Costruisci oggetto con valori mensili
    const monthlyTargets: Record<string, number> = {}
    let annualTotal = 0

    for (const key of MONTH_KEYS) {
      monthlyTargets[key] = 0
    }

    for (const target of targets) {
      const monthKey = MONTH_NUMBER_TO_KEY[target.month]
      if (monthKey) {
        const value = Number(target.targetRevenue)
        monthlyTargets[monthKey] = value
        annualTotal += value
      }
    }

    return NextResponse.json({
      venueId,
      year,
      targets: monthlyTargets,
      annualTotal,
      hasTargets: targets.length > 0,
    })
  } catch (error) {
    console.error('Errore GET /api/budget/targets:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei target' },
      { status: 500 }
    )
  }
}

// PUT /api/budget/targets - Aggiorna target mensili
export async function PUT(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin o manager
    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json(
        { error: 'Non hai i permessi per modificare i target' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validationResult = updateTargetsSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Dati non validi', details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const { venueId, year, targets } = validationResult.data

    // Verifica accesso sede
    if (session.user.role !== 'admin' && venueId !== session.user.venueId) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    // Verifica che la venue esista
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true, name: true },
    })

    if (!venue) {
      return NextResponse.json({ error: 'Sede non trovata' }, { status: 404 })
    }

    // Upsert di tutti i target mensili in transazione
    const operations = Object.entries(targets).map(([monthKey, value]) => {
      const month = MONTH_KEY_TO_NUMBER[monthKey]
      if (!month) return null

      return prisma.budgetTarget.upsert({
        where: {
          venueId_year_month: { venueId, year, month },
        },
        create: {
          venueId,
          year,
          month,
          targetRevenue: value,
        },
        update: {
          targetRevenue: value,
        },
      })
    }).filter(Boolean) as ReturnType<typeof prisma.budgetTarget.upsert>[]

    await prisma.$transaction(operations)

    // Recupera i target aggiornati
    const updatedTargets = await prisma.budgetTarget.findMany({
      where: { venueId, year },
      orderBy: { month: 'asc' },
    })

    // Calcola totale annuale
    const annualTotal = updatedTargets.reduce(
      (sum: number, t: { targetRevenue: unknown }) => sum + Number(t.targetRevenue),
      0
    )

    return NextResponse.json({
      success: true,
      venueId,
      year,
      targets,
      annualTotal,
      message: 'Target aggiornati con successo',
    })
  } catch (error) {
    console.error('Errore PUT /api/budget/targets:', error)
    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento dei target' },
      { status: 500 }
    )
  }
}
