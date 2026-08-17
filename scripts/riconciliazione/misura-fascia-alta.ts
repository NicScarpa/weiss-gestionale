/**
 * La misura che la Fase A1 ha lasciato aperta: **le proposte della fascia Alta
 * sono giuste?**
 *
 * `misura-lotto.ts` misura la scala — quanto ci mette il motore, quante
 * proposte escono, quanto diventa grossa la transazione — ma non la
 * correttezza, perché costruisce le scadenze sintetiche dallo stesso movimento
 * che poi le fa incontrare: il motore ritroverebbe ciò che gli è stato appena
 * messo sotto, e il tasso che ne uscirebbe sarebbe una tautologia.
 *
 * Il piano della Fase A1 rimandava questa misura «dopo la Fase 3», con questa
 * motivazione: richiede i due lati veri insieme, e «le 226 fatture vere stanno
 * nel database di produzione, non come file».
 *
 * Quel presupposto è aggirabile. I due lati veri si possono far incontrare qui:
 *
 * - **le fatture e le loro scadenze** arrivano da un dump di produzione,
 *   ripristinato in un database usa-e-getta;
 * - **i movimenti bancari** arrivano dagli snapshot GoCardless della Fase 0,
 *   che stanno su disco fuori dal repository perché contengono dati veri.
 *
 * Nessuna chiamata a GoCardless, nessun consumo di contingente, nessuna
 * scrittura sulla produzione: si legge un dump e si scrive in locale.
 *
 * ## Cosa produce
 *
 * Una tabella delle proposte in fascia Alta con, per ciascuna, ciò che serve a
 * un umano per dire «giusta» o «sbagliata»: la causale del movimento, il suo
 * importo e la sua data, e dall'altra parte la scadenza proposta col numero di
 * documento, il fornitore e l'importo. Il giudizio resta umano — è il punto.
 *
 * Uso:
 *   DUMP=/percorso/backup.sql DB_MISURA=misura_alta \
 *     npx tsx scripts/riconciliazione/misura-fascia-alta.ts
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { leggiMovimenti, causaleDi, type MovimentoSnapshot } from './snapshot'

const run = promisify(execFile)
const projectRoot = fileURLToPath(new URL('../../', import.meta.url))

const PG_LOCALE = 'postgresql://nicolascarpa@127.0.0.1:5433'
const PSQL = '/opt/homebrew/opt/postgresql@16/bin/psql'

function richiede(nome: string): string {
  const valore = process.env[nome]
  if (!valore) {
    console.error(
      `\n${nome} è obbligatorio.\n\n` +
        `  DUMP=<percorso del dump di produzione> DB_MISURA=<nome database> \\\n` +
        `    npx tsx scripts/riconciliazione/misura-fascia-alta.ts\n`
    )
    process.exit(1)
  }
  return valore
}

interface MovimentoValido {
  data: Date
  importo: number
  causale: string
  snapshot: MovimentoSnapshot
}

/**
 * Gli stessi criteri di `misura-lotto.ts`: servono una data, un importo e una
 * causale, altrimenti la riga non è caricabile come `BankTransaction`.
 */
function movimentiValidi(): MovimentoValido[] {
  const validi: MovimentoValido[] = []

  for (const m of leggiMovimenti()) {
    const dataGrezza = m.bookingDate ?? m.valueDate
    const importoGrezzo = m.transactionAmount?.amount
    if (!dataGrezza || !importoGrezzo) continue

    const data = new Date(dataGrezza)
    const importo = Number(importoGrezzo)
    if (Number.isNaN(data.getTime()) || Number.isNaN(importo)) continue

    validi.push({ data, importo, causale: causaleDi(m), snapshot: m })
  }

  return validi
}

async function conAdmin<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: `${PG_LOCALE}/postgres` })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function main(): Promise<void> {
  const dump = richiede('DUMP')
  const dbName = richiede('DB_MISURA')
  const url = `${PG_LOCALE}/${dbName}`

  console.log(`\nDatabase di misura: ${dbName}\nDump di partenza:   ${dump}\n`)

  await conAdmin(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`)
    await client.query(`CREATE DATABASE "${dbName}"`)
  })

  try {
    console.log('Ripristino il dump di produzione...')
    // `ON_ERROR_STOP=0`: il dump viene da Supabase e cita ruoli ed estensioni
    // che qui non esistono. Quegli errori sono attesi e innocui — ciò che
    // conta è che le tabelle e le righe arrivino, e lo si verifica subito dopo
    // contando le fatture invece di fidarsi del codice d'uscita.
    await run(PSQL, ['-v', 'ON_ERROR_STOP=0', '-q', '-f', dump, url], {
      maxBuffer: 1024 * 1024 * 512,
    })

    process.env.DATABASE_URL = url
    process.env.DIRECT_URL = url

    console.log('Applico le migrazioni mancanti...')
    await run('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: projectRoot,
      env: { ...process.env, DATABASE_URL: url },
      maxBuffer: 1024 * 1024 * 64,
    })

    const { prisma } = await import('../../src/lib/prisma')
    const { generaLotto } = await import('../../src/lib/services/reconciliation-batch-service')

    const fatture = await prisma.electronicInvoice.count()
    const scadenze = await prisma.schedule.count()
    const venue = await prisma.venue.findFirstOrThrow()
    console.log(`\nDal dump: ${fatture} fatture, ${scadenze} scadenze, sede "${venue.name}"`)

    if (fatture === 0 || scadenze === 0) {
      throw new Error(
        'Il dump non contiene fatture o scadenze: senza uno dei due lati la misura non ha senso.'
      )
    }

    // Con `SENZA_SNAPSHOT` si misura su ciò che il dump già contiene: da quando
    // la sincronizzazione gira in produzione, i movimenti veri stanno lì e
    // caricarci sopra quelli di giugno mescolerebbe due popolazioni diverse.
    const soloDump = process.env.SENZA_SNAPSHOT === '1'

    if (!soloDump) {
      const movimenti = movimentiValidi()
      console.log(`Dagli snapshot: ${movimenti.length} movimenti bancari veri\n`)

      await prisma.bankTransaction.createMany({
        data: movimenti.map((m) => ({
          venueId: venue.id,
          transactionDate: m.data,
          description: m.causale.slice(0, 500) || '(causale assente)',
          amount: m.importo,
          bankTransactionCode: m.snapshot.proprietaryBankTransactionCode ?? null,
          providerTransactionId: m.snapshot.transactionId ?? null,
          importSource: 'PSD2_GOCARDLESS',
          status: 'PENDING',
        })),
        skipDuplicates: true,
      })
    }

    const inDatabase = await prisma.bankTransaction.findMany({
      select: { transactionDate: true },
    })
    if (inDatabase.length === 0) {
      throw new Error('Nessun movimento bancario: né dal dump né dagli snapshot.')
    }
    console.log(`Movimenti bancari in gioco: ${inDatabase.length}\n`)

    const tempi = inDatabase.map((m) => m.transactionDate.getTime())
    const esito = await generaLotto({
      venueId: venue.id,
      dateFrom: new Date(Math.min(...tempi)),
      dateTo: new Date(Math.max(...tempi)),
      regole: ['R1', 'R2', 'R3'],
      userId: null,
    })

    console.log(
      `Lotto generato: ${esito.perFascia.alta} alte, ${esito.perFascia.media} medie, ` +
        `${esito.perFascia.bassa} basse\n`
    )

    const proposte = await prisma.reconciliationProposal.findMany({
      where: { batchId: esito.batchId },
      include: {
        gambe: { include: { schedule: { include: { invoice: true } } } },
        journalEntry: true,
        bankTransaction: true,
      },
      orderBy: { punteggio: 'desc' },
    })

    const da = Number(process.env.DA ?? 85)
    const a = Number(process.env.A ?? 100)
    const alte = proposte.filter((p) => {
      const n = Number(p.punteggio)
      return n >= da && n <= a
    })

    console.log('='.repeat(100))
    console.log(`PUNTEGGIO ${da}-${a} — ${alte.length} proposte`)
    console.log('='.repeat(100))

    for (const [i, p] of alte.entries()) {
      const mov = p.bankTransaction
      console.log(`\n[${i + 1}] punteggio ${Number(p.punteggio).toFixed(0)}`)
      console.log(
        `  MOVIMENTO  ${mov?.transactionDate.toISOString().slice(0, 10)}  ` +
          `${Number(mov?.amount).toFixed(2).padStart(10)}  ${(mov?.description ?? '').slice(0, 90)}`
      )
      for (const g of p.gambe) {
        const s = g.schedule
        const f = s?.invoice
        console.log(
          `  SCADENZA   ${s?.dataScadenza.toISOString().slice(0, 10)}  ` +
            `${Number(g.importo).toFixed(2).padStart(10)}  ${(s?.descrizione ?? '').slice(0, 60)}`
        )
        console.log(
          `             fattura ${f?.invoiceNumber ?? '—'}  ${f?.supplierName ?? '—'}  ` +
            `tot ${f ? Number(f.totalAmount).toFixed(2) : '—'}`
        )
      }
      // `fattori` e `motivazioni` sono JSON strutturati, non stringhe: sono
      // esattamente ciò che la scheda della schermata deve mostrare sotto la
      // barra dei punteggi, quindi qui si leggono nella loro forma.
      const fattori = p.fattori as Record<string, number> | null
      if (fattori) {
        console.log(
          `  FATTORI    ` +
            Object.entries(fattori)
              .map(([nome, valore]) => `${nome} ${valore}`)
              .join('  ·  ')
        )
      }
      const motivazioni = p.motivazioni as Array<{ testo: string; segno: string }> | null
      for (const m of motivazioni ?? []) {
        console.log(`  ${m.segno === '+' ? '✓' : '✗'}          ${m.testo}`)
      }
    }

    console.log(`\n${'='.repeat(100)}`)
    console.log(
      `Da giudicare a mano: ${alte.length} proposte in fascia Alta su ${proposte.length} totali.`
    )
    console.log(
      'Il criterio della spec: la fascia Alta dev\'essere corretta quasi al 100%.\n'
    )

    await prisma.$disconnect()
  } finally {
    console.log(`Il database "${dbName}" resta in piedi per ispezione. Per rimuoverlo:`)
    console.log(`  /opt/homebrew/opt/postgresql@16/bin/dropdb -h 127.0.0.1 -p 5433 ${dbName}\n`)
  }
}

main().catch((errore) => {
  console.error('\nMisura interrotta:', errore instanceof Error ? errore.message : errore)
  process.exit(1)
})
