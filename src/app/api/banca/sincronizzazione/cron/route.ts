import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { sincronizzaConti } from '@/lib/services/bank-sync-service'

/**
 * La sincronizzazione bancaria notturna.
 *
 * Non ha sessione: si difende con il segreto in `Authorization`, come l'auto
 * clock-out e i promemoria di timbratura.
 *
 * ⚠️ Serve **anche** la riga in `PUBLIC_PREFIXES` (`src/middleware.ts`): senza,
 * il middleware redirige al login prima che la richiesta arrivi qui, e il cron
 * riceve una pagina HTML al posto della risposta. È il difetto per cui
 * `/api/shifts/reminder` ha il guard e resta irraggiungibile.
 *
 * Gira su un servizio cron di Railway, non da `vercel.json`: quel file è
 * ignorato in produzione.
 */

/** Rifiuto della richiesta, oppure `null` se il segreto combacia. */
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

export async function GET(request: NextRequest) {
  const rifiuto = verificaSegretoCron(request)
  if (rifiuto) return rifiuto

  try {
    // Il cron non ha sessione, quindi nemmeno una sede: le percorre tutte
    // quelle che hanno un collegamento bancario. Oggi è una sola, e passare da
    // `getVenueId()` qui vorrebbe dire leggere una sede che nessuno ha scelto.
    const sedi = await prisma.bankConnection.findMany({
      distinct: ['venueId'],
      select: { venueId: true },
    })

    const esiti = []
    for (const { venueId } of sedi) {
      esiti.push(...(await sincronizzaConti({ venueId, origine: 'cron' })))
    }

    logger.info('[SyncBancaria] Giro notturno concluso', {
      conti: esiti.length,
      falliti: esiti.filter((e) => e.esito === 'ERRORE').length,
    })

    return NextResponse.json({ esiti })
  } catch (errore) {
    logger.error('[SyncBancaria] Giro notturno fallito', { errore })
    return NextResponse.json({ error: 'Sincronizzazione fallita' }, { status: 500 })
  }
}
