/**
 * Simboli condivisi fra `richieste-correzione/route.ts` e le sue route figlie.
 *
 * Stanno qui e non nella route perché Next genera il validatore dei tipi solo
 * per i moduli `route.ts` che esportano *soltanto* handler: un export in più e
 * il type check del build fallisce con
 * «Property '<nome>' is incompatible with index signature» (TS2344), oppure —
 * peggio — la route resta senza controllo sulla firma degli handler.
 */

/** Campi restituiti al client, uguali in lista e nelle azioni. */
export const richiestaSelect = {
  id: true,
  date: true,
  requestedClockIn: true,
  requestedClockOut: true,
  reason: true,
  status: true,
  reviewNotes: true,
  reviewedAt: true,
  createdAt: true,
  user: { select: { id: true, firstName: true, lastName: true } },
  workLocation: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
  anomaly: { select: { id: true, anomalyType: true, status: true } },
} as const
