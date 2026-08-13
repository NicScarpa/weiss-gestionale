import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import {
  valutaCoppia,
  fascia,
  SOGLIE,
  TOLLERANZA,
  type ContestoValutazione,
  type Fattori,
  type Motivazione,
  type MovimentoBanca,
  type ScadenzaCandidata,
} from '@/lib/reconciliation/punteggio'
import { trovaCombinazioni } from '@/lib/reconciliation/combinazioni'
import { applicaUnicita } from '@/lib/reconciliation/unicita'

/**
 * Generare un lotto di proposte.
 *
 * Il servizio legge il database, chiama le funzioni pure di
 * `@/lib/reconciliation/` e persiste. Tutta la logica di punteggio sta lì, non
 * qui: è la separazione che permette di esercitare il motore sui movimenti veri
 * degli snapshot senza montare un database.
 *
 * Nota sulla riesecuzione: si escludono i movimenti già riconciliati e le
 * scadenze già saldate, quindi rilanciare dopo aver approvato le proposte
 * facili restringe lo spazio dei candidati e fa emergere abbinamenti prima
 * nascosti. Il flusso è iterativo per disegno.
 */

/** Finestra di ricerca attorno alla data del movimento, in giorni. */
const FINESTRA_INDIETRO = 120
const FINESTRA_AVANTI = 15

export interface GeneraLottoInput {
  venueId: string
  dateFrom: Date
  dateTo: Date
  regole: string[]
  userId: string | null
  sogliaMinima?: number
}

export interface GeneraLottoEsito {
  batchId: string
  contaProposte: number
  perFascia: { alta: number; media: number; bassa: number }
}

interface CoppiaValutata {
  scadenze: ScadenzaCandidata[]
  punteggioParziale: number
  fattori: Fattori
  motivazioni: Motivazione[]
}

/** Gli alias della sede, indicizzati per testo normalizzato. */
async function leggiAlias(venueId: string): Promise<Map<string, string>> {
  const righe = await prisma.counterpartyAlias.findMany({
    where: { venueId },
    select: { testoNormalizzato: true, supplierId: true, customerId: true },
  })
  const mappa = new Map<string, string>()
  for (const riga of righe) {
    const identita = riga.supplierId ?? riga.customerId
    if (identita) mappa.set(riga.testoNormalizzato, identita)
  }
  return mappa
}

/** Le coppie che l'utente ha escluso per sempre, come chiavi `btx|sch`. */
async function leggiEsclusioni(venueId: string): Promise<Set<string>> {
  const righe = await prisma.reconciliationExclusion.findMany({
    where: { venueId },
    select: { bankTransactionId: true, scheduleId: true },
  })
  return new Set(righe.map((r) => `${r.bankTransactionId ?? ''}|${r.scheduleId ?? ''}`))
}

export async function generaLotto(input: GeneraLottoInput): Promise<GeneraLottoEsito> {
  const { venueId, dateFrom, dateTo, regole, userId } = input
  const sogliaMinima = input.sogliaMinima ?? SOGLIE.MINIMA

  const [movimentiGrezzi, scadenzeGrezze, alias, esclusioni] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: {
        venueId,
        deletedAt: null,
        status: { in: ['PENDING', 'UNMATCHED', 'TO_REVIEW'] },
        transactionDate: { gte: dateFrom, lte: dateTo },
      },
      select: {
        id: true,
        transactionDate: true,
        description: true,
        amount: true,
        bankTransactionCode: true,
      },
      orderBy: { transactionDate: 'asc' },
    }),
    prisma.schedule.findMany({
      where: {
        venueId,
        deletedAt: null,
        stato: { in: ['aperta', 'parzialmente_pagata', 'scaduta'] },
        dataScadenza: {
          gte: new Date(dateFrom.getTime() - FINESTRA_INDIETRO * 86_400_000),
          lte: new Date(dateTo.getTime() + FINESTRA_AVANTI * 86_400_000),
        },
      },
      select: {
        id: true,
        tipo: true,
        dataScadenza: true,
        descrizione: true,
        importoTotale: true,
        importoPagato: true,
        numeroDocumento: true,
        controparteNome: true,
        controparteIban: true,
        supplierId: true,
        metodoPagamento: true,
        invoiceId: true,
        supplier: { select: { vatNumber: true } },
      },
    }),
    leggiAlias(venueId),
    leggiEsclusioni(venueId),
  ])

  const contesto: ContestoValutazione = {
    alias,
    // La mappa dei codici banca va ricavata leggendo i movimenti veri. Finché
    // è vuota il fattore vale 0 per tutti e non rompe nulla.
    mappaCodiciBanca: new Map(),
  }

  const scadenze: ScadenzaCandidata[] = scadenzeGrezze
    .map((s) => ({
      id: s.id,
      tipo: s.tipo === 'attiva' ? ('attiva' as const) : ('passiva' as const),
      dataScadenza: s.dataScadenza,
      descrizione: s.descrizione,
      residuo: Number(s.importoTotale) - Number(s.importoPagato),
      numeroDocumento: s.numeroDocumento,
      controparteNome: s.controparteNome,
      controparteIban: s.controparteIban,
      supplierId: s.supplierId,
      partitaIvaControparte: s.supplier?.vatNumber ?? null,
      metodoPagamento: s.metodoPagamento,
    }))
    .filter((s) => s.residuo > TOLLERANZA)

  // Le scadenze nate da una fattura elettronica: distinguono R1/R2 da R3
  const conFattura = new Set(
    scadenzeGrezze.filter((s) => s.invoiceId !== null).map((s) => s.id)
  )

  const lotto = await prisma.reconciliationBatch.create({
    data: {
      venueId,
      dateFrom,
      dateTo,
      regoleUsate: regole,
      sogliaMinima,
      createdById: userId,
    },
    select: { id: true },
  })

  const perFascia = { alta: 0, media: 0, bassa: 0 }
  let contaProposte = 0

  for (const grezzo of movimentiGrezzi) {
    const movimento: MovimentoBanca = {
      id: grezzo.id,
      data: grezzo.transactionDate,
      causale: grezzo.description,
      importo: Number(grezzo.amount),
      bankTransactionCode: grezzo.bankTransactionCode,
    }

    const nellaFinestra = scadenze.filter((s) => {
      const chiave = `${movimento.id}|${s.id}`
      if (esclusioni.has(chiave)) return false
      const giorni = (movimento.data.getTime() - s.dataScadenza.getTime()) / 86_400_000
      return giorni <= FINESTRA_INDIETRO && giorni >= -FINESTRA_AVANTI
    })

    const valutate: CoppiaValutata[] = []

    // Coppie singole
    for (const scadenza of nellaFinestra) {
      const esito = valutaCoppia(movimento, scadenza, contesto)
      if (!esito) continue
      valutate.push({
        scadenze: [scadenza],
        punteggioParziale: esito.punteggioParziale,
        fattori: esito.fattori,
        motivazioni: esito.motivazioni,
      })
    }

    // Combinazioni cumulative: si valutano contro la somma dei residui,
    // rappresentata da una scadenza sintetica che non viene mai persistita
    const importoAssoluto = Math.abs(movimento.importo)
    for (const combinazione of trovaCombinazioni(importoAssoluto, nellaFinestra)) {
      const sommaResidui = combinazione.reduce((totale, s) => totale + s.residuo, 0)
      const rappresentante = combinazione[0]
      const esito = valutaCoppia(
        movimento,
        { ...rappresentante, residuo: sommaResidui },
        contesto
      )
      if (!esito) continue
      valutate.push({
        scadenze: combinazione,
        punteggioParziale: esito.punteggioParziale,
        fattori: esito.fattori,
        motivazioni: [
          ...esito.motivazioni,
          {
            testo: `Pagamento cumulativo di ${combinazione.length} scadenze`,
            segno: '+' as const,
          },
        ],
      })
    }

    if (valutate.length === 0) continue

    // L'unicità si applica ora, che si conoscono le alternative sopra soglia
    const sopraSoglia = valutate.filter((v) => v.punteggioParziale >= sogliaMinima - 5)
    const alternative = sopraSoglia.length

    const finali = sopraSoglia
      .map((v) => ({
        scadenze: v.scadenze,
        ...applicaUnicita(
          { fattori: v.fattori, motivazioni: v.motivazioni, punteggioParziale: v.punteggioParziale },
          alternative
        ),
      }))
      .filter((v) => v.punteggio >= sogliaMinima)
      .sort((a, b) => b.punteggio - a.punteggio)

    for (const finale of finali) {
      const quotaPerGamba = ripartisci(importoAssoluto, finale.scadenze)

      await prisma.reconciliationProposal.create({
        data: {
          batchId: lotto.id,
          regola: regolaDi(finale.scadenze[0], conFattura),
          punteggio: finale.punteggio,
          fattori: finale.fattori as unknown as Prisma.InputJsonValue,
          motivazioni: finale.motivazioni as unknown as Prisma.InputJsonValue,
          bankTransactionId: movimento.id,
          gambe: {
            create: finale.scadenze.map((s, indice) => ({
              scheduleId: s.id,
              importo: new Prisma.Decimal(quotaPerGamba[indice].toFixed(2)),
            })),
          },
        },
      })

      contaProposte++
      perFascia[fascia(finale.punteggio)]++
    }
  }

  await prisma.reconciliationBatch.update({
    where: { id: lotto.id },
    data: { contaProposte },
  })

  return { batchId: lotto.id, contaProposte, perFascia }
}

/**
 * La sigla della regola.
 *
 * R3 è il caso senza fattura elettronica dietro — affitto, F24, ricorrenti —
 * e si distingue perché la scadenza non ha `invoiceId`. Percorre lo stesso
 * codice di R1 e R2: la sigla serve all'utente per attribuire un errore a una
 * regola precisa, non al motore per comportarsi diversamente.
 */
function regolaDi(scadenza: ScadenzaCandidata, conFattura: Set<string>): string {
  if (!conFattura.has(scadenza.id)) return 'R3'
  return scadenza.tipo === 'attiva' ? 'R2' : 'R1'
}

/**
 * Quanto imputare a ciascuna gamba.
 *
 * Ogni gamba prende il minore fra il proprio residuo e quanto resta del
 * movimento, così la somma delle quote non eccede mai l'importo mosso.
 */
function ripartisci(importo: number, scadenze: ScadenzaCandidata[]): number[] {
  let restante = importo
  return scadenze.map((s) => {
    const quota = Math.min(s.residuo, restante)
    restante -= quota
    return Math.max(0, quota)
  })
}
