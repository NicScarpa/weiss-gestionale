/**
 * Verifica dello stato del piano dei conti v4 + centri di costo.
 *
 * Script di sola lettura, pensato per essere rieseguito in più momenti:
 * dopo il seed di sviluppo (che replica lo stato finale con le 155 voci) e
 * dopo i rollout in produzione dello script 01 e della migrazione di FASE 3.
 * Esce con codice diverso da zero se una delle attese non è soddisfatta, per
 * poter essere usato in pipeline/CI.
 *
 * Alcune attese valgono solo DOPO la migrazione (script 03) e vengono
 * segnalate come avvisi finché il passo successivo non è stato fatto: il
 * `cost_center_id` NOT NULL sui movimenti, per esempio, è un follow-up del
 * DDL. Con `--rigoroso` anche gli avvisi diventano errori: è la forma da
 * usare per dire "la migrazione è finita davvero".
 *
 * Uso:
 *   npx tsx scripts/piano-v4/verifica.ts
 *   npx tsx scripts/piano-v4/verifica.ts --rigoroso
 */
import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

import { descriviDatabase } from './_comune'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const VOCI_ATTESE = 155
const CENTRI_ATTESI = 4
const SYSTEM_KEYS_ATTESE = ['CASSA', 'BANCA', 'DEBITI_FORNITORI']
const PERMESSO_ATTESO = 'journal.edit-closure'
const VOCE_CORRISPETTIVI = '10.01'

const rigoroso = process.argv.includes('--rigoroso')

async function main() {
  console.log('🔎 Verifica piano dei conti v4 + centri di costo')
  console.log(`   database: ${descriviDatabase()}${rigoroso ? ' — modalità rigorosa' : ''}`)
  let ok = true
  let avvisi = 0

  // ==================== VOCI PIANO V4 ====================
  // Solo le voci del piano v4 hanno mastroCode valorizzato: i conti
  // patrimoniali e quelli legacy lo hanno null (vedi commento su Account
  // in prisma/schema.prisma).
  const vociCount = await prisma.account.count({
    where: { mastroCode: { not: null }, isActive: true },
  })
  if (vociCount === VOCI_ATTESE) {
    console.log(`  ✓ voci piano v4 attive: ${vociCount}`)
  } else {
    console.error(`  ❌ voci piano v4 attive: ${vociCount} (attese ${VOCI_ATTESE})`)
    ok = false
  }

  // ==================== CENTRI DI COSTO ====================
  const centri = await prisma.costCenter.findMany()
  if (centri.length === CENTRI_ATTESI) {
    console.log(`  ✓ centri di costo: ${centri.length}`)
  } else {
    console.error(`  ❌ centri di costo: ${centri.length} (attesi ${CENTRI_ATTESI})`)
    ok = false
  }

  const default_ = centri.filter((c) => c.isDefault)
  if (default_.length === 1 && default_[0].code === 'STR') {
    console.log(`  ✓ centro default: ${default_[0].code}`)
  } else {
    console.error(
      `  ❌ centro default: trovati ${default_.length} (${default_.map((c) => c.code).join(', ') || 'nessuno'}), atteso esattamente STR`
    )
    ok = false
  }

  // ==================== CONTI DI SISTEMA ====================
  const contiSistema = await prisma.account.findMany({
    where: { systemKey: { in: SYSTEM_KEYS_ATTESE } },
    select: { code: true, systemKey: true },
  })
  const trovate = new Set(contiSistema.map((a) => a.systemKey))
  for (const key of SYSTEM_KEYS_ATTESE) {
    if (trovate.has(key)) {
      const acc = contiSistema.find((a) => a.systemKey === key)
      console.log(`  ✓ systemKey ${key} → conto ${acc?.code}`)
    } else {
      console.error(`  ❌ systemKey ${key} non trovata su nessun conto`)
      ok = false
    }
  }

  // ==================== PERMESSO RICLASSIFICA ====================
  const permission = await prisma.permission.findUnique({
    where: { code: PERMESSO_ATTESO },
    include: { roles: { include: { role: true } } },
  })
  if (!permission) {
    console.error(`  ❌ permesso ${PERMESSO_ATTESO} non trovato`)
    ok = false
  } else {
    const assegnatoAdmin = permission.roles.some((rp) => rp.role.name === 'admin')
    if (assegnatoAdmin) {
      console.log(`  ✓ permesso ${PERMESSO_ATTESO} assegnato al ruolo admin`)
    } else {
      console.error(`  ❌ permesso ${PERMESSO_ATTESO} presente ma non assegnato al ruolo admin`)
      ok = false
    }
  }

  // ==================== CONTO DI SISTEMA CORRISPETTIVI ====================
  // Assegnata dalla migrazione di FASE 3 alla voce 10.01: da lì le chiusure
  // di cassa nascono imputate ai ricavi.
  const corrispettivi = await prisma.account.findUnique({
    where: { systemKey: 'CORRISPETTIVI' },
    select: { code: true, isActive: true },
  })
  if (!corrispettivi) {
    console.error(`  ❌ systemKey CORRISPETTIVI non trovata (attesa sulla voce ${VOCE_CORRISPETTIVI})`)
    ok = false
  } else if (corrispettivi.code !== VOCE_CORRISPETTIVI) {
    console.error(
      `  ❌ systemKey CORRISPETTIVI sul conto ${corrispettivi.code}, attesa su ${VOCE_CORRISPETTIVI}`
    )
    ok = false
  } else if (!corrispettivi.isActive) {
    console.error(`  ❌ la voce ${VOCE_CORRISPETTIVI} (CORRISPETTIVI) è disattivata`)
    ok = false
  } else {
    console.log(`  ✓ systemKey CORRISPETTIVI → conto ${corrispettivi.code}`)
  }

  // ==================== CONTI LEGACY ====================
  // Il piano vecchio non si cancella, si spegne: dopo la migrazione nessun
  // conto economico fuori dal piano v4 deve restare selezionabile. Su un
  // database appena seminato di conti legacy non ce ne sono affatto, e va
  // bene lo stesso.
  const legacy = await prisma.account.findMany({
    where: { mastroCode: null, type: { in: ['RICAVO', 'COSTO'] } },
    select: { code: true, isActive: true },
    orderBy: { code: 'asc' },
  })
  const legacyAttivi = legacy.filter((l) => l.isActive)
  if (legacyAttivi.length === 0) {
    console.log(`  ✓ conti legacy RICAVO/COSTO attivi: 0 (${legacy.length} disattivati in archivio)`)
  } else {
    console.error(
      `  ❌ conti legacy RICAVO/COSTO ancora attivi: ${legacyAttivi.length} (${legacyAttivi.map((l) => l.code).join(', ')})`
    )
    ok = false
  }

  // ==================== CENTRO SUI MOVIMENTI ====================
  // Atteso zero solo dopo il follow-up che porta cost_center_id a NOT NULL:
  // finché quello non c'è, è un avviso.
  const senzaCentro = await prisma.journalEntry.count({ where: { costCenterId: null } })
  if (senzaCentro === 0) {
    console.log('  ✓ movimenti senza centro di costo: 0')
  } else if (rigoroso) {
    console.error(`  ❌ movimenti senza centro di costo: ${senzaCentro}`)
    ok = false
  } else {
    console.warn(
      `  ⚠️  movimenti senza centro di costo: ${senzaCentro} (atteso 0 dopo il follow-up NOT NULL su journal_entries.cost_center_id)`
    )
    avvisi++
  }

  if (ok && avvisi === 0) {
    console.log('✅ Tutte le verifiche superate')
  } else if (ok) {
    console.log(`✅ Verifiche superate con ${avvisi} avviso/i (usare --rigoroso per trattarli come errori)`)
  } else {
    console.error('❌ Una o più verifiche fallite')
    process.exitCode = 1
  }
}

main()
  .catch((e) => {
    console.error('❌ Errore durante la verifica:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
