import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { ForecastStatus, ForecastType, Prisma } from '@prisma/client'

// GET /api/cashflow/forecasts/[id] - Dettaglio forecast
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params

    // `findUnique` non passa dall'estensione che filtra i cancellati: la
    // condizione va scritta a mano, o una previsione eliminata resterebbe
    // raggiungibile da chi ne conosce l'identificativo.
    const forecast = await prisma.cashFlowForecast.findFirst({
      where: { id, deletedAt: null },
      include: {
        venue: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        lines: {
          orderBy: { data: 'asc' },
        },
        alerts: {
          where: { stato: 'ATTIVO' },
          orderBy: { dataPrevista: 'asc' },
        },
      },
    })

    if (!forecast) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    const venueId = await getVenueId()
    if (forecast.venueId !== venueId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Calcola saldo progressivo per ogni linea
    let saldoProgressivo = forecast.saldoIniziale.toNumber()
    const linesWithBalance = forecast.lines.map(line => {
      const importo = line.importo.toNumber()
      if (line.tipo === 'ENTRATA') {
        saldoProgressivo += importo
      } else {
        saldoProgressivo -= importo
      }
      return {
        ...line,
        saldoProgressivo,
      }
    })

    // Calcola riepilogo
    const totaleEntrate = forecast.lines
      .filter(l => l.tipo === 'ENTRATA')
      .reduce((sum, l) => sum + l.importo.toNumber(), 0)

    const totaleUscite = forecast.lines
      .filter(l => l.tipo === 'USCITA')
      .reduce((sum, l) => sum + l.importo.toNumber(), 0)

    const saldoFinale = forecast.saldoIniziale.toNumber() + totaleEntrate - totaleUscite
    const saldoMinimo = Math.min(
      forecast.saldoIniziale.toNumber(),
      ...linesWithBalance.map(l => l.saldoProgressivo)
    )

    return NextResponse.json({
      ...forecast,
      lines: linesWithBalance,
      summary: {
        totaleEntrate,
        totaleUscite,
        saldoFinale,
        saldoMinimo,
        giorniSottoSoglia: 0, // Da calcolare in base alla soglia venue
        alertAttivi: forecast.alerts.length,
      },
    })
  } catch (error) {
    console.error('Error fetching cash flow forecast:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/cashflow/forecasts/[id] - Aggiorna forecast
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()

    // Verifica esistenza e permessi
    const existing = await prisma.cashFlowForecast.findFirst({
      where: { id, deletedAt: null },
      select: { venueId: true, stato: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    const venueId = await getVenueId()
    if (existing.venueId !== venueId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Campi aggiornabili, uno per uno. La versione precedente ciclava su un
    // elenco di nomi e assegnava `data[field] = body[field]`: comoda da
    // scrivere, ma il tipo di ogni campo si perdeva per strada (`any`), e con
    // esso il controllo su cosa arriva davvero dal client.
    const data: Prisma.CashFlowForecastUpdateInput = {}
    if (body.nome !== undefined) data.nome = String(body.nome)
    if (body.descrizione !== undefined) {
      data.descrizione = body.descrizione === null ? null : String(body.descrizione)
    }
    if (body.dataInizio !== undefined) data.dataInizio = new Date(body.dataInizio)
    if (body.dataFine !== undefined) data.dataFine = new Date(body.dataFine)
    if (body.saldoIniziale !== undefined) data.saldoIniziale = Number(body.saldoIniziale)
    if (body.stato !== undefined) data.stato = body.stato as ForecastStatus
    if (body.tipo !== undefined) data.tipo = body.tipo as ForecastType

    const forecast = await prisma.cashFlowForecast.update({
      where: { id },
      data,
      include: {
        venue: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    return NextResponse.json(forecast)
  } catch (error) {
    console.error('Error updating cash flow forecast:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/cashflow/forecasts/[id] - Elimina forecast
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params

    // Verifica esistenza e permessi
    const existing = await prisma.cashFlowForecast.findFirst({
      where: { id, deletedAt: null },
      select: { venueId: true, stato: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 })
    }

    const venueId = await getVenueId()
    if (existing.venueId !== venueId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Non permettere eliminazione se attivo
    if (existing.stato === ForecastStatus.ATTIVA) {
      return NextResponse.json(
        { error: 'Archiviare la previsione prima di eliminarla' },
        { status: 400 }
      )
    }

    // Cancellazione logica: `CashFlowForecast` è fra i `SOFT_DELETE_MODELS` di
    // `@/lib/prisma`, e le letture filtrano `deletedAt` da sole. La `delete()`
    // fisica di prima, oltre a contraddire quella politica, non riusciva
    // proprio: le righe della previsione hanno `onDelete: Restrict` e la
    // foreign key rifiutava la cancellazione con un errore 500 opaco.
    await prisma.cashFlowForecast.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: session.user.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting cash flow forecast:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
