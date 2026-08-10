// prisma/seed.ts
// Seed dati iniziali per Sistema Gestionale Weiss Cafè

import { PrismaClient, AccountType } from '@prisma/client'
import { hash } from 'bcryptjs'
import 'dotenv/config'

// Prisma 7 richiede adapter o URL nel costruttore
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

import { PIANO_CONTI_WEISS_V4, CENTRI_DI_COSTO } from '../src/lib/accounts/piano-conti-weiss-v4'
import { assertNotProdOrExit } from '../scripts/guards/assert-not-prod'

// Prima di aprire qualunque connessione: il seed scrive dati e non deve mai
// poterlo fare sulla produzione. Il controllo è su DATABASE_URL, non su
// NODE_ENV, che in sviluppo non vale mai 'production' e quindi non protegge.
assertNotProdOrExit()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Inizio seed database...')

  // ==================== RUOLI ====================
  console.log('Creating roles...')

  const adminRole = await prisma.role.create({
    data: {
      name: 'admin',
      description: 'Accesso completo al sistema'
    }
  })

  const managerRole = await prisma.role.create({
    data: {
      name: 'manager',
      description: 'Gestione operativa e validazione'
    }
  })

  const staffRole = await prisma.role.create({
    data: {
      name: 'staff',
      description: 'Compilazione chiusura cassa'
    }
  })

  // ==================== PERMESSI ====================
  console.log('Creating permissions...')

  const permissionsData = [
    { code: 'closure.create', description: 'Creare chiusura cassa', module: 'cash' },
    { code: 'closure.edit', description: 'Modificare chiusura cassa', module: 'cash' },
    { code: 'closure.validate', description: 'Validare chiusura cassa', module: 'cash' },
    { code: 'closure.view', description: 'Visualizzare chiusure', module: 'cash' },
    { code: 'journal.create', description: 'Creare movimenti prima nota', module: 'journal' },
    { code: 'journal.edit', description: 'Modificare movimenti', module: 'journal' },
    { code: 'journal.view', description: 'Visualizzare prima nota', module: 'journal' },
    { code: 'reports.view', description: 'Visualizzare report', module: 'reports' },
    { code: 'admin.users', description: 'Gestire utenti', module: 'admin' },
    { code: 'admin.settings', description: 'Gestire impostazioni', module: 'admin' },
  ]

  for (const perm of permissionsData) {
    await prisma.permission.create({ data: perm })
  }

  // Assegna tutti i permessi ad admin
  const allPermissions = await prisma.permission.findMany()
  for (const perm of allPermissions) {
    await prisma.rolePermission.create({
      data: { roleId: adminRole.id, permissionId: perm.id }
    })
  }

  // Manager: tutto tranne admin
  const managerPerms = allPermissions.filter(p => p.module !== 'admin')
  for (const perm of managerPerms) {
    await prisma.rolePermission.create({
      data: { roleId: managerRole.id, permissionId: perm.id }
    })
  }

  // Staff: solo closure.create, closure.edit, closure.view
  const staffPerms = allPermissions.filter(p =>
    ['closure.create', 'closure.edit', 'closure.view'].includes(p.code)
  )
  for (const perm of staffPerms) {
    await prisma.rolePermission.create({
      data: { roleId: staffRole.id, permissionId: perm.id }
    })
  }

  // ==================== SEDE ====================
  console.log('Creating venue...')

  const weiss = await prisma.venue.create({
    data: {
      name: 'Weiss Cafè',
      code: 'WEISS',
      address: 'Via Roma 1, 33077 Sacile (PN)',
      defaultFloat: 114.00,
      vatRate: 10.00
    }
  })

  // Template postazioni cassa
  const stationNames = ['BAR', 'CASSA 1', 'CASSA 2', 'CASSA 3', 'TAVOLI', 'MARSUPIO', 'ESTERNO']
  for (let i = 0; i < stationNames.length; i++) {
    await prisma.cashStationTemplate.create({
      data: {
        venueId: weiss.id,
        name: stationNames[i],
        position: i
      }
    })
  }

  // ==================== UTENTI ====================
  console.log('Creating users...')

  // Admin
  await prisma.user.create({
    data: {
      email: 'admin@weisscafe.it',
      username: 'admin@weisscafe.it',
      passwordHash: await hash('admin123', 12),
      firstName: 'Admin',
      lastName: 'Weiss',
      roleId: adminRole.id,
      venueId: weiss.id,
      isFixedStaff: true,
      mustChangePassword: true
    }
  })

  // Manager
  await prisma.user.create({
    data: {
      email: 'manager@weisscafe.it',
      username: 'manager@weisscafe.it',
      passwordHash: await hash('manager123', 12),
      firstName: 'Mario',
      lastName: 'Rossi',
      roleId: managerRole.id,
      venueId: weiss.id,
      isFixedStaff: true,
      mustChangePassword: true
    }
  })

  // Dipendenti fissi
  const fixedStaff = [
    { firstName: 'Vanessa', lastName: 'Basso', email: 'vanessa@weisscafe.it' },
    { firstName: 'Serena', lastName: 'Rui', email: 'serena@weisscafe.it' },
    { firstName: 'Andrea', lastName: 'Segatto', email: 'andrea.s@weisscafe.it' },
    { firstName: 'Silvia', lastName: 'Carniello', email: 'silvia@weisscafe.it' },
    { firstName: 'Brian', lastName: 'Monferone', email: 'brian@weisscafe.it' },
    { firstName: 'Matteo', lastName: 'Momesso', email: 'matteo.m@weisscafe.it' },
  ]

  for (const staff of fixedStaff) {
    // Genera username: NomeCognome
    const username = `${staff.firstName}${staff.lastName}`.replace(/[^a-zA-Z]/g, '')
    await prisma.user.create({
      data: {
        ...staff,
        username,
        passwordHash: await hash('staff123', 12),
        roleId: staffRole.id,
        venueId: weiss.id,
        isFixedStaff: true,
        mustChangePassword: true
      }
    })
  }

  // Extra (collaboratori occasionali)
  const extras = [
    { firstName: 'Matteo', lastName: "D'Elia", email: 'matteo.d@weisscafe.it', hourlyRate: 10.00 },
    { firstName: 'Andrea', lastName: 'Nadin', email: 'andrea.n@weisscafe.it', hourlyRate: 10.00 },
    { firstName: 'Patrick', lastName: 'Zanetti', email: 'patrick@weisscafe.it', hourlyRate: 10.00 },
  ]

  for (const extra of extras) {
    // Genera username: NomeCognome (rimuovi caratteri speciali)
    const username = `${extra.firstName}${extra.lastName}`.replace(/[^a-zA-Z]/g, '')
    await prisma.user.create({
      data: {
        firstName: extra.firstName,
        lastName: extra.lastName,
        email: extra.email,
        username,
        passwordHash: await hash('extra123', 12),
        roleId: staffRole.id,
        venueId: weiss.id,
        isFixedStaff: false,
        hourlyRate: extra.hourlyRate,
        mustChangePassword: true
      }
    })
  }

  // ==================== PIANO DEI CONTI v4 ====================
  console.log('Creating chart of accounts (piano v4)...')

  // Conti patrimoniali "di sistema": non fanno parte delle 155 voci del
  // piano v4 (che sono tutte RICAVO/COSTO), ma servono da controparte per i
  // movimenti di cassa/banca/debiti e sono referenziati via systemKey.
  const patrimoniali = [
    { code: '100', name: 'Cassa', type: AccountType.ATTIVO, systemKey: 'CASSA' },
    { code: '110', name: 'Banca', type: AccountType.ATTIVO, systemKey: 'BANCA' },
    { code: '200', name: 'Debiti v/fornitori', type: AccountType.PASSIVO, systemKey: 'DEBITI_FORNITORI' },
  ]

  for (const acc of patrimoniali) {
    await prisma.account.create({ data: acc })
  }

  for (const voce of PIANO_CONTI_WEISS_V4) {
    await prisma.account.create({
      data: {
        code: voce.code,
        name: voce.nome,
        type: voce.tipo,
        mastroCode: voce.mastroCode,
        mastroNome: voce.mastroNome,
        gruppoCode: voce.gruppoCode,
        gruppoNome: voce.gruppoNome,
        costCenterRule: voce.regolaCentro,
        systemKey: voce.code === '10.01' ? 'CORRISPETTIVI' : undefined,
      },
    })
  }

  // ==================== CENTRI DI COSTO ====================
  console.log('Creating cost centers...')

  for (const centro of CENTRI_DI_COSTO) {
    await prisma.costCenter.create({
      data: {
        code: centro.code,
        name: centro.name,
        description: centro.description,
        isDefault: centro.isDefault,
      },
    })
  }

  // Permesso di riclassifica dei movimenti da chiusura: assegnato solo al
  // ruolo admin, non tramite il meccanismo generico "tutti i permessi tranne
  // admin" usato sopra per manager (altrimenti lo erediterebbe anche lui).
  const editClosurePermission = await prisma.permission.create({
    data: {
      code: 'journal.edit-closure',
      description: 'Riclassificare movimenti da chiusura',
      module: 'journal',
    },
  })
  await prisma.rolePermission.create({
    data: { roleId: adminRole.id, permissionId: editClosurePermission.id },
  })

  // ==================== FORNITORI ESEMPIO ====================
  console.log('Creating suppliers...')

  const suppliers = [
    { name: 'Bevande Sacile', vatNumber: '01234567890' },
    { name: 'Metro Cash & Carry', vatNumber: '12345678901' },
    { name: 'Partesa', vatNumber: '23456789012' },
    { name: 'Servizi Pulizie Srl', vatNumber: '34567890123' },
  ]

  for (const sup of suppliers) {
    await prisma.supplier.create({ data: sup })
  }

  console.log('✅ Seed completato!')
  console.log('')
  console.log('📋 Utenti creati:')
  console.log('   admin@weisscafe.it / admin123 (Admin)')
  console.log('   manager@weisscafe.it / manager123 (Manager)')
  console.log('   vanessa@weisscafe.it / staff123 (Staff)')
  console.log('   ... altri staff con password staff123 o extra123')
}

main()
  .catch((e) => {
    console.error('❌ Errore durante il seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
