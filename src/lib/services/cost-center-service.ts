import type { PrismaClient } from '@prisma/client'

export type RisoluzioneCentro =
  | { outcome: 'ok'; costCenterId: string }
  | {
      outcome: 'invalid'
      motivo: string
      code: 'CENTRO_DI_COSTO_OBBLIGATORIO' | 'CENTRO_DI_COSTO_NON_VALIDO'
    }

/**
 * Risolve e valida il centro di costo da applicare a un movimento/voce del
 * piano dei conti v4. Ordine di risoluzione: centro esplicito (se valido) >
 * obbligatorietà del conto (o delle fette) > centro di default (STR). Va
 * chiamato dentro la stessa transazione che scrive il movimento, quindi
 * accetta anche il client di transazione oltre al client globale.
 */
export async function risolviCentroDiCosto(
  db: Pick<PrismaClient, 'costCenter' | 'account'>,
  input: { accountId?: string | null; costCenterId?: string | null; accountIdsFette?: string[] }
): Promise<RisoluzioneCentro> {
  if (input.costCenterId) {
    const centro = await db.costCenter.findUnique({ where: { id: input.costCenterId } })
    if (centro && centro.isActive) {
      return { outcome: 'ok', costCenterId: centro.id }
    }
    return {
      outcome: 'invalid',
      motivo: 'Centro di costo inesistente o disattivato.',
      code: 'CENTRO_DI_COSTO_NON_VALIDO',
    }
  }

  // Ordine di ispezione: prima il conto dominante, poi le fette, così il
  // conto citato nel messaggio è il primo OBBLIGATORIO incontrato in
  // quest'ordine.
  const idsDaVerificare = [
    ...(input.accountId ? [input.accountId] : []),
    ...(input.accountIdsFette ?? []),
  ]

  if (idsDaVerificare.length > 0) {
    const conti = await db.account.findMany({
      where: { id: { in: idsDaVerificare } },
      select: { id: true, code: true, name: true, costCenterRule: true },
    })
    const contiPerId = new Map(conti.map((c) => [c.id, c]))
    for (const id of idsDaVerificare) {
      const conto = contiPerId.get(id)
      if (conto?.costCenterRule === 'OBBLIGATORIO') {
        return {
          outcome: 'invalid',
          motivo: `Il conto ${conto.code} — ${conto.name} richiede un centro di costo.`,
          code: 'CENTRO_DI_COSTO_OBBLIGATORIO',
        }
      }
    }
  }

  const centroDefault = await db.costCenter.findFirst({
    where: { isDefault: true, isActive: true },
  })
  if (!centroDefault) {
    // Errore di configurazione (mancano dati di setup), non un esito di
    // validazione: non è responsabilità del chiamante gestirlo come 'invalid'.
    throw new Error('Nessun centro di costo di default configurato')
  }
  return { outcome: 'ok', costCenterId: centroDefault.id }
}
