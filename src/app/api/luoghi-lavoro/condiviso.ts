/**
 * Simboli condivisi fra `luoghi-lavoro/route.ts` e le sue route figlie.
 *
 * Stanno qui e non nella route perché Next genera il validatore dei tipi solo
 * per i moduli `route.ts` che esportano *soltanto* handler: un export in più e
 * il type check del build fallisce con
 * «Property '<nome>' is incompatible with index signature» (TS2344), oppure —
 * peggio — la route resta senza controllo sulla firma degli handler. Un file
 * accanto costa una riga di import e tiene acceso quel controllo.
 */

/** Chi decide dove si timbra decide anche le ore: solo admin e manager. */
export const RUOLI_CONFIGURAZIONE = ['admin', 'manager'] as const

export const luogoSelect = {
  id: true,
  name: true,
  address: true,
  latitude: true,
  longitude: true,
  geofenceRadiusMeters: true,
  isActive: true,
  timekeepingPolicyId: true,
  timekeepingPolicy: { select: { id: true, name: true } },
  assignments: {
    where: { endedAt: null },
    select: {
      id: true,
      trackingMode: true,
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} as const
