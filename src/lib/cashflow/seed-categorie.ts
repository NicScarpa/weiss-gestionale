/**
 * Popola `BudgetCategory` con le famiglie e i sottogruppi della
 * riclassificazione, e lega ogni conto al suo sottogruppo.
 *
 * Perché portarla nel database se la struttura è già in codice: le categorie
 * sono modificabili dalle impostazioni, e le viste del budget leggono da lì.
 * Il codice resta la fonte del **primo** popolamento e del ripristino.
 *
 * Idempotente per costruzione: upsert su (venueId, code).
 */
import { prisma } from '@/lib/prisma'
import { RICLASSIFICAZIONE_CASH_FLOW } from './riclassificazione'

export interface EsitoSeed {
  famiglieCreate: number
  sottogruppiCreati: number
  mappingCreati: number
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
    sottogruppiCreati: 0,
    mappingCreati: 0,
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
    esito.famiglieCreate += 1

    for (const [indice, sottogruppo] of famiglia.sottogruppi.entries()) {
      const codiceSottogruppo = `${PREFISSO}${sottogruppo.codice}`

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
      esito.sottogruppiCreati += 1

      for (const voce of sottogruppo.voci) {
        const accountId = contiPerCodice.get(voce)

        if (!accountId) {
          esito.contiMancanti.push(voce)
          continue
        }

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
        esito.mappingCreati += 1
      }
    }
  }

  return esito
}
