import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getVapidPublicKey } from '@/lib/notifications/webpush'

/**
 * La chiave pubblica VAPID, che il browser deve presentare per iscriversi
 * alle notifiche.
 *
 * Non è un segreto — finisce comunque nel browser di chiunque si iscriva —
 * ma passa da una route invece che da una variabile NEXT_PUBLIC_ così può
 * essere ruotata senza ricompilare l'applicazione. Serve comunque una
 * sessione: non c'è motivo di rispondere a chi non è entrato.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const publicKey = getVapidPublicKey()
  if (!publicKey) {
    return NextResponse.json(
      { error: 'Notifiche push non configurate su questo server' },
      { status: 503 }
    )
  }

  return NextResponse.json({ publicKey })
}
