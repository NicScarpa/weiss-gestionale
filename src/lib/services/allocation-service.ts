import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { formatCurrency } from '@/lib/formatters'
import { derivaBudgetCategoryDaConto } from '@/lib/accounts/mapping'
import {
  centroDaRiproporre,
  risolviCentroDiCosto,
  trovaCentroStrutturale,
  type ContestoRisoluzione,
} from '@/lib/services/cost-center-service'
// Il lock di riga sul movimento è uno solo in tutto il progetto: quello usato
// dalla riconciliazione. Riusarlo — invece di scrivere qui un secondo
// `FOR UPDATE` — è ciò che garantisce che i due percorsi si mettano davvero in
// fila sulla stessa riga. `stato-schedule.ts` importa da qui solo il tipo
// `TransactionClient` (`import type`), quindi il ciclo non esiste a runtime.
import { bloccaMovimento } from '@/lib/scadenzario/stato-schedule'

export interface FettaInput {
  accountId: string
  importo: number
  note?: string | null
}

/**
 * Riparte una quota proporzionalmente alle fette date, al centesimo.
 * La somma restituita è SEMPRE esattamente la quota. Pura: nessun accesso al DB.
 *
 * **Si arrotonda il cumulato, non la singola fetta.** Ogni fetta vale la
 * differenza fra due totali progressivi arrotondati, quindi lo scarto non si
 * accumula: dopo la fetta i-esima risultano assegnati esattamente
 * `round(quota × pesi_fino_a_i ÷ totale)` centesimi, e all'ultima il cumulato
 * è la quota per costruzione.
 *
 * La versione precedente arrotondava ogni fetta per conto suo e lasciava il
 * resto all'ultima, che però poteva risultare **negativo** — gli arrotondamenti
 * precedenti avevano già consumato più della quota, fino a mezzo centesimo per
 * conto — e un `if (centesimi > 0)` lo scartava invece di sottrarlo. La somma
 * allora superava la quota: 731,34 € ripartiti su undici conti diventavano
 * 731,37 €. Cifre irrisorie, ma l'invariante dichiarata qui sopra è quella su
 * cui si appoggiano i controlli di quadratura degli altri percorsi, che
 * tollerano ±0,01 € contro i 0,03 € che questa funzione poteva produrre.
 *
 * I pesi non positivi si scartano prima di cominciare: con un peso negativo i
 * cumulati non sarebbero più crescenti e una fetta potrebbe tornare negativa,
 * cioè proprio il caso che l'invariante non saprebbe reggere.
 */
export function ripartisciProQuota(fette: FettaInput[], quota: number): FettaInput[] {
  const positive = fette.filter((f) => f.importo > 0)
  const totale = positive.reduce((s, f) => s + f.importo, 0)
  if (totale <= 0 || quota <= 0) return []

  const quotaCentesimi = Math.round(quota * 100)
  const out: FettaInput[] = []
  let cumulatoPesi = 0
  let assegnati = 0

  positive.forEach((f, i) => {
    cumulatoPesi += f.importo
    // L'ultima fetta chiude sulla quota esatta: `cumulatoPesi` vi arriva per
    // costruzione, ma dirlo evita di dipendere dall'ultima cifra di una
    // divisione in virgola mobile.
    const obiettivo =
      i === positive.length - 1
        ? quotaCentesimi
        : Math.round((quotaCentesimi * cumulatoPesi) / totale)
    const centesimi = obiettivo - assegnati
    assegnati = obiettivo
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

/** Un conto con quanto gli spetta al lordo e quanta IVA c'è dentro. */
export interface PesoConIva {
  accountId: string
  importo: number
  /** `null` quando l'aliquota di almeno una riga non era leggibile. */
  iva: number | null
}

/**
 * Aggrega le righe fattura per conto tenendo separata l'IVA di ciascuna.
 *
 * Perché serve: i pesi sono imponibili, la quota da ripartire è un pagamento,
 * cioè lordo. Applicare proporzioni calcolate sul netto a un importo lordo
 * sbaglia ogni volta che le aliquote non sono uniformi — ed è la fattura
 * normale di un fornitore di ristorazione, alimentari al 10% e detersivi al
 * 22%. Portando l'IVA di ogni riga fino in fondo, la fetta non ha più bisogno
 * di essere stimata da nessuno.
 *
 * Tutto-o-niente sull'IVA: se anche una sola riga non ha un'aliquota
 * leggibile, l'IVA di TUTTE le fette è `null`. Un insieme misto di fette
 * esatte e fette stimate produrrebbe un totale che non quadra con nessuna
 * delle due logiche, e nessun controllo se ne accorgerebbe.
 *
 * **Il tutto-o-niente NON si estende al conto scartato**, ed è una scelta
 * misurata, non una dimenticanza. Il filtro qui sotto butta via i conti il cui
 * totale non è positivo: succede con una riga di sconto o di reso a
 * `PrezzoTotale` negativo, che il parser non normalizza (sdi/parser.ts:276) e
 * che l'imputazione per riga accetta come ogni altra. Quel conto se ne va con
 * la propria IVA, i conti rimasti si dividono comunque l'intera quota pagata,
 * e la loro IVA viene riscalata verso l'alto: dichiarata esatta, ma non più
 * quella del documento.
 *
 * Reagire azzerandola peggiora i numeri invece di migliorarli, e di parecchio.
 * Su alimentari 1.000 al 10% con uno sconto di 100 al 22% — documento 978
 * lordi, 78 di IVA — tenere le fette «esatte» dichiara 88,91 di IVA, cioè
 * 10,91 di troppo. Azzerarle ne fa dichiarare zero: da quando la
 * riconciliazione scrive l'IVA di testata solo se le fette la dichiarano, una
 * fetta a `null` su un movimento nato dall'import (che di suo non ha IVA)
 * significa che il ripiego pro-quota divide zero, e il blocco IVA del
 * prospetto perde tutti e 78. Sette volte l'errore che si voleva evitare, e
 * sulla stessa famiglia. La fase B (Task 6) ha dato un segno proprio alle
 * righe negative delle NOTE DI CREDITO — un documento a parte, sottratto ai
 * pesi con le sue guardie dedicate — ma non a una riga di sconto dentro la
 * STESSA fattura, che resta questo caso: finché anche quella non entrerà nei
 * pesi col proprio segno, l'approssimazione minore è questa — ma non resta
 * invisibile: chi chiama avvisa quando un conto sparisce (vedi
 * `ereditaFetteDaFattura`).
 */
export function calcolaPesiConIva(righe: RigaDaImputare[]): PesoConIva[] {
  const ivaNota = righe.every((r) => r.aliquota !== undefined)

  return [...aggregaPerConto(righe).entries()]
    .filter(([, v]) => v.importo > 0)
    .sort((a, b) => b[1].importo - a[1].importo)
    .map(([accountId, v]) => ({
      accountId,
      importo: Math.round(v.importo * 100) / 100,
      iva: ivaNota ? Math.round(v.iva * 100) / 100 : null,
    }))
}

/** Una riga fattura pronta per i pesi: imponibile e aliquota, per conto. */
export interface RigaDaImputare {
  accountId: string
  imponibile: number
  /** In punti percentuali. `undefined` = non leggibile dallo snapshot. */
  aliquota: number | undefined
}

/**
 * Il lordo e l'IVA di ciascun conto.
 *
 * La formula — netto + netto × aliquota/100 — è duplicata in `alLordo`, dentro
 * `src/components/invoices/InvoiceDetailSections.tsx`, e la duplicazione è
 * voluta: quel componente è `'use client'` e importare questo modulo, che
 * porta `@prisma/client`, romperebbe il bundle in un modo che nessuna
 * revisione del diff vede (lo stesso motivo per cui `TOLLERANZA_IMPORTI` è
 * ricopiata in `riga-fattura-condivisa.ts`). Chi cambia il calcolo qui deve
 * cambiarlo anche là.
 *
 * Il contatore di copertura della stessa tabella non usa più questa formula
 * per il totale: raggruppa per aliquota e arrotonda l'imposta una volta per
 * gruppo, perché lì il confronto è con `ImportoTotaleDocumento`, che
 * l'emittente scrive proprio così (vedi `attribuitoAlLordo`).
 */
function aggregaPerConto(righe: RigaDaImputare[]): Map<string, { importo: number; iva: number }> {
  const totali = new Map<string, { importo: number; iva: number }>()
  for (const riga of righe) {
    const aliquota = riga.aliquota ?? 0
    const iva = riga.imponibile * (aliquota / 100)
    const corrente = totali.get(riga.accountId) ?? { importo: 0, iva: 0 }
    totali.set(riga.accountId, {
      importo: corrente.importo + riga.imponibile + iva,
      iva: corrente.iva + iva,
    })
  }
  return totali
}

/**
 * Quanti conti `calcolaPesiConIva` scarta **portandosi via qualcosa**.
 *
 * Serve a chi vuole avvisare che le fette non quadreranno più con il
 * documento. Non basta contare i conti mancanti: il filtro scarta anche il
 * totale esattamente zero — la riga in omaggio, o la riga e il suo storno
 * sullo stesso conto — dove però non si perde né importo né IVA. Un avviso
 * che grida quando non è successo niente insegna a ignorarlo, e il primo caso
 * vero passerebbe inosservato.
 *
 * Mezzo centesimo di soglia perché il totale passa da moltiplicazioni in
 * virgola mobile: uno zero può presentarsi come 1e-14.
 */
export function contiScartatiConPeso(righe: RigaDaImputare[]): number {
  return [...aggregaPerConto(righe).values()].filter(
    (v) => v.importo <= 0 && (Math.abs(v.importo) >= 0.005 || Math.abs(v.iva) >= 0.005)
  ).length
}

/**
 * Come `ripartisciProQuota`, ma l'IVA scende insieme all'importo.
 *
 * Su un pagamento parziale ogni fetta si riduce con la propria IVA — metà
 * fattura dà 550 con dentro 50 e 61 con dentro 11 — invece di ereditare una
 * media che non corrisponde a nessuna delle aliquote pagate.
 *
 * Anche qui un peso può sparire: `ripartisciProQuota` scarta la fetta il cui
 * cumulato non avanza di un centesimo, e la sua IVA se ne va con lei mentre le
 * rimaste si riscalano. L'IVA resta comunque dichiarata, perché lo scarto è
 * limitato per costruzione: una fetta si perde solo se vale meno di un
 * centesimo della quota, quindi l'IVA che porta via è al massimo l'aliquota di
 * un centesimo — frazioni di millesimo di euro. Rinunciare all'esattezza di
 * tutta la fattura per un errore così sarebbe uno scambio in perdita, per la
 * stessa ragione spiegata in `calcolaPesiConIva`.
 */
export function ripartisciProQuotaConIva(
  pesi: PesoConIva[],
  quota: number
): Array<{ accountId: string; importo: number; iva: number | null }> {
  const fette = ripartisciProQuota(
    pesi.map(({ accountId, importo }) => ({ accountId, importo })),
    quota
  )
  const perConto = new Map(pesi.map((p) => [p.accountId, p]))

  return fette.map((fetta) => {
    const peso = perConto.get(fetta.accountId)
    if (!peso || peso.iva === null || peso.importo <= 0) {
      return { ...fetta, iva: null }
    }
    return {
      ...fetta,
      iva: Math.round(peso.iva * (fetta.importo / peso.importo) * 100) / 100,
    }
  })
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
 * Rivaluta il centro del movimento dopo che le fette gli hanno riscritto il
 * conto, sui soli percorsi automatici. Serve perché il conto può arrivare
 * DOPO il centro: il movimento nasce dall'import senza conto, prende il
 * centro che si dà a chi non ne ha uno, e solo alla riconciliazione eredita
 * dalla fattura un conto che invece un centro lo pretendeva.
 *
 * Cosa si rivaluta e cosa no lo decide `centroDaRiproporre` sulla provenienza
 * persistita: una scelta umana non si tocca mai, il resto sì.
 */
async function rivalutaCentroSuPercorsoAutomatico(
  tx: TransactionClient,
  journalEntryId: string,
  accountIdDominante: string
): Promise<{ costCenterId?: string; costCenterSource?: string }> {
  const movimento = await tx.journalEntry.findUnique({
    where: { id: journalEntryId },
    select: { costCenterId: true, costCenterSource: true },
  })
  const strutturale = await trovaCentroStrutturale(tx)

  const esito = await risolviCentroDiCosto(
    tx,
    {
      accountId: accountIdDominante,
      costCenterId: movimento
        ? centroDaRiproporre(movimento, strutturale?.id ?? null)
        : null,
    },
    'automatico'
  )
  if (esito.outcome !== 'ok') {
    // Su un percorso automatico la risoluzione non chiede più nulla: resta
    // 'invalid' solo se il centro già sul movimento è sparito o è stato
    // disattivato. Il conto si aggiorna comunque, il centro resta com'è e il
    // movimento è da verificare: sarà chi approva a sistemarlo.
    logger.warn('Centro non rivalutabile dopo il conto dominante: si lascia quello del movimento', {
      journalEntryId,
      accountId: accountIdDominante,
      code: esito.code,
    })
    return {}
  }
  return { costCenterId: esito.costCenterId, costCenterSource: esito.origine }
}

/**
 * Rilegge TUTTE le fette del movimento (manuali + ereditate) e allinea conto
 * dominante, categoria derivata e `categorizationSource: 'split'`. Condiviso
 * fra lo split manuale (setEntryAllocations) e l'ereditarietà pro-quota dalla
 * fattura alla riconciliazione (Fase 3): stesso identico calcolo del
 * dominante, un'unica verità. Ritorna il numero di fette rilette (0 se non
 * ce n'è più nessuna, e in tal caso non scrive nulla).
 *
 * Sul percorso `interattivo` il centro non si tocca: chi chiama ha già
 * validato le fette contro il centro del movimento (setEntryAllocations, che
 * risponde 400 se non tornano). Sul percorso `automatico` — l'ereditarietà
 * dalla fattura alla riconciliazione — il centro va invece rivalutato contro
 * il conto nuovo, e il movimento torna da verificare.
 */
export async function aggiornaContoDominante(
  tx: TransactionClient,
  journalEntryId: string,
  contesto: ContestoRisoluzione = 'interattivo'
): Promise<number> {
  const tutte = await tx.journalEntryAllocation.findMany({
    where: { journalEntryId },
    select: { accountId: true, importo: true },
  })
  if (tutte.length === 0) return 0

  const dominante = tutte.reduce((max, f) =>
    Number(f.importo) > Number(max.importo) ? f : max
  )
  // `verified: false` incondizionato, e non perché il centro sia supposto:
  // questa funzione RISCRIVE il conto del movimento. Una verifica umana
  // riferita al conto di prima non dice nulla sul conto nuovo, quindi decade
  // insieme a quello — anche quando il centro non cambia affatto.
  const imputazioneAutomatica =
    contesto === 'automatico'
      ? {
          ...(await rivalutaCentroSuPercorsoAutomatico(tx, journalEntryId, dominante.accountId)),
          verified: false,
        }
      : {}

  await tx.journalEntry.update({
    where: { id: journalEntryId },
    data: {
      accountId: dominante.accountId,
      budgetCategoryId: await derivaBudgetCategoryDaConto(dominante.accountId),
      categorizationSource: 'split',
      ...imputazioneAutomatica,
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
 *
 * **Tutto dentro una transazione, letture comprese, con il movimento bloccato
 * per primo.** La versione precedente leggeva fuori — esistenza del movimento,
 * somma delle fette ereditate, validità dei conti — e scriveva dentro: due
 * richieste simultanee sullo stesso movimento non vedevano l'una le righe
 * dell'altra, entrambe cancellavano il nulla e poi scrivevano le proprie fette.
 * Sei fette per 2.000 € su un movimento da 1.000 €, cioè esattamente
 * l'invariante che questo modulo esiste per difendere. Lo stesso schema (lock
 * di riga con `SELECT … FOR UPDATE`, poi decidi) è quello della
 * riconciliazione, ed è deliberato che sia lo stesso: `bloccaMovimento` va
 * sempre preso PRIMA di un eventuale lock sulla scadenza, altrimenti due
 * percorsi che li acquisissero in ordine opposto si bloccherebbero a vicenda.
 */
export async function setEntryAllocations({
  journalEntryId, venueId, userId, fette,
}: {
  journalEntryId: string
  venueId: string
  userId: string | null
  fette: FettaInput[]
}): Promise<SetAllocationsOutcome> {
  // Controllo puro sull'input: non dipende dal database, non merita una
  // transazione (né una connessione) per essere respinto.
  if (fette.some((f) => f.importo <= 0)) {
    return { outcome: 'invalid', motivo: 'Ogni fetta deve avere un importo positivo' }
  }

  const risultato = await prisma.$transaction(async (tx): Promise<SetAllocationsOutcome> => {
    const entry = await bloccaMovimento(tx, journalEntryId, venueId)
    if (!entry) return { outcome: 'entry_not_found' }

    const importoUtile = Number(entry.debitAmount ?? entry.creditAmount ?? 0)

    const somma = fette.reduce((s, f) => s + f.importo, 0)
    // Il vincolo di quadratura copre l'intero movimento: le fette manuali
    // proposte più quelle già ereditate dalla riconciliazione (Fase 3) non
    // possono superare l'importo utile, anche se le manuali da sole ci
    // starebbero (altrimenti la somma delle fette eccede il movimento).
    const aggregatoEreditate = await tx.journalEntryAllocation.aggregate({
      where: { journalEntryId, origine: 'ereditata' },
      _sum: { importo: true },
    })
    const sommaEreditate = Number(aggregatoEreditate._sum.importo ?? 0)
    if (somma + sommaEreditate > importoUtile + 0.01) {
      return {
        outcome: 'invalid',
        motivo: `La somma delle fette (${formatCurrency(somma + sommaEreditate)}) supera l'importo del movimento (${formatCurrency(importoUtile)})`,
      }
    }
    if (fette.length > 0) {
      const conti = await tx.account.findMany({
        where: { id: { in: fette.map((f) => f.accountId) }, isActive: true },
        select: { id: true },
      })
      if (conti.length !== new Set(fette.map((f) => f.accountId)).size) {
        return { outcome: 'invalid', motivo: 'Uno o più conti non esistono o non sono attivi' }
      }

      // Le fette possono portare conti che pretendono un centro di costo: se
      // il movimento non ne ha uno, la suddivisione creerebbe righe non
      // imputabili. Qui si valida soltanto — il centro resta quello del
      // movimento, che è l'unico titolare dell'imputazione (le fette scelgono
      // il conto, non il centro). Sta dentro la transazione come le altre
      // guardie, e sul movimento già bloccato: il centro va letto sotto lock,
      // altrimenti si valida una fotografia che un'altra richiesta può aver
      // cambiato nel frattempo. Rimuovere lo split (fette vuote) non ha nulla
      // da imputare e non passa di qui.
      const centro = await risolviCentroDiCosto(tx, {
        accountId: null,
        costCenterId: entry.costCenterId,
        accountIdsFette: fette.map((f) => f.accountId),
      })
      if (centro.outcome === 'invalid') {
        return {
          outcome: 'invalid',
          motivo:
            centro.code === 'CENTRO_DI_COSTO_OBBLIGATORIO'
              ? 'Scegli il centro di costo del movimento prima di suddividerlo.'
              : centro.motivo,
        }
      }
    }

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
      return { outcome: 'ok', allocazioni: 0 }
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
    return { outcome: 'ok', allocazioni: numeroFette }
  })

  if (risultato.outcome === 'ok') {
    logger.info('Fette del movimento aggiornate', {
      journalEntryId,
      allocazioni: risultato.allocazioni,
    })
  }
  return risultato
}
