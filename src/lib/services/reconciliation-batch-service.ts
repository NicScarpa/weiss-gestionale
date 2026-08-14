import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import {
  valutaCoppia,
  fascia,
  PESI,
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
import { mappaCodiciBanca } from '@/lib/reconciliation/codici-banca'

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

/**
 * Gli alias della sede, indicizzati per testo normalizzato.
 *
 * **Si indicizza solo `supplierId`, e `customerId` resta deliberatamente
 * fuori.** Non è una svista: `punteggioControparte` interroga la mappa con
 * `scadenza.supplierId`, e dal lato scadenza non esiste altra chiave —
 * `ScadenzaCandidata` non ha un campo cliente perché `Schedule` non ha una
 * colonna `customerId`. Un alias indicizzato per cliente entrerebbe in mappa e
 * nessuna chiave potrebbe interrogarlo: metà della tabella sarebbe codice
 * irraggiungibile travestito da dato.
 *
 * La colonna resta sul modello — serve alla Fase A2 se e quando `Schedule`
 * avrà un riferimento al cliente — ma finché quel lato manca il codice smette
 * di fingere di usarla.
 */
async function leggiAlias(venueId: string): Promise<Map<string, string>> {
  const righe = await prisma.counterpartyAlias.findMany({
    where: { venueId, supplierId: { not: null } },
    select: { testoNormalizzato: true, supplierId: true },
  })
  const mappa = new Map<string, string>()
  for (const riga of righe) {
    if (riga.supplierId) mappa.set(riga.testoNormalizzato, riga.supplierId)
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
    // Ricavata leggendo i 621 movimenti veri del Task 9, non inventata: la
    // provenienza di ogni riga e i codici deliberatamente esclusi sono
    // documentati in `codici-banca.ts`.
    mappaCodiciBanca: mappaCodiciBanca(),
  }

  // Le scadenze nate da una fattura elettronica: distinguono R1/R2 da R3
  const conFattura = new Set(
    scadenzeGrezze.filter((s) => s.invoiceId !== null).map((s) => s.id)
  )

  // Le regole chieste **restringono l'insieme dei candidati**, non solo
  // l'etichetta. Prima il parametro finiva unicamente in `regoleUsate`:
  // chiedere il solo R1 generava comunque proposte R2 e R3, perché `regolaDi`
  // assegna la sigla a posteriori. Il filtro qui usa lo stesso predicato di
  // `regolaDi`, così la sigla richiesta e quella generata non possono
  // divergere — e `regoleUsate` documenta un'esecuzione davvero avvenuta.
  const regoleRichieste = new Set(regole)

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
    .filter((s) => regoleRichieste.has(regolaDi(s, conFattura)))

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
  // Le `create` non vengono eseguite qui: si accumulano e partono tutte
  // insieme nella transazione finale, vedi sotto.
  const operazioni: Prisma.PrismaPromise<unknown>[] = []

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
    // rappresentata da una scadenza sintetica che non viene mai persistita.
    //
    // Il rappresentante è `combinazione[0]`, che è sempre la scadenza col
    // residuo maggiore fra le gambe scelte: `trovaCombinazioni` ordina le
    // candidate per residuo decrescente e le esplora per indice crescente,
    // quindi il primo elemento di ogni combinazione è la più grossa del
    // gruppo, mai la più vicina per data né quella citata nella causale. Per
    // controparte e codice banca è irrilevante — la combinazione è già
    // ristretta alla stessa controparte. Per riferimento e data è
    // un'approssimazione consapevole: si valuta la fattura dominante, non
    // necessariamente quella più pertinente.
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

    // L'unicità si applica ora, che si conoscono le alternative sopra soglia.
    // La preselezione usa sogliaMinima - PESI.UNICITA: sotto quel margine
    // nessun bonus di unicità (al massimo PESI.UNICITA) potrebbe comunque
    // farla arrivare alla soglia vera.
    const sopraSoglia = valutate.filter((v) => v.punteggioParziale >= sogliaMinima - PESI.UNICITA)
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

      operazioni.push(
        prisma.reconciliationProposal.create({
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
      )

      contaProposte++
      perFascia[fascia(finale.punteggio)]++
    }
  }

  // Proposte e contatore nella stessa transazione: senza, un'interruzione a
  // metà corsa — realistica sui volumi veri del Task 9 — lascerebbe proposte
  // persistite con `contaProposte` ancora a zero sul lotto. È lo stesso
  // difetto che questo disegno esiste per evitare, spostato dal contatore in
  // memoria a quello su disco. Il calcolo che precede (valutaCoppia,
  // trovaCombinazioni, applicaUnicita) resta fuori: sono funzioni pure senza
  // I/O, quindi non allungano il tempo in cui la transazione tiene la
  // connessione aperta — dentro ci sono solo le scritture. La forma array di
  // `$transaction` (a differenza di quella interattiva) non accetta un
  // timeout esplicito: esegue le operazioni come un batch unico, senza
  // attese fra una scrittura e l'altra, quindi il timeout di default basta
  // anche per centinaia di proposte.
  await prisma.$transaction([
    ...operazioni,
    prisma.reconciliationBatch.update({
      where: { id: lotto.id },
      // Lo stato avanza qui, insieme al contatore e per la stessa ragione: un
      // lotto nasce `in_corso` alla `create` e senza questo aggiornamento non
      // ne uscirebbe mai, così ogni lotto concluso continuerebbe a dichiararsi
      // in corso — anche nello storico che `GET /lotti` espone. Nella stessa
      // transazione delle proposte perché «completato» e «le proposte ci
      // sono» devono diventare veri insieme.
      data: { contaProposte, stato: 'completato' },
    }),
  ])

  return { batchId: lotto.id, contaProposte, perFascia }
}

/**
 * La sigla della regola: R1 = passiva con fattura, R2 = attiva con fattura,
 * R3 = senza fattura.
 *
 * R3 è il caso senza fattura elettronica dietro — affitto, F24, ricorrenti —
 * e si distingue perché la scadenza non ha `invoiceId`. Le tre percorrono lo
 * stesso codice di punteggio: la sigla serve all'utente per attribuire un
 * errore a una regola precisa, non al motore per comportarsi diversamente.
 *
 * **Una funzione sola per due usi, ed è il punto**: qui si etichetta la
 * proposta, sopra si filtrano le scadenze candidate. Separare i due predicati
 * li lascerebbe divergere, ed è come è nato il difetto che questo assetto
 * corregge — la sigla chiesta e quella generata che non coincidono.
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
