/**
 * Reimposta la password di un utente e la STAMPA a terminale.
 *
 * È la via di rientro quando nessuno conosce più le credenziali di un utente:
 * gli hash bcrypt non sono reversibili, quindi l'unica strada è generarne una
 * nuova. L'utente dovrà comunque sceglierne una propria al primo accesso
 * (mustChangePassword resta true, come in POST /api/users/[id]/reset-password).
 *
 * Eseguire con:
 *   npx tsx scripts/reset-password.ts <username|email>
 *   npx tsx scripts/reset-password.ts <username|email> --si   (salta la conferma)
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import readline from 'readline'
import { generaPasswordTemporanea } from '../src/lib/password-temporanea'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

/** Host del database, per non reimpostare per errore una password in produzione. */
function descriviDatabase(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '')
    return `${url.hostname}${url.pathname}`
  } catch {
    return '(DATABASE_URL non leggibile)'
  }
}

async function chiediConferma(domanda: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const risposta = await new Promise<string>((resolve) => rl.question(domanda, resolve))
  rl.close()
  return risposta.trim().toLowerCase() === 's'
}

async function main() {
  const argomenti = process.argv.slice(2)
  const identificativo = argomenti.find((a) => !a.startsWith('--'))
  const salta = argomenti.includes('--si')

  if (!identificativo) {
    console.error('Uso: npx tsx scripts/reset-password.ts <username|email> [--si]')
    process.exit(1)
  }

  const utente = await prisma.user.findFirst({
    where: {
      OR: [
        { username: identificativo },
        { email: identificativo.toLowerCase() },
      ],
    },
    include: { role: true },
  })

  if (!utente) {
    console.error(`❌ Nessun utente con username o email "${identificativo}"`)
    process.exit(1)
  }

  console.log('')
  console.log(`  Database: ${descriviDatabase()}`)
  console.log(`  Utente:   ${utente.firstName} ${utente.lastName}`)
  console.log(`  Username: ${utente.username}`)
  console.log(`  Email:    ${utente.email ?? '(nessuna)'}`)
  console.log(`  Ruolo:    ${utente.role.name}`)
  console.log(`  Stato:    ${utente.isActive ? 'attivo' : 'SOSPESO'}`)
  console.log(`  Accessi:  ${utente.lastLoginAt ? utente.lastLoginAt.toISOString() : 'mai entrato'}`)
  console.log('')

  if (!utente.isActive) {
    console.log('⚠️  L\'utente è sospeso: con la nuova password non riuscirà comunque ad entrare.')
    console.log('')
  }

  if (!salta) {
    const confermato = await chiediConferma('Reimpostare la password di questo utente? [s/N] ')
    if (!confermato) {
      console.log('Annullato, nessuna modifica.')
      return
    }
  }

  const passwordTemporanea = generaPasswordTemporanea()
  const passwordHash = await bcrypt.hash(passwordTemporanea, 12)

  await prisma.user.update({
    where: { id: utente.id },
    data: { passwordHash, mustChangePassword: true },
  })

  console.log('')
  console.log('✅ Password reimpostata. Credenziali da consegnare:')
  console.log('')
  console.log(`   Username: ${utente.username}`)
  console.log(`   Password: ${passwordTemporanea}`)
  console.log('')
  console.log('   Va cambiata al primo accesso. Non resterà scritta da nessuna parte:')
  console.log('   se si perde, va rigenerata.')
  console.log('')
}

main()
  .catch((e) => {
    console.error('Errore fatale:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
