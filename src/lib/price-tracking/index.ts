/**
 * Price Tracking Library
 *
 * Gestisce il tracking dei prezzi degli articoli dalle fatture elettroniche.
 * Crea automaticamente prodotti, registra lo storico prezzi e genera alert
 * per variazioni significative (>5%).
 */

import { prisma } from '@/lib/prisma'
import { Prisma, PriceAlertType } from '@prisma/client'

// Soglia percentuale per generare alert (configurable)
const PRICE_CHANGE_THRESHOLD_PERCENT = 5

// Interfaccia per una linea articolo da fattura
export interface InvoiceLineItem {
  description: string
  code?: string | null
  quantity: number
  unitPrice: number // Prezzo unitario
  totalPrice: number // Prezzo totale linea
  unit?: string | null
}

// Interfaccia per l'import
export interface PriceTrackingInput {
  venueId: string
  supplierId: string
  invoiceId: string
  invoiceNumber: string
  invoiceDate: Date
  lineItems: InvoiceLineItem[]
}

// Risultato dell'operazione
export interface PriceTrackingResult {
  productsCreated: number
  pricesRecorded: number
  alertsGenerated: number
  errors: string[]
}

/**
 * Normalizza il nome di un prodotto per il matching.
 * Rimuove caratteri speciali, normalizza spazi e maiuscole.
 */
export function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\sàèéìòùáéíóú]/gi, '') // Mantieni caratteri italiani
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Estrae la categoria merceologica dal nome/descrizione del prodotto.
 * Logica semplificata, può essere espansa con ML in futuro.
 */
export function inferCategory(description: string): string | null {
  const desc = description.toLowerCase()

  const categoryPatterns: Record<string, RegExp[]> = {
    'BEVANDE_ALCOLICHE': [
      /\b(vino|prosecco|spumante|champagne|birra|beer|whisky|vodka|gin|rum|grappa|liquore|amaro|aperol|campari|spritz)\b/,
    ],
    'BEVANDE_ANALCOLICHE': [
      /\b(acqua|coca|fanta|sprite|succo|succhi|aranciata|limonata|tonic|red bull|energy|thè|te)\b/,
    ],
    'CAFFETTERIA': [
      /\b(caffè|caffe|coffee|cialde|capsule|zucchero|latte|cacao|orzo)\b/,
    ],
    'FOOD': [
      /\b(pane|panino|tramezzino|pizza|focaccia|brioche|croissant|dolce|torta|biscotti|snack|patatine|chips|frutta|verdura|formaggio|prosciutto|salame)\b/,
    ],
    'GELATO': [
      /\b(gelato|sorbetto|ghiacciolo|cono|coppetta|panna)\b/,
    ],
    'PULIZIA': [
      /\b(detersivo|sapone|carta|tovaglioli|tovaglietta|sacchetti|buste|guanti|igienizzante|alcol|sanificante)\b/,
    ],
    'PACKAGING': [
      /\b(bicchieri|bicchiere|tazza|tazze|piatti|piatto|posate|cannucce|contenitori|vaschette|buste|sacchetti)\b/,
    ],
  }

  for (const [category, patterns] of Object.entries(categoryPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(desc)) {
        return category
      }
    }
  }

  return null
}

/**
 * Processa le linee di una fattura e aggiorna lo storico prezzi.
 */
export async function trackPricesFromInvoice(
  input: PriceTrackingInput
): Promise<PriceTrackingResult> {
  const result: PriceTrackingResult = {
    productsCreated: 0,
    pricesRecorded: 0,
    alertsGenerated: 0,
    errors: [],
  }

  for (const line of input.lineItems) {
    try {
      // Salta linee senza prezzo valido
      if (line.unitPrice <= 0 || !line.description || line.description.trim() === '') {
        continue
      }

      const normalizedName = normalizeProductName(line.description)

      // Cerca prodotto esistente o crealo
      let product = await prisma.product.findFirst({
        where: {
          venueId: input.venueId,
          OR: [
            { name: { equals: normalizedName, mode: 'insensitive' } },
            { originalName: { equals: line.description, mode: 'insensitive' } },
            // Match anche su codice se presente
            ...(line.code ? [{ code: line.code }] : []),
          ],
        },
      })

      const previousPrice = product?.lastPrice
        ? Number(product.lastPrice)
        : null

      if (!product) {
        // Crea nuovo prodotto
        const category = inferCategory(line.description)

        product = await prisma.product.create({
          data: {
            venueId: input.venueId,
            name: normalizedName,
            originalName: line.description,
            code: line.code,
            category,
            unit: line.unit,
            lastPrice: new Prisma.Decimal(line.unitPrice),
            lastPriceDate: input.invoiceDate,
            lastSupplierId: input.supplierId,
          },
        })
        result.productsCreated++

        // Alert per nuovo prodotto
        await prisma.priceAlert.create({
          data: {
            productId: product.id,
            alertType: PriceAlertType.NEW_PRODUCT,
            oldPrice: new Prisma.Decimal(0),
            newPrice: new Prisma.Decimal(line.unitPrice),
            changePercent: new Prisma.Decimal(100),
            supplierId: input.supplierId,
            invoiceId: input.invoiceId,
            invoiceDate: input.invoiceDate,
          },
        })
        result.alertsGenerated++
      } else {
        // Aggiorna prodotto esistente
        await prisma.product.update({
          where: { id: product.id },
          data: {
            lastPrice: new Prisma.Decimal(line.unitPrice),
            lastPriceDate: input.invoiceDate,
            lastSupplierId: input.supplierId,
            // Aggiorna codice se non era presente
            ...(line.code && !product.code ? { code: line.code } : {}),
          },
        })
      }

      // Calcola variazione prezzo
      let priceChange: number | null = null
      let priceChangePct: number | null = null

      if (previousPrice !== null && previousPrice > 0) {
        priceChange = line.unitPrice - previousPrice
        priceChangePct = ((line.unitPrice - previousPrice) / previousPrice) * 100
      }

      // Registra nello storico
      await prisma.priceHistory.create({
        data: {
          productId: product.id,
          price: new Prisma.Decimal(line.unitPrice),
          quantity: line.quantity ? new Prisma.Decimal(line.quantity) : null,
          totalPrice: line.totalPrice ? new Prisma.Decimal(line.totalPrice) : null,
          supplierId: input.supplierId,
          invoiceId: input.invoiceId,
          invoiceNumber: input.invoiceNumber,
          invoiceDate: input.invoiceDate,
          previousPrice: previousPrice ? new Prisma.Decimal(previousPrice) : null,
          priceChange: priceChange !== null ? new Prisma.Decimal(priceChange) : null,
          priceChangePct: priceChangePct !== null ? new Prisma.Decimal(priceChangePct) : null,
        },
      })
      result.pricesRecorded++

      // Genera alert se variazione significativa
      if (
        priceChangePct !== null &&
        Math.abs(priceChangePct) >= PRICE_CHANGE_THRESHOLD_PERCENT
      ) {
        await prisma.priceAlert.create({
          data: {
            productId: product.id,
            alertType: priceChangePct > 0 ? PriceAlertType.INCREASE : PriceAlertType.DECREASE,
            oldPrice: new Prisma.Decimal(previousPrice!),
            newPrice: new Prisma.Decimal(line.unitPrice),
            changePercent: new Prisma.Decimal(priceChangePct),
            supplierId: input.supplierId,
            invoiceId: input.invoiceId,
            invoiceDate: input.invoiceDate,
          },
        })
        result.alertsGenerated++
      }
    } catch (error) {
      result.errors.push(
        `Errore articolo "${line.description}": ${error instanceof Error ? error.message : 'Errore sconosciuto'}`
      )
    }
  }

  return result
}

/**
 * Ottiene statistiche sui prezzi per la dashboard.
 */
export async function getPriceTrackingStats(venueId?: string) {
  const where = venueId ? { product: { venueId } } : {}

  const [pendingAlerts, recentChanges, topIncreases] = await Promise.all([
    // Alert pendenti
    prisma.priceAlert.count({
      where: {
        ...where,
        status: 'PENDING',
      },
    }),

    // Variazioni ultime 24h
    prisma.priceHistory.count({
      where: {
        ...where,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    }),

    // Top 5 aumenti recenti
    prisma.priceAlert.findMany({
      where: {
        ...where,
        alertType: 'INCREASE',
        status: 'PENDING',
      },
      include: {
        product: {
          select: { id: true, name: true },
        },
        supplier: {
          select: { id: true, name: true },
        },
      },
      orderBy: { changePercent: 'desc' },
      take: 5,
    }),
  ])

  return {
    pendingAlerts,
    recentChanges,
    topIncreases,
  }
}
