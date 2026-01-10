/**
 * Script per popolare gli username degli utenti esistenti
 *
 * Regole:
 * - Admin/Manager: username = email
 * - Staff: username = NomeCognome (normalizzato, con suffisso se duplicato)
 *
 * Eseguire con: npx tsx scripts/populate-usernames.ts
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { generateUniqueUsername } from '../src/lib/utils/username'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🔄 Popolamento username utenti esistenti...\n')

  // Recupera tutti gli utenti senza username (usa raw query per trovare NULL)
  // Questo script è stato usato per la migrazione iniziale
  // Ora username è obbligatorio, quindi non dovrebbero esserci più utenti senza username
  const users = await prisma.$queryRaw<Array<{ id: string; firstName: string; lastName: string; email: string | null; roleId: string }>>`
    SELECT u.id, u.first_name as "firstName", u.last_name as "lastName", u.email, u.role_id as "roleId"
    FROM users u
    WHERE u.username IS NULL
  `

  // Per ogni utente, recupera il ruolo
  const usersWithRoles = await Promise.all(
    users.map(async (user) => {
      const role = await prisma.role.findUnique({ where: { id: user.roleId } })
      return { ...user, role }
    })
  )

  console.log(`📊 Trovati ${users.length} utenti senza username\n`)

  let updated = 0
  let errors = 0

  for (const user of usersWithRoles) {
    try {
      let username: string

      // Admin e Manager usano email come username
      if (user.role?.name === 'admin' || user.role?.name === 'manager') {
        if (!user.email) {
          console.error(`❌ Utente ${user.id} (${user.firstName} ${user.lastName}) è ${user.role?.name} ma non ha email`)
          errors++
          continue
        }
        username = user.email.toLowerCase()
      } else {
        // Staff: genera username da nome+cognome
        username = await generateUniqueUsername(prisma, user.firstName, user.lastName, user.id)
      }

      // Aggiorna utente
      await prisma.user.update({
        where: { id: user.id },
        data: {
          username,
          // Admin esistenti non devono cambiare password al prossimo login
          mustChangePassword: user.role?.name === 'admin' ? false : true,
        },
      })

      console.log(`✅ ${user.firstName} ${user.lastName} → ${username}`)
      updated++
    } catch (error) {
      console.error(`❌ Errore per ${user.firstName} ${user.lastName}:`, error)
      errors++
    }
  }

  console.log(`\n📈 Risultato: ${updated} aggiornati, ${errors} errori`)
}

main()
  .catch((e) => {
    console.error('Errore fatale:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
