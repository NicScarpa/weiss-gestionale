import { prisma } from '@/lib/prisma'

/**
 * Simboli condivisi fra `promemoria-timbratura/route.ts` e la sua route figlia.
 *
 * Stanno qui e non nella route perché Next genera il validatore dei tipi solo
 * per i moduli `route.ts` che esportano *soltanto* handler: un export in più e
 * il type check del build fallisce con
 * «Property '<nome>' is incompatible with index signature» (TS2344), oppure —
 * peggio — la route resta senza controllo sulla firma degli handler.
 */

/** I promemoria scrivono sui telefoni di tutti: solo admin e manager. */
export const RUOLI_PROMEMORIA = ['admin', 'manager'] as const

/** Campi restituiti al client, uguali in lista e dopo il salvataggio. */
export const promemoriaSelect = {
  id: true,
  name: true,
  punchType: true,
  timeMinutes: true,
  daysOfWeek: true,
  skipIfPunched: true,
  title: true,
  body: true,
  isActive: true,
  lastSentDate: true,
  recipients: { select: { userId: true } },
} as const

/**
 * Chi può ricevere un promemoria: l'organico attivo con il portale acceso.
 * È lo stesso insieme che il cron usa quando il promemoria non ha destinatari
 * espliciti — se qui comparisse qualcun altro, si potrebbe scegliere una
 * persona che non riceverà mai nulla.
 */
export function destinatariPossibili(venueId: string) {
  return prisma.user.findMany({
    where: { venueId, isActive: true, portalEnabled: true },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
}

/**
 * Verifica che i destinatari scelti siano davvero dipendenti della sede
 * abilitati al portale. Restituisce il messaggio d'errore, o `null` se va bene.
 */
export async function verificaDestinatari(
  recipientIds: string[],
  venueId: string
): Promise<string | null> {
  if (recipientIds.length === 0) return null

  const trovati = await prisma.user.count({
    where: {
      id: { in: recipientIds },
      venueId,
      isActive: true,
      portalEnabled: true,
    },
  })

  return trovati === recipientIds.length
    ? null
    : 'Fra i destinatari scelti c\'è qualcuno che non è un dipendente attivo con il portale abilitato'
}
