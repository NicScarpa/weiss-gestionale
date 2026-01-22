/**
 * Matcher per fornitori dalla fattura elettronica
 * Cerca match esistenti o prepara dati per nuovo fornitore
 */

import { prisma } from '@/lib/prisma'
import type { Supplier } from '@prisma/client'
import type { FatturaParsata } from './types'

import { logger } from '@/lib/logger'
export interface SupplierMatchResult {
  matched: boolean
  supplier: Supplier | null
  suggestedData: SuggestedSupplierData
}

export interface SuggestedSupplierData {
  name: string
  vatNumber: string | null
  fiscalCode: string | null
  address: string | null
  city: string | null
  province: string | null
  postalCode: string | null
}

/**
 * Normalizza una Partita IVA (rimuove prefisso paese e spazi)
 */
function normalizeVatNumber(vat: string | null | undefined): string | null {
  if (!vat) return null
  // Rimuovi spazi e caratteri speciali
  let normalized = vat.replace(/[\s\-\.]/g, '').toUpperCase()
  // Rimuovi prefisso paese IT se presente
  if (normalized.startsWith('IT')) {
    normalized = normalized.slice(2)
  }
  // P.IVA italiana: 11 cifre
  if (!/^\d{11}$/.test(normalized)) {
    return vat.trim() // Restituisci originale se non valida
  }
  return normalized
}

/**
 * Normalizza un codice fiscale
 */
function normalizeFiscalCode(cf: string | null | undefined): string | null {
  if (!cf) return null
  return cf.replace(/[\s\-\.]/g, '').toUpperCase()
}

/**
 * Cerca un fornitore esistente per Partita IVA o Codice Fiscale
 * Gestisce varianti P.IVA per retrocompatibilità con dati non normalizzati
 */
export async function findSupplierByVat(
  vatNumber: string | null,
  fiscalCode?: string | null
): Promise<Supplier | null> {
  const normalizedVat = normalizeVatNumber(vatNumber)
  const normalizedCf = normalizeFiscalCode(fiscalCode)

  if (!normalizedVat && !normalizedCf) {
    return null
  }

  // Cerca per P.IVA con varianti (con/senza zeri iniziali)
  if (normalizedVat) {
    // Genera varianti P.IVA per retrocompatibilità
    const vatWithoutLeadingZeros = normalizedVat.replace(/^0+/, '')
    const vatVariants = [normalizedVat]

    // Aggiungi variante senza zeri iniziali solo se diversa
    if (vatWithoutLeadingZeros !== normalizedVat && vatWithoutLeadingZeros.length > 0) {
      vatVariants.push(vatWithoutLeadingZeros)
    }

    const byVat = await prisma.supplier.findFirst({
      where: {
        OR: vatVariants.map(v => ({
          vatNumber: { equals: v, mode: 'insensitive' as const },
        })),
        isActive: true,
      },
    })
    if (byVat) return byVat
  }

  // Cerca per Codice Fiscale se non trovato per P.IVA
  if (normalizedCf) {
    const byCf = await prisma.supplier.findFirst({
      where: {
        fiscalCode: {
          equals: normalizedCf,
          mode: 'insensitive',
        },
        isActive: true,
      },
    })
    if (byCf) return byCf
  }

  return null
}

/**
 * Estrae i dati fornitore dalla fattura parsata
 */
export function extractSupplierData(fattura: FatturaParsata): SuggestedSupplierData {
  const cedente = fattura.cedentePrestatore

  return {
    name: cedente.denominazione,
    vatNumber: normalizeVatNumber(cedente.partitaIva),
    fiscalCode: normalizeFiscalCode(cedente.codiceFiscale),
    address: cedente.sede.indirizzo || null,
    city: cedente.sede.comune || null,
    province: cedente.sede.provincia || null,
    postalCode: cedente.sede.cap || null,
  }
}

/**
 * Cerca match fornitore o prepara dati per creazione
 */
export async function matchSupplier(fattura: FatturaParsata): Promise<SupplierMatchResult> {
  const cedente = fattura.cedentePrestatore
  const suggestedData = extractSupplierData(fattura)

  // Cerca fornitore esistente
  const existingSupplier = await findSupplierByVat(
    cedente.partitaIva,
    cedente.codiceFiscale
  )

  return {
    matched: !!existingSupplier,
    supplier: existingSupplier,
    suggestedData,
  }
}

/**
 * Crea un nuovo fornitore da dati suggeriti
 * Verifica prima se esiste già un fornitore con la stessa P.IVA
 */
export async function createSupplierFromData(
  data: SuggestedSupplierData,
  defaultAccountId?: string
): Promise<Supplier> {
  // Prima verifica se esiste già un fornitore con questa P.IVA o C.F.
  if (data.vatNumber || data.fiscalCode) {
    const existing = await findSupplierByVat(data.vatNumber, data.fiscalCode)
    if (existing) {
      // Fornitore già esiste, ritorna quello esistente
      logger.info(`Fornitore già esistente trovato: ${existing.name} (${existing.vatNumber})`)
      return existing
    }
  }

  // Crea nuovo solo se non esiste
  return prisma.supplier.create({
    data: {
      name: data.name,
      vatNumber: data.vatNumber,
      fiscalCode: data.fiscalCode,
      address: data.address,
      city: data.city,
      province: data.province,
      postalCode: data.postalCode,
      defaultAccountId: defaultAccountId || null,
      isActive: true,
    },
  })
}

/**
 * Aggiorna un fornitore esistente con dati mancanti dalla fattura
 */
export async function updateSupplierFromData(
  supplierId: string,
  data: Partial<SuggestedSupplierData>
): Promise<Supplier> {
  const updateData: Record<string, unknown> = {}

  // Aggiorna solo campi non presenti
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
  })

  if (!supplier) {
    throw new Error('Fornitore non trovato')
  }

  if (!supplier.fiscalCode && data.fiscalCode) {
    updateData.fiscalCode = data.fiscalCode
  }
  if (!supplier.address && data.address) {
    updateData.address = data.address
  }
  if (!supplier.city && data.city) {
    updateData.city = data.city
  }
  if (!supplier.province && data.province) {
    updateData.province = data.province
  }
  if (!supplier.postalCode && data.postalCode) {
    updateData.postalCode = data.postalCode
  }

  if (Object.keys(updateData).length === 0) {
    return supplier
  }

  return prisma.supplier.update({
    where: { id: supplierId },
    data: updateData,
  })
}

/**
 * Suggerisce un conto di default basato sullo storico del fornitore
 */
export async function suggestAccountForSupplier(supplierId: string): Promise<string | null> {
  // Prima controlla il default account del fornitore
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { defaultAccountId: true },
  })

  if (supplier?.defaultAccountId) {
    return supplier.defaultAccountId
  }

  // Altrimenti cerca nelle fatture precedenti
  const lastInvoice = await prisma.electronicInvoice.findFirst({
    where: {
      supplierId,
      accountId: { not: null },
    },
    orderBy: { importedAt: 'desc' },
    select: { accountId: true },
  })

  return lastInvoice?.accountId || null
}
