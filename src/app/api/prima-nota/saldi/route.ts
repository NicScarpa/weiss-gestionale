import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'

import { logger } from '@/lib/logger'
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
    const targetVenueId = await getVenueId()

    // Calcola i saldi correnti dai movimenti
    const calculatedBalances = await calculateBalancesFromEntries(targetVenueId)

    return NextResponse.json({
      data: calculatedBalances,
    })
  } catch (error) {
    logger.error('Errore GET /api/prima-nota/saldi', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei saldi' },
      { status: 500 }
    )
  }
}

// Funzione per ottenere saldo iniziale dell'anno corrente
async function getInitialBalance(venueId: string) {
  const currentYear = new Date().getFullYear()

  const initialBalance = await prisma.initialBalance.findUnique({
    where: {
      venueId_year: {
        venueId,
        year: currentYear,
      },
    },
  })

  return {
    cashBalance: initialBalance ? Number(initialBalance.cashBalance) : 0,
    bankBalance: initialBalance ? Number(initialBalance.bankBalance) : 0,
  }
}

// Funzione helper per calcolare saldi dai movimenti
async function calculateBalancesFromEntries(venueId?: string) {
  const registerTypes = ['CASH', 'BANK'] as const

  // Se c'è una sede specifica, calcola per quella
  if (venueId) {
    // Ottieni saldo iniziale
    const initialBalance = await getInitialBalance(venueId)

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

        // Saldo iniziale per questo registro
        const openingBalance = registerType === 'CASH'
          ? initialBalance.cashBalance
          : initialBalance.bankBalance

        // Saldo finale = apertura + dare - avere
        const closingBalance = openingBalance + totalDebits - totalCredits

        return {
          registerType,
          openingBalance,
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
      // Ottieni saldo iniziale per questa sede
      const initialBalance = await getInitialBalance(venue.id)

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

          // Saldo iniziale per questo registro
          const openingBalance = registerType === 'CASH'
            ? initialBalance.cashBalance
            : initialBalance.bankBalance

          // Saldo finale = apertura + dare - avere
          const closingBalance = openingBalance + totalDebits - totalCredits

          return {
            registerType,
            openingBalance,
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
