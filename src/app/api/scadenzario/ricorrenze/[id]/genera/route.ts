import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { createAuditLog } from '@/lib/audit'
import { calcolaProssimaGenerazione, calcolaDataDallaRicorrenza } from '@/lib/recurrence-utils'
import { applicaStimaSuScadenza } from '@/lib/scadenzario/stima-data-attesa'

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

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
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

    // Aggiorna prossimaGenerazione della ricorrenza
    const nuovaProssimaGenerazione = calcolaProssimaGenerazione(
      dataScadenza,
      recurrence.frequenza
    )

    // Se la nuova data supera la data fine, disattiva la ricorrenza
    const shouldDeactivate = recurrence.dataFine && nuovaProssimaGenerazione > recurrence.dataFine

    // Creazione della scadenza e avanzamento della ricorrenza nella stessa
    // transazione: erano due passi separati, e fra l'uno e l'altro un secondo
    // click (o un cron sovrapposto) rigenerava la stessa occorrenza. Se il
    // secondo passo fallisce, la ricorrenza non avanza e la scadenza non resta.
    const schedule = await prisma.$transaction(async (tx) => {
      const creata = await tx.schedule.create({
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

      await tx.recurrence.update({
        where: { id },
        data: {
          prossimaGenerazione: nuovaProssimaGenerazione,
          ...(shouldDeactivate ? { isActive: false } : {}),
        },
      })

      return creata
    })

    // Fuori dalla transazione: la stima è best-effort e non deve poter far
    // fallire (né allungare) la generazione
    await applicaStimaSuScadenza(schedule.id, recurrence.venueId)

    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Schedule',
      entityId: schedule.id,
      newValues: { source: 'ricorrenza_auto', recurrenceId: id },
    })

    return NextResponse.json({
      schedule,
      prossimaGenerazione: nuovaProssimaGenerazione,
      ricorrenzaDisattivata: !!shouldDeactivate,
    })
  } catch (error) {
    // `ux_schedules_ricorrenza_occorrenza` (indice parziale su recurrence_id +
    // data_scadenza) è il lucchetto che impedisce la doppia occorrenza quando
    // due richieste passano insieme il controllo applicativo. Intercettarlo
    // qui trasforma il 500 in una risposta che descrive cosa è successo.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Questa occorrenza è già stata generata' },
        { status: 409 }
      )
    }

    logger.error('Errore POST /api/scadenzario/ricorrenze/[id]/genera', error)
    return NextResponse.json(
      { error: 'Errore nella generazione dello schedule' },
      { status: 500 }
    )
  }
}
