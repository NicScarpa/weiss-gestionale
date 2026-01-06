import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  // Get all users without contract type
  const usersWithoutContract = await prisma.user.findMany({
    where: {
      contractType: null,
      isActive: true
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      isFixedStaff: true,
      contractType: true
    }
  })

  console.log(`Found ${usersWithoutContract.length} users without contract type`)

  for (const user of usersWithoutContract) {
    // isFixedStaff=true means EXTRA (inverted switch logic)
    // isFixedStaff=false means fixed staff
    const newContractType = user.isFixedStaff
      ? 'LAVORO_INTERMITTENTE'  // EXTRA workers (isFixedStaff=true)
      : 'TEMPO_INDETERMINATO'   // Fixed staff (isFixedStaff=false)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        contractType: newContractType,
        // Set hire date to Jan 1, 2024 as default if not set
        hireDate: new Date('2024-01-01')
      }
    })

    console.log(`Updated ${user.firstName} ${user.lastName}: ${newContractType}`)
  }

  console.log('Done!')
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
