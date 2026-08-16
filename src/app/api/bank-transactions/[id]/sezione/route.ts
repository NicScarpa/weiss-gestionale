import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { spostaSezioneSchema } from '@/lib/validations/reconciliation'
import { registraModifiche } from '@/lib/banca/cronologia'

/** «Sposta in»: cambia la scheda in cui la riga si vede, non la contabilità (spec, decisione 5). */
export const POST = withAuth<{ id: string }>(
  async (request, { venueId, user, params }) => {
    const parsed = spostaSezioneSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Sezione non valida' }, { status: 400 })

    const riga = await prisma.bankTransaction.findFirst({ where: { id: params.id, venueId }, select: { id: true, sezione: true } })
    if (!riga) return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })
    if (riga.sezione === parsed.data.sezione) return NextResponse.json({ ok: true })

    await prisma.$transaction(async (tx) => {
      await tx.bankTransaction.update({ where: { id: riga.id }, data: { sezione: parsed.data.sezione } })
      await registraModifiche(tx, {
        bankTransactionId: riga.id,
        userId: user.id ?? null,
        modifiche: [{ campo: 'sezione', prima: riga.sezione, dopo: parsed.data.sezione }],
      })
    })
    return NextResponse.json({ ok: true })
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
