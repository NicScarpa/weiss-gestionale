/**
 * Smoke test una-tantum della pipeline di categorizzazione righe (ondata B).
 * Esegui con: npx tsx scripts/smoke-line-categorization.ts
 * Sceglie una fattura reale con righe, fornitore e nessuna categorizzazione,
 * lancia categorizzaRigheFattura e stampa cosa è stato scritto.
 */

import 'dotenv/config'
import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'
import { categorizzaRigheFattura } from '../src/lib/line-categorization'

async function main() {
  const candidate = await prisma.electronicInvoice.findMany({
    where: {
      supplierId: { not: null },
      xmlContent: { not: null },
      lineItems: { not: Prisma.DbNull },
    },
    orderBy: { invoiceDate: 'desc' },
    take: 15,
    select: {
      id: true,
      invoiceNumber: true,
      supplierName: true,
      invoiceDate: true,
      lineItems: true,
    },
  })

  for (const inv of candidate) {
    const righe = Array.isArray(inv.lineItems) ? inv.lineItems.length : 0
    if (righe === 0 || righe > 25) continue
    const esistenti = await prisma.invoiceLineAccount.count({ where: { invoiceId: inv.id } })
    if (esistenti > 0) continue

    console.log(
      `Candidata: ${inv.invoiceNumber} — ${inv.supplierName} (${inv.invoiceDate?.toISOString().slice(0, 10)}), ${righe} righe`
    )
    const t0 = Date.now()
    await categorizzaRigheFattura({ invoiceId: inv.id })
    console.log(`Pipeline completata in ${Date.now() - t0}ms`)

    const rows = await prisma.invoiceLineAccount.findMany({
      where: { invoiceId: inv.id },
      orderBy: { numeroLinea: 'asc' },
    })
    if (rows.length === 0) {
      console.log('Nessuna riga scritta (guardie della pipeline o AI non disponibile — vedi log sopra)')
      return
    }
    const conti = await prisma.account.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.accountId))] } },
      select: { id: true, name: true, code: true },
    })
    const nomeConto = new Map(conti.map((c) => [c.id, `${c.code ?? ''} ${c.name}`.trim()]))
    for (const r of rows) {
      const conf = r.confidence != null ? ` conf=${r.confidence}` : ''
      const motivo = r.motivazioneAi ? ` — ${r.motivazioneAi.slice(0, 70)}` : ''
      console.log(
        `  riga ${r.numeroLinea}: ${(r.descrizione ?? '').slice(0, 45)} → ${nomeConto.get(r.accountId) ?? r.accountId} [${r.stato}/${r.fonte}]${conf}${motivo}`
      )
    }
    return
  }
  console.log('Nessuna fattura candidata trovata (tutte già categorizzate o senza righe)')
}

main()
  .catch((e) => {
    console.error('Errore smoke:', e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
