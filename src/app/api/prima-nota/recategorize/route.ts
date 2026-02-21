import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'

/**
 * POST /api/prima-nota/recategorize
 * Riesegue le regole di categorizzazione sulle entry non verificate
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const venueId = await getVenueId()

    // Recupera regole attive per la venue
    const rules = await prisma.categorizationRule.findMany({
      where: {
        venueId,
        isActive: true,
      },
      orderBy: { priority: 'desc' },
      include: {
        budgetCategory: {
          select: { id: true, code: true },
        },
        account: {
          select: { id: true, code: true },
        },
      },
    })

    // Recupera entry da ricategorizzare
    const entries = await prisma.journalEntry.findMany({
      where: {
        venueId,
        verified: false,
        hiddenAt: null,
      },
      take: 100, // Batch processing
    })

    let updated = 0

    for (const entry of entries) {
      for (const rule of rules) {
        let match = false

        // Controllo keywords
        if (rule.keywords.length > 0) {
          const description = entry.description.toLowerCase()
          match = rule.keywords.some((kw) =>
            description.includes(kw.toLowerCase())
          )
        }

        // Controllo direzione
        if (match) {
          const isInflow = entry.debitAmount && Number(entry.debitAmount) > 0
          const isOutflow = entry.creditAmount && Number(entry.creditAmount) > 0

          if (rule.direction === 'INFLOW' && !isInflow) {
            match = false
          }
          if (rule.direction === 'OUTFLOW' && !isOutflow) {
            match = false
          }
        }

        if (match) {
          await prisma.journalEntry.update({
            where: { id: entry.id },
            data: {
              budgetCategoryId: rule.budgetCategoryId,
              accountId: rule.accountId,
              appliedRuleId: rule.id,
              verified: rule.autoVerify,
            },
          })
          updated++
          break // Prima regola che match
        }
      }
    }

    return NextResponse.json({
      processed: entries.length,
      updated,
      rules: rules.length,
    })
  } catch (error) {
    console.error('Errore POST /api/prima-nota/recategorize', error)
    return NextResponse.json(
      { error: 'Errore nella ricategorizzazione' },
      { status: 500 }
    )
  }
}
