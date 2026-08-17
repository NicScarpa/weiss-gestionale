import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseCSV, parseXLS, parseCBIXML, parseCBITXT, RELAXBANKING_CONFIG } from '@/lib/reconciliation'
import { importBatchSchema } from '@/lib/validations/reconciliation'
import { separaCausale } from '@/lib/banca/separa-causale'
import type { ImportResult, CSVParserConfig, ImportSource } from '@/types/reconciliation'
import { getVenueId } from '@/lib/venue'

import { logger } from '@/lib/logger'

/** Una riga dell'estratto conto, così come la restituiscono i parser. */
interface RigaEstratto {
  transactionDate: Date
  valueDate: Date | null
  description: string
  amount: number
  balance: number | null
  reference: string | null
}

/**
 * Deduplica dell'estratto conto.
 *
 * Il criterio precedente scartava ogni riga con stessa data, importo e
 * descrizione di una già a database. Ma due addebiti identici nello stesso
 * giorno — due commissioni da 2,50 €, due SDD uguali, due accrediti POS gemelli
 * — sono ordinaria amministrazione: il secondo spariva in silenzio e il saldo
 * ricostruito non tornava più con quello della banca.
 *
 * Quello che serve non è "somiglia a una riga già vista" ma "è la stessa riga
 * già importata", e la differenza sta nel *contare* le occorrenze. Ogni riga
 * riceve un riferimento derivato dal suo contenuto più il numero d'ordine
 * dell'occorrenza dentro il file: due righe identiche ottengono `…:0` e `…:1`,
 * distinte fra loro e stabili fra un import e l'altro. Reimportare lo stesso
 * file ricalcola gli stessi riferimenti, che risultano già presenti e vengono
 * saltati; un file che ne aggiunge una terza produce `…:2`, che è nuovo.
 *
 * Il riferimento è anche la chiave dell'indice unico
 * `ux_bank_transactions_sede_riferimento`: il criterio del codice e il vincolo
 * del database sono la stessa cosa, non due opinioni da tenere allineate.
 */
const PREFISSO_RIFERIMENTO_CALCOLATO = 'auto:'

/**
 * Giorno nel fuso del server, che è quello in cui i parser costruiscono le date
 * (`new Date(anno, mese, giorno)`). Formattarle in UTC sposterebbe di un giorno
 * le date dei fusi a est di Greenwich, e la stessa riga darebbe impronte
 * diverse a seconda di dove gira il server.
 */
function giorno(data: Date): string {
  const mese = String(data.getMonth() + 1).padStart(2, '0')
  const giornoDelMese = String(data.getDate()).padStart(2, '0')
  return `${data.getFullYear()}-${mese}-${giornoDelMese}`
}

/**
 * Impronta del contenuto di una riga. Si usa un digest e non la descrizione
 * troncata: il riferimento sintetico precedente tagliava a 50 caratteri, e due
 * righe che differivano solo dopo il cinquantesimo collidevano sul vincolo di
 * unicità facendo esplodere l'import a metà file.
 */
function improntaRiga(riga: RigaEstratto): string {
  // Separatore NUL, scritto come sequenza di escape: è l'unico carattere
  // che non può comparire dentro una descrizione bancaria, quindi due righe
  // non possono ottenere la stessa impronta spostando il confine fra i campi.
  // Va lasciato in forma di escape: un NUL incorporato nel sorgente lo
  // farebbe classificare come binario a git, e i diff diventerebbero opachi.
  const contenuto = [
    giorno(riga.transactionDate),
    riga.valueDate ? giorno(riga.valueDate) : '',
    riga.amount.toFixed(2),
    riga.description,
  ].join('\u0000')

  return createHash('sha256').update(contenuto).digest('hex').slice(0, 24)
}

/**
 * Riferimento nel formato usato prima di questo fix.
 *
 * Serve solo a riconoscere i movimenti già in archivio: senza, reimportare un
 * estratto conto caricato in passato non ritroverebbe nulla e duplicherebbe
 * tutto. La formula va lasciata identica all'originale, compreso l'uso di UTC
 * e il troncamento della descrizione, perché deve produrre le stesse stringhe
 * che stanno a database.
 */
function riferimentoStorico(riga: RigaEstratto): string {
  return `${riga.transactionDate.toISOString().slice(0, 10)}_${riga.amount}_${riga.description.slice(0, 50)}`
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 100)
}

interface RigaDaImportare {
  riga: RigaEstratto
  bankReference: string
}

interface EsitoDeduplica {
  daImportare: RigaDaImportare[]
  duplicati: number
}

/**
 * Decide quali righe del file sono nuove.
 *
 * Le righe con un riferimento vero della banca si riconoscono da quello: è
 * l'identificativo che la banca stessa garantisce unico, e due righe che lo
 * condividono sono la stessa operazione elencata due volte. Per tutte le altre
 * vale il conteggio delle occorrenze descritto sopra.
 */
async function deduplica(
  righe: RigaEstratto[],
  venueId: string,
  client: Pick<typeof prisma, 'bankTransaction'>
): Promise<EsitoDeduplica> {
  const occorrenze = new Map<string, number>()

  // Riferimento assegnato a ciascuna riga, più quello che la stessa riga
  // avrebbe avuto con la formula precedente: entrambi vanno cercati in archivio.
  const candidate = righe.map((riga) => {
    if (riga.reference) {
      return { riga, riferimento: riga.reference, storico: riga.reference }
    }

    const impronta = improntaRiga(riga)
    const occorrenza = occorrenze.get(impronta) ?? 0
    occorrenze.set(impronta, occorrenza + 1)

    return {
      riga,
      riferimento: `${PREFISSO_RIFERIMENTO_CALCOLATO}${impronta}:${occorrenza}`,
      // Con la formula vecchia le occorrenze successive alla prima venivano
      // scartate: a database ce n'è al massimo una, e solo la prima riga del
      // gruppo può corrispondervi.
      storico: occorrenza === 0 ? riferimentoStorico(riga) : null,
    }
  })

  const daCercare = [
    ...new Set(
      candidate.flatMap((c) => (c.storico ? [c.riferimento, c.storico] : [c.riferimento]))
    ),
  ]

  const presenti = new Set(
    (
      await client.bankTransaction.findMany({
        where: { venueId, bankReference: { in: daCercare } },
        select: { bankReference: true },
      })
    ).map((m) => m.bankReference)
  )

  const daImportare: RigaDaImportare[] = []
  let duplicati = 0

  for (const { riga, riferimento, storico } of candidate) {
    const giaInArchivio = presenti.has(riferimento) || (storico !== null && presenti.has(storico))

    if (giaInArchivio) {
      duplicati++
      continue
    }

    daImportare.push({ riga, bankReference: riferimento })
    // Un riferimento vero ripetuto nello stesso file è la stessa operazione
    // elencata due volte: la seconda comparsa va contata come duplicato.
    presenti.add(riferimento)
  }

  return { daImportare, duplicati }
}

// POST /api/bank-transactions/import - Import CSV/XLS
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const venueId = await getVenueId()
    const configJson = formData.get('config') as string | null
    const bankAccountIdRaw = formData.get('bankAccountId')

    if (!file) {
      return NextResponse.json(
        { error: 'Nessun file caricato' },
        { status: 400 }
      )
    }

    // Ogni riga dell'estratto conto appartiene a un conto: senza, non si
    // potrebbe sapere su quale bilancio incidono i movimenti importati.
    if (typeof bankAccountIdRaw !== 'string' || bankAccountIdRaw === '') {
      return NextResponse.json(
        { error: 'Indica il conto bancario a cui appartiene l\'estratto conto' },
        { status: 400 }
      )
    }
    const bankAccountId = bankAccountIdRaw

    const bankAccount = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, venueId, accountType: 'BANK' },
    })
    if (!bankAccount) {
      return NextResponse.json({ error: 'Conto bancario non trovato' }, { status: 404 })
    }

    // Determina tipo file
    const fileName = file.name.toLowerCase()
    const isXLS = fileName.endsWith('.xls') || fileName.endsWith('.xlsx')
    const isCSV = fileName.endsWith('.csv')
    const isXML = fileName.endsWith('.xml')
    const isTXT = fileName.endsWith('.txt')

    if (!isXLS && !isCSV && !isXML && !isTXT) {
      return NextResponse.json(
        { error: 'Formato file non supportato. Usa CSV, XLS, XLSX, XML o TXT.' },
        { status: 400 }
      )
    }

    // Determina source type
    let sourceType: ImportSource
    if (isXLS) {
      sourceType = 'XLSX'
    } else if (isXML) {
      sourceType = 'CBI_XML'
    } else if (isTXT) {
      sourceType = 'CBI_TXT'
    } else {
      sourceType = 'CSV'
    }

    // Validazione parametri
    const params = importBatchSchema.parse({
      venueId,
      source: sourceType,
      config: configJson ? JSON.parse(configJson) : undefined,
    })

    // Usa configurazione custom o default RelaxBanking
    const config: CSVParserConfig = (params.config || RELAXBANKING_CONFIG) as CSVParserConfig

    // Parsa il file
    let rows: Array<{
      transactionDate: Date
      valueDate: Date | null
      description: string
      amount: number
      balance: number | null
      reference: string | null
    }> = []
    let errors: Array<{ row: number; field: string; message: string; value?: string }> = []

    if (isXLS) {
      // Parsa XLS/XLSX
      const buffer = await file.arrayBuffer()
      const result = await parseXLS(buffer, config)
      rows = result.rows
      errors = result.errors
    } else if (isXML) {
      // Parsa CBI XML (ISO 20022 CAMT.053)
      const content = await file.text()
      const result = parseCBIXML(content)
      rows = result.rows
      errors = result.errors
    } else if (isTXT) {
      // Parsa CBI TXT (formato a posizioni fisse)
      const content = await file.text()
      const result = parseCBITXT(content)
      rows = result.rows
      errors = result.errors
    } else {
      // Parsa CSV
      const content = await file.text()
      const result = parseCSV(content, config)
      rows = result.rows
      errors = result.errors
    }

    if (rows.length === 0 && errors.length > 0) {
      return NextResponse.json(
        {
          error: 'Nessuna transazione valida trovata',
          errors,
        },
        { status: 400 }
      )
    }

    // Il file entra tutto o non entra affatto: batch, movimenti e conteggi in
    // una sola transazione. Prima il batch nasceva prima del ciclo e il ciclo
    // scriveva riga per riga fuori transazione — un errore a metà lasciava
    // metà estratto conto importato, un batch con `recordCount: 0` a
    // contraddirlo, e nessun modo di sapere dove si era fermato.
    const { batch, recordsImported, duplicatesSkipped } = await prisma.$transaction(
      async (tx) => {
        const { daImportare, duplicati } = await deduplica(rows, venueId, tx)

        const batch = await tx.importBatch.create({
          data: {
            venueId,
            filename: file.name,
            source: sourceType,
            recordCount: daImportare.length,
            duplicatesSkipped: duplicati,
            errorsCount: errors.length,
            importedBy: session.user.id,
          },
        })

        if (daImportare.length > 0) {
          await tx.bankTransaction.createMany({
            data: daImportare.map(({ riga, bankReference }) => ({
              venueId,
              bankAccountId,
              transactionDate: riga.transactionDate,
              valueDate: riga.valueDate,
              description: riga.description,
              // Il CSV non porta il codice operazione: vale la regola dell'asterisco.
              ...separaCausale(riga.description, null),
              amount: riga.amount,
              balanceAfter: riga.balance,
              bankReference,
              importBatchId: batch.id,
              importSource: sourceType,
              status: 'PENDING' as const,
            })),
          })
        }

        return {
          batch,
          recordsImported: daImportare.length,
          duplicatesSkipped: duplicati,
        }
      },
      // Un estratto conto mensile porta qualche centinaio di righe, scritte in
      // un solo comando: il tetto è largo per i file annuali, non per coprire
      // lavoro lento.
      { timeout: 30_000 }
    )

    const result: ImportResult = {
      batchId: batch.id,
      recordsImported,
      duplicatesSkipped,
      errors,
    }

    return NextResponse.json(result)
  } catch (error) {
    logger.error('POST /api/bank-transactions/import error', error)
    return NextResponse.json(
      { error: 'Errore nell\'import del file' },
      { status: 500 }
    )
  }
}
