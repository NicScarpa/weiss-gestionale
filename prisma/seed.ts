// prisma/seed.ts
// Seed dati iniziali per Sistema Gestionale Weiss Cafè

import { PrismaClient, AccountType } from '@prisma/client'
import { hash } from 'bcryptjs'
import 'dotenv/config'

// Prisma 7 richiede adapter o URL nel costruttore
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

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
      mustChangePassword: false // Per test
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
      mustChangePassword: false // Per test
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
        mustChangePassword: false // Per test
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
        mustChangePassword: false // Per test
      }
    })
  }

  // ==================== PIANO DEI CONTI ====================
  console.log('Creating chart of accounts...')

  const accounts = [
    // RICAVI
    { code: '400', name: 'Ricavi', type: AccountType.RICAVO, category: 'Ricavi' },
    { code: '400.01', name: 'Ricavi da vendite bar', type: AccountType.RICAVO, category: 'Ricavi' },
    { code: '400.02', name: 'Ricavi da vendite caffetteria', type: AccountType.RICAVO, category: 'Ricavi' },
    { code: '400.03', name: 'Ricavi da eventi', type: AccountType.RICAVO, category: 'Ricavi' },

    // COSTI
    { code: '500', name: 'Costi', type: AccountType.COSTO, category: 'Costi' },
    { code: '500.01', name: 'Acquisti materie prime', type: AccountType.COSTO, category: 'Costi F&B' },
    { code: '500.02', name: 'Acquisti bevande', type: AccountType.COSTO, category: 'Costi F&B' },
    { code: '510', name: 'Costi personale', type: AccountType.COSTO, category: 'Personale' },
    { code: '510.01', name: 'Stipendi dipendenti', type: AccountType.COSTO, category: 'Personale' },
    { code: '510.02', name: 'Compensi extra', type: AccountType.COSTO, category: 'Personale' },
    { code: '520', name: 'Costi per servizi', type: AccountType.COSTO, category: 'Servizi' },
    { code: '520.01', name: 'Pulizie', type: AccountType.COSTO, category: 'Servizi' },
    { code: '520.02', name: 'Utenze', type: AccountType.COSTO, category: 'Servizi' },
    { code: '520.03', name: 'Manutenzioni', type: AccountType.COSTO, category: 'Servizi' },
    { code: '530', name: 'Costi amministrativi', type: AccountType.COSTO, category: 'Amministrativi' },
    { code: '530.01', name: 'Commissioni bancarie', type: AccountType.COSTO, category: 'Amministrativi' },
    { code: '530.02', name: 'Commissioni POS', type: AccountType.COSTO, category: 'Amministrativi' },

    // ATTIVO
    { code: '100', name: 'Cassa', type: AccountType.ATTIVO, category: 'Liquidità' },
    { code: '110', name: 'Banca', type: AccountType.ATTIVO, category: 'Liquidità' },

    // PASSIVO
    { code: '200', name: 'Debiti v/fornitori', type: AccountType.PASSIVO, category: 'Debiti' },
  ]

  for (const acc of accounts) {
    await prisma.account.create({ data: acc })
  }

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
