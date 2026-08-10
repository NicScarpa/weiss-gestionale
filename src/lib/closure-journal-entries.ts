import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { generateClosureDescription } from '@/lib/prima-nota-utils'
import { getSystemAccountOptional } from '@/lib/accounts/system'
import { risolviCentroDiCosto, type OrigineCentro } from '@/lib/services/cost-center-service'

/**
 * Client Prisma o transazione: permette di generare le scritture dentro la
 * stessa transazione che aggiorna lo stato della chiusura. Legge anche conti e
 * centri perché l'imputazione dei movimenti si risolve qui, prima di scrivere.
 */
type PrismaLike = Pick<typeof prisma, 'journalEntry' | 'costCenter' | 'account'>

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
  /** Override di riga: se assente vale il centro di testata della chiusura */
  costCenterId?: string | null
}

interface Closure {
  id: string
  date: Date
  venueId: string
  bankDeposit: number | null
  /** Centro di costo della testata, applicato a tutti i movimenti generati */
  costCenterId?: string | null
  stations: CashStation[]
  expenses: Expense[]
}

/**
 * Conti di sistema usati dall'imputazione, già risolti in id (o null).
 *
 * Sono letti con la variante "optional" di proposito: la voce 10.01
 * Corrispettivi — e con lei i patrimoniali — arriva in produzione solo con la
 * migrazione del piano dei conti. Finché manca, i movimenti nascono senza
 * conto esattamente come prima di questo cambiamento (nessuna regressione), e
 * quando la migrazione gira l'imputazione si accende da sola, senza un
 * secondo deploy.
 */
interface ContiSistema {
  corrispettivi: string | null
  cassa: string | null
  banca: string | null
}

// Legge dal client globale e non da quello di transazione: sono dati di
// configurazione del piano dei conti, non toccati dalla validazione in corso.
async function leggiContiSistema(): Promise<ContiSistema> {
  const [corrispettivi, cassa, banca] = await Promise.all([
    getSystemAccountOptional('CORRISPETTIVI'),
    getSystemAccountOptional('CASSA'),
    getSystemAccountOptional('BANCA'),
  ])

  return {
    corrispettivi: corrispettivi?.id ?? null,
    cassa: cassa?.id ?? null,
    banca: banca?.id ?? null,
  }
}

/**
 * Risolve il centro di costo di un movimento generato senza mai far fallire
 * la chiusura.
 *
 * Il centro esplicito viene dalla chiusura (testata) o dalla singola riga
 * spesa; quando non c'è — chiusure storiche, create prima che il form
 * chiedesse il centro — il service ricade sul centro di default (STR). Il
 * default di prodotto è WEISS, ma garantirlo è responsabilità del form: qui
 * non lo si inventa, perché imputare a WEISS una chiusura che nessuno ha
 * classificato sarebbe un dato inventato, non un default.
 *
 * Se la risoluzione non riesce (centro disattivato, conto che ne pretende uno
 * su una chiusura senza testata, anagrafica centri non ancora popolata) il
 * movimento nasce senza centro — com'era prima — e resta la traccia nei log:
 * la quadratura contabile della chiusura non può dipendere dall'anagrafica
 * dei centri.
 */
async function risolviCentroMovimento(
  client: PrismaLike,
  closureId: string,
  input: { accountId: string | null; costCenterId: string | null }
): Promise<{ id: string; origine: OrigineCentro } | null> {
  try {
    const esito = await risolviCentroDiCosto(client, input)
    if (esito.outcome === 'ok') {
      // L'origine viaggia insieme all'id: dice se il centro l'ha scelto chi ha
      // compilato la chiusura o se è il ripiego sul centro di sistema per una
      // testata rimasta vuota. Scriverla sempre come 'scelto' bloccherebbe per
      // sempre su STR un movimento che nessuno ha imputato — l'opposto di ciò
      // che la colonna serve a ottenere.
      return { id: esito.costCenterId, origine: esito.origine }
    }

    logger.warn('Chiusura: centro di costo non risolvibile, movimento senza centro', {
      closureId,
      accountId: input.accountId,
      costCenterId: input.costCenterId,
      code: esito.code,
      motivo: esito.motivo,
    })
  } catch (error) {
    logger.error('Chiusura: risoluzione del centro di costo fallita', error, { closureId })
  }

  return null
}

/**
 * Genera movimenti prima nota automatici quando una chiusura viene validata.
 *
 * Ogni movimento nasce imputato — conto, contropartita e centro di costo —
 * secondo questa tabella:
 *
 * | movimento          | registro | conto         | contropartita |
 * |--------------------|----------|---------------|---------------|
 * | incasso contanti   | CASH     | CORRISPETTIVI | CASSA         |
 * | uscita (per spesa) | CASH     | conto riga    | CASSA         |
 * | incasso POS        | BANK     | CORRISPETTIVI | BANCA         |
 * | versamento (cassa) | CASH     | BANCA         | CASSA         |
 * | versamento (banca) | BANK     | CASSA         | BANCA         |
 *
 * La regola che tiene insieme la colonna: `counterpartId` è sempre il conto
 * patrimoniale del registro DELLA RIGA STESSA (cassa sulle righe CASH, banca
 * su quelle BANK), mentre `accountId` racconta l'altra faccia del movimento.
 * Per questo le due gambe del versamento portano il conto della gamba
 * opposta: è la destinazione (o l'origine) del giroconto.
 *
 * Il centro è quello della testata; ogni riga spesa può sovrascriverlo.
 * L'imputazione è additiva: numero di movimenti, importi, registri, date e
 * descrizioni restano quelli di sempre, perché sono il dato contabile.
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

  const conti = await leggiContiSistema()

  // `accountId: null` è voluto: i movimenti che useranno questo centro portano
  // i conti di sistema (corrispettivi e patrimoniali), non conti scelti da
  // qualcuno. Passarli qui farebbe scattare la loro regola OBBLIGATORIO su una
  // chiusura senza testata, e il risultato sarebbe un movimento senza centro
  // invece che sul centro di default: peggio, e per una scelta che non è di
  // chi compila la chiusura.
  const centroTestata = await risolviCentroMovimento(client, closure.id, {
    accountId: null,
    costCenterId: closure.costCenterId ?? null,
  })

  // Una risoluzione per riga spesa: l'override di riga vince sul centro di
  // testata, e il conto della riga entra nella risoluzione perché può essere
  // un conto che pretende un centro. Le righe a zero non diventano movimenti,
  // quindi non si risolvono.
  const centriSpese = await Promise.all(
    closure.expenses.map((expense) =>
      expense.amount > 0
        ? risolviCentroMovimento(client, closure.id, {
            accountId: expense.accountId,
            costCenterId: expense.costCenterId ?? closure.costCenterId ?? null,
          })
        : Promise.resolve(null)
    )
  )

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
      accountId: conti.corrispettivi,
      counterpartId: conti.cassa,
      costCenterId: centroTestata?.id ?? null,
      costCenterSource: centroTestata?.origine ?? null,
      closureId: closure.id,
      createdById: userId,
    })
    totalDebits += cashIncome
  }

  // 2. Movimenti USCITA su CASSA per ogni spesa
  for (const [index, expense] of closure.expenses.entries()) {
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
        counterpartId: conti.cassa,
        costCenterId: centriSpese[index]?.id ?? null,
        costCenterSource: centriSpese[index]?.origine ?? null,
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
      accountId: conti.corrispettivi,
      counterpartId: conti.banca,
      costCenterId: centroTestata?.id ?? null,
      costCenterSource: centroTestata?.origine ?? null,
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
      accountId: conti.banca,
      counterpartId: conti.cassa,
      costCenterId: centroTestata?.id ?? null,
      costCenterSource: centroTestata?.origine ?? null,
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
      accountId: conti.cassa,
      counterpartId: conti.banca,
      costCenterId: centroTestata?.id ?? null,
      costCenterSource: centroTestata?.origine ?? null,
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
