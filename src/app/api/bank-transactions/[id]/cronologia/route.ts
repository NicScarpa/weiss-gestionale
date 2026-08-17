import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'

/** La scheda «Cronologia modifiche»: prima/dopo/chi/quando, la più recente per prima. */
export const GET = withAuth<{ id: string }>(
  async (_request, { venueId, params }) => {
    // Anche dal Cestino si legge la cronologia: la seconda ricerca è per le
    // righe cestinate, che l'estensione soft-delete nasconde alla prima.
    const riga =
      (await prisma.bankTransaction.findFirst({ where: { id: params.id, venueId }, select: { id: true } })) ??
      (await prisma.bankTransaction.findFirst({ where: { id: params.id, venueId, deletedAt: { not: null } }, select: { id: true } }))
    if (!riga) return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })

    const modifiche = await prisma.bankTransactionEdit.findMany({
      where: { bankTransactionId: riga.id },
      orderBy: { createdAt: 'desc' },
    })
    const idUtenti = [...new Set(modifiche.map((m) => m.userId).filter((u): u is string => !!u))]
    const utenti = idUtenti.length
      ? await prisma.user.findMany({ where: { id: { in: idUtenti } }, select: { id: true, firstName: true, lastName: true } })
      : []
    const nome = new Map(utenti.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]))

    return NextResponse.json({
      modifiche: modifiche.map((m) => ({
        id: m.id,
        campo: m.campo,
        prima: m.prima,
        dopo: m.dopo,
        quando: m.createdAt.toISOString(),
        utente: m.userId ? (nome.get(m.userId) ?? null) : null,
      })),
    })
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
