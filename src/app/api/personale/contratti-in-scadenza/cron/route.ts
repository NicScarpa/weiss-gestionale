import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { avvisaContrattiInScadenza } from '@/lib/notifications/contratti-in-scadenza'
import { GIORNI_DI_PREAVVISO } from '@/lib/personale/scadenza-contratti'

/**
 * Il controllo notturno dei contratti a termine in scadenza.
 *
 * Non ha sessione: si difende con il segreto in `Authorization`, come la
 * sincronizzazione bancaria e l'auto clock-out.
 *
 * ⚠️ Serve **anche** la riga in `PUBLIC_PREFIXES` (`src/middleware.ts`): senza,
 * il middleware redirige al login prima che la richiesta arrivi qui, e il cron
 * riceve una pagina HTML al posto della risposta.
 */
function verificaSegretoCron(request: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    logger.error('CRON_SECRET environment variable is not set')
    return NextResponse.json({ error: 'Errore di configurazione server' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  return null
}

export async function POST(request: NextRequest) {
  const rifiuto = verificaSegretoCron(request)
  if (rifiuto) return rifiuto

  try {
    const esito = await avvisaContrattiInScadenza()

    logger.info('Controllo dei contratti in scadenza eseguito', {
      contrattiSegnalati: esito.contrattiSegnalati,
      destinatari: esito.destinatari,
      mailInviate: esito.mailInviate,
      mailConfigurata: esito.mailConfigurata,
      preavvisoGiorni: GIORNI_DI_PREAVVISO,
    })

    return NextResponse.json(esito)
  } catch (error) {
    logger.error('Errore nel controllo dei contratti in scadenza', error)
    return NextResponse.json(
      { error: 'Errore nel controllo dei contratti in scadenza' },
      { status: 500 }
    )
  }
}
