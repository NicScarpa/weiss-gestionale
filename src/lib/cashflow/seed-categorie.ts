/**
 * Popola `BudgetCategory` con le famiglie e i sottogruppi della
 * riclassificazione, e lega ogni conto al suo sottogruppo.
 *
 * Perché portarla nel database se la struttura è già in codice: le categorie
 * sono modificabili dalle impostazioni, e le viste del budget leggono da lì.
 * Il codice resta la fonte del **primo** popolamento e del ripristino.
 *
 * Idempotente per costruzione: upsert su (venueId, code). Ogni upsert è
 * preceduto da una lettura che dice se la riga esisteva già: senza quella i
 * contatori dell'esito mentirebbero a ogni riesecuzione, dicendo "creato"
 * anche quando non è cambiato nulla.
 *
 * **Tutto in una transazione, e non per abitudine.** Il seed comincia
 * disattivando le 13 categorie generiche e prosegue con ~200 scritture; se una
 * qualsiasi fallisce a metà, senza transazione resterebbe un budget con le
 * vecchie categorie spente e le nuove installate solo in parte — uno stato
 * peggiore di quello di partenza, e da cui l'utente non può tornare indietro
 * dalle impostazioni. La transazione fa sì che l'unico esito possibile sia
 * tutto o niente.
 */
import { prisma } from '@/lib/prisma'
import type { TransactionClient } from '@/lib/services/allocation-service'
import { RICLASSIFICAZIONE_CASH_FLOW } from './riclassificazione'

export interface EsitoSeed {
  famiglieCreate: number
  famiglieAggiornate: number
  sottogruppiCreati: number
  sottogruppiAggiornati: number
  mappingCreati: number
  /** Mapping già esistenti, confermati sulla categoria prevista. */
  mappingAggiornati: number
  /**
   * Mapping già esistenti che puntavano a una categoria diversa da quella
   * prevista dalla riclassificazione: qualcuno li aveva riassegnati a mano
   * dal pannello «Mapping Conti», e il seed li ha rimessi sulla categoria di
   * default. È voluto — questo modulo è anche la fonte del ripristino — ma
   * va detto, non confuso con un semplice aggiornamento.
   */
  mappingRiassegnati: number
  /** Voci previste dalla riclassificazione ma assenti in `accounts`. */
  contiMancanti: string[]
  categorieDisattivate: number
}

/**
 * Il seed si rifiuta di partire perché il database non ha ancora i valori di
 * enum che la riclassificazione usa.
 *
 * È un errore distinto perché la risposta che merita è diversa da un guasto:
 * non c'è nulla di rotto, manca un passo di installazione, e chi lo riceve
 * deve sapere quale.
 */
export class MigrazioneNonApplicataError extends Error {
  constructor(public readonly tipiMancanti: string[]) {
    super(
      `Il database non conosce ${tipiMancanti.join(', ')} fra i valori di ` +
        'BudgetCategoryType: la migrazione 20260811000000_cash_flow_enums non è ' +
        'stata eseguita. Applicare le migrazioni prima di installare le ' +
        'categorie — il seed si è fermato senza scrivere nulla.'
    )
    this.name = 'MigrazioneNonApplicataError'
  }
}

/** Prefisso dei codici, per non collidere con le categorie preesistenti. */
const PREFISSO = 'CF_'

/**
 * Le categorie del template generico installato prima di questo design. Non si
 * cancellano: `journalEntries.budgetCategoryId` e `budgetLines` puntano lì, e
 * `AccountBudgetMapping` ha `onDelete: Restrict`. Si disattivano.
 */
const CATEGORIE_GENERICHE = [
  'RICAVI_TOTALI', 'COSTI_TOTALI', 'MARGINE_OPERATIVO',
  'COSTI_PERSONALE', 'FOOD_COST', 'BEVERAGE_COST',
  'COSTI_FISSI', 'COSTI_VARIABILI', 'MARKETING',
  'RICAVI_BAR', 'RICAVI_RISTORAZIONE', 'RICAVI_EVENTI',
  'IMPOSTE_CONTRIBUTI',
]

/**
 * Le ~200 scritture del seed su una connessione remota non stanno nei 5
 * secondi di default di Prisma. Il timeout va commisurato al lavoro, non al
 * caso fortunato: se scade, la transazione torna indietro e non lascia
 * l'installazione a metà — ma è comunque un fallimento, non un esito.
 */
const TIMEOUT_TRANSAZIONE_MS = 120_000

/**
 * I valori di `BudgetCategoryType` che la riclassificazione pretende, verificati
 * **prima** di scrivere.
 *
 * Serve perché la famiglia I è `FINANCING`, un valore che arriva con la
 * migrazione `20260811000000_cash_flow_enums`. Su un database che non l'ha
 * applicata l'errore arriverebbe all'ultima delle nove famiglie, cioè dopo
 * quasi tutte le scritture: la transazione le annullerebbe comunque, ma
 * fallire subito e dire perché è un'altra cosa rispetto a fallire in fondo con
 * un errore di Postgres su un enum.
 */
async function tipiEnumMancanti(client: TransactionClient): Promise<string[]> {
  const richiesti = [...new Set(RICLASSIFICAZIONE_CASH_FLOW.map((f) => f.tipo))]

  const presenti = await client.$queryRaw<{ enumlabel: string }[]>`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'BudgetCategoryType'
  `
  const disponibili = new Set(presenti.map((riga) => riga.enumlabel))

  return richiesti.filter((tipo) => !disponibili.has(tipo))
}

export async function seedCategorieCashFlow(
  venueId: string,
  createdBy?: string
): Promise<EsitoSeed> {
  return prisma.$transaction((tx) => installa(tx, venueId, createdBy), {
    timeout: TIMEOUT_TRANSAZIONE_MS,
    maxWait: 15_000,
  })
}

async function installa(
  tx: TransactionClient,
  venueId: string,
  createdBy?: string
): Promise<EsitoSeed> {
  const mancanti = await tipiEnumMancanti(tx)
  if (mancanti.length > 0) {
    throw new MigrazioneNonApplicataError(mancanti)
  }

  const esito: EsitoSeed = {
    famiglieCreate: 0,
    famiglieAggiornate: 0,
    sottogruppiCreati: 0,
    sottogruppiAggiornati: 0,
    mappingCreati: 0,
    mappingAggiornati: 0,
    mappingRiassegnati: 0,
    contiMancanti: [],
    categorieDisattivate: 0,
  }

  const disattivate = await tx.budgetCategory.updateMany({
    where: { venueId, code: { in: CATEGORIE_GENERICHE }, isActive: true },
    data: { isActive: false },
  })
  esito.categorieDisattivate = disattivate.count

  const contiPerCodice = new Map(
    (await tx.account.findMany({ select: { id: true, code: true } })).map((c) => [
      c.code,
      c.id,
    ])
  )

  // Le letture che dicono cosa esisteva già, in due query invece che una per
  // riga: dentro una transazione ogni round-trip in più è tempo in cui le
  // righe restano bloccate, e a ~400 query il timeout smette di essere teorico.
  const categorieEsistenti = new Set(
    (
      await tx.budgetCategory.findMany({
        where: { venueId, code: { startsWith: PREFISSO } },
        select: { code: true },
      })
    ).map((c) => c.code)
  )

  const categoriaDelConto = new Map(
    (
      await tx.accountBudgetMapping.findMany({
        where: { accountId: { in: [...contiPerCodice.values()] } },
        select: { accountId: true, budgetCategoryId: true },
      })
    ).map((m) => [m.accountId, m.budgetCategoryId])
  )

  for (const [indiceFamiglia, famiglia] of RICLASSIFICAZIONE_CASH_FLOW.entries()) {
    const codiceFamiglia = `${PREFISSO}${famiglia.codice}`
    const ordineFamiglia = (indiceFamiglia + 1) * 100

    const categoriaFamiglia = await tx.budgetCategory.upsert({
      where: { venueId_code: { venueId, code: codiceFamiglia } },
      update: {
        name: famiglia.nome,
        categoryType: famiglia.tipo,
        displayOrder: ordineFamiglia,
        isActive: true,
      },
      create: {
        venueId,
        code: codiceFamiglia,
        name: famiglia.nome,
        categoryType: famiglia.tipo,
        displayOrder: ordineFamiglia,
        isSystem: true,
        createdBy,
      },
    })
    if (categorieEsistenti.has(codiceFamiglia)) {
      esito.famiglieAggiornate += 1
    } else {
      esito.famiglieCreate += 1
    }

    for (const [indice, sottogruppo] of famiglia.sottogruppi.entries()) {
      const codiceSottogruppo = `${PREFISSO}${sottogruppo.codice}`

      const categoriaSottogruppo = await tx.budgetCategory.upsert({
        where: { venueId_code: { venueId, code: codiceSottogruppo } },
        update: {
          name: sottogruppo.nome,
          categoryType: famiglia.tipo,
          parentId: categoriaFamiglia.id,
          displayOrder: ordineFamiglia + indice + 1,
          isActive: true,
        },
        create: {
          venueId,
          code: codiceSottogruppo,
          name: sottogruppo.nome,
          categoryType: famiglia.tipo,
          parentId: categoriaFamiglia.id,
          displayOrder: ordineFamiglia + indice + 1,
          isSystem: true,
          createdBy,
        },
      })
      if (categorieEsistenti.has(codiceSottogruppo)) {
        esito.sottogruppiAggiornati += 1
      } else {
        esito.sottogruppiCreati += 1
      }

      for (const voce of sottogruppo.voci) {
        const accountId = contiPerCodice.get(voce)

        if (!accountId) {
          esito.contiMancanti.push(voce)
          continue
        }

        const categoriaPrecedente = categoriaDelConto.get(accountId)

        await tx.accountBudgetMapping.upsert({
          where: { accountId },
          update: { budgetCategoryId: categoriaSottogruppo.id, includeInBudget: true },
          create: {
            accountId,
            budgetCategoryId: categoriaSottogruppo.id,
            includeInBudget: true,
            createdBy,
          },
        })

        if (categoriaPrecedente === undefined) {
          esito.mappingCreati += 1
        } else if (categoriaPrecedente === categoriaSottogruppo.id) {
          esito.mappingAggiornati += 1
        } else {
          esito.mappingRiassegnati += 1
        }
      }
    }
  }

  return esito
}
