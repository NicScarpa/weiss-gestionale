/**
 * Script di pulizia database - Sistema Gestionale Weiss Cafè
 *
 * Questo script elimina i dati di business mantenendo intatti:
 * - Utenti e autenticazione
 * - Personale (dipendenti, turni, permessi, presenze)
 * - Venue e impostazioni
 * - Budget e contabilità
 */

import { config } from 'dotenv'
// Caria le variabili d'ambiente PRIMA di importare Prisma
config()

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// Crea pool di connessioni e adapter come nel resto dell'applicazione
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)

const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
})

// Tabelle da pulire organizzate per ordine di dipendenza
const TABLES_TO_DELETE = {
  // Prodotti
    products: 'Product',
    priceHistory: 'PriceHistory',
    priceAlerts: 'PriceAlert',

  // Fatture
    electronicInvoices: 'ElectronicInvoice',
    invoiceDeadlines: 'InvoiceDeadline',

  // Movimenti bancari
    bankTransactions: 'BankTransaction',
    importBatches: 'ImportBatch',

  // Chiusure di cassa
    dailyClosures: 'DailyClosure',
    cashCounts: 'CashCount',
    hourlyPartials: 'HourlyPartial',
    dailyExpenses: 'DailyExpense',

  // Fornitori
    suppliers: 'Supplier',
}

/**
 * Formatta un numero con separatore migliaia
 */
function formatNumber(num: number): string {
  return new Intl.NumberFormat('it-IT').format(num)
}

/**
 * Mostra un riepilogo dei dati che verranno eliminati
 */
async function showSummary() {
  console.log('\n📊 RIEPILOGO DATI DA ELIMINARE:\n')

  const counts: Record<string, number> = {}

  // Conta record per ogni tabella
  for (const [key, model] of Object.entries(TABLES_TO_DELETE)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const count = await (prisma as any)[model].count()
      counts[key] = count
      console.log(`  ${key.padEnd(25)}: ${formatNumber(count)} record`)
    } catch (error) {
      counts[key] = 0
      console.log(`  ${key.padEnd(25)}: ERRORE - ${error}`)
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  console.log(`\n  ${'='.repeat(50)}`)
  console.log(`  ${'TOTALE'.padEnd(25)}: ${formatNumber(total)} record`)
  console.log(`  ${'='.repeat(50)}\n`)

  return { counts, total }
}

/**
 * Esegue la DELETE in ordine sicuro
 * Ordine: tabelle figlie prima, poi tabelle padri
 */
async function executeCleanup() {
  console.log('\n🧹 INIZIO PULIZIA DATABASE...\n')

  const results: Record<string, { deleted: number; error?: string }> = {}

  // FASE 1: Tabelle figlie (dipendono da altre, hanno onDelete: Cascade)
  const childTables = [
    'priceHistory',
    'priceAlerts',
    'invoiceDeadlines',
    'cashCounts',
    'hourlyPartials',
    'dailyExpenses',
  ]

  console.log('📋 FASE 1: Eliminazione tabelle dipendenti (figlie)\n')

  for (const key of childTables) {
    const model = TABLES_TO_DELETE[key as keyof typeof TABLES_TO_DELETE]
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (prisma as any)[model].deleteMany({})
      results[key] = { deleted: result.count }
      console.log(`  ✅ ${key.padEnd(25)}: ${formatNumber(result.count)} eliminati`)
    } catch (error) {
      results[key] = { deleted: 0, error: String(error) }
      console.log(`  ❌ ${key.padEnd(25)}: ERRORE - ${error}`)
    }
  }

  // FASE 2: Tabelle padri (indipendenti o radice)
  const parentTables = [
    'products',
    'electronicInvoices',
    'bankTransactions',
    'importBatches',
    'dailyClosures',
    'suppliers',
  ]

  console.log('\n📋 FASE 2: Eliminazione tabelle indipendenti (padri)\n')

  for (const key of parentTables) {
    const model = TABLES_TO_DELETE[key as keyof typeof TABLES_TO_DELETE]
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (prisma as any)[model].deleteMany({})
      results[key] = { deleted: result.count }
      console.log(`  ✅ ${key.padEnd(25)}: ${formatNumber(result.count)} eliminati`)
    } catch (error) {
      results[key] = { deleted: 0, error: String(error) }
      console.log(`  ❌ ${key.padEnd(25)}: ERRORE - ${error}`)
    }
  }

  return results
}

/**
 * Verifica che le tabelle pulite siano vuote
 */
async function verifyCleanup() {
  console.log('\n🔍 VERIFICA PULIZIA\n')

  const allEmpty: string[] = []
  const notEmpty: string[] = []

  for (const [key, model] of Object.entries(TABLES_TO_DELETE)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const count = await (prisma as any)[model].count()
      if (count === 0) {
        allEmpty.push(key)
      } else {
        notEmpty.push(`${key}: ${formatNumber(count)} record rimasti`)
      }
    } catch (error) {
      notEmpty.push(`${key}: ERRORE verifica`)
    }
  }

  if (allEmpty.length > 0) {
    console.log('  ✅ Tabelle vuote:')
    allEmpty.forEach(t => console.log(`     - ${t}`))
  }

  if (notEmpty.length > 0) {
    console.log('  ⚠️  Attenzione:')
    notEmpty.forEach(t => console.log(`     - ${t}`))
  }

  return notEmpty.length === 0
}

/**
 * Verifica che i dati critici siano intatti
 */
async function verifyCriticalData() {
  console.log('\n🔍 VERIFICA DATI CRITICI (devono essere intatti)\n')

  const criticalTables = {
    users: 'User',
    roles: 'Role',
    permissions: 'Permission',
    venues: 'Venue',
    employees: 'EmployeeConstraint',
    shifts: 'ShiftAssignment',
    leaves: 'LeaveRequest',
    budgets: 'Budget',
    accounts: 'Account',
    journalEntries: 'JournalEntry',
  }

  for (const [key, model] of Object.entries(criticalTables)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const count = await (prisma as any)[model].count()
      const status = count > 0 ? '✅' : '❌'
      console.log(`  ${status} ${key.padEnd(20)}: ${formatNumber(count)} record`)
    } catch (error) {
      console.log(`  ❌ ${key.padEnd(20)}: ERRORE - ${error}`)
    }
  }
}

/**
 * Funzione principale
 */
async function main() {
  const args = process.argv.slice(2)
  const autoConfirm = args.includes('--yes') || args.includes('-y')

  console.log('\n╔════════════════════════════════════════════════════════════╗')
  console.log('║     PULIZIA DATABASE - Sistema Gestionale Weiss Cafè        ║')
  console.log('╚════════════════════════════════════════════════════════════╝')

  if (!autoConfirm) {
    console.log('\n⚠️  ATTENZIONE: Questa operazione eliminerà i seguenti dati:')
    console.log('   - Prodotti e storico prezzi')
    console.log('   - Fatture elettroniche')
    console.log('   - Movimenti bancari')
    console.log('   - Chiusure di cassa')
    console.log('   - Fornitori')
    console.log('\n✅ I seguenti dati saranno MANTENUTI:')
    console.log('   - Utenti e autenticazione')
    console.log('   - Personale (dipendenti, turni, permessi, presenze)')
    console.log('   - Venue e impostazioni')
    console.log('   - Budget e contabilità')
  }

  // Mostra riepilogo
  const { counts, total } = await showSummary()

  if (total === 0) {
    console.log('✅ Nessun dato da eliminare. Database già pulito.')
    await prisma.$disconnect()
    return
  }

  // Conferma
  if (!autoConfirm) {
    console.log('\n⚠️  Procedere con l\'eliminazione?')
    console.log('   Digita "yes" per confermare, o usa --yes per saltare la conferma\n')

    // In un ambiente reale, qui useremmo readline
    // Per ora, procediamo solo con --yes
    console.log('❌ Per sicurezza, usa: npm run cleanup:db --yes')
    await prisma.$disconnect()
    process.exit(1)
  }

  // Esegui pulizia
  const results = await executeCleanup()

  // Riepilogo finale
  console.log('\n📊 RIEPILOGO ELIMINAZIONE:\n')
  let totalDeleted = 0
  for (const [key, result] of Object.entries(results)) {
    if (result.error) {
      console.log(`  ❌ ${key.padEnd(25)}: ${result.error}`)
    } else {
      console.log(`  ✅ ${key.padEnd(25)}: ${formatNumber(result.deleted)} eliminati`)
      totalDeleted += result.deleted
    }
  }
  console.log(`\n  ${'='.repeat(50)}`)
  console.log(`  ${'TOTALE ELIMINATI'.padEnd(25)}: ${formatNumber(totalDeleted)} record`)
  console.log(`  ${'='.repeat(50)}`)

  // Verifica
  await verifyCleanup()
  await verifyCriticalData()

  console.log('\n✅ Pulizia completata!\n')

  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('❌ Errore durante la pulizia:', error)
  process.exit(1)
})
