import { Prisma } from '@prisma/client'
import type { FiltriEstrattoConto } from './filtri-estratto-conto'
import { CAMPI_BADGE } from './cronologia'
import { statoLegenda } from './stato-legenda'
import type { RigaEstrattoConto } from '@/types/reconciliation'

/** Il `where` della lista. `deletedAt` è esplicito — è ciò che apre o chiude il Cestino — salvo col collegamento profondo a una riga (`movimento`), che la mostra dovunque sia. */
export function costruisciWhere(f: FiltriEstrattoConto, venueId: string): Prisma.BankTransactionWhereInput {
  const where: Prisma.BankTransactionWhereInput = { venueId }
  // Il collegamento profondo a una riga sola (`?movimento=`) arriva dalla
  // scheda Scritture e dalla pagina di riconciliazione, che non sanno dove la
  // riga si trovi: «Sposta in» può averla portata in Deleghe F24 o nel
  // Cestino. Filtrarla anche per scheda apriva una lista vuota sotto il chip
  // «Stai guardando un solo movimento», che prometteva una riga inesistente.
  if (f.movimento) {
    where.id = f.movimento
  } else if (f.cestino) {
    where.deletedAt = { not: null }
  } else {
    where.deletedAt = null
    where.sezione = f.sezione
  }
  if (f.tipo === 'entrate') where.amount = { gt: 0 }
  if (f.tipo === 'uscite') where.amount = { lt: 0 }
  if (f.bankAccountId) where.bankAccountId = f.bankAccountId
  // «Non riconciliata» = Non abbinato + Parzialmente abbinato (spec, «Gli
  // stati»): senza scrittura, con una proposta da rivedere, o col residuo dei
  // documenti ancora aperto. In `AND`, perché `OR` è della ricerca.
  if (f.soloNonRiconciliati) {
    where.AND = [{ OR: [{ matchedEntryId: null }, { status: 'TO_REVIEW' }, { residuoDocumenti: { gt: 0 } }] }]
  }
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
    // La scrittura collegata porta la Categoria (conto e centro) e il numero di
    // fette; il residuo dei documenti NON si somma qui: sta sulla riga
    // (`residuoDocumenti`), ed è la stessa colonna che filtra.
    matchedEntry: {
      select: {
        id: true,
        date: true,
        description: true,
        debitAmount: true,
        creditAmount: true,
        documentRef: true,
        account: { select: { id: true, code: true, name: true } },
        costCenter: { select: { id: true, code: true, name: true } },
        _count: { select: { allocations: true } },
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
  const residuoDocumenti = r.residuoDocumenti === null ? null : Number(r.residuoDocumenti)
  const { stato, residuo, proposta } = statoLegenda({
    matchedEntryId: r.matchedEntryId,
    status: r.status,
    amount,
    residuoDocumenti,
  })
  const { _count, matchedEntry, ...resto } = r
  return {
    ...resto,
    amount,
    balanceAfter: r.balanceAfter ? Number(r.balanceAfter) : null,
    matchConfidence: r.matchConfidence ? Number(r.matchConfidence) : null,
    residuoDocumenti,
    matchedEntry: matchedEntry
      ? {
          id: matchedEntry.id,
          date: matchedEntry.date,
          description: matchedEntry.description,
          debitAmount: matchedEntry.debitAmount ? Number(matchedEntry.debitAmount) : null,
          creditAmount: matchedEntry.creditAmount ? Number(matchedEntry.creditAmount) : null,
          documentRef: matchedEntry.documentRef,
          account: matchedEntry.account,
          costCenter: matchedEntry.costCenter,
          fette: matchedEntry._count.allocations,
        }
      : null,
    modificato: _count.modifiche > 0,
    stato,
    residuo,
    proposta,
  }
}
