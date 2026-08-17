import { NextResponse } from 'next/server'
import type { ReconciliationStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import { logger } from '@/lib/logger'
import { sincronizzaConti } from '@/lib/services/bank-sync-service'
import { sincronizzazioniRimaste } from '@/lib/gocardless/contingente'

/**
 * «Sincronizza ora» e lo stato della sincronizzazione.
 *
 * Ruolo `admin`: collegare e sincronizzare una banca è la stessa classe di
 * operazione di `bank-accounts`, non una lettura di dati finanziari.
 */

/** Mezzanotte UTC del giorno di `istante`. */
function inizioGiornata(istante: Date): Date {
  return new Date(`${istante.toISOString().slice(0, 10)}T00:00:00.000Z`)
}

/**
 * Gli stati in cui un movimento aspetta ancora qualcuno: mai guardato, con una
 * proposta da verificare, o senza abbinamento. Riconciliati e ignorati sono
 * chiusi.
 */
const DA_RICONCILIARE: ReconciliationStatus[] = ['PENDING', 'TO_REVIEW', 'UNMATCHED']

export const GET = withAuth(
  async (_request, { venueId }) => {
    try {
      const conti = await prisma.bankAccount.findMany({
        where: { venueId, syncEnabled: true, isActive: true, providerAccountId: { not: null } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })

      const daInizioGiornata = inizioGiornata(new Date())

      // Quanti movimenti ha portato la sincronizzazione, conto per conto, e
      // quanti aspettano ancora nella riconciliazione. Un solo `groupBy` per
      // tutti i conti: le connessioni verso il pooler sono poche (vedi
      // `prisma.ts`) e non vale la pena spenderne una per conto.
      const perStato = await prisma.bankTransaction.groupBy({
        by: ['bankAccountId', 'status'],
        where: { venueId, bankAccountId: { in: conti.map((c) => c.id) } },
        _count: { _all: true },
      })
      const conteggi = new Map<string, { importati: number; daRiconciliare: number }>()
      for (const riga of perStato) {
        if (!riga.bankAccountId) continue
        const voce = conteggi.get(riga.bankAccountId) ?? { importati: 0, daRiconciliare: 0 }
        voce.importati += riga._count._all
        if (DA_RICONCILIARE.includes(riga.status)) voce.daRiconciliare += riga._count._all
        conteggi.set(riga.bankAccountId, voce)
      }

      const stato = await Promise.all(
        conti.map(async (conto) => {
          const [ultimoRiuscito, giriOggi] = await Promise.all([
            prisma.bankSyncRun.findFirst({
              where: { bankAccountId: conto.id, esito: 'OK' },
              orderBy: { startedAt: 'desc' },
              select: { startedAt: true, movimentiNuovi: true, movimentiDuplicati: true },
            }),
            prisma.bankSyncRun.findMany({
              where: {
                bankAccountId: conto.id,
                startedAt: { gte: daInizioGiornata },
                esito: { in: ['OK', 'ERRORE'] },
              },
              orderBy: { startedAt: 'desc' },
              select: { rateLimitRemaining: true, rateLimitResetAt: true, esito: true },
            }),
          ])

          const ultimo = giriOggi[0]
          const conteggio = conteggi.get(conto.id)
          return {
            bankAccountId: conto.id,
            nomeConto: conto.name,
            ultimaRiuscita: ultimoRiuscito?.startedAt ?? null,
            movimentiUltimaRiuscita: ultimoRiuscito?.movimentiNuovi ?? null,
            movimentiImportati: conteggio?.importati ?? 0,
            daRiconciliare: conteggio?.daRiconciliare ?? 0,
            ultimoEsito: ultimo?.esito ?? null,
            sincronizzazioniRimaste: sincronizzazioniRimaste({
              sincronizzazioniOggi: giriOggi.length,
              restantiDichiarate: ultimo?.rateLimitRemaining ?? null,
              riapreAlle: ultimo?.rateLimitResetAt ?? null,
            }),
            riapreAlle: ultimo?.rateLimitResetAt ?? null,
          }
        })
      )

      // Il pannello deve poter dire che il canale mail è spento invece di
      // mostrare «mail inviata: no» come se fosse un esito normale.
      return NextResponse.json({ conti: stato, mailConfigurata: Boolean(process.env.RESEND_API_KEY) })
    } catch (errore) {
      logger.error('[SyncBancaria] Lettura dello stato fallita', { errore })
      return NextResponse.json({ error: 'Errore nel recupero dello stato' }, { status: 500 })
    }
  },
  // Lettura aperta anche ai manager: l'indicatore di freschezza sta sulla
  // pagina di riconciliazione, che è admin **o** manager. Con il solo admin il
  // manager vedrebbe l'indicatore sparire senza spiegazione, che è peggio del
  // non averlo. La sincronizzazione vera resta ad admin, sotto.
  { roles: ['admin', 'manager'], venueScoped: true }
)

export const POST = withAuth(
  async (request, { venueId }) => {
    try {
      let soloConto: string | undefined
      try {
        const corpo = (await request.json()) as { bankAccountId?: unknown }
        if (typeof corpo?.bankAccountId === 'string') soloConto = corpo.bankAccountId
      } catch {
        // Corpo assente o non JSON: si sincronizzano tutti i conti accesi.
      }

      const esiti = await sincronizzaConti({ venueId, soloConto, origine: 'manuale' })
      return NextResponse.json({ esiti })
    } catch (errore) {
      logger.error('[SyncBancaria] Sincronizzazione manuale fallita', { errore })
      return NextResponse.json({ error: 'Sincronizzazione fallita' }, { status: 500 })
    }
  },
  { roles: ['admin'], venueScoped: true }
)
