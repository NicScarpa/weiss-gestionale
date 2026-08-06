import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { generateClosureDescription } from '@/lib/prima-nota-utils'

/**
 * Client Prisma o transazione: permette di generare le scritture dentro la
 * stessa transazione che aggiorna lo stato della chiusura.
 */
type PrismaLike = Pick<typeof prisma, 'journalEntry'>

/** Come sopra, ma serve anche a chi cerca i legami a valle delle scritture. */
type PrismaLikeWithLinks = PrismaLike &
  Pick<
    typeof prisma,
    | 'bankTransaction'
    | 'scheduleReconciliation'
    | 'journalEntryAllocation'
    | 'payment'
    | 'electronicInvoice'
  >

/**
 * La chiusura ha già scritture vive: generarne altre raddoppierebbe l'incasso
 * del giorno. È la rete che protegge dalle validazioni concorrenti sopravvissute
 * al controllo di stato, e da qualunque percorso futuro che chiami la
 * generazione senza aver prima annullato le scritture precedenti.
 */
export class JournalEntriesAlreadyExistError extends Error {
  constructor(
    readonly closureId: string,
    readonly existingEntries: number
  ) {
    super(
      `La chiusura ${closureId} ha già ${existingEntries} scritture di prima nota: ` +
        'generarne altre duplicherebbe i movimenti del giorno.'
    )
    this.name = 'JournalEntriesAlreadyExistError'
  }
}

/**
 * Le scritture della chiusura sono state lavorate a valle (riconciliate,
 * ripartite fra conti, collegate a un pagamento): rigenerarle lascerebbe quei
 * collegamenti appesi a righe annullate.
 */
export class JournalEntriesLockedError extends Error {
  constructor(readonly reasons: string[]) {
    super(
      'Le scritture di questa chiusura non possono essere rigenerate: ' +
        `${reasons.join(', ')}. Annulla prima quei collegamenti.`
    )
    this.name = 'JournalEntriesLockedError'
  }
}

interface CashStation {
  cashAmount: number | null
  posAmount: number | null
  floatAmount: number | null
}

interface Expense {
  amount: number
  payee: string | null
  description: string | null
  documentRef: string | null
  accountId: string | null
}

interface Closure {
  id: string
  date: Date
  venueId: string
  bankDeposit: number | null
  stations: CashStation[]
  expenses: Expense[]
}

/**
 * Genera movimenti prima nota automatici quando una chiusura viene validata
 */
export async function generateJournalEntriesFromClosure(
  closure: Closure,
  userId: string,
  client: PrismaLike = prisma
): Promise<{ entriesCreated: number; totalDebits: number; totalCredits: number }> {
  // Prima di scrivere qualsiasi cosa: se per questa chiusura esistono già
  // scritture vive, chi ci ha preceduto ha già registrato il giorno. Il
  // controllo sta qui e non nel chiamante perché è l'ultimo punto comune a
  // tutti i percorsi — validazione, rigenerazione dopo correzione, eventuali
  // script — e dentro la transazione: interromperla annulla anche il cambio di
  // stato che l'ha aperta.
  const existingEntries = await client.journalEntry.count({
    where: { closureId: closure.id, deletedAt: null },
  })

  if (existingEntries > 0) {
    throw new JournalEntriesAlreadyExistError(closure.id, existingEntries)
  }

  const entries: Prisma.JournalEntryCreateManyInput[] = []
  let totalDebits = 0
  let totalCredits = 0

  // Calcola totale incassi (contanti + POS)
  const totalCash = closure.stations.reduce(
    (sum, s) => sum + (Number(s.cashAmount) || 0),
    0
  )
  const totalPos = closure.stations.reduce(
    (sum, s) => sum + (Number(s.posAmount) || 0),
    0
  )
  // totalCash + totalPos available if needed for revenue calculation

  // Calcola totale uscite pagate in contanti
  const totalExpenses = closure.expenses.reduce(
    (sum, e) => sum + (Number(e.amount) || 0),
    0
  )

  // L'incasso contanti per prima nota = vendite contanti + uscite pagate
  // Perché: se ho 550€ in cassa e ho pagato 37,90€ di uscite,
  // significa che l'incasso totale era 587,90€
  const cashIncome = totalCash + totalExpenses

  // 1. Movimento INCASSO su CASSA per totale incassi contanti (vendite + uscite)
  if (cashIncome > 0) {
    entries.push({
      venueId: closure.venueId,
      date: closure.date,
      registerType: 'CASH',
      description: generateClosureDescription('revenue', closure.date),
      debitAmount: cashIncome,
      creditAmount: null,
      closureId: closure.id,
      createdById: userId,
    })
    totalDebits += cashIncome
  }

  // 2. Movimenti USCITA su CASSA per ogni spesa
  for (const expense of closure.expenses) {
    if (expense.amount > 0) {
      entries.push({
        venueId: closure.venueId,
        date: closure.date,
        registerType: 'CASH',
        description: generateClosureDescription('expense', closure.date, {
          payee: expense.payee || undefined,
          description: expense.description || undefined,
          documentRef: expense.documentRef || undefined,
        }),
        documentRef: expense.documentRef,
        debitAmount: null,
        creditAmount: expense.amount,
        accountId: expense.accountId,
        closureId: closure.id,
        createdById: userId,
      })
      totalCredits += expense.amount
    }
  }

  // 3. Movimento INCASSO POS su BANCA (gli incassi POS arrivano direttamente in banca)
  if (totalPos > 0) {
    entries.push({
      venueId: closure.venueId,
      date: closure.date,
      registerType: 'BANK',
      description: generateClosureDescription('pos', closure.date),
      debitAmount: totalPos,
      creditAmount: null,
      closureId: closure.id,
      createdById: userId,
    })
    totalDebits += totalPos
  }

  // 4. Movimento VERSAMENTO se presente (coppia cassa → banca)
  const bankDeposit = Number(closure.bankDeposit) || 0
  if (bankDeposit > 0) {
    // Uscita da cassa
    entries.push({
      venueId: closure.venueId,
      date: closure.date,
      registerType: 'CASH',
      description: generateClosureDescription('deposit', closure.date),
      debitAmount: null,
      creditAmount: bankDeposit,
      closureId: closure.id,
      createdById: userId,
    })
    totalCredits += bankDeposit

    // Entrata in banca
    entries.push({
      venueId: closure.venueId,
      date: closure.date,
      registerType: 'BANK',
      description: generateClosureDescription('deposit', closure.date),
      debitAmount: bankDeposit,
      creditAmount: null,
      closureId: closure.id,
      createdById: userId,
    })
    totalDebits += bankDeposit
  }

  if (entries.length > 0) {
    await client.journalEntry.createMany({
      data: entries,
    })
  }

  return {
    entriesCreated: entries.length,
    totalDebits,
    totalCredits,
  }
}

/**
 * Cerca i legami a valle delle scritture vive di una chiusura e li descrive.
 *
 * Rigenerare le scritture significa annullare le vecchie e crearne di nuove con
 * id diversi. Tutto ciò che puntava alle vecchie resterebbe agganciato a righe
 * annullate: il movimento bancario risulterebbe ancora riconciliato con una
 * scrittura che non esiste più, e la scrittura nuova comparirebbe fra quelle da
 * riconciliare. Quando la lista non è vuota la correzione va fermata, non
 * eseguita: sono danni che il database non solleva da solo, perché la
 * cancellazione è logica e nessuna foreign key protesta.
 *
 * Le interrogazioni sono in sequenza e non in parallelo: su un client di
 * transazione condividono una sola connessione.
 */
export async function findClosureJournalLinks(
  closureId: string,
  client: PrismaLikeWithLinks = prisma
): Promise<string[]> {
  const entries = await client.journalEntry.findMany({
    where: { closureId, deletedAt: null },
    select: { id: true },
  })

  if (entries.length === 0) return []

  const ids = entries.map((e) => e.id)
  const reasons: string[] = []

  const bankMatches = await client.bankTransaction.count({
    where: { matchedEntryId: { in: ids } },
  })
  if (bankMatches > 0) {
    reasons.push(`${bankMatches} movimenti bancari già riconciliati`)
  }

  // Le riconciliazioni rifiutate sono storia: non tengono più agganciato nulla.
  const scheduleMatches = await client.scheduleReconciliation.count({
    where: { journalEntryId: { in: ids }, status: 'VERIFIED' },
  })
  if (scheduleMatches > 0) {
    reasons.push(`${scheduleMatches} scadenze abbinate`)
  }

  const allocations = await client.journalEntryAllocation.count({
    where: { journalEntryId: { in: ids } },
  })
  if (allocations > 0) {
    reasons.push(`${allocations} ripartizioni fra conti`)
  }

  const payments = await client.payment.count({
    where: { journalEntryId: { in: ids } },
  })
  if (payments > 0) {
    reasons.push(`${payments} pagamenti collegati`)
  }

  const invoices = await client.electronicInvoice.count({
    where: { journalEntryId: { in: ids } },
  })
  if (invoices > 0) {
    reasons.push(`${invoices} fatture elettroniche collegate`)
  }

  return reasons
}

/**
 * Totali delle scritture vive di una chiusura, nella stessa forma restituita
 * dalla generazione. Serve a mettere nel registro di audit il "prima" da
 * confrontare con il "dopo" di una rigenerazione.
 */
export async function summarizeJournalEntriesForClosure(
  closureId: string,
  client: PrismaLike = prisma
): Promise<{ entriesCreated: number; totalDebits: number; totalCredits: number }> {
  const totals = await client.journalEntry.aggregate({
    where: { closureId, deletedAt: null },
    _count: true,
    _sum: { debitAmount: true, creditAmount: true },
  })

  return {
    entriesCreated: totals._count,
    totalDebits: Number(totals._sum.debitAmount ?? 0),
    totalCredits: Number(totals._sum.creditAmount ?? 0),
  }
}

/**
 * Elimina i movimenti prima nota generati da una chiusura
 * (utile se la chiusura viene riportata a DRAFT dopo rifiuto)
 */
export async function deleteJournalEntriesForClosure(
  closureId: string,
  client: PrismaLike = prisma
) {
  // Cancellazione logica: le scritture restano tracciabili anche quando la
  // chiusura che le ha generate torna in bozza (inalterabilità contabile)
  const result = await client.journalEntry.updateMany({
    where: { closureId, deletedAt: null },
    data: { deletedAt: new Date() },
  })

  return result.count
}
