import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateSchedule } from '@/lib/shift-generation'
import { notifyShiftPublished } from '@/lib/notifications'

// POST /api/schedules/[id]/publish - Pubblica pianificazione
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono pubblicare
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { id } = await params

    // Verifica esistenza pianificazione
    const schedule = await prisma.shiftSchedule.findUnique({
      where: { id },
      include: {
        _count: {
          select: { assignments: true },
        },
      },
    })

    if (!schedule) {
      return NextResponse.json({ error: 'Pianificazione non trovata' }, { status: 404 })
    }

    // Manager può pubblicare solo per la propria sede
    if (
      session.user.role === 'manager' &&
      schedule.venueId !== session.user.venueId
    ) {
      return NextResponse.json(
        { error: 'Non autorizzato per questa sede' },
        { status: 403 }
      )
    }

    // Verifica stato: può pubblicare solo da GENERATED o REVIEW
    if (!['GENERATED', 'REVIEW'].includes(schedule.status)) {
      return NextResponse.json(
        { error: 'Puoi pubblicare solo pianificazioni già generate' },
        { status: 400 }
      )
    }

    // Verifica che ci siano assegnazioni
    if (schedule._count.assignments === 0) {
      return NextResponse.json(
        { error: 'La pianificazione non ha assegnazioni' },
        { status: 400 }
      )
    }

    // Valida la pianificazione
    const validation = await validateSchedule(id)

    if (!validation.isValid) {
      const highWarnings = validation.warnings.filter(w => w.severity === 'high')
      return NextResponse.json({
        error: 'Ci sono dei turni scoperti, impossibile pubblicare la pianificazione dei turni',
        warnings: highWarnings,
        canForcePublish: session.user.role === 'admin',
      }, { status: 400 })
    }

    // Pubblica
    const updated = await prisma.shiftSchedule.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    })

    // Invia notifiche ai dipendenti (async, non blocca la risposta)
    notifyShiftPublished(id, { excludeUserId: session.user.id }).catch((err) =>
      console.error('Errore invio notifiche turni:', err)
    )

    return NextResponse.json({
      success: true,
      schedule: updated,
      message: 'Pianificazione pubblicata con successo',
    })
  } catch (error) {
    console.error('Errore POST /api/schedules/[id]/publish:', error)
    return NextResponse.json(
      { error: 'Errore nella pubblicazione della pianificazione' },
      { status: 500 }
    )
  }
}
