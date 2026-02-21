import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CategorizationRule } from '@prisma/client'

// POST /api/categorization-rules/test - Test regola su descrizione
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { venueId, description, amount } = body

    if (!venueId || !description) {
      return NextResponse.json(
        { error: 'Venue ID e descrizione sono richiesti' },
        { status: 400 }
      )
    }

    // Recupera regole attive per la venue
    const rules = await prisma.categorizationRule.findMany({
      where: {
        venueId,
        isActive: true,
      },
      include: {
        budgetCategory: { select: { id: true, code: true, name: true, color: true } },
        account: { select: { id: true, code: true, name: true } },
      },
      orderBy: { priority: 'desc' },
    })

    // Determina direzione in base all'importo
    const direction = amount && amount < 0 ? 'OUTFLOW' : 'INFLOW'

    // Trova matching rules
    const matchedRules = rules
      .filter(rule => {
        if (rule.direction !== direction) return false
        // Controlla se almeno una keyword è presente nella descrizione
        return rule.keywords.some((keyword: string) =>
          description.toLowerCase().includes(keyword.toLowerCase())
        )
      })
      .map(rule => ({
        rule,
        confidence: calculateConfidence(rule, description),
      }))
      .sort((a, b) => b.confidence - a.confidence)

    return NextResponse.json({
      matched: matchedRules.length > 0,
      matches: matchedRules.slice(0, 5), // Top 5 matches
      suggestedCategory: matchedRules[0]?.rule.budgetCategoryId,
      suggestedAccount: matchedRules[0]?.rule.accountId,
      bestMatch: matchedRules[0]?.rule,
    })
  } catch (error) {
    console.error('Error testing categorization rule:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function calculateConfidence(rule: Pick<CategorizationRule, 'keywords' | 'priority'>, description: string): number {
  // Calcola confidence in base a:
  // - Numero di keywords che matchano
  // - Priorità della regola
  // - Lunghezza delle keywords (più specifiche = più confidence)

  const descriptionLower = description.toLowerCase()
  let matchedKeywords = 0
  let totalKeywordLength = 0

  for (const keyword of rule.keywords) {
    if (descriptionLower.includes(keyword.toLowerCase())) {
      matchedKeywords++
      totalKeywordLength += keyword.length
    }
  }

  // Base confidence dalla percentuale di keywords matchate
  const keywordMatchRatio = matchedKeywords / rule.keywords.length
  const baseConfidence = keywordMatchRatio * 0.7

  // Bonus per priorità (1-10)
  const priorityBonus = (rule.priority / 10) * 0.2

  // Bonus per specificità keyword
  const specificityBonus = Math.min(totalKeywordLength / 100, 0.1)

  return Math.min(baseConfidence + priorityBonus + specificityBonus, 1)
}
