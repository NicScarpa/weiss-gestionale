import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { Prisma, RuleDirection } from '@prisma/client'

// GET /api/categorization-rules - Lista regole categorizzazione
export const GET = withAuth(
  async (request, { venueId }) => {
    try {
      const { searchParams } = new URL(request.url)
      const direction = searchParams.get('direction')
      const isActive = searchParams.get('isActive')

      const where: Prisma.CategorizationRuleWhereInput = { venueId }
      if (direction) where.direction = direction as RuleDirection
      if (isActive !== null) where.isActive = isActive === 'true'

      const rules = await prisma.categorizationRule.findMany({
        where,
        include: {
          venue: { select: { id: true, name: true, code: true } },
          budgetCategory: { select: { id: true, code: true, name: true, color: true } },
          account: { select: { id: true, code: true, name: true } },
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
      })

      // Statistiche
      const stats = await prisma.categorizationRule.aggregate({
        where: { venueId: venueId },
        _count: { id: true },
        _avg: { priority: true },
      })

      const inflowRules = await prisma.categorizationRule.count({
        where: { venueId: venueId, direction: 'INFLOW', isActive: true },
      })
      const outflowRules = await prisma.categorizationRule.count({
        where: { venueId: venueId, direction: 'OUTFLOW', isActive: true },
      })

      return NextResponse.json({
        data: rules,
        stats: {
          totalRules: stats._count.id || 0,
          activeRules: await prisma.categorizationRule.count({
            where: { venueId: venueId, isActive: true },
          }),
          inflowRules,
          outflowRules,
          avgPriority: stats._avg.priority || 0,
        },
      })
    } catch (error) {
      console.error('Error fetching categorization rules:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)

// POST /api/categorization-rules - Crea nuova regola
export const POST = withAuth(
  async (request, { venueId }) => {
    try {
      const body = await request.json()
      const {
        name,
        direction,
        keywords,
        priority,
        isActive,
        budgetCategoryId,
        accountId,
        autoVerify,
        autoHide,
      } = body

      if (!name || !direction || !keywords?.length) {
        return NextResponse.json(
          { error: 'Campi obbligatori mancanti' },
          { status: 400 }
        )
      }

      // Almeno una categoria o conto deve essere specificato
      if (!budgetCategoryId && !accountId) {
        return NextResponse.json(
          { error: 'Specificare almeno una categoria budget o un conto' },
          { status: 400 }
        )
      }

      const rule = await prisma.categorizationRule.create({
        data: {
          venueId,
          name,
          direction,
          keywords: Array.isArray(keywords) ? keywords : [keywords],
          priority: priority || 5,
          isActive: isActive ?? true,
          budgetCategoryId,
          accountId,
          autoVerify: autoVerify || false,
          autoHide: autoHide || false,
        },
        include: {
          venue: { select: { id: true, name: true, code: true } },
          budgetCategory: { select: { id: true, code: true, name: true, color: true } },
          account: { select: { id: true, code: true, name: true } },
        },
      })

      return NextResponse.json(rule, { status: 201 })
    } catch (error) {
      console.error('Error creating categorization rule:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
