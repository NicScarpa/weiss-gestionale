/**
 * Ricalcola causale e descrizione delle righe di banca importate prima della
 * consegna A. Idempotente. Uso:
 *
 *   PATH=… npx tsx --env-file=.env scripts/banca/ricalcola-causali.ts --dry-run
 *   PATH=… npx tsx --env-file=.env scripts/banca/ricalcola-causali.ts
 *
 * Il `.env` del repository punta alla produzione: il `--dry-run` va fatto
 * prima, e il conteggio per codice va confrontato con la tabella della spec.
 */
import { prisma } from '../../src/lib/prisma'
import { ricalcolaCausali } from '../../src/lib/banca/ricalcola-causali'

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const esito = await ricalcolaCausali(prisma, { dryRun })
  console.log(dryRun ? 'PROVA (nessuna scrittura)' : 'ESEGUITO')
  console.log(`esaminate ${esito.esaminate}, aggiornate ${esito.aggiornate}`)
  for (const [codice, n] of Object.entries(esito.perCodice).sort()) console.log(`  ${codice}  ${n}`)
}

main()
  .catch((errore) => {
    console.error(errore)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
