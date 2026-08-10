import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { riportaSaldiTutteLeSedi } from '@/lib/riporto-anno'
import { romeDateKey } from '@/lib/timezone'

/**
 * Riporto automatico del saldo di fine anno.
 *
 * Pensato per girare il 1° gennaio. Non ha sessione: si difende con il segreto
 * in `Authorization`, come l'auto clock-out e i promemoria di timbratura —
 * stesso schema, non un terzo meccanismo.
 *
 * È idempotente: rilanciarlo non sovrascrive un saldo iniziale già presente,
 * quindi si può riprovare senza rischio dopo aver chiuso il 31 dicembre in
 * ritardo. Ed è proprio per questo che l'astensione non è un fallimento: la
 * sede che non ha chiuso comparirà fra i `mancanti`, e alla corsa successiva —
 * o a un colpo manuale — otterrà il suo saldo senza che nessuno debba
 * correggere una riga inventata nel frattempo.
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

export async function POST(request: NextRequest) {
  const rifiuto = verificaSegretoCron(request)
  if (rifiuto) return rifiuto

  try {
    // L'anno da chiudere è quello precedente al giorno italiano corrente: il
    // 1° gennaio 2027 si riporta il 31 dicembre 2026. `anno` esplicito serve a
    // recuperare un riporto saltato senza aspettare dodici mesi.
    const richiesto = new URL(request.url).searchParams.get('anno')
    const annoDaChiudere = richiesto
      ? Number(richiesto)
      : Number(romeDateKey(new Date()).slice(0, 4)) - 1

    if (!Number.isInteger(annoDaChiudere) || annoDaChiudere < 2000 || annoDaChiudere > 2999) {
      return NextResponse.json({ error: 'Anno non valido' }, { status: 400 })
    }

    const esiti = await riportaSaldiTutteLeSedi(annoDaChiudere)

    // Le sedi senza chiusura validata NON sono un errore della richiesta: il
    // cron ha fatto il suo lavoro, e chi lo legge deve poter distinguere «non
    // ho potuto» da «non ho funzionato». Restano in evidenza nella risposta e
    // in un log di warn.
    return NextResponse.json({
      annoDaChiudere,
      creati: esiti.filter((e) => e.esito === 'creato').length,
      giaPresenti: esiti.filter((e) => e.esito === 'gia_presente').length,
      daChiudere: esiti
        .filter((e) => e.esito === 'chiusura_mancante')
        .map((e) => ('motivo' in e ? { venueId: e.venueId, motivo: e.motivo } : e)),
    })
  } catch (error) {
    logger.error('Errore POST /api/saldi/riporto-anno/cron', error)
    return NextResponse.json({ error: 'Errore nel riporto di fine anno' }, { status: 500 })
  }
}
