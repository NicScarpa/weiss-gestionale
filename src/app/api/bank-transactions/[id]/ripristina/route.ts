import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'

/** Dal Cestino alla vita: `updateMany` con `deletedAt` esplicito, perché un `update({ where: { id } })` non vedrebbe la riga cestinata. */
export const POST = withAuth<{ id: string }>(
  async (_request, { venueId, params }) => {
    const esito = await prisma.bankTransaction.updateMany({
      where: { id: params.id, venueId, deletedAt: { not: null } },
      data: { deletedAt: null, deletedById: null },
    })
    if (esito.count === 0) return NextResponse.json({ error: 'Il movimento non è nel Cestino' }, { status: 404 })
    return NextResponse.json({ ok: true })
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
