import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { derivaBudgetCategoryDaConto } from '@/lib/accounts/mapping'

export interface FettaInput {
  accountId: string
  importo: number
}

/**
 * Riparte una quota proporzionalmente alle fette date, al centesimo.
 * La differenza di arrotondamento quadra sull'ultima fetta non nulla, così la
 * somma restituita è SEMPRE esattamente la quota. Pura: nessun accesso al DB.
 */
export function ripartisciProQuota(fette: FettaInput[], quota: number): FettaInput[] {
  const totale = fette.reduce((s, f) => s + f.importo, 0)
  if (totale <= 0 || quota <= 0) return []

  const out: FettaInput[] = []
  let residuo = Math.round(quota * 100)
  fette.forEach((f, i) => {
    const centesimi =
      i === fette.length - 1 ? residuo : Math.round((quota * f.importo * 100) / totale)
    residuo -= centesimi
    if (centesimi > 0) out.push({ accountId: f.accountId, importo: centesimi / 100 })
  })
  return out
}

export type SetAllocationsOutcome =
  | { outcome: 'ok'; allocazioni: number }
  | { outcome: 'entry_not_found' }
  | { outcome: 'invalid'; motivo: string }

/**
 * Split manuale del movimento: sostituisce SOLO le fette di origine 'manuale'
 * (quelle 'ereditate' dalla riconciliazione, Fase 3, non vengono toccate).
 * Il conto/categoria del movimento seguono il conto dominante calcolato su
 * TUTTE le fette rimaste dopo la scrittura. Array vuoto = rimuove lo split e
 * torna alla categorizzazione semplice ('manual'), lasciando accountId e
 * categoria correnti del movimento invariati.
 */
export async function setEntryAllocations({
  journalEntryId, venueId, userId, fette,
}: {
  journalEntryId: string
  venueId: string
  userId: string | null
  fette: FettaInput[]
}): Promise<SetAllocationsOutcome> {
  const entry = await prisma.journalEntry.findFirst({
    where: { id: journalEntryId, venueId, deletedAt: null },
    select: { id: true, debitAmount: true, creditAmount: true, accountId: true },
  })
  if (!entry) return { outcome: 'entry_not_found' }

  const importoUtile = Number(entry.debitAmount ?? entry.creditAmount ?? 0)

  if (fette.some((f) => f.importo <= 0)) {
    return { outcome: 'invalid', motivo: 'Ogni fetta deve avere un importo positivo' }
  }
  const somma = fette.reduce((s, f) => s + f.importo, 0)
  if (somma > importoUtile + 0.01) {
    return {
      outcome: 'invalid',
      motivo: `La somma delle fette (${somma.toFixed(2)} €) supera l'importo del movimento (${importoUtile.toFixed(2)} €)`,
    }
  }
  if (fette.length > 0) {
    const conti = await prisma.account.findMany({
      where: { id: { in: fette.map((f) => f.accountId) }, isActive: true },
      select: { id: true },
    })
    if (conti.length !== new Set(fette.map((f) => f.accountId)).size) {
      return { outcome: 'invalid', motivo: 'Uno o più conti non esistono o non sono attivi' }
    }
  }

  const risultato = await prisma.$transaction(async (tx) => {
    await tx.journalEntryAllocation.deleteMany({
      where: { journalEntryId, origine: 'manuale' },
    })
    if (fette.length > 0) {
      await tx.journalEntryAllocation.createMany({
        data: fette.map((f) => ({
          journalEntryId,
          accountId: f.accountId,
          importo: new Prisma.Decimal(f.importo.toFixed(2)),
          origine: 'manuale',
          createdById: userId,
        })),
      })
    }
    // Il dominante si calcola su TUTTE le fette rimaste (manuali + ereditate)
    const tutte = await tx.journalEntryAllocation.findMany({
      where: { journalEntryId },
      select: { accountId: true, importo: true },
    })
    if (tutte.length > 0) {
      const dominante = tutte.reduce((max, f) =>
        Number(f.importo) > Number(max.importo) ? f : max
      )
      await tx.journalEntry.update({
        where: { id: journalEntryId },
        data: {
          accountId: dominante.accountId,
          budgetCategoryId: await derivaBudgetCategoryDaConto(dominante.accountId),
          categorizationSource: 'split',
        },
      })
    } else {
      // Split rimosso: il movimento torna alla categorizzazione semplice
      await tx.journalEntry.update({
        where: { id: journalEntryId },
        data: { categorizationSource: 'manual' },
      })
    }
    return tutte.length
  })

  logger.info('Fette del movimento aggiornate', { journalEntryId, allocazioni: risultato })
  return { outcome: 'ok', allocazioni: risultato }
}
