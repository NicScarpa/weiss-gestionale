import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handleApiError, notFound, ok, withAuth } from '@/lib/api-utils'

type Params = { id: string }

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
export const GET = withAuth<Params>(
  async (_request: NextRequest, { params, venueId }) => {
    try {
      const { id } = params

      const movimento = await prisma.journalEntry.findFirst({
        where: { id, venueId },
        select: { id: true, transferId: true },
      })

      if (!movimento) {
        return notFound('Movimento non trovato')
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

      return ok({
        riconciliazioni: riconciliazioni.map((r) => ({
          id: r.id,
          scheduleId: r.scheduleId,
          importo: Number(r.amount),
          source: r.source,
          createdAt: r.createdAt,
          // Vero quando la riconciliazione sta sull'altra riga del
          // trasferimento: senza dirlo, l'elenco sembrerebbe sbagliato a chi
          // guarda la riga che ha in mano, che di agganci non ne ha.
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
      return handleApiError(
        error,
        'GET /api/prima-nota/[id]/riconciliazioni',
        'Errore nel recupero delle riconciliazioni'
      )
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
