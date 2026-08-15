/**
 * La sincronizzazione dei movimenti bancari da GoCardless.
 *
 * L'orchestratore: legge i conti accesi, chiama la banca, scrive i movimenti e
 * il registro del giro. Le decisioni difficili stanno altrove e sono pure —
 * `finestra.ts` (da quando chiedere), `contingente.ts` (se si può chiamare),
 * `mapper.ts` (cosa salvare) — così si provano senza montare nulla.
 *
 * ## La deduplica non è qui
 *
 * È dell'indice `ux_bank_transactions_conto_provider`, UNIQUE parziale su
 * `(bank_account_id, provider_transaction_id)`. Questo modulo inserisce e conta
 * le violazioni `P2002` come duplicati.
 *
 * Un controllo applicativo «esiste già?» creerebbe una seconda fonte di verità
 * che diverge dalla prima sotto concorrenza: due giri sovrapposti passerebbero
 * entrambi il controllo, e solo l'indice fermerebbe il secondo. In più
 * `transactionId` **collide fra conti** — 249 casi su 678 nel dato vero — e solo
 * la coppia è una chiave.
 *
 * ## Perché non chiediamo il saldo
 *
 * Costerebbe zero in contingente (endpoint separato), ma non c'è dove metterlo:
 * `BankAccount` non ha un saldo corrente e `BankTransaction.balanceAfter` è per
 * riga, non per conto. Una chiamata il cui risultato si butta è solo un modo di
 * far fallire la sincronizzazione più spesso. Entra quando entra il campo.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { clientDaAmbiente } from '@/lib/gocardless/servizio'
import { mappaMovimenti } from '@/lib/gocardless/mapper'
import { calcolaDataDa } from '@/lib/gocardless/finestra'
import { puoSincronizzare, riapertura } from '@/lib/gocardless/contingente'
import { avvisaSyncFallita } from '@/lib/notifications/sync-fallita'

export type EsitoGiro = 'OK' | 'ERRORE' | 'LIMITE'

export interface EsitoSync {
  bankAccountId: string
  nomeConto: string
  esito: EsitoGiro
  movimentiLetti: number
  movimentiNuovi: number
  movimentiDuplicati: number
  errore?: string
}

export interface ArgomentiSync {
  venueId: string
  /** Un conto solo, per il pulsante «Sincronizza ora». */
  soloConto?: string
  origine: 'cron' | 'manuale'
  /** Iniettabile per i test: senza, non si prova il comportamento a mezzanotte. */
  oggi?: Date
}

/** Mezzanotte UTC del giorno di `istante`. */
function inizioGiornata(istante: Date): Date {
  return new Date(`${istante.toISOString().slice(0, 10)}T00:00:00.000Z`)
}

export async function sincronizzaConti(args: ArgomentiSync): Promise<EsitoSync[]> {
  const oggi = args.oggi ?? new Date()

  const conti = await prisma.bankAccount.findMany({
    where: {
      venueId: args.venueId,
      syncEnabled: true,
      isActive: true,
      providerAccountId: { not: null },
      ...(args.soloConto ? { id: args.soloConto } : {}),
    },
    select: {
      id: true,
      name: true,
      providerAccountId: true,
      syncCutoffDate: true,
      connectionId: true,
    },
  })

  const esiti: EsitoSync[] = []
  for (const conto of conti) {
    esiti.push(await sincronizzaConto(conto, args, oggi))
  }
  return esiti
}

type ContoDaSincronizzare = {
  id: string
  name: string
  providerAccountId: string | null
  syncCutoffDate: Date | null
  connectionId: string | null
}

async function sincronizzaConto(
  conto: ContoDaSincronizzare,
  args: ArgomentiSync,
  oggi: Date
): Promise<EsitoSync> {
  const base = {
    bankAccountId: conto.id,
    nomeConto: conto.name,
    movimentiLetti: 0,
    movimentiNuovi: 0,
    movimentiDuplicati: 0,
  }

  // I giri respinti dal contingente non hanno speso nulla: non contano come
  // sincronizzazioni fatte, altrimenti il rifiuto si autoalimenterebbe.
  const giriOggi = await prisma.bankSyncRun.findMany({
    where: {
      bankAccountId: conto.id,
      startedAt: { gte: inizioGiornata(oggi) },
      esito: { in: ['OK', 'ERRORE'] },
    },
    orderBy: { startedAt: 'desc' },
    select: { rateLimitRemaining: true, rateLimitResetAt: true },
  })

  const ultimo = giriOggi[0]
  const permesso = puoSincronizzare({
    sincronizzazioniOggi: giriOggi.length,
    restantiDichiarate: ultimo?.rateLimitRemaining ?? null,
    riapreAlle: ultimo?.rateLimitResetAt ?? null,
  })

  if (!permesso.si) {
    await registraGiro(conto, args, {
      esito: 'LIMITE',
      errore: permesso.motivo ?? null,
      rateLimitRemaining: ultimo?.rateLimitRemaining ?? null,
      rateLimitResetAt: permesso.riapreAlle,
      letti: 0,
      nuovi: 0,
      duplicati: 0,
    })
    return { ...base, esito: 'LIMITE', errore: permesso.motivo }
  }

  const ultimoMovimento = await prisma.bankTransaction.findFirst({
    where: { bankAccountId: conto.id, deletedAt: null },
    orderBy: { transactionDate: 'desc' },
    select: { transactionDate: true },
  })

  const da = calcolaDataDa(
    {
      syncCutoffDate: conto.syncCutoffDate,
      ultimoMovimento: ultimoMovimento?.transactionDate ?? null,
    },
    oggi
  )

  try {
    const client = clientDaAmbiente()
    const risposta = await client.movimentiConto(conto.providerAccountId as string, { da })
    const movimenti = mappaMovimenti(risposta.dati)

    let nuovi = 0
    let duplicati = 0
    for (const m of movimenti) {
      try {
        await prisma.bankTransaction.create({
          data: {
            venueId: args.venueId,
            bankAccountId: conto.id,
            providerTransactionId: m.providerTransactionId,
            transactionDate: m.transactionDate,
            valueDate: m.valueDate,
            description: m.description,
            amount: m.amount,
            bankTransactionCode: m.bankTransactionCode,
            importSource: 'PSD2_GOCARDLESS',
            status: 'PENDING',
          },
        })
        nuovi++
      } catch (errore) {
        // `P2002` qui non è un guasto: è l'indice che fa il suo mestiere.
        if (errore instanceof Prisma.PrismaClientKnownRequestError && errore.code === 'P2002') {
          duplicati++
          continue
        }
        throw errore
      }
    }

    await registraGiro(conto, args, {
      esito: 'OK',
      errore: null,
      rateLimitRemaining: risposta.limiti.restanti,
      rateLimitResetAt: riapertura(risposta.limiti.ripresaFraSecondi, oggi),
      letti: movimenti.length,
      nuovi,
      duplicati,
    })

    return {
      ...base,
      esito: 'OK',
      movimentiLetti: movimenti.length,
      movimentiNuovi: nuovi,
      movimentiDuplicati: duplicati,
    }
  } catch (errore) {
    const messaggio = errore instanceof Error ? errore.message : String(errore)
    logger.error('[SyncBancaria] Giro fallito', { conto: conto.name, errore: messaggio })

    await registraGiro(conto, args, {
      esito: 'ERRORE',
      errore: messaggio,
      rateLimitRemaining: null,
      rateLimitResetAt: null,
      letti: 0,
      nuovi: 0,
      duplicati: 0,
    })

    await avvisaSyncFallita({
      venueId: args.venueId,
      nomeConto: conto.name,
      errore: messaggio,
      fallimentiConsecutivi: await contaFallimentiConsecutivi(conto.id),
    })

    return { ...base, esito: 'ERRORE', errore: messaggio }
  }
}

/**
 * Quanti giri falliti di fila, guardando indietro fino al primo riuscito.
 *
 * I giri respinti dal contingente non spezzano la serie e non la allungano: non
 * dicono nulla sulla salute del collegamento.
 */
async function contaFallimentiConsecutivi(bankAccountId: string): Promise<number> {
  const recenti = await prisma.bankSyncRun.findMany({
    where: { bankAccountId, esito: { in: ['OK', 'ERRORE'] } },
    orderBy: { startedAt: 'desc' },
    take: 20,
    select: { esito: true },
  })

  let consecutivi = 0
  for (const g of recenti) {
    if (g.esito !== 'ERRORE') break
    consecutivi++
  }
  return consecutivi
}

async function registraGiro(
  conto: ContoDaSincronizzare,
  args: ArgomentiSync,
  dati: {
    esito: EsitoGiro
    errore: string | null
    rateLimitRemaining: number | null
    rateLimitResetAt: Date | null
    letti: number
    nuovi: number
    duplicati: number
  }
): Promise<void> {
  if (!conto.connectionId) {
    logger.error('[SyncBancaria] Conto senza collegamento: giro non registrato', {
      conto: conto.name,
    })
    return
  }

  await prisma.bankSyncRun.create({
    data: {
      venueId: args.venueId,
      connectionId: conto.connectionId,
      bankAccountId: conto.id,
      finishedAt: new Date(),
      esito: dati.esito,
      movimentiLetti: dati.letti,
      movimentiNuovi: dati.nuovi,
      movimentiDuplicati: dati.duplicati,
      rateLimitRemaining: dati.rateLimitRemaining,
      rateLimitResetAt: dati.rateLimitResetAt,
      errore: dati.errore,
    },
  })
}
