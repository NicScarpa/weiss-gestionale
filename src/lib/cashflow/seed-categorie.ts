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
 */
import { prisma } from '@/lib/prisma'
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

export async function seedCategorieCashFlow(
  venueId: string,
  createdBy?: string
): Promise<EsitoSeed> {
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

  const disattivate = await prisma.budgetCategory.updateMany({
    where: { venueId, code: { in: CATEGORIE_GENERICHE }, isActive: true },
    data: { isActive: false },
  })
  esito.categorieDisattivate = disattivate.count

  const contiPerCodice = new Map(
    (await prisma.account.findMany({ select: { id: true, code: true } })).map((c) => [
      c.code,
      c.id,
    ])
  )

  for (const [indiceFamiglia, famiglia] of RICLASSIFICAZIONE_CASH_FLOW.entries()) {
    const codiceFamiglia = `${PREFISSO}${famiglia.codice}`
    const ordineFamiglia = (indiceFamiglia + 1) * 100

    const famigliaEsisteva = await prisma.budgetCategory.findUnique({
      where: { venueId_code: { venueId, code: codiceFamiglia } },
      select: { id: true },
    })

    const categoriaFamiglia = await prisma.budgetCategory.upsert({
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
    if (famigliaEsisteva) {
      esito.famiglieAggiornate += 1
    } else {
      esito.famiglieCreate += 1
    }

    for (const [indice, sottogruppo] of famiglia.sottogruppi.entries()) {
      const codiceSottogruppo = `${PREFISSO}${sottogruppo.codice}`

      const sottogruppoEsisteva = await prisma.budgetCategory.findUnique({
        where: { venueId_code: { venueId, code: codiceSottogruppo } },
        select: { id: true },
      })

      const categoriaSottogruppo = await prisma.budgetCategory.upsert({
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
      if (sottogruppoEsisteva) {
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

        const mappingEsistente = await prisma.accountBudgetMapping.findUnique({
          where: { accountId },
          select: { budgetCategoryId: true },
        })

        await prisma.accountBudgetMapping.upsert({
          where: { accountId },
          update: { budgetCategoryId: categoriaSottogruppo.id, includeInBudget: true },
          create: {
            accountId,
            budgetCategoryId: categoriaSottogruppo.id,
            includeInBudget: true,
            createdBy,
          },
        })

        if (!mappingEsistente) {
          esito.mappingCreati += 1
        } else if (mappingEsistente.budgetCategoryId === categoriaSottogruppo.id) {
          esito.mappingAggiornati += 1
        } else {
          esito.mappingRiassegnati += 1
        }
      }
    }
  }

  return esito
}
