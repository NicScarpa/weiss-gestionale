import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'

// GET /api/categorization-rules/proposals - Analizza movimenti non categorizzati e propone regole
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const venueId = await getVenueId()

    // Trova movimenti non categorizzati (senza budgetCategoryId e senza appliedRuleId)
    const uncategorized = await prisma.journalEntry.findMany({
      where: {
        venueId,
        budgetCategoryId: null,
        appliedRuleId: null,
      },
      select: {
        id: true,
        description: true,
        counterpartName: true,
        debitAmount: true,
        creditAmount: true,
      },
    })

    // Raggruppa per counterpartName o pattern dalla description
    const groups = new Map<string, {
      keyword: string
      direction: 'INFLOW' | 'OUTFLOW'
      count: number
      matchingEntryIds: string[]
    }>()

    for (const entry of uncategorized) {
      const keyword = entry.counterpartName?.trim() || entry.description?.trim()
      if (!keyword) continue

      const normalizedKey = keyword.toLowerCase()
      const direction = (entry.debitAmount && Number(entry.debitAmount) > 0) ? 'INFLOW' : 'OUTFLOW'
      const groupKey = `${normalizedKey}__${direction}`

      const existing = groups.get(groupKey)
      if (existing) {
        existing.count++
        existing.matchingEntryIds.push(entry.id)
      } else {
        groups.set(groupKey, {
          keyword,
          direction,
          count: 1,
          matchingEntryIds: [entry.id],
        })
      }
    }

    // Filtra solo gruppi con almeno 2 occorrenze e ordina per count DESC
    const proposals = Array.from(groups.values())
      .filter(g => g.count >= 2)
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({ proposals })
  } catch (error) {
    console.error('Error fetching categorization proposals:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/categorization-rules/proposals - Applica una proposta: crea regola e categorizza movimenti
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { keyword, direction, budgetCategoryId, matchingEntryIds, venueId } = body

    if (!keyword || !direction || !budgetCategoryId || !matchingEntryIds?.length || !venueId) {
      return NextResponse.json(
        { error: 'Campi obbligatori mancanti: keyword, direction, budgetCategoryId, matchingEntryIds, venueId' },
        { status: 400 }
      )
    }

    // Crea regola e aggiorna movimenti in una transazione
    const result = await prisma.$transaction(async (tx) => {
      // Calcola la priority massima attuale per posizionare la nuova regola in cima
      const maxPriority = await tx.categorizationRule.aggregate({
        where: { venueId, direction },
        _max: { priority: true },
      })

      const rule = await tx.categorizationRule.create({
        data: {
          venueId,
          name: keyword,
          direction,
          keywords: [keyword],
          priority: (maxPriority._max.priority || 0) + 1,
          isActive: true,
          budgetCategoryId,
          autoVerify: false,
          autoHide: false,
        },
        include: {
          budgetCategory: { select: { id: true, code: true, name: true, color: true } },
          account: { select: { id: true, code: true, name: true } },
        },
      })

      // Aggiorna in batch i movimenti corrispondenti
      await tx.journalEntry.updateMany({
        where: { id: { in: matchingEntryIds } },
        data: {
          budgetCategoryId,
          appliedRuleId: rule.id,
          categorizationSource: 'rule',
        },
      })

      return rule
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error applying categorization proposal:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
