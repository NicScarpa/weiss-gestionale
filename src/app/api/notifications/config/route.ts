import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getVapidPublicKey } from '@/lib/notifications/vapid'

/**
 * GET /api/notifications/config
 *
 * Dice al client se il canale push è configurato sul server e, in caso
 * affermativo, gli consegna la chiave pubblica VAPID che serve a creare la
 * sottoscrizione. Senza questa risposta la UI non può sapere se le notifiche
 * partiranno davvero, ed è esattamente l'informazione che finora mancava.
 */
export async function GET() {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const publicKey = getVapidPublicKey()

  return NextResponse.json({
    configured: publicKey !== null,
    publicKey,
  })
}
