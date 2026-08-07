// Category Aggregator - Logica per aggregare budget/actual per categoria
import type { AccountType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { money, toApi, type Money } from '@/lib/money'
import { liquiditaAlGiorno, movimentiPerContoEMese } from '@/lib/saldi'
import {
  type MonthKey,
  type MonthlyValues,
  MONTH_KEYS,
  MONTH_NUMBER_TO_KEY,
} from '@/types/budget'
import {
  emptyMonthlyValues,
  calculateAnnualTotal,
  budgetLineToMonthlyValues,
} from '@/lib/budget-utils'

/**
 * Confronto fra budget e consuntivo, categoria per categoria.
 *
 * Gli actual vengono dalla **prima nota**. Prima venivano dalle uscite delle
 * chiusure di cassa, e quella scelta aveva due conseguenze: i costi pagati per
 * banca — cioè le fatture dei fornitori, la parte più grossa dei costi di un
 * bar — non entravano mai nel confronto; e le uscite di chiusura, che a fine
 * validazione diventano comunque scritture di prima nota, sarebbero state
 * contate due volte non appena si fosse aggiunta la prima nota alla somma.
 * Leggendo solo la prima nota si ottengono entrambe le cose: tutti i costi, una
 * volta sola.
 *
 * L'imputazione parte dal **conto**, non dalla categoria: la categoria si
 * deriva dal conto tramite `AccountBudgetMapping`, quindi rimappare un conto
 * sposta subito anche lo storico, senza dover riscrivere i movimenti.
 */

export type CategoryType = 'REVENUE' | 'COST' | 'KPI' | 'TAX' | 'INVESTMENT' | 'VAT'

export interface CategoryData {
  id: string
  code: string
  name: string
  categoryType: CategoryType
  benchmarkPercentage: number | null
  alertThresholdPercent: number
  color: string | null
  icon: string | null
  level: number
  parentId: string | null
  displayOrder: number
  budget: MonthlyValues & { annual: number }
  actual: MonthlyValues & { annual: number }
  variance: MonthlyValues & { annual: number }
  percentOfRevenue: MonthlyValues & { annual: number }
  status: 'ok' | 'warning' | 'alert'
  children: CategoryData[]
}

export interface BudgetKPIs {
  targetRevenue: MonthlyValues & { annual: number }
  totalRevenue: MonthlyValues & { annual: number }
  totalCosts: MonthlyValues & { annual: number }
  profit: MonthlyValues & { annual: number }
  profitMargin: MonthlyValues & { annual: number }
  /**
   * Ricavi che nessun conto rivendica: la differenza fra il fatturato delle
   * chiusure validate e quanto è finito su conti di ricavo in prima nota. Oggi
   * coincide praticamente con tutto l'incasso di cassa, perché le scritture
   * generate dalla chiusura non portano un conto di ricavo. Finché questo
   * numero non è vicino a zero, le categorie di ricavo mostrano meno del vero.
   */
  unassignedRevenue: MonthlyValues & { annual: number }
  liquidity: number
}

export interface CategoryAggregationResult {
  budgetId: string
  year: number
  venue: { id: string; name: string; code: string }
  kpis: BudgetKPIs
  categories: CategoryData[]
}

/** Dodici mesi di importi, tenuti in `Money` finché non escono verso la UI. */
type ValoriMensili = Record<MonthKey, Money>

function mesiVuoti(): ValoriMensili {
  return MONTH_KEYS.reduce((acc, key) => {
    acc[key] = money(0)
    return acc
  }, {} as ValoriMensili)
}

function sommaMesi(a: ValoriMensili, b: ValoriMensili): ValoriMensili {
  return MONTH_KEYS.reduce((acc, key) => {
    acc[key] = a[key].plus(b[key])
    return acc
  }, {} as ValoriMensili)
}

function totaleAnnuo(valori: ValoriMensili): Money {
  return MONTH_KEYS.reduce((somma, key) => somma.plus(valori[key]), money(0))
}

/** Converte in ciò che l'API espone: numeri, arrotondati una volta sola. */
function versoApi(valori: ValoriMensili): MonthlyValues & { annual: number } {
  const mensili = MONTH_KEYS.reduce((acc, key) => {
    acc[key] = toApi(valori[key])
    return acc
  }, {} as MonthlyValues)

  return { ...mensili, annual: toApi(totaleAnnuo(valori)) }
}

function daMonthlyValues(valori: MonthlyValues): ValoriMensili {
  return MONTH_KEYS.reduce((acc, key) => {
    acc[key] = money(valori[key])
    return acc
  }, {} as ValoriMensili)
}

/**
 * Recupera i target mensili per una venue/anno
 */
export async function getMonthlyTargets(
  venueId: string,
  year: number
): Promise<MonthlyValues & { annual: number }> {
  const targets = await prisma.budgetTarget.findMany({
    where: { venueId, year },
  })

  const monthlyValues = emptyMonthlyValues()

  for (const target of targets) {
    const monthKey = MONTH_NUMBER_TO_KEY[target.month]
    if (monthKey) {
      monthlyValues[monthKey] = Number(target.targetRevenue)
    }
  }

  return {
    ...monthlyValues,
    annual: calculateAnnualTotal(monthlyValues),
  }
}

/**
 * Fatturato delle chiusure validate, mese per mese.
 *
 * Resta la fonte dei ricavi complessivi perché è il dato fiscale: scontrini e
 * fatture emesse. La prima nota registra l'incasso, non il fatturato, e i due
 * numeri non coincidono (il POS arriva in banca con giorni di ritardo, il
 * sospeso non arriva affatto).
 */
async function ricaviDalleChiusure(venueId: string, year: number): Promise<ValoriMensili> {
  const closures = await prisma.dailyClosure.findMany({
    where: {
      venueId,
      status: 'VALIDATED',
      date: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) },
    },
    select: {
      date: true,
      stations: { select: { receiptAmount: true, invoiceAmount: true } },
    },
  })

  const valori = mesiVuoti()

  for (const closure of closures) {
    const monthKey = MONTH_NUMBER_TO_KEY[closure.date.getUTCMonth() + 1]

    for (const station of closure.stations) {
      valori[monthKey] = valori[monthKey]
        .plus(money(station.receiptAmount))
        .plus(money(station.invoiceAmount))
    }
  }

  return valori
}

interface MovimentiDelConto {
  /** Entrate: alimentano i conti di ricavo. */
  entrate: ValoriMensili
  /** Uscite: alimentano i conti di costo. */
  uscite: ValoriMensili
}

/**
 * Movimenti di prima nota dell'anno, per conto e mese.
 *
 * Non applica alcun segno: quale delle due colonne rappresenti il consuntivo
 * dipende dalla natura della categoria, e la decisione sta dove quella natura
 * è nota.
 */
async function movimentiPerConto(
  venueId: string,
  year: number
): Promise<Record<string, MovimentiDelConto>> {
  const righe = await movimentiPerContoEMese(venueId, year)
  const perConto: Record<string, MovimentiDelConto> = {}

  for (const riga of righe) {
    // I movimenti senza conto (incassi e versamenti generati dalla chiusura)
    // non appartengono a nessuna categoria di budget.
    if (!riga.accountId) continue

    const conto = (perConto[riga.accountId] ??= {
      entrate: mesiVuoti(),
      uscite: mesiVuoti(),
    })

    const monthKey = MONTH_NUMBER_TO_KEY[riga.mese]
    conto.entrate[monthKey] = conto.entrate[monthKey].plus(riga.dare)
    conto.uscite[monthKey] = conto.uscite[monthKey].plus(riga.avere)
  }

  return perConto
}

/**
 * Consuntivo di un conto secondo la natura della categoria che lo ospita: per
 * un ricavo conta quanto è entrato, per tutto il resto quanto è uscito. Il
 * verso opposto viene sottratto, così una nota di credito o uno storno
 * riducono il consuntivo invece di gonfiare l'altra colonna.
 */
function consuntivoDelConto(
  movimenti: MovimentiDelConto | undefined,
  categoryType: CategoryType
): ValoriMensili {
  if (!movimenti) return mesiVuoti()

  const positivo = categoryType === 'REVENUE' ? movimenti.entrate : movimenti.uscite
  const negativo = categoryType === 'REVENUE' ? movimenti.uscite : movimenti.entrate

  return MONTH_KEYS.reduce((acc, key) => {
    acc[key] = positivo[key].minus(negativo[key])
    return acc
  }, {} as ValoriMensili)
}

/**
 * Recupera i budget per account dalle BudgetLine
 */
async function getBudgetByAccount(
  budgetId: string
): Promise<Record<string, MonthlyValues>> {
  const lines = await prisma.budgetLine.findMany({
    where: { budgetId },
    select: {
      accountId: true,
      jan: true,
      feb: true,
      mar: true,
      apr: true,
      may: true,
      jun: true,
      jul: true,
      aug: true,
      sep: true,
      oct: true,
      nov: true,
      dec: true,
    },
  })

  const byAccount: Record<string, MonthlyValues> = {}

  for (const line of lines) {
    byAccount[line.accountId] = budgetLineToMonthlyValues({
      jan: line.jan !== null ? Number(line.jan) : null,
      feb: line.feb !== null ? Number(line.feb) : null,
      mar: line.mar !== null ? Number(line.mar) : null,
      apr: line.apr !== null ? Number(line.apr) : null,
      may: line.may !== null ? Number(line.may) : null,
      jun: line.jun !== null ? Number(line.jun) : null,
      jul: line.jul !== null ? Number(line.jul) : null,
      aug: line.aug !== null ? Number(line.aug) : null,
      sep: line.sep !== null ? Number(line.sep) : null,
      oct: line.oct !== null ? Number(line.oct) : null,
      nov: line.nov !== null ? Number(line.nov) : null,
      dec: line.dec !== null ? Number(line.dec) : null,
    })
  }

  return byAccount
}

/**
 * Percentuale di incidenza sui ricavi, mese per mese.
 */
function incidenzaSuiRicavi(valori: ValoriMensili, ricavi: ValoriMensili): MonthlyValues {
  return MONTH_KEYS.reduce((acc, key) => {
    acc[key] = ricavi[key].isZero()
      ? 0
      : valori[key].dividedBy(ricavi[key]).times(100).toNumber()
    return acc
  }, {} as MonthlyValues)
}

/**
 * Determina lo status basato su benchmark
 */
function determineStatus(
  percentOfRevenue: number,
  benchmarkPercentage: number | null,
  alertThreshold: number,
  categoryType: CategoryType
): 'ok' | 'warning' | 'alert' {
  if (benchmarkPercentage === null) return 'ok'

  const diff = percentOfRevenue - benchmarkPercentage

  // Per COST: superare benchmark e' negativo
  // Per REVENUE: essere sotto benchmark e' negativo
  const isNegative =
    categoryType === 'COST' || categoryType === 'TAX' || categoryType === 'INVESTMENT'
      ? diff > 0
      : diff < 0

  if (!isNegative) return 'ok'

  const absDiff = Math.abs(diff)

  if (absDiff >= alertThreshold) return 'alert'
  if (absDiff >= alertThreshold / 2) return 'warning'
  return 'ok'
}

/** Natura contabile dei conti citati, per separare ricavi e costi nei KPI. */
async function naturaDeiConti(): Promise<Record<string, AccountType>> {
  const conti = await prisma.account.findMany({ select: { id: true, type: true } })
  return Object.fromEntries(conti.map((conto) => [conto.id, conto.type]))
}

/**
 * Aggrega ricorsivamente le categorie con budget e actual
 */
export async function aggregateCategoriesForBudget(
  budgetId: string,
  venueId: string,
  year: number
): Promise<CategoryAggregationResult> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, name: true, code: true },
  })

  if (!venue) {
    throw new Error('Venue non trovata')
  }

  const categories = await prisma.budgetCategory.findMany({
    where: { venueId, isActive: true },
    include: {
      accountMappings: {
        where: { includeInBudget: true },
        select: { accountId: true },
      },
    },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  })

  const [budgetByAccount, movimenti, ricaviChiusure, tipoDelConto, targets, liquidity] =
    await Promise.all([
      getBudgetByAccount(budgetId),
      movimentiPerConto(venueId, year),
      ricaviDalleChiusure(venueId, year),
      naturaDeiConti(),
      getMonthlyTargets(venueId, year),
      // Stessa funzione della prima nota e del cash flow: è ciò che tiene
      // allineata la liquidità mostrata dalle tre schermate.
      liquiditaAlGiorno(venueId),
    ])

  // KPI di ricavo e costo: si sommano i conti per natura contabile e non per
  // categoria di budget, così un conto non ancora mappato pesa comunque sul
  // totale invece di sparire dal margine.
  let ricaviDaConti = mesiVuoti()
  let totalCostsValues = mesiVuoti()

  for (const [accountId, movimentiConto] of Object.entries(movimenti)) {
    if (tipoDelConto[accountId] === 'RICAVO') {
      ricaviDaConti = sommaMesi(
        ricaviDaConti,
        consuntivoDelConto(movimentiConto, 'REVENUE')
      )
    } else if (tipoDelConto[accountId] === 'COSTO') {
      totalCostsValues = sommaMesi(totalCostsValues, consuntivoDelConto(movimentiConto, 'COST'))
    }
  }

  const totalRevenueValues = ricaviChiusure
  const unassignedRevenue = MONTH_KEYS.reduce((acc, key) => {
    acc[key] = totalRevenueValues[key].minus(ricaviDaConti[key])
    return acc
  }, {} as ValoriMensili)

  const profitValues = MONTH_KEYS.reduce((acc, key) => {
    acc[key] = totalRevenueValues[key].minus(totalCostsValues[key])
    return acc
  }, {} as ValoriMensili)

  const profitMarginValues = incidenzaSuiRicavi(profitValues, totalRevenueValues)
  const totalRevenueAnnual = totaleAnnuo(totalRevenueValues)
  const profitMarginAnnual = totalRevenueAnnual.isZero()
    ? 0
    : totaleAnnuo(profitValues).dividedBy(totalRevenueAnnual).times(100).toNumber()

  // Prima passata: valori di ogni categoria, dai conti che le sono mappati.
  const categoryMap = new Map<string, CategoryData>()

  for (const cat of categories) {
    const categoryType = cat.categoryType as CategoryType
    let budgetValues = mesiVuoti()
    let actualValues = mesiVuoti()

    for (const mapping of cat.accountMappings) {
      const accountBudget = budgetByAccount[mapping.accountId]
      if (accountBudget) {
        budgetValues = sommaMesi(budgetValues, daMonthlyValues(accountBudget))
      }

      actualValues = sommaMesi(
        actualValues,
        consuntivoDelConto(movimenti[mapping.accountId], categoryType)
      )
    }

    const varianceValues = MONTH_KEYS.reduce((acc, key) => {
      acc[key] = actualValues[key].minus(budgetValues[key])
      return acc
    }, {} as ValoriMensili)

    const actualAnnual = totaleAnnuo(actualValues)
    const percentOfRevenueAnnual = totalRevenueAnnual.isZero()
      ? 0
      : actualAnnual.dividedBy(totalRevenueAnnual).times(100).toNumber()

    const status = determineStatus(
      percentOfRevenueAnnual,
      cat.benchmarkPercentage ? Number(cat.benchmarkPercentage) : null,
      cat.alertThresholdPercent ? Number(cat.alertThresholdPercent) : 10,
      categoryType
    )

    categoryMap.set(cat.id, {
      id: cat.id,
      code: cat.code,
      name: cat.name,
      categoryType,
      benchmarkPercentage: cat.benchmarkPercentage
        ? Number(cat.benchmarkPercentage)
        : null,
      alertThresholdPercent: cat.alertThresholdPercent
        ? Number(cat.alertThresholdPercent)
        : 10,
      color: cat.color,
      icon: cat.icon,
      level: cat.parentId ? 1 : 0,
      parentId: cat.parentId,
      displayOrder: cat.displayOrder,
      budget: versoApi(budgetValues),
      actual: versoApi(actualValues),
      variance: versoApi(varianceValues),
      percentOfRevenue: {
        ...incidenzaSuiRicavi(actualValues, totalRevenueValues),
        annual: percentOfRevenueAnnual,
      },
      status,
      children: [],
    })
  }

  // Seconda passata: costruisci gerarchia
  const rootCategories: CategoryData[] = []

  for (const cat of categories) {
    const categoryData = categoryMap.get(cat.id)!

    if (cat.parentId) {
      const parent = categoryMap.get(cat.parentId)
      if (parent) {
        parent.children.push(categoryData)
        categoryData.level = parent.level + 1
      }
    } else {
      rootCategories.push(categoryData)
    }
  }

  // Ordina children per displayOrder
  for (const cat of categoryMap.values()) {
    cat.children.sort((a, b) => a.displayOrder - b.displayOrder)
  }

  return {
    budgetId,
    year,
    venue,
    kpis: {
      targetRevenue: targets,
      totalRevenue: versoApi(totalRevenueValues),
      totalCosts: versoApi(totalCostsValues),
      profit: versoApi(profitValues),
      profitMargin: { ...profitMarginValues, annual: profitMarginAnnual },
      unassignedRevenue: versoApi(unassignedRevenue),
      liquidity,
    },
    categories: rootCategories,
  }
}
