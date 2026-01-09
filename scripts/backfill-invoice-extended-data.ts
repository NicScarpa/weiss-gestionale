/**
 * Script di backfill per aggiornare le fatture esistenti con i nuovi campi estesi
 * Esegui con: npx tsx scripts/backfill-invoice-extended-data.ts
 */

import { PrismaClient, Prisma } from '@prisma/client'
import { estraiDatiEstesi } from '../src/lib/sdi/parser'

const prisma = new PrismaClient()

async function backfillInvoices() {
  console.log('🚀 Inizio backfill fatture con dati estesi...\n')

  // Trova tutte le fatture con xmlContent ma senza dati estesi
  const invoices = await prisma.electronicInvoice.findMany({
    where: {
      xmlContent: { not: null },
      OR: [
        { documentType: null },
        { lineItems: { equals: Prisma.DbNull } },
        { references: { equals: Prisma.DbNull } },
        { vatSummary: { equals: Prisma.DbNull } },
      ],
    },
    select: {
      id: true,
      invoiceNumber: true,
      supplierName: true,
      invoiceDate: true,
      xmlContent: true,
    },
  })

  console.log(`📋 Trovate ${invoices.length} fatture da processare\n`)

  let successCount = 0
  let errorCount = 0
  const errors: Array<{ id: string; invoiceNumber: string; error: string }> = []

  for (const invoice of invoices) {
    try {
      if (!invoice.xmlContent) {
        console.log(`⚠️ Saltata ${invoice.invoiceNumber} - XML mancante`)
        continue
      }

      // Estrai i dati estesi
      const datiEstesi = estraiDatiEstesi(invoice.xmlContent)

      // Aggiorna la fattura (cast a Prisma.JsonValue per i campi JSON)
      await prisma.electronicInvoice.update({
        where: { id: invoice.id },
        data: {
          documentType: datiEstesi.documentType,
          lineItems: datiEstesi.lineItems as unknown as Prisma.InputJsonValue,
          references: datiEstesi.references as unknown as Prisma.InputJsonValue,
          vatSummary: datiEstesi.vatSummary as unknown as Prisma.InputJsonValue,
          causale: datiEstesi.causale,
        },
      })

      successCount++
      console.log(
        `✅ ${invoice.invoiceNumber} (${invoice.supplierName}) - Tipo: ${datiEstesi.documentType}, ` +
        `Linee: ${datiEstesi.lineItems.length}, ` +
        `DDT: ${datiEstesi.references.datiDDT.length}`
      )
    } catch (error) {
      errorCount++
      const errorMessage = error instanceof Error ? error.message : 'Errore sconosciuto'
      errors.push({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        error: errorMessage,
      })
      console.error(`❌ ${invoice.invoiceNumber} - ${errorMessage}`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 Riepilogo:')
  console.log(`   ✅ Aggiornate con successo: ${successCount}`)
  console.log(`   ❌ Errori: ${errorCount}`)
  console.log(`   📋 Totale processate: ${invoices.length}`)

  if (errors.length > 0) {
    console.log('\n⚠️ Dettaglio errori:')
    for (const err of errors) {
      console.log(`   - ${err.invoiceNumber} (${err.id}): ${err.error}`)
    }
  }

  console.log('\n✨ Backfill completato!')
}

// Esegui lo script
backfillInvoices()
  .catch((error) => {
    console.error('💥 Errore fatale:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
