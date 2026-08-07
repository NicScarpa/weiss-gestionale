/**
 * Verifica dello stato del piano dei conti v4 + centri di costo.
 *
 * Script di sola lettura, pensato per essere rieseguito in più momenti:
 * dopo il seed di sviluppo (che replica lo stato finale con le 155 voci) e
 * dopo i rollout in produzione dello script 01 e della futura migrazione di
 * FASE 3. Esce con codice diverso da zero se una delle attese non è
 * soddisfatta, per poter essere usato in pipeline/CI.
 *
 * Uso: npx tsx scripts/piano-v4/verifica.ts
 */
import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const VOCI_ATTESE = 155
const CENTRI_ATTESI = 4
const SYSTEM_KEYS_ATTESE = ['CASSA', 'BANCA', 'DEBITI_FORNITORI']
const PERMESSO_ATTESO = 'journal.edit-closure'

async function main() {
  console.log('🔎 Verifica piano dei conti v4 + centri di costo')
  let ok = true

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

  if (ok) {
    console.log('✅ Tutte le verifiche superate')
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
