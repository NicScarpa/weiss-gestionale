import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { applicaStimaSuScadenza } from '@/lib/scadenzario/stima-data-attesa'

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

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
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

    // Prossima generazione del padre, calcolata prima: entra nella stessa
    // transazione della creazione
    const prossimaGenerazione = calcolaProssimaGenerazione(
      nuovaDataScadenza,
      parent.ricorrenzaTipo || 'mensile'
    )

    // Creazione dell'occorrenza e avanzamento del padre insieme: separati,
    // due click generavano due scadenze per la stessa data.
    const newSchedule = await prisma.$transaction(async (tx) => {
      const creata = await tx.schedule.create({
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

      await tx.schedule.update({
        where: { id: parent.id },
        data: { ricorrenzaProssimaGenerazione: prossimaGenerazione },
      })

      return creata
    })

    // Fuori dalla transazione: best-effort, non deve poter far fallire la
    // generazione
    await applicaStimaSuScadenza(newSchedule.id, parent.venueId)

    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Schedule',
      entityId: newSchedule.id,
      newValues: { source: 'ricorrenza_auto', parentId: id },
    })

    return NextResponse.json({
      schedule: {
        ...newSchedule,
        importoResiduo: Number(newSchedule.importoTotale),
      },
      prossimaGenerazione,
    })
  } catch (error) {
    // `ux_schedules_ricorrenza_parent_occorrenza` (indice parziale su
    // ricorrenza_parent_id + data_scadenza): è il vincolo che ferma la seconda
    // richiesta quando due passano insieme il controllo applicativo.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Questa occorrenza è già stata generata' },
        { status: 409 }
      )
    }

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
