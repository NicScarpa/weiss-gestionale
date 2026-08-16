import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createBankTransactionSchema } from '@/lib/validations/reconciliation'
import { getVenueId } from '@/lib/venue'
import { filtriDaSearchParams } from '@/lib/banca/filtri-estratto-conto'
import { costruisciWhere, costruisciOrderBy, SELEZIONE_RIGA, mappaRiga } from '@/lib/banca/query-estratto-conto'

import { checkRequestRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/api-utils'
import { logger } from '@/lib/logger'
// GET /api/bank-transactions - Lista transazioni bancarie
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const venueId = await getVenueId()

    const filtri = filtriDaSearchParams(request.nextUrl.searchParams)
    const where = costruisciWhere(filtri, venueId)

    // Un `$transaction` a lista: una connessione sola. Sette query in
    // `Promise.all` prenderebbero sette connessioni su un pool da dieci.
    const [righe, totale, entrate, uscite, perSezione, cestino, perStato] = await prisma.$transaction([
      prisma.bankTransaction.findMany({
        where,
        ...SELEZIONE_RIGA,
        orderBy: costruisciOrderBy(filtri),
        skip: (filtri.page - 1) * filtri.limit,
        take: filtri.limit,
      }),
      prisma.bankTransaction.count({ where }),
      // `AND`, non spread: `where` può già avere un `amount` suo (filtro
      // `tipo`), e uno spread lo sovrascriverebbe silenziosamente invece di
      // intersecarlo — coi filtri combinati i totali di segno opposto
      // tornerebbero somme prese da fuori il filtro attivo.
      prisma.bankTransaction.aggregate({ where: { AND: [where, { amount: { gt: 0 } }] }, _sum: { amount: true } }),
      prisma.bankTransaction.aggregate({ where: { AND: [where, { amount: { lt: 0 } }] }, _sum: { amount: true } }),
      prisma.bankTransaction.groupBy({ by: ['sezione'], where: { venueId, deletedAt: null }, _count: { _all: true } }),
      prisma.bankTransaction.count({ where: { venueId, deletedAt: { not: null } } }),
      prisma.bankTransaction.groupBy({ by: ['status'], where: { venueId, deletedAt: null }, _count: { id: true } }),
    ])

    const conta = (sezione: string) => perSezione.find((s) => s.sezione === sezione)?._count._all ?? 0
    const sommaEntrate = Number(entrate._sum.amount ?? 0)
    const sommaUscite = Math.abs(Number(uscite._sum.amount ?? 0))
    const summaryMap = Object.fromEntries(perStato.map((s) => [s.status, s._count.id])) as Record<string, number>

    return NextResponse.json({
      data: righe.map(mappaRiga),
      pagination: { page: filtri.page, limit: filtri.limit, total: totale, totalPages: Math.ceil(totale / filtri.limit) },
      totali: { entrate: sommaEntrate, uscite: sommaUscite, saldoNetto: Math.round((sommaEntrate - sommaUscite) * 100) / 100 },
      conteggi: { attivi: conta('ATTIVI'), delegheF24: conta('DELEGHE_F24'), cbillPagopa: conta('CBILL_PAGOPA'), cestino },
      // Il riepilogo di prima, per la pagina /riconciliazione finché esiste.
      summary: {
        total: totale,
        pending: summaryMap.PENDING || 0,
        matched: summaryMap.MATCHED || 0,
        toReview: summaryMap.TO_REVIEW || 0,
        manual: summaryMap.MANUAL || 0,
        ignored: summaryMap.IGNORED || 0,
        unmatched: summaryMap.UNMATCHED || 0,
      },
    })
  } catch (error) {
    logger.error('GET /api/bank-transactions error', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle transazioni' },
      { status: 500 }
    )
  }
}

// POST /api/bank-transactions - Crea transazione manuale
export async function POST(request: NextRequest) {
  try {
    const rateCheck = checkRequestRateLimit(request, 'bank:create', RATE_LIMIT_CONFIGS.STRICT)
    if (!rateCheck.allowed) return rateCheck.response!

    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const venueId = await getVenueId()

    const body = await request.json()
    const data = createBankTransactionSchema.parse(body)

    // Il conto appartiene alla sede come ogni altro movimento: niente riga
    // manuale orfana o intestata al conto di un'altra sede.
    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id: data.bankAccountId, venueId, accountType: 'BANK' },
    })
    if (!bankAccount) {
      return NextResponse.json({ error: 'Conto bancario non trovato' }, { status: 404 })
    }

    // Crea la transazione
    const transaction = await prisma.bankTransaction.create({
      data: {
        venueId,
        bankAccountId: data.bankAccountId,
        transactionDate: new Date(data.transactionDate),
        valueDate: data.valueDate ? new Date(data.valueDate) : null,
        description: data.descrizione,
        descrizione: data.descrizione,
        causale: data.causale?.trim() || null,
        note: data.note?.trim() || null,
        amount: data.amount,
        importSource: 'MANUAL',
        status: 'PENDING',
      },
      include: {
        venue: {
          select: { id: true, name: true, code: true },
        },
      },
    })

    return NextResponse.json({
      ...transaction,
      amount: Number(transaction.amount),
      balanceAfter: transaction.balanceAfter ? Number(transaction.balanceAfter) : null,
    })
  } catch (error) {
    logger.error('POST /api/bank-transactions error', error)
    // Un conto mancante o un importo a zero sono errori dell'utente, non del
    // server: senza questo controllo il parse di Zod finiva nel 500 generico
    // e chi inserisce a mano una riga non capiva cosa correggere.
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dati non validi', details: error.issues }, { status: 400 })
    }
    return NextResponse.json(
      { error: 'Errore nella creazione della transazione' },
      { status: 500 }
    )
  }
}
