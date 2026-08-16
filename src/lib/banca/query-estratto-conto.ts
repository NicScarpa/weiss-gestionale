import { Prisma } from '@prisma/client'
import type { FiltriEstrattoConto } from './filtri-estratto-conto'
import { CAMPI_BADGE } from './cronologia'
import { statoLegenda } from './stato-legenda'
import type { RigaEstrattoConto } from '@/types/reconciliation'

/** Il `where` della lista. `deletedAt` è sempre esplicito: è ciò che apre o chiude il Cestino. */
export function costruisciWhere(f: FiltriEstrattoConto, venueId: string): Prisma.BankTransactionWhereInput {
  const where: Prisma.BankTransactionWhereInput = { venueId }
  if (f.cestino) {
    where.deletedAt = { not: null }
  } else {
    where.deletedAt = null
    where.sezione = f.sezione
  }
  if (f.tipo === 'entrate') where.amount = { gt: 0 }
  if (f.tipo === 'uscite') where.amount = { lt: 0 }
  if (f.bankAccountId) where.bankAccountId = f.bankAccountId
  // Consegna A: «non riconciliata» = senza scrittura. I parziali entreranno
  // con la consegna B, quando il residuo dei documenti sarà denormalizzato
  // sulla riga e filtrabile in SQL.
  if (f.soloNonRiconciliati) where.matchedEntryId = null
  if (f.status) where.status = f.status
  if (f.dateFrom || f.dateTo) {
    where.transactionDate = {
      ...(f.dateFrom ? { gte: new Date(`${f.dateFrom}T00:00:00.000Z`) } : {}),
      ...(f.dateTo ? { lte: new Date(`${f.dateTo}T00:00:00.000Z`) } : {}),
    }
  }
  if (f.search) {
    const contiene = { contains: f.search, mode: 'insensitive' as const }
    where.OR = [
      { descrizione: contiene },
      { causale: contiene },
      { note: contiene },
      { description: contiene },
      { bankReference: contiene },
    ]
  }
  return where
}

/** Ordinamento lato server, due stati; le righe non ancora ricalcolate (descrizione nulla) vanno in fondo. */
export function costruisciOrderBy(f: FiltriEstrattoConto): Prisma.BankTransactionOrderByWithRelationInput[] {
  switch (f.ordina) {
    case 'descrizione':
      return [{ descrizione: { sort: f.verso, nulls: 'last' } }, { transactionDate: 'desc' }]
    case 'causale':
      return [{ causale: { sort: f.verso, nulls: 'last' } }, { transactionDate: 'desc' }]
    case 'importo':
      return [{ amount: f.verso }, { transactionDate: 'desc' }]
    default:
      return [{ transactionDate: f.verso }, { createdAt: f.verso }]
  }
}

export const SELEZIONE_RIGA = {
  include: {
    venue: { select: { id: true, name: true, code: true } },
    bankAccount: { select: { id: true, name: true } },
    matchedEntry: {
      select: {
        id: true,
        date: true,
        description: true,
        debitAmount: true,
        creditAmount: true,
        documentRef: true,
        scheduleReconciliations: { where: { status: 'VERIFIED' as const }, select: { amount: true } },
      },
    },
    // Il badge «Modificato» guarda solo i campi del movimento: spostare di
    // scheda non è una modifica (spec, «La cronologia»). L'elenco è quello di
    // `CAMPI_BADGE` e non una copia scritta qui: due liste della stessa cosa
    // divergono al primo campo aggiunto, e il badge lo direbbe di nascosto.
    _count: { select: { modifiche: { where: { campo: { in: [...CAMPI_BADGE] } } } } },
  },
} satisfies Prisma.BankTransactionDefaultArgs

export function mappaRiga(r: Prisma.BankTransactionGetPayload<typeof SELEZIONE_RIGA>): RigaEstrattoConto {
  const amount = Number(r.amount)
  const { stato, residuo } = statoLegenda({
    matchedEntryId: r.matchedEntryId,
    status: r.status,
    amount,
    importiRiconciliati: r.matchedEntry?.scheduleReconciliations.map((x) => Number(x.amount)) ?? [],
  })
  const { _count, matchedEntry, ...resto } = r
  return {
    ...resto,
    amount,
    balanceAfter: r.balanceAfter ? Number(r.balanceAfter) : null,
    matchConfidence: r.matchConfidence ? Number(r.matchConfidence) : null,
    matchedEntry: matchedEntry
      ? {
          id: matchedEntry.id,
          date: matchedEntry.date,
          description: matchedEntry.description,
          debitAmount: matchedEntry.debitAmount ? Number(matchedEntry.debitAmount) : null,
          creditAmount: matchedEntry.creditAmount ? Number(matchedEntry.creditAmount) : null,
          documentRef: matchedEntry.documentRef,
        }
      : null,
    modificato: _count.modifiche > 0,
    stato,
    residuo,
  }
}
