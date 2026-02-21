import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

// POST /api/scadenzario/[id]/genera-prossima - Genera prossima occorrenza ricorrente
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Recupera scadenza padre
    const parent = await prisma.schedule.findFirst({
      where: { id },
    })

    if (!parent) {
      return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
    }

    if (!parent.isRicorrente) {
      return NextResponse.json({ error: 'La scadenza non è ricorrente' }, { status: 400 })
    }

    if (!parent.ricorrenzaAttiva) {
      return NextResponse.json({ error: 'La ricorrenza è disattivata' }, { status: 400 })
    }

    // Verifica se c'è una data fine ricorrenza e se è già superata
    if (parent.ricorrenzaFine) {
      const fineDate = new Date(parent.ricorrenzaFine)
      if (new Date() > fineDate) {
        return NextResponse.json({ error: 'La ricorrenza ha raggiunto la data di fine' }, { status: 400 })
      }
    }

    // Calcola nuova data scadenza
    const baseDate = parent.ricorrenzaProssimaGenerazione || parent.dataScadenza
    const nuovaDataScadenza = calcolaProssimaGenerazione(
      new Date(baseDate),
      parent.ricorrenzaTipo || 'mensile'
    )

    // Verifica che la nuova data non superi la fine ricorrenza
    if (parent.ricorrenzaFine && nuovaDataScadenza > new Date(parent.ricorrenzaFine)) {
      return NextResponse.json({ error: 'La prossima occorrenza supererebbe la data di fine ricorrenza' }, { status: 400 })
    }

    // Crea nuova occorrenza
    const newSchedule = await prisma.schedule.create({
      data: {
        venueId: parent.venueId,
        tipo: parent.tipo,
        descrizione: parent.descrizione,
        importoTotale: parent.importoTotale,
        dataScadenza: nuovaDataScadenza,
        tipoDocumento: parent.tipoDocumento,
        numeroDocumento: parent.numeroDocumento,
        riferimentoDocumento: parent.riferimentoDocumento,
        controparteNome: parent.controparteNome,
        controparteIban: parent.controparteIban,
        supplierId: parent.supplierId,
        priorita: parent.priorita,
        metodoPagamento: parent.metodoPagamento,
        note: parent.note,
        source: 'ricorrenza_auto',
        ricorrenzaParentId: parent.id,
        createdById: session.user.id,
      },
    })

    // Aggiorna prossima generazione del padre
    const prossimaGenerazione = calcolaProssimaGenerazione(
      nuovaDataScadenza,
      parent.ricorrenzaTipo || 'mensile'
    )

    await prisma.schedule.update({
      where: { id: parent.id },
      data: { ricorrenzaProssimaGenerazione: prossimaGenerazione },
    })

    return NextResponse.json({
      schedule: {
        ...newSchedule,
        importoResiduo: Number(newSchedule.importoTotale),
      },
      prossimaGenerazione,
    })
  } catch (error) {
    logger.error('Errore POST /api/scadenzario/[id]/genera-prossima', error)
    return NextResponse.json(
      { error: 'Errore nella generazione della prossima occorrenza' },
      { status: 500 }
    )
  }
}

function calcolaProssimaGenerazione(dataScadenza: Date, tipo: string): Date {
  const result = new Date(dataScadenza)
  switch (tipo) {
    case 'settimanale':
      result.setDate(result.getDate() + 7)
      break
    case 'mensile':
      result.setMonth(result.getMonth() + 1)
      break
    case 'bimestrale':
      result.setMonth(result.getMonth() + 2)
      break
    case 'trimestrale':
      result.setMonth(result.getMonth() + 3)
      break
    case 'semestrale':
      result.setMonth(result.getMonth() + 6)
      break
    case 'annuale':
      result.setFullYear(result.getFullYear() + 1)
      break
  }
  return result
}
