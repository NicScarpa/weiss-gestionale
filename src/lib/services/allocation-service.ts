import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { derivaBudgetCategoryDaConto } from '@/lib/accounts/mapping'

export interface FettaInput {
  accountId: string
  importo: number
  note?: string | null
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

/**
 * Aggrega gli importi delle righe fattura per conto: l'input di
 * `ripartisciProQuota` per l'ereditarietà pro-quota alla riconciliazione
 * (Fase 3). Pura: raggruppa per accountId, scarta i totali non positivi e
 * ordina per importo decrescente, così il dominante è stabile e nessuna
 * fetta a zero finisce in coda a quadrare il residuo.
 */
export function calcolaPesiDaRighe(
  righe: Array<{ accountId: string; importo: number }>
): FettaInput[] {
  const totali = new Map<string, number>()
  for (const riga of righe) {
    totali.set(riga.accountId, (totali.get(riga.accountId) ?? 0) + riga.importo)
  }
  return [...totali.entries()]
    .filter(([, importo]) => importo > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([accountId, importo]) => ({ accountId, importo }))
}

/**
 * Il client dentro `prisma.$transaction`: con il client esteso dall'adapter
 * il tipo `Prisma.TransactionClient` di libreria non combacia, quindi lo si
 * ricava da quello reale (stesso pattern di src/lib/attendance/manual-punch.ts).
 */
export type TransactionClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

/**
 * Rilegge TUTTE le fette del movimento (manuali + ereditate) e allinea conto
 * dominante, categoria derivata e `categorizationSource: 'split'`. Condiviso
 * fra lo split manuale (setEntryAllocations) e l'ereditarietà pro-quota dalla
 * fattura alla riconciliazione (Fase 3): stesso identico calcolo del
 * dominante, un'unica verità. Ritorna il numero di fette rilette (0 se non
 * ce n'è più nessuna, e in tal caso non scrive nulla).
 */
export async function aggiornaContoDominante(
  tx: TransactionClient,
  journalEntryId: string
): Promise<number> {
  const tutte = await tx.journalEntryAllocation.findMany({
    where: { journalEntryId },
    select: { accountId: true, importo: true },
  })
  if (tutte.length === 0) return 0

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
  return tutte.length
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
  // Il vincolo di quadratura copre l'intero movimento: le fette manuali
  // proposte più quelle già ereditate dalla riconciliazione (Fase 3) non
  // possono superare l'importo utile, anche se le manuali da sole ci
  // starebbero (altrimenti la somma delle fette eccede il movimento).
  const aggregatoEreditate = await prisma.journalEntryAllocation.aggregate({
    where: { journalEntryId, origine: 'ereditata' },
    _sum: { importo: true },
  })
  const sommaEreditate = Number(aggregatoEreditate._sum.importo ?? 0)
  if (somma + sommaEreditate > importoUtile + 0.01) {
    return {
      outcome: 'invalid',
      motivo: `La somma delle fette (${(somma + sommaEreditate).toFixed(2)} €) supera l'importo del movimento (${importoUtile.toFixed(2)} €)`,
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
    const deleted = await tx.journalEntryAllocation.deleteMany({
      where: { journalEntryId, origine: 'manuale' },
    })
    if (fette.length > 0) {
      await tx.journalEntryAllocation.createMany({
        data: fette.map((f) => ({
          journalEntryId,
          accountId: f.accountId,
          importo: new Prisma.Decimal(f.importo.toFixed(2)),
          note: f.note ?? null,
          origine: 'manuale',
          createdById: userId,
        })),
      })
    }
    // No-op se non è stato rimosso nulla e non stiamo scrivendo nuove fette
    if (deleted.count === 0 && fette.length === 0) {
      return 0
    }
    // Il dominante si calcola su TUTTE le fette rimaste (manuali + ereditate)
    const numeroFette = await aggiornaContoDominante(tx, journalEntryId)
    if (numeroFette === 0 && deleted.count > 0) {
      // Split rimosso e nessuna fetta ereditata a sostenerlo: il movimento
      // torna alla categorizzazione semplice
      await tx.journalEntry.update({
        where: { id: journalEntryId },
        data: { categorizationSource: 'manual' },
      })
    }
    return numeroFette
  })

  logger.info('Fette del movimento aggiornate', { journalEntryId, allocazioni: risultato })
  return { outcome: 'ok', allocazioni: risultato }
}
