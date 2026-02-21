import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { calcolaProssimaGenerazione, calcolaDataDallaRicorrenza } from '@/lib/recurrence-utils'

// POST /api/scadenzario/ricorrenze/[id]/genera - Genera prossimo schedule dalla ricorrenza
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { id } = await params

    const recurrence = await prisma.recurrence.findUnique({ where: { id } })
    if (!recurrence) {
      return NextResponse.json({ error: 'Ricorrenza non trovata' }, { status: 404 })
    }

    if (!recurrence.isActive) {
      return NextResponse.json({ error: 'Ricorrenza non attiva' }, { status: 400 })
    }

    // Verifica che non abbia superato la data fine
    if (recurrence.dataFine && recurrence.prossimaGenerazione) {
      if (recurrence.prossimaGenerazione > recurrence.dataFine) {
        return NextResponse.json(
          { error: 'La ricorrenza ha superato la data di fine' },
          { status: 400 }
        )
      }
    }

    // Calcola la data di scadenza dello schedule
    const baseDate = recurrence.prossimaGenerazione || recurrence.dataInizio
    const dataScadenza = calcolaDataDallaRicorrenza(
      recurrence.frequenza,
      recurrence.giornoDelMese,
      recurrence.giornoDellSettimana,
      baseDate
    )

    // Crea lo schedule dalla ricorrenza template
    const schedule = await prisma.schedule.create({
      data: {
        venueId: recurrence.venueId,
        tipo: recurrence.tipo,
        descrizione: recurrence.descrizione,
        importoTotale: recurrence.importo,
        dataScadenza,
        metodoPagamento: recurrence.metodoPagamento,
        source: 'ricorrenza_auto',
        recurrenceId: recurrence.id,
        createdById: session.user.id,
        note: recurrence.note,
      },
    })

    // Aggiorna prossimaGenerazione della ricorrenza
    const nuovaProssimaGenerazione = calcolaProssimaGenerazione(
      dataScadenza,
      recurrence.frequenza
    )

    // Se la nuova data supera la data fine, disattiva la ricorrenza
    const shouldDeactivate = recurrence.dataFine && nuovaProssimaGenerazione > recurrence.dataFine

    await prisma.recurrence.update({
      where: { id },
      data: {
        prossimaGenerazione: nuovaProssimaGenerazione,
        ...(shouldDeactivate ? { isActive: false } : {}),
      },
    })

    return NextResponse.json({
      schedule,
      prossimaGenerazione: nuovaProssimaGenerazione,
      ricorrenzaDisattivata: !!shouldDeactivate,
    })
  } catch (error) {
    logger.error('Errore POST /api/scadenzario/ricorrenze/[id]/genera', error)
    return NextResponse.json(
      { error: 'Errore nella generazione dello schedule' },
      { status: 500 }
    )
  }
}
