import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { Prisma } from '@prisma/client'

const soloGestori = { roles: ['admin', 'manager'], venueScoped: true } as const

// GET /api/categorization-rules/[id] - Dettaglio regola
export const GET = withAuth<{ id: string }>(
  async (request, { params, venueId }) => {
    try {
      const { id } = params

      const rule = await prisma.categorizationRule.findUnique({
        where: { id },
        include: {
          venue: { select: { id: true, name: true, code: true } },
          budgetCategory: { select: { id: true, code: true, name: true, color: true } },
          account: { select: { id: true, code: true, name: true } },
        },
      })

      if (!rule) {
        return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
      }

      if (rule.venueId !== venueId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      return NextResponse.json(rule)
    } catch (error) {
      console.error('Error fetching categorization rule:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  },
  soloGestori
)

// PATCH /api/categorization-rules/[id] - Aggiorna regola
export const PATCH = withAuth<{ id: string }>(
  async (request, { params, venueId }) => {
    try {
      const { id } = params
      const body = await request.json()

      // Verifica esistenza e permessi
      const existing = await prisma.categorizationRule.findUnique({
        where: { id },
        select: { venueId: true },
      })

      if (!existing) {
        return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
      }

      if (existing.venueId !== venueId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      // Campi aggiornabili
      const updatable = [
        'name', 'direction', 'keywords', 'priority', 'isActive',
        'budgetCategoryId', 'accountId', 'autoVerify', 'autoHide',
      ]
      const data: Prisma.CategorizationRuleUpdateInput = {}
      for (const field of updatable) {
        if (body[field] !== undefined) {
          data[field] = body[field]
        }
      }

      const rule = await prisma.categorizationRule.update({
        where: { id },
        data,
        include: {
          venue: { select: { id: true, name: true, code: true } },
          budgetCategory: { select: { id: true, code: true, name: true, color: true } },
          account: { select: { id: true, code: true, name: true } },
        },
      })

      return NextResponse.json(rule)
    } catch (error) {
      console.error('Error updating categorization rule:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  },
  soloGestori
)

// DELETE /api/categorization-rules/[id] - Elimina regola
export const DELETE = withAuth<{ id: string }>(
  async (request, { params, venueId }) => {
    try {
      const { id } = params

      // Verifica esistenza e permessi
      const existing = await prisma.categorizationRule.findUnique({
        where: { id },
        select: { venueId: true },
      })

      if (!existing) {
        return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
      }

      if (existing.venueId !== venueId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      await prisma.categorizationRule.delete({ where: { id } })

      return NextResponse.json({ success: true })
    } catch (error) {
      console.error('Error deleting categorization rule:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  },
  soloGestori
)
