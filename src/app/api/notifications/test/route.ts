import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isPushConfigured } from '@/lib/notifications/vapid'
import { inviaPushMultiplo } from '@/lib/notifications/web-push'
import { sottoscrizioniAttive } from '@/lib/notifications/subscriptions'

import { logger } from '@/lib/logger'

/**
 * POST /api/notifications/test
 *
 * Invia una notifica di prova ai dispositivi dell'utente autenticato.
 * Serve a verificare il canale dal vivo: se qualcosa non funziona, il
 * fallimento va detto qui e ora invece che restare invisibile.
 *
 * Non passa da `sendNotification`: salta di proposito le preferenze e il log,
 * perché è una diagnostica, non una notifica applicativa.
 */
export async function POST() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!isPushConfigured()) {
      return NextResponse.json(
        {
          error:
            'Canale push non configurato: mancano le chiavi VAPID sul server.',
        },
        { status: 503 }
      )
    }

    const sottoscrizioni = await sottoscrizioniAttive(session.user.id)

    if (sottoscrizioni.length === 0) {
      return NextResponse.json(
        { error: 'Nessun dispositivo sottoscritto per questo utente.' },
        { status: 409 }
      )
    }

    const risultati = await inviaPushMultiplo(sottoscrizioni, {
      title: 'Notifica di prova',
      body: 'Se leggi questo messaggio, le notifiche push funzionano.',
      tag: 'test',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: { url: '/portale/impostazioni' },
    })

    const inviate = risultati.filter((r) => r.success).length
    const errori = risultati.filter((r) => !r.success).map((r) => r.error)

    if (inviate === 0) {
      logger.error('Notifica di prova non consegnata', { errori })
      return NextResponse.json(
        { error: errori[0] ?? 'Invio fallito', inviate: 0 },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      inviate,
      dispositivi: sottoscrizioni.length,
    })
  } catch (error) {
    logger.error('Errore POST /api/notifications/test', error)
    return NextResponse.json({ error: "Errore nell'invio di prova" }, { status: 500 })
  }
}
