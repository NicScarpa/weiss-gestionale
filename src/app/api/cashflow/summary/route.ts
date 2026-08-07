import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'
import { money, toApi } from '@/lib/money'
import {
  giornoCorrente,
  giornoIndietro,
  liquiditaAlGiorno,
  nettoMedioGiornaliero,
} from '@/lib/saldi'

/**
 * GET /api/cashflow/summary — le quattro card in testa alla pagina Cash Flow.
 *
 * Ogni cifra qui dentro nasce dai movimenti di prima nota, tramite `@/lib/saldi`.
 * Prima la card del saldo leggeva `register_balances`, una tabella di appoggio
 * che nessun codice ha mai scritto — mostrava zero quando andava bene, e la
 * pagina intera rispondeva 500 quando andava male — e il trend sottraeva a un
 * saldo puntuale la *somma* dei saldi di sette giorni, cioè due grandezze
 * diverse. Le unità di misura, qui sotto, sono tutte euro.
 */

/**
 * Finestra su cui si misura l'andamento medio. Un mese: sette giorni
 * risentirebbero troppo del giorno di paga dei fornitori o di un versamento
 * grosso, e la previsione a trenta giorni ballerebbe di conseguenza.
 */
const GIORNI_DI_MEDIA = 30

/** Orizzonte della previsione, in giorni. */
const ORIZZONTE = 30

/** Runway convenzionale quando non si sta bruciando cassa: la UI lo mostra così. */
const RUNWAY_ILLIMITATO = 999

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const venueId = await getVenueId()
    const oggi = giornoCorrente()

    const [saldoAttuale, saldoDiSetteGiorniFa, nettoAlGiorno, prossimoAlert] =
      await Promise.all([
        liquiditaAlGiorno(venueId, oggi),
        liquiditaAlGiorno(venueId, giornoIndietro(oggi, 7)),
        nettoMedioGiornaliero(venueId, {
          dal: giornoIndietro(oggi, GIORNI_DI_MEDIA - 1),
          al: oggi,
        }),
        prisma.cashFlowAlert.findFirst({
          where: { venueId, stato: 'ATTIVO', dataPrevista: { gte: new Date() } },
          orderBy: { dataPrevista: 'asc' },
        }),
      ])

    // Due saldi puntuali: la differenza è il denaro entrato o uscito in una
    // settimana, non un numero che serva solo a fare colore.
    const trend7gg = money(saldoAttuale).minus(money(saldoDiSetteGiorniFa))

    // Variazione attesa nei prossimi trenta giorni, e il saldo a cui porta.
    const deltaPrevisione = nettoAlGiorno.times(ORIZZONTE)
    const previsione30gg = money(saldoAttuale).plus(deltaPrevisione)

    // Si "brucia" cassa solo quando il saldo scende: con un netto positivo il
    // burn rate è zero e il runway non ha un limite da mostrare.
    const burnRateMensile = deltaPrevisione.isNegative() ? deltaPrevisione.negated() : money(0)
    const runwayMesi = burnRateMensile.isZero()
      ? RUNWAY_ILLIMITATO
      : toApi(
          money(Math.max(0, saldoAttuale)).dividedBy(burnRateMensile).toDecimalPlaces(1)
        )

    return NextResponse.json({
      saldoAttuale,
      trend7gg: toApi(trend7gg),
      previsione30gg: toApi(previsione30gg),
      deltaPrevisione: toApi(deltaPrevisione),
      runwayMesi,
      burnRateMensile: toApi(burnRateMensile),
      prossimoAlert: prossimoAlert
        ? {
            tipo: prossimoAlert.tipo,
            data: prossimoAlert.dataPrevista,
            messaggio: prossimoAlert.messaggio,
          }
        : null,
    })
  } catch (error) {
    logger.error('Errore GET /api/cashflow/summary', error)
    return NextResponse.json(
      { error: 'Errore nel recupero del riepilogo cash flow' },
      { status: 500 }
    )
  }
}
