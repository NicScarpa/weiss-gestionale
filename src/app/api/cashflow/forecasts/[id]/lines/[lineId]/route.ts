import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { ConfidenceLevel, FlowType, Prisma } from '@prisma/client'

/**
 * Una singola voce di una previsione di cassa.
 *
 * Le due funzioni qui sotto lavoravano sul solo `lineId`, senza verificare né
 * che la riga appartenesse alla previsione indicata nell'URL né che quella
 * previsione fosse della sede corrente: l'identificativo di una riga qualsiasi
 * bastava a modificarla o cancellarla.
 */

/** La riga, se appartiene davvero alla previsione dell'URL e alla sede in sessione. */
async function rigaAccessibile(forecastId: string, lineId: string) {
  const riga = await prisma.cashFlowForecastLine.findFirst({
    where: { id: lineId, forecastId },
    select: { id: true, forecast: { select: { venueId: true, deletedAt: true } } },
  })

  if (!riga || riga.forecast.deletedAt !== null) return null

  return riga.forecast.venueId === (await getVenueId()) ? riga : null
}

// PATCH /api/cashflow/forecasts/[id]/lines/[lineId] - Aggiorna riga
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id, lineId } = await params
    const body = await request.json()

    if (!(await rigaAccessibile(id, lineId))) {
      return NextResponse.json({ error: 'Line not found' }, { status: 404 })
    }

    // Campo per campo: il ciclo su un elenco di nomi che assegnava
    // `data[field] = body[field]` era comodo ma perdeva i tipi per strada, e
    // con essi il controllo su ciò che arriva dal client.
    const data: Prisma.CashFlowForecastLineUpdateInput = {}
    if (body.data !== undefined) data.data = new Date(body.data)
    if (body.tipo !== undefined) data.tipo = body.tipo as FlowType
    if (body.importo !== undefined) data.importo = Number(body.importo)
    if (body.categoria !== undefined) {
      data.categoria = body.categoria === null ? null : String(body.categoria)
    }
    if (body.descrizione !== undefined) {
      data.descrizione = body.descrizione === null ? null : String(body.descrizione)
    }
    if (body.fonte !== undefined) {
      data.fonte = body.fonte === null ? null : String(body.fonte)
    }
    if (body.confidenza !== undefined) data.confidenza = body.confidenza as ConfidenceLevel
    if (body.isRealizzata !== undefined) data.isRealizzata = Boolean(body.isRealizzata)

    const line = await prisma.cashFlowForecastLine.update({
      where: { id: lineId },
      data,
    })

    return NextResponse.json(line)
  } catch (error) {
    console.error('Error updating forecast line:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/cashflow/forecasts/[id]/lines/[lineId] - Elimina riga
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; lineId: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id, lineId } = await params

    // Senza questo controllo la cancellazione di una riga inesistente
    // rispondeva 500 invece di 404, e quella di una riga altrui riusciva.
    if (!(await rigaAccessibile(id, lineId))) {
      return NextResponse.json({ error: 'Line not found' }, { status: 404 })
    }

    await prisma.cashFlowForecastLine.delete({ where: { id: lineId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting forecast line:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
