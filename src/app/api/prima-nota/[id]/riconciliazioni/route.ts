import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'

/**
 * GET /api/prima-nota/[id]/riconciliazioni
 *
 * Le scadenze che questo movimento sta saldando, viste dal lato del movimento.
 * Serve a chi ha in mano la riga di prima nota e si sente rispondere che non la
 * può cancellare: fino a qui l'elenco esisteva solo dal lato scadenza, e per
 * trovarlo bisognava già sapere quale scadenza cercare.
 *
 * Il criterio è lo stesso che blocca la cancellazione (`status: VERIFIED`),
 * riga gemella del trasferimento compresa: se l'elenco fosse più stretto del
 * blocco, resterebbe un movimento non cancellabile e senza nulla da sganciare.
 * Per lo stesso motivo non si escludono le scadenze cancellate: la
 * riconciliazione trattiene il movimento anche allora, e va mostrata.
 */
export async function GET(
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
    const venueId = await getVenueId()

    const movimento = await prisma.journalEntry.findFirst({
      where: { id, venueId },
      select: { id: true, transferId: true },
    })

    if (!movimento) {
      return NextResponse.json({ error: 'Movimento non trovato' }, { status: 404 })
    }

    const righe = movimento.transferId
      ? await prisma.journalEntry.findMany({
          where: { transferId: movimento.transferId, venueId },
          select: { id: true },
        })
      : [{ id: movimento.id }]

    const riconciliazioni = await prisma.scheduleReconciliation.findMany({
      where: {
        journalEntryId: { in: righe.map((r) => r.id) },
        status: 'VERIFIED',
      },
      select: {
        id: true,
        scheduleId: true,
        journalEntryId: true,
        amount: true,
        source: true,
        createdAt: true,
        schedule: {
          select: {
            id: true,
            descrizione: true,
            dataScadenza: true,
            importoTotale: true,
            stato: true,
            tipo: true,
            numeroDocumento: true,
            controparteNome: true,
            deletedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      riconciliazioni: riconciliazioni.map((r) => ({
        id: r.id,
        scheduleId: r.scheduleId,
        importo: Number(r.amount),
        source: r.source,
        createdAt: r.createdAt,
        // Vero quando la riconciliazione sta sull'altra riga del trasferimento:
        // senza dirlo, l'elenco sembrerebbe sbagliato a chi guarda la riga che
        // ha in mano, che di agganci non ne ha.
        altraRigaDelTrasferimento: r.journalEntryId !== movimento.id,
        schedule: {
          id: r.schedule.id,
          descrizione: r.schedule.descrizione,
          dataScadenza: r.schedule.dataScadenza,
          importoTotale: Number(r.schedule.importoTotale),
          stato: r.schedule.stato,
          tipo: r.schedule.tipo,
          numeroDocumento: r.schedule.numeroDocumento,
          controparteNome: r.schedule.controparteNome,
          eliminata: r.schedule.deletedAt !== null,
        },
      })),
    })
  } catch (error) {
    logger.error('Errore GET /api/prima-nota/[id]/riconciliazioni', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle riconciliazioni' },
      { status: 500 }
    )
  }
}
