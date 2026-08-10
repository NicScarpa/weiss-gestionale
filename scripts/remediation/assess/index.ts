/**
 * Censimento in sola lettura dei dati contabili corrotti.
 *
 * Esegue i quattro controlli e produce due cose: un rapporto leggibile a
 * schermo, destinato al titolare, e un file JSON per ciascun controllo,
 * destinato agli script di bonifica che verranno dopo.
 *
 * Uso:
 *   DATABASE_URL="postgresql://…" npx tsx scripts/remediation/assess/index.ts
 *
 * NON SCRIVE NULLA. La connessione si apre in sola lettura e il server rifiuta
 * ogni tentativo di scrittura; si veda `lib/db.ts` per le cinque barriere che
 * lo garantiscono.
 */

import { SolaLettura } from './lib/db'
import { cartellaRapportiPredefinita, marcatoreEsecuzione, scriviRapporto } from './lib/rapporto'
import type { Censimento, Opzioni } from './lib/tipi'
import { intero, sezione, tabella, titolo, voci } from './lib/format'
import { censimentoMovimentiPagamento } from './a-movimenti-pagamento'
import { censimentoScadenzeDataPagamento } from './b-scadenze-data-pagamento'
import { censimentoDuplicatiUnicita } from './c-duplicati-unicita'
import { censimentoFornitoriDuplicati } from './d-fornitori-duplicati'

const CENSIMENTI: Censimento[] = [
  censimentoMovimentiPagamento,
  censimentoScadenzeDataPagamento,
  censimentoDuplicatiUnicita,
  censimentoFornitoriDuplicati,
]

const ESEMPI_PREDEFINITI = 10

interface Argomenti {
  aiuto: boolean
  url?: string
  esempi: number
  solo?: string[]
  scriviJson: boolean
  cartella?: string
}

function leggiArgomenti(argomenti: string[]): Argomenti {
  const letti: Argomenti = { aiuto: false, esempi: ESEMPI_PREDEFINITI, scriviJson: true }

  for (const argomento of argomenti) {
    if (argomento === '--aiuto' || argomento === '--help' || argomento === '-h') {
      letti.aiuto = true
    } else if (argomento.startsWith('--url=')) {
      letti.url = argomento.slice('--url='.length)
    } else if (argomento.startsWith('--esempi=')) {
      const valore = Number(argomento.slice('--esempi='.length))
      if (!Number.isInteger(valore) || valore < 1) {
        throw new Error(`--esempi vuole un intero positivo, ricevuto: ${argomento}`)
      }
      letti.esempi = valore
    } else if (argomento.startsWith('--solo=')) {
      letti.solo = argomento
        .slice('--solo='.length)
        .split(',')
        .map((voce) => voce.trim().toLowerCase())
        .filter((voce) => voce.length > 0)
    } else if (argomento.startsWith('--cartella=')) {
      letti.cartella = argomento.slice('--cartella='.length)
    } else if (argomento === '--senza-json') {
      letti.scriviJson = false
    } else {
      throw new Error(`Argomento non riconosciuto: ${argomento}. Usare --aiuto per l'elenco.`)
    }
  }

  return letti
}

function stampaAiuto(): void {
  console.log(
    [
      'Censimento in sola lettura dei dati contabili corrotti.',
      '',
      'Uso:',
      '  DATABASE_URL="postgresql://…" npx tsx scripts/remediation/assess/index.ts [opzioni]',
      '',
      'Opzioni:',
      '  --url=…         indirizzo del database, in alternativa a DATABASE_URL',
      '  --solo=a,c      esegue solo i controlli indicati (a, b, c, d)',
      '  --esempi=N      righe di esempio per raggruppamento (predefinito 10)',
      '  --cartella=…    dove depositare i file JSON (predefinito: ./report accanto agli script)',
      '  --senza-json    stampa soltanto, non scrive alcun file',
      '  --aiuto         questo messaggio',
      '',
      'Il comando non modifica alcun dato: la connessione è aperta in sola lettura',
      'e il server rifiuta ogni scrittura.',
      '',
      'Controlli disponibili:',
      ...CENSIMENTI.map((censimento) => `  ${censimento.lettera}  ${censimento.titolo}`),
    ].join('\n')
  )
}

function stampa(righe: string[]): void {
  console.log(righe.join('\n'))
}

async function principale(): Promise<number> {
  const argomenti = leggiArgomenti(process.argv.slice(2))

  if (argomenti.aiuto) {
    stampaAiuto()
    return 0
  }

  const url = argomenti.url ?? process.env.DATABASE_URL
  if (!url) {
    console.error(
      'Manca l\'indirizzo del database: valorizzare DATABASE_URL oppure passare --url=…'
    )
    return 1
  }

  const scelti = argomenti.solo
    ? CENSIMENTI.filter((censimento) => argomenti.solo?.includes(censimento.lettera))
    : CENSIMENTI

  if (scelti.length === 0) {
    console.error(`Nessun controllo corrisponde a --solo=${argomenti.solo?.join(',')}`)
    return 1
  }

  const opzioni: Opzioni = {
    esempi: argomenti.esempi,
    cartellaRapporti: argomenti.cartella ?? cartellaRapportiPredefinita(),
    esecuzione: marcatoreEsecuzione(),
    scriviJson: argomenti.scriviJson,
  }

  const db = new SolaLettura(url)
  const destinazione = db.destinazione()

  stampa([
    ...titolo('Censimento dei dati contabili corrotti — sola lettura'),
    '',
    ...voci([
      ['Eseguito il', new Date().toLocaleString('it-IT')],
      ['Database', `${destinazione.database} su ${destinazione.host}:${destinazione.porta}`],
      ['Utente', destinazione.utente],
      ['Controlli', scelti.map((censimento) => censimento.lettera).join(', ')],
    ]),
    '',
    'Nessun dato verrà modificato: la connessione si apre con il divieto di',
    'scrittura imposto dal server, tutto gira dentro una transazione di sola',
    'lettura e la transazione si chiude annullandosi.',
  ])

  await db.apri()

  const esiti: Array<{ censimento: Censimento; anomalie: number; percorso?: string }> = []

  try {
    for (const censimento of scelti) {
      const esito = await censimento.esegui(db, opzioni)
      stampa(esito.testo)

      let percorso: string | undefined
      if (opzioni.scriviJson) {
        percorso = scriviRapporto(opzioni.cartellaRapporti, censimento.nome, opzioni.esecuzione, {
          censimento: censimento.nome,
          lettera: censimento.lettera,
          titolo: censimento.titolo,
          descrizione: censimento.descrizione,
          esecuzione: opzioni.esecuzione,
          database: `${destinazione.database}@${destinazione.host}:${destinazione.porta}`,
          anomalie: esito.anomalie,
          ...esito.dati,
        })
      }

      esiti.push({ censimento, anomalie: esito.anomalie, percorso })
    }
  } finally {
    await db.chiudi()
  }

  stampa([
    ...titolo('Riepilogo'),
    '',
    ...tabella(
      [
        { etichetta: '', valore: (r: (typeof esiti)[number]) => `(${r.censimento.lettera})` },
        { etichetta: 'Controllo', valore: (r) => r.censimento.titolo, massimo: 52 },
        { etichetta: 'Anomalie', valore: (r) => intero(r.anomalie), allinea: 'dx' },
      ],
      esiti
    ),
  ])

  if (opzioni.scriviJson) {
    stampa([
      ...sezione('File depositati'),
      ...esiti
        .filter((esito) => esito.percorso)
        .map((esito) => `  ${esito.percorso}`),
      '',
      '  Contengono dati aziendali: restano fuori dal controllo di versione e non',
      '  vanno inviati per posta o allegati a un ticket.',
    ])
  }

  const totale = esiti.reduce((somma, esito) => somma + esito.anomalie, 0)
  stampa([
    '',
    totale === 0
      ? 'Nessuna anomalia rilevata.'
      : `Rilevate ${intero(totale)} anomalie complessive. Il passo successivo è la bonifica, che va decisa con il titolare.`,
    '',
  ])

  return 0
}

principale()
  .then((codice) => {
    process.exitCode = codice
  })
  .catch((errore: unknown) => {
    console.error('\nIl censimento si è interrotto.')
    console.error(errore instanceof Error ? errore.message : String(errore))
    process.exitCode = 1
  })
