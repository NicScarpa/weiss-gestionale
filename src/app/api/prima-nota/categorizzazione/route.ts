import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { romeDateKey, toDateOnlyUtc } from '@/lib/timezone'

/**
 * Quanta parte dei movimenti recenti ha un conto.
 *
 * La finestra è mobile e fissa a 60 giorni: ciò che conta è se il lavoro
 * corrente è al passo, non quanto arretrato c'è nel 2024. Per lo stesso motivo
 * la misura non risponde ai filtri della lista — è una proprietà del lavoro, non
 * della vista.
 */
const GIORNI_FINESTRA = 60

export const GET = withAuth(
  async (_request, { venueId }) => {
    // Il confine è un giorno civile romano portato a mezzanotte UTC, perché la
    // colonna è @db.Date. Costruirlo da un istante farebbe scorrere la finestra
    // di un giorno a seconda dell'ora di apertura della pagina.
    const oggi = toDateOnlyUtc(romeDateKey(new Date()))
    const daQuando = new Date(oggi)
    daQuando.setUTCDate(daQuando.getUTCDate() - GIORNI_FINESTRA)

    const finestra = {
      venueId,
      deletedAt: null,
      hiddenAt: null,
      date: { gte: daQuando },
    }

    const [totale, senzaConto] = await Promise.all([
      prisma.journalEntry.count({ where: finestra }),
      prisma.journalEntry.count({ where: { ...finestra, accountId: null } }),
    ])

    const categorizzati = totale - senzaConto

    return NextResponse.json({
      periodoGiorni: GIORNI_FINESTRA,
      totale,
      categorizzati,
      // Una prima nota vuota è categorizzata al 100%: non c'è niente da fare, e
      // mostrare 0% inviterebbe a un lavoro che non esiste.
      percentuale: totale === 0 ? 100 : Math.round((categorizzati / totale) * 100),
    })
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
