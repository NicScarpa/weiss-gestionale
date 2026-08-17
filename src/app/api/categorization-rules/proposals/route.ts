import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'

// GET /api/categorization-rules/proposals - Analizza movimenti non categorizzati e propone regole
export const GET = withAuth(
  async (request, { venueId }) => {
    try {
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
        sampleDescriptions: string[]
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
          // Solo distinte: quando il gruppo è chiuso sulla descrizione (nessuna
          // controparte) le righe hanno tutte la stessa causale, e tre copie
          // della stessa stringa non insegnano niente.
          if (
            existing.sampleDescriptions.length < 3 &&
            entry.description &&
            !existing.sampleDescriptions.includes(entry.description)
          ) {
            existing.sampleDescriptions.push(entry.description)
          }
        } else {
          groups.set(groupKey, {
            keyword,
            direction,
            count: 1,
            matchingEntryIds: [entry.id],
            sampleDescriptions: entry.description ? [entry.description] : [],
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
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)

// POST /api/categorization-rules/proposals - Applica una proposta: crea regola e categorizza movimenti
export const POST = withAuth(
  async (request, { venueId }) => {
    try {
      const body = await request.json()
      const { keyword, direction, budgetCategoryId, matchingEntryIds } = body

      if (!keyword || !direction || !budgetCategoryId || !matchingEntryIds?.length) {
        return NextResponse.json(
          { error: 'Campi obbligatori mancanti: keyword, direction, budgetCategoryId, matchingEntryIds' },
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

        // Aggiorna in batch i movimenti corrispondenti, restando dentro la sede
        // della sessione: gli id arrivano dal client e senza questo vincolo
        // basterebbe una lista arbitraria per riclassificare qualsiasi scrittura.
        await tx.journalEntry.updateMany({
          where: { id: { in: matchingEntryIds }, venueId },
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
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
