// prisma/seed-leave-types.ts
// Seed tipi di assenza per Sistema Gestionale Weiss Cafè

import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Creazione tipi di assenza...')

  const leaveTypes = [
    {
      code: 'FE',
      name: 'Ferie',
      color: '#10B981',  // green
      icon: 'palm-tree',
      requiresApproval: true,
      requiresDocument: false,
      minDaysAdvance: 7,
      affectsAccrual: true,
      paid: true
    },
    {
      code: 'ROL',
      name: 'Permesso ROL',
      color: '#3B82F6',  // blue
      icon: 'clock',
      requiresApproval: true,
      requiresDocument: false,
      minDaysAdvance: 1,
      affectsAccrual: true,
      paid: true
    },
    {
      code: 'MA',
      name: 'Malattia',
      color: '#EF4444',  // red
      icon: 'thermometer',
      requiresApproval: false,  // Automatica con certificato
      requiresDocument: true,
      minDaysAdvance: null,
      affectsAccrual: false,
      paid: true
    },
    {
      code: 'PAR',
      name: 'Permesso non retribuito',
      color: '#6B7280',  // gray
      icon: 'calendar-x',
      requiresApproval: true,
      requiresDocument: false,
      minDaysAdvance: 3,
      affectsAccrual: false,
      paid: false
    },
    {
      code: 'MAT',
      name: 'Maternità/Paternità',
      color: '#EC4899',  // pink
      icon: 'baby',
      requiresApproval: false,
      requiresDocument: true,
      minDaysAdvance: null,
      affectsAccrual: false,
      paid: true
    },
    {
      code: 'LUT',
      name: 'Lutto',
      color: '#1F2937',  // dark
      icon: 'heart',
      requiresApproval: false,
      requiresDocument: true,
      minDaysAdvance: null,
      affectsAccrual: false,
      paid: true
    },
    {
      code: 'STU',
      name: 'Permesso studio',
      color: '#8B5CF6',  // purple
      icon: 'book',
      requiresApproval: true,
      requiresDocument: true,
      minDaysAdvance: 7,
      affectsAccrual: false,
      paid: true
    },
  ]

  for (const leaveType of leaveTypes) {
    await prisma.leaveType.upsert({
      where: { code: leaveType.code },
      update: leaveType,
      create: leaveType
    })
    console.log(`  ✓ ${leaveType.code}: ${leaveType.name}`)
  }

  console.log('✅ Tipi di assenza creati!')
}

main()
  .catch((e) => {
    console.error('❌ Errore:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
