/**
 * Script di produzione 01 — Piano dei conti v4: centri di costo, conti "di
 * sistema" e permesso di riclassifica.
 *
 * Questa è solo la fase preliminare: in PRODUZIONE inserisce i 4 centri di
 * costo, valorizza systemKey sui conti patrimoniali già esistenti (Cassa,
 * Banca, Debiti v/fornitori), **crea** i tre transitori POS (120/121/122, che
 * in produzione non esistono) e crea il permesso `journal.edit-closure`
 * assegnato al ruolo admin. Le 155 voci del piano dei conti v4 NON vengono
 * inserite qui: arrivano con la migrazione della FASE 3, dopo l'approvazione
 * del committente.
 *
 * Idempotente: rieseguibile senza errori (upsert su centri e permesso,
 * update guardato da findUnique sui conti di sistema e sui transitori).
 *
 * Uso: npx tsx scripts/piano-v4/01-centri-e-sistema.ts
 */
import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

// Prisma 7 richiede adapter o URL nel costruttore
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

import { CENTRI_DI_COSTO } from '../../src/lib/accounts/piano-conti-weiss-v4'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

/** Conti patrimoniali già esistenti a cui assegnare una chiave di sistema stabile. */
const CONTI_SISTEMA: { code: string; systemKey: string }[] = [
  { code: '100', systemKey: 'CASSA' },
  { code: '110', systemKey: 'BANCA' },
  { code: '200', systemKey: 'DEBITI_FORNITORI' },
]

/**
 * Transitori POS: a differenza dei tre qui sopra **non esistono** in
 * produzione e vanno creati. Reggono l'incasso dalla sera della chiusura fino
 * all'accredito in banca, che arriva uno o due giorni dopo e — con Axerve e
 * SumUp — al netto delle commissioni. Uno per provider, perché la
 * riconciliazione lavora per provider e il saldo di ciascuno deve essere
 * leggibile da solo.
 *
 * Vedi docs/superpowers/specs/2026-08-10-ricavi-sospesi-pos-design.md
 */
const TRANSITORI_POS: { code: string; name: string; systemKey: string }[] = [
  { code: '120', name: 'POS Worldline da accreditare', systemKey: 'POS_WORLDLINE' },
  { code: '121', name: 'POS Axerve da accreditare', systemKey: 'POS_AXERVE' },
  { code: '122', name: 'POS SumUp da accreditare', systemKey: 'POS_SUMUP' },
]

const PERMESSO_RICLASSIFICA = {
  code: 'journal.edit-closure',
  description: 'Riclassificare movimenti da chiusura',
  module: 'journal',
}

async function main() {
  console.log('🌱 Piano dei conti v4 — script 01 (centri, conti di sistema, permesso)')

  // ==================== CENTRI DI COSTO ====================
  console.log('Centri di costo...')

  for (const centro of CENTRI_DI_COSTO) {
    await prisma.costCenter.upsert({
      where: { code: centro.code },
      update: {
        name: centro.name,
        description: centro.description,
        isDefault: centro.isDefault,
      },
      create: {
        code: centro.code,
        name: centro.name,
        description: centro.description,
        isDefault: centro.isDefault,
      },
    })
    console.log(`  ✓ ${centro.code} — ${centro.name}`)
  }

  // ==================== CONTI DI SISTEMA ====================
  console.log('Conti di sistema...')

  for (const { code, systemKey } of CONTI_SISTEMA) {
    const account = await prisma.account.findUnique({ where: { code } })
    if (!account) {
      console.warn(`  ⚠️  conto ${code} non trovato: salto systemKey ${systemKey}`)
      continue
    }
    if (account.systemKey === systemKey) {
      console.log(`  ✓ ${code} → systemKey ${systemKey} (già presente)`)
      continue
    }
    await prisma.account.update({
      where: { code },
      data: { systemKey },
    })
    console.log(`  ✓ ${code} → systemKey ${systemKey}`)
  }

  // ==================== TRANSITORI POS ====================
  console.log('Transitori POS...')

  for (const { code, name, systemKey } of TRANSITORI_POS) {
    // `upsert` sul codice: l'update tocca solo `systemKey` e `name`, così una
    // riesecuzione non riporta indietro modifiche fatte a mano sul conto (per
    // esempio una disattivazione), e non duplica nulla se il conto c'è già.
    const esistente = await prisma.account.findUnique({ where: { code } })

    if (esistente) {
      if (esistente.systemKey === systemKey) {
        console.log(`  ✓ ${code} — ${name} (già presente)`)
        continue
      }
      await prisma.account.update({ where: { code }, data: { systemKey } })
      console.log(`  ✓ ${code} → systemKey ${systemKey} (conto già esistente)`)
      continue
    }

    await prisma.account.create({
      data: { code, name, type: 'ATTIVO', systemKey },
    })
    console.log(`  ✓ ${code} — ${name} (creato)`)
  }

  // ==================== PERMESSO RICLASSIFICA ====================
  console.log('Permesso journal.edit-closure...')

  const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } })
  if (!adminRole) {
    console.warn('  ⚠️  ruolo admin non trovato: salto creazione/assegnazione permesso')
  } else {
    const permission = await prisma.permission.upsert({
      where: { code: PERMESSO_RICLASSIFICA.code },
      update: {
        description: PERMESSO_RICLASSIFICA.description,
        module: PERMESSO_RICLASSIFICA.module,
      },
      create: PERMESSO_RICLASSIFICA,
    })
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id },
      },
      update: {},
      create: { roleId: adminRole.id, permissionId: permission.id },
    })
    console.log(`  ✓ ${permission.code} → ruolo admin`)
  }

  console.log('✅ Script 01 completato')
}

main()
  .catch((e) => {
    console.error('❌ Errore durante lo script 01:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
