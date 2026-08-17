/**
 * Porta gli username esistenti alla forma `cognome.nome`.
 *
 * Riscrive la chiave con cui delle persone entrano nel gestionale, quindi:
 * **mostra il piano e chiede conferma prima di scrivere**, dice su quale
 * database sta agendo, e si può rilanciare senza danni (chi è già nella forma
 * nuova viene saltato).
 *
 * Perché il cambio non chiude la porta a nessuno: `src/lib/auth.ts` accetta
 * username **oppure** email, quindi chi era già entrato può continuare a farlo
 * con il proprio indirizzo mentre gli si comunica il nome nuovo.
 *
 * Eseguire con:
 *   npx tsx --env-file=.env scripts/migra-username.ts            # mostra il piano e chiede conferma
 *   npx tsx --env-file=.env scripts/migra-username.ts --prova    # mostra il piano e non scrive nulla
 *   npx tsx --env-file=.env scripts/migra-username.ts --si       # salta la conferma
 */
import readline from 'readline'
import { prisma } from '../src/lib/prisma'
import { pianificaMigrazioneUsername } from '../src/lib/utils/username'
import { createAuditLog } from '../src/lib/audit'

/** Host e nome del database, per non rinominare per sbaglio la produzione. */
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
  const soloProva = argomenti.includes('--prova')
  const senzaConferma = argomenti.includes('--si')

  const utenti = await prisma.user.findMany({
    select: { id: true, username: true, firstName: true, lastName: true, lastLoginAt: true },
    orderBy: { username: 'asc' },
  })

  const piano = pianificaMigrazioneUsername(utenti)
  const daRinominare = piano.filter((r) => r.azione === 'rinomina')
  const saltati = piano.filter((r) => r.azione === 'salta')
  const giaEntrati = new Set(utenti.filter((u) => u.lastLoginAt).map((u) => u.id))

  console.log(`\nDatabase: ${descriviDatabase()}`)
  console.log(`Utenti letti: ${utenti.length}\n`)

  if (daRinominare.length > 0) {
    console.log('Da rinominare:')
    for (const riga of daRinominare) {
      if (riga.azione !== 'rinomina') continue
      // Chi è già entrato una volta va avvisato: è l'unico caso in cui il
      // cambio si nota, perché gli altri non hanno mai usato lo username.
      const avviso = giaEntrati.has(riga.id) ? '   ← è già entrato: avvisalo' : ''
      console.log(`  ${riga.da.padEnd(22)} → ${riga.a}${avviso}`)
    }
    console.log('')
  }

  if (saltati.length > 0) {
    console.log('Saltati:')
    for (const riga of saltati) {
      if (riga.azione !== 'salta') continue
      console.log(`  ${riga.username.padEnd(22)}   ${riga.motivo}`)
    }
    console.log('')
  }

  if (daRinominare.length === 0) {
    console.log('Niente da fare: nessuno username da cambiare.\n')
    await prisma.$disconnect()
    return
  }

  if (soloProva) {
    console.log('--prova: nessuna scrittura eseguita.\n')
    await prisma.$disconnect()
    return
  }

  if (!senzaConferma) {
    const procedi = await chiediConferma(
      `Rinomino ${daRinominare.length} username su ${descriviDatabase()}? [s/N] `
    )
    if (!procedi) {
      console.log('Annullato: nessuna scrittura eseguita.\n')
      await prisma.$disconnect()
      return
    }
  }

  let scritti = 0
  for (const riga of daRinominare) {
    if (riga.azione !== 'rinomina') continue
    await prisma.user.update({ where: { id: riga.id }, data: { username: riga.a } })
    await createAuditLog({
      action: 'UPDATE',
      entityType: 'User',
      entityId: riga.id,
      userId: null,
      oldValues: { username: riga.da },
      newValues: { username: riga.a },
    })
    scritti++
  }

  console.log(`\nFatto: ${scritti} username aggiornati, ${saltati.length} saltati.`)
  console.log('Chi era già entrato può accedere anche con la propria email.\n')
  await prisma.$disconnect()
}

main()
