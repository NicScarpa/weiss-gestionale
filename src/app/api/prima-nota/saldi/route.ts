import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/prima-nota/saldi - Saldi attuali dei registri
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')

    // Determina la sede da filtrare
    let targetVenueId: string | undefined

    if (session.user.role !== 'admin') {
      targetVenueId = session.user.venueId || undefined
    } else if (venueId) {
      targetVenueId = venueId
    }

    // Calcola i saldi correnti dai movimenti
    const calculatedBalances = await calculateBalancesFromEntries(targetVenueId)

    return NextResponse.json({
      data: calculatedBalances,
    })
  } catch (error) {
    console.error('Errore GET /api/prima-nota/saldi:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei saldi' },
      { status: 500 }
    )
  }
}

// Funzione helper per calcolare saldi dai movimenti
async function calculateBalancesFromEntries(venueId?: string) {
  const registerTypes = ['CASH', 'BANK'] as const

  // Se c'è una sede specifica, calcola per quella
  if (venueId) {
    const results = await Promise.all(
      registerTypes.map(async (registerType) => {
        const aggregation = await prisma.journalEntry.aggregate({
          where: {
            venueId,
            registerType,
          },
          _sum: {
            debitAmount: true,
            creditAmount: true,
          },
        })

        const totalDebits = Number(aggregation._sum.debitAmount || 0)
        const totalCredits = Number(aggregation._sum.creditAmount || 0)
        const closingBalance = totalDebits - totalCredits

        return {
          registerType,
          openingBalance: 0,
          totalDebits,
          totalCredits,
          closingBalance,
        }
      })
    )

    const cashBalance = results.find((r) => r.registerType === 'CASH')?.closingBalance || 0
    const bankBalance = results.find((r) => r.registerType === 'BANK')?.closingBalance || 0

    return [
      {
        venueId,
        cashBalance,
        bankBalance,
        totalAvailable: cashBalance + bankBalance,
        registers: {
          CASH: results.find((r) => r.registerType === 'CASH'),
          BANK: results.find((r) => r.registerType === 'BANK'),
        },
      },
    ]
  }

  // Se admin senza sede specifica, calcola per tutte le sedi
  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    select: { id: true, name: true, code: true },
  })

  const allResults = await Promise.all(
    venues.map(async (venue) => {
      const results = await Promise.all(
        registerTypes.map(async (registerType) => {
          const aggregation = await prisma.journalEntry.aggregate({
            where: {
              venueId: venue.id,
              registerType,
            },
            _sum: {
              debitAmount: true,
              creditAmount: true,
            },
          })

          const totalDebits = Number(aggregation._sum.debitAmount || 0)
          const totalCredits = Number(aggregation._sum.creditAmount || 0)
          const closingBalance = totalDebits - totalCredits

          return {
            registerType,
            openingBalance: 0,
            totalDebits,
            totalCredits,
            closingBalance,
          }
        })
      )

      const cashBalance = results.find((r) => r.registerType === 'CASH')?.closingBalance || 0
      const bankBalance = results.find((r) => r.registerType === 'BANK')?.closingBalance || 0

      return {
        venueId: venue.id,
        venue,
        cashBalance,
        bankBalance,
        totalAvailable: cashBalance + bankBalance,
        registers: {
          CASH: results.find((r) => r.registerType === 'CASH'),
          BANK: results.find((r) => r.registerType === 'BANK'),
        },
      }
    })
  )

  return allResults
}
