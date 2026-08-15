import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseFatturaPASafe, calcolaImporti, estraiScadenze, estraiDatiEstesi } from '@/lib/sdi/parser'
import type { ParseWarning } from '@/lib/sdi/types'
import {
  matchSupplier,
  createSupplierFromData,
  findSupplierByVat,
  suggestAccountForSupplier,
  type SuggestedSupplierData,
} from '@/lib/sdi/matcher'
import { normalizzaPartitaIva } from '@/lib/invoices/partita-iva'
import { trackPricesFromInvoice } from '@/lib/price-tracking'
import {
  risolviContoDaRegole,
  tipoDocumentoDaCodiceSdi,
  tipoPagamentoDaCodiceSdi,
} from '@/lib/schedule-rules/engine'
import { ScheduleRuleDirection } from '@/types/schedule'
import { Prisma, InvoiceStatus } from '@prisma/client'
import { z } from 'zod'
import { getVenueId } from '@/lib/venue'
import { createAuditLog } from '@/lib/audit'

import { logger } from '@/lib/logger'
import {
  generateSchedulesFromInvoice,
  TIPI_DOCUMENTO_SENZA_SCADENZA,
  checkInvoiceDeletable,
  softDeleteSchedulesForInvoice,
} from '@/lib/services/invoice-schedule-service'
import { ricalcolaStimeFornitore } from '@/lib/scadenzario/stima-data-attesa'
import { categorizzaRigheFattura } from '@/lib/line-categorization'
/**
 * Colonne su cui la lista fatture si lascia ordinare, e versi ammessi.
 *
 * Il campo era già filtrato, il verso no: `?sortOrder=pippo` finiva in Prisma e
 * faceva rispondere 500. Entrambi ora sono elenchi chiusi, e un valore fuori
 * elenco è una richiesta sbagliata — non un errore del server, che ripetuto
 * basta a fare rumore nei log e a saturare le risorse.
 */
const CAMPI_ORDINABILI = [
  'documentType',
  'invoiceDate',
  'invoiceNumber',
  'supplierName',
  'totalAmount',
  'status',
  'importedAt',
] as const

type CampoOrdinabile = (typeof CAMPI_ORDINABILI)[number]

const VERSI_ORDINAMENTO = ['asc', 'desc'] as const

type VersoOrdinamento = (typeof VERSI_ORDINAMENTO)[number]

function isCampoOrdinabile(valore: string): valore is CampoOrdinabile {
  return (CAMPI_ORDINABILI as readonly string[]).includes(valore)
}

function isVersoOrdinamento(valore: string): valore is VersoOrdinamento {
  return (VERSI_ORDINAMENTO as readonly string[]).includes(valore)
}

/**
 * Interi positivi della paginazione: `parseInt` su testo dà NaN, e un NaN in
 * `skip`/`take` fa fallire la query come un ordinamento sbagliato.
 */
function interoPositivo(valore: string | null, predefinito: number): number {
  const numero = Number(valore)
  if (!Number.isInteger(numero) || numero < 1) return predefinito
  return numero
}

// Schema validazione import
const importInvoiceSchema = z.object({
  xmlContent: z.string().min(100, 'Contenuto XML non valido'),
  fileName: z.string().optional(),
  venueId: z.string().min(1, 'Sede richiesta'),
  // Dati fornitore (per conferma/creazione)
  createSupplier: z.boolean().default(false),
  supplierData: z
    .object({
      name: z.string(),
      vatNumber: z.string().nullable(),
      fiscalCode: z.string().nullable(),
      address: z.string().nullable(),
      city: z.string().nullable(),
      province: z.string().nullable(),
      postalCode: z.string().nullable(),
    })
    .optional(),
  supplierId: z.string().optional(),
  // Categorizzazione opzionale
  accountId: z.string().optional(),
  /** Cosa fare se la fattura è già in archivio. */
  politicaDuplicati: z.enum(['salta', 'sostituisci']).default('salta'),
  /**
   * Giorni di dilazione decisi dall'utente nella finestra dei conflitti.
   * Vincono sui termini dell'anagrafica, che a loro volta vincono sul default.
   */
  giorniPagamentoScelti: z.number().int().positive().max(365).optional(),
  /** Aggiorna i dati del fornitore già esistente con quelli del documento. */
  sovrascriviAnagrafica: z.boolean().default(false),
})

// GET /api/invoices - Lista fatture
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono vedere le fatture
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    // Letto come stringa, non come enum: il valore può essere uno stato oppure
    // «non_pagate», che stato non è. Il cast a InvoiceStatus arriva dopo il
    // ramo che lo traduce.
    const status = searchParams.get('status')
    const supplierId = searchParams.get('supplierId')
    const fromDate = searchParams.get('from')
    const toDate = searchParams.get('to')
    const page = interoPositivo(searchParams.get('page'), 1)
    const limit = interoPositivo(searchParams.get('limit'), 50)

    // Nuovi parametri per ricerca, filtro anno/mese, tipo documento e ordinamento
    const search = searchParams.get('search')
    const year = searchParams.get('year')
    const month = searchParams.get('month')
    const lastMonths = searchParams.get('lastMonths')
    const documentType = searchParams.get('documentType')
    const sortBy = searchParams.get('sortBy') || 'invoiceDate'
    const sortOrder = searchParams.get('sortOrder') || 'desc'

    if (!isCampoOrdinabile(sortBy)) {
      return NextResponse.json(
        {
          error: `Ordinamento non valido: "${sortBy}" non è una colonna ordinabile`,
          campiAmmessi: CAMPI_ORDINABILI,
        },
        { status: 400 }
      )
    }

    if (!isVersoOrdinamento(sortOrder)) {
      return NextResponse.json(
        {
          error: `Verso di ordinamento non valido: "${sortOrder}"`,
          versiAmmessi: VERSI_ORDINAMENTO,
        },
        { status: 400 }
      )
    }

    // Costruisci filtri
    const where: Prisma.ElectronicInvoiceWhereInput = {}

    // Single-venue mode: filter by venue
    const resolvedVenueId = await getVenueId()
    where.venueId = resolvedVenueId

    // «non_pagate» non è uno stato ma il suo complemento, e va tradotto qui:
    // finché passava dritto, Prisma riceveva un valore d'enum inesistente e
    // rispondeva con un errore di validazione. Era il filtro «Non registrate»
    // della lista fatture, rotto da prima di questa modifica.
    if (status === 'non_pagate') {
      where.status = { not: 'PAID' }
    } else if (status) {
      where.status = status as InvoiceStatus
    }

    if (supplierId) {
      where.supplierId = supplierId
    }

    // Filtro per tipo documento
    if (documentType) {
      where.documentType = documentType
    }

    // Ricerca globale su nome fornitore, numero fattura e P.IVA
    if (search && search.length >= 2) {
      where.OR = [
        { supplierName: { contains: search, mode: 'insensitive' } },
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { supplierVat: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Filtro per ultimi N mesi (ha priorità)
    if (lastMonths) {
      const monthsNum = parseInt(lastMonths)
      const now = new Date()
      const startDate = new Date(now.getFullYear(), now.getMonth() - monthsNum + 1, 1)
      where.invoiceDate = {
        gte: startDate,
      }
    }
    // Filtro per anno e mese (priorità su from/to)
    else if (year && year !== 'all') {
      const yearNum = parseInt(year)
      if (month && month !== 'all') {
        const monthNum = parseInt(month)
        // Filtro per anno e mese specifico
        const startDate = new Date(yearNum, monthNum - 1, 1)
        const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999)
        where.invoiceDate = {
          gte: startDate,
          lte: endDate,
        }
      } else {
        // Solo anno
        const startDate = new Date(yearNum, 0, 1)
        const endDate = new Date(yearNum, 11, 31, 23, 59, 59, 999)
        where.invoiceDate = {
          gte: startDate,
          lte: endDate,
        }
      }
    } else if (fromDate || toDate) {
      // Fallback ai filtri from/to esistenti
      where.invoiceDate = {}
      if (fromDate) {
        where.invoiceDate.gte = new Date(fromDate)
      }
      if (toDate) {
        where.invoiceDate.lte = new Date(toDate)
      }
    }

    // Costruisci ordinamento dinamico
    const orderBy: Prisma.ElectronicInvoiceOrderByWithRelationInput[] = [
      { [sortBy]: sortOrder },
    ]
    // Aggiungi ordinamento secondario se non è già invoiceDate
    if (sortBy !== 'invoiceDate') {
      orderBy.push({ invoiceDate: 'desc' })
    }

    // Query con paginazione
    const [invoices, total] = await Promise.all([
      prisma.electronicInvoice.findMany({
        where,
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          supplierVat: true,
          supplierName: true,
          totalAmount: true,
          vatAmount: true,
          netAmount: true,
          status: true,
          fileName: true,
          importedAt: true,
          // Nuovi campi (PRD Phase 1)
          documentType: true,
          lineItems: true,
          references: true,
          vatSummary: true,
          causale: true,
          // Relazioni
          supplier: {
            select: {
              id: true,
              name: true,
              vatNumber: true,
            },
          },
          account: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          venue: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          deadlines: {
            orderBy: { dueDate: 'asc' },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.electronicInvoice.count({ where }),
    ])

    return NextResponse.json({
      data: invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        search,
        year,
        month,
        documentType,
        sortBy,
        sortOrder,
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/invoices', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle fatture' },
      { status: 500 }
    )
  }
}

/**
 * Cerca una fattura già importata con la stessa terna (numero, data, P.IVA).
 *
 * La P.IVA viene confrontata anche senza zeri iniziali: le fatture importate
 * prima della normalizzazione le hanno perse, e senza questa variante lo stesso
 * documento risulterebbe nuovo. L'indice unico del database
 * (`ux_electronic_invoices_numero_data_piva`) non può fare altrettanto, per
 * questo il controllo applicativo resta anche ora che c'è il vincolo: sono due
 * reti a maglie diverse, non una ridondanza.
 */
async function trovaFatturaEsistente(
  invoiceNumber: string,
  invoiceDate: Date,
  supplierVat: string
) {
  return prisma.electronicInvoice.findFirst({
    where: {
      invoiceNumber,
      invoiceDate,
      OR: [
        { supplierVat },
        { supplierVat: normalizzaPartitaIva(supplierVat) },
      ],
    },
  })
}

// POST /api/invoices - Import fattura XML
export async function POST(request: NextRequest) {
  /**
   * Identità del documento in lavorazione, leggibile anche dal `catch`: serve a
   * ritrovare la fattura quando il duplicato concorrente viene fermato dal
   * database, senza riparsare l'XML.
   */
  let fatturaInCorso: { numero: string; data: Date; partitaIva: string } | null = null

  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // Solo admin e manager possono importare fatture
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = importInvoiceSchema.parse(body)

    // Override venueId with single-venue value
    validatedData.venueId = await getVenueId()

    // Parse XML con error handling strutturato
    const parseResult = parseFatturaPASafe(validatedData.xmlContent, validatedData.fileName)

    if (!parseResult.success || !parseResult.data) {
      // Restituisci errori strutturati
      const errorMessages = parseResult.errors
        .map(e => `[${e.code}] ${e.field}: ${e.message}`)
        .join('; ')
      return NextResponse.json(
        {
          error: `Errore nel parsing della fattura: ${errorMessages}`,
          parseErrors: parseResult.errors,
        },
        { status: 400 }
      )
    }

    const fattura = parseResult.data
    const parseWarnings: ParseWarning[] = parseResult.warnings

    // Verifica se la fattura esiste già
    fatturaInCorso = {
      numero: fattura.numero,
      data: new Date(fattura.data),
      partitaIva: fattura.cedentePrestatore.partitaIva,
    }

    const existingInvoice = await trovaFatturaEsistente(
      fatturaInCorso.numero,
      fatturaInCorso.data,
      fatturaInCorso.partitaIva
    )

    // Chi ha già una fattura in archivio decide cosa farne nella finestra dei
    // conflitti: «salta» mantiene il comportamento di sempre (409), «sostituisci»
    // archivia la vecchia — mai cancellata, è una scrittura contabile — e lascia
    // proseguire l'import come se il duplicato non ci fosse.
    //
    // «Sostituisci» è, di fatto, un delete-e-reimporta: usa perciò la stessa
    // guardia di DELETE /api/invoices/[id] e di bulk-delete, non una nuova.
    // Una fattura già registrata in prima nota, o con pagamenti già segnati
    // sulle sue scadenze, non si sostituisce a metà — si scollegherebbe un
    // pagamento realmente uscito dal conto dal documento che lo giustifica.
    // L'archiviazione vera e propria (fattura + sue scadenze) avviene dentro
    // la transazione più sotto, insieme alla creazione della nuova: fuori da
    // lì, un fallimento a valle lascerebbe il documento senza alcuna fattura
    // attiva — né la vecchia (già archiviata) né la nuova (mai creata). È
    // esattamente il guasto per cui esiste il commento sulla transazione qui
    // sotto, «nascono insieme o non nascono affatto».
    let idSostituita: string | null = null

    if (existingInvoice) {
      if (validatedData.politicaDuplicati === 'salta') {
        return NextResponse.json(
          {
            error: 'Fattura già importata',
            existingId: existingInvoice.id,
          },
          { status: 409 }
        )
      }

      if (existingInvoice.status === 'PAID') {
        return NextResponse.json(
          {
            error: 'Impossibile sostituire: la fattura già importata risulta pagata',
            existingId: existingInvoice.id,
          },
          { status: 409 }
        )
      }

      const sostituzioneCheck = await checkInvoiceDeletable(existingInvoice.id)
      if (!sostituzioneCheck.canDelete) {
        return NextResponse.json(
          {
            error:
              'Impossibile sostituire: sulla fattura già importata risultano pagamenti già registrati nello scadenzario. Annulla prima i pagamenti.',
            existingId: existingInvoice.id,
            scadenzeConPagamenti: sostituzioneCheck.schedulesWithPayments,
          },
          { status: 409 }
        )
      }

      idSostituita = existingInvoice.id
    }

    // Gestione fornitore
    let supplierId: string | null = null
    let supplierNameForInvoice = fattura.cedentePrestatore.denominazione // Default name from XML
    let status: InvoiceStatus = 'IMPORTED'
    // Alimenta «Fornitori creati» nella verifica di integrità (Task 11): vero
    // solo quando questo import ha davvero inserito una riga Supplier nuova,
    // non quando ne ha semplicemente trovata una già esistente.
    let fornitoreCreato = false
    // Un fornitore già in anagrafica, sia scelto esplicitamente sia trovato
    // dal match automatico — mai quello appena creato, che ha già i dati del
    // documento. È il "ramo in cui il fornitore viene trovato" a cui si
    // applica `sovrascriviAnagrafica`.
    let fornitoreTrovatoId: string | null = null

    if (validatedData.supplierId) {
      // Fornitore specificato dall'utente
      const supplier = await prisma.supplier.findUnique({
        where: { id: validatedData.supplierId },
      })
      if (supplier) {
        supplierId = supplier.id
        supplierNameForInvoice = supplier.name // Use DB name
        status = 'MATCHED'
        fornitoreTrovatoId = supplier.id
      }
    } else if (validatedData.createSupplier && validatedData.supplierData) {
      // Crea nuovo fornitore con i dati corretti a mano dall'utente: quando
      // arrivano dal client vincono sempre sui dati del documento, è il caso
      // in cui l'anteprima aveva sbagliato qualcosa e l'utente l'ha
      // sistemato prima di confermare. `createSupplierFromData` ritorna
      // quello già esistente se la P.IVA/C.F. combaciano (evita duplicati
      // anche su una corsa concorrente): il controllo qui, appena prima, è
      // l'unico modo di sapere se la riga è davvero nuova — il dato che
      // alimenta «fornitoreCreato» nella risposta.
      const supplierData = validatedData.supplierData as SuggestedSupplierData
      const preesistente =
        supplierData.vatNumber || supplierData.fiscalCode
          ? await findSupplierByVat(supplierData.vatNumber, supplierData.fiscalCode)
          : null
      const newSupplier = await createSupplierFromData(supplierData)
      supplierId = newSupplier.id
      supplierNameForInvoice = newSupplier.name // Use new supplier name
      status = 'MATCHED'
      fornitoreCreato = !preesistente
    } else if (validatedData.createSupplier) {
      // `createSupplier: true` senza `supplierData`: il wizard nuovo (Task
      // 12) calcola l'anteprima nel browser e non chiede più al server un
      // `suggestedData` da rimandargli indietro, come facevano i due dialog
      // che sostituisce. Il client non deve rimandare dati che il server già
      // possiede: qui l'XML è già stato riparsato, `fattura.cedentePrestatore`
      // è per intero sotto mano, ed è esattamente ciò che serve a
      // `matchSupplier` per costruire `suggestedData`.
      //
      // Prima di questo fix la condizione del ramo sopra (che richiede
      // `supplierData`) era sempre falsa per il wizard nuovo: 226 fatture
      // importate dal campo, 0 fornitori creati, `supplierId` sempre NULL.
      //
      // Si tenta prima il match: due fatture dello stesso fornitore non
      // devono creare due anagrafiche, e `matchSupplier` lo garantisce
      // cercando per P.IVA/C.F. prima di suggerire una creazione.
      const match = await matchSupplier(fattura)
      if (match.matched && match.supplier) {
        supplierId = match.supplier.id
        supplierNameForInvoice = match.supplier.name
        status = 'MATCHED'
        fornitoreTrovatoId = match.supplier.id
      } else {
        const newSupplier = await createSupplierFromData(match.suggestedData)
        supplierId = newSupplier.id
        supplierNameForInvoice = newSupplier.name
        status = 'MATCHED'
        fornitoreCreato = true
      }
    } else {
      // Cerca match automatico
      const match = await matchSupplier(fattura)
      if (match.matched && match.supplier) {
        supplierId = match.supplier.id
        supplierNameForInvoice = match.supplier.name // Use matched DB name
        status = 'MATCHED'
        fornitoreTrovatoId = match.supplier.id
      }
    }

    // La finestra dei conflitti (Task 9) può chiedere di rinfrescare
    // l'anagrafica del fornitore già a database con quella del documento
    // appena letto: indirizzo e sede cambiano più spesso di quanto si
    // aggiorni a mano. Non si applica al fornitore appena creato, che ha
    // già questi stessi dati.
    if (fornitoreTrovatoId && validatedData.sovrascriviAnagrafica) {
      const sede = fattura.cedentePrestatore.sede
      await prisma.supplier.update({
        where: { id: fornitoreTrovatoId },
        data: {
          address: sede.indirizzo || undefined,
          city: sede.comune || undefined,
          province: sede.provincia || undefined,
          postalCode: sede.cap || undefined,
          fiscalCode: fattura.cedentePrestatore.codiceFiscale || undefined,
        },
      })
    }

    // Categorizzazione, in tre gradini di precedenza: la scelta esplicita del
    // client, poi il conto abituale del fornitore, poi le regole dello
    // scadenzario. È l'ordine che i due dialog sostituiti dal wizard avevano
    // di fatto: chiedevano al server un'anteprima, ne prendevano il conto
    // suggerito — cioè proprio `suggestAccountForSupplier` — e lo rimandavano
    // qui come `accountId`.
    let accountId: string | null = validatedData.accountId || null
    let regolaApplicata: { ruleId: string; azione: string } | null = null

    if (accountId) {
      // Verifica che il conto esista
      const account = await prisma.account.findUnique({
        where: { id: accountId },
      })
      if (account) {
        status = 'CATEGORIZED'
      }
    } else if (supplierId) {
      // Il conto predefinito del fornitore (o, in mancanza, quello della sua
      // ultima fattura categorizzata). Viene prima delle regole perché sa una
      // cosa che le regole non sanno: *chi* ha emesso il documento. Le regole
      // ragionano per tipo documento e tipo pagamento, quindi non possono
      // distinguere due fornitori che vanno su conti diversi.
      //
      // Senza questo gradino una fattura di un fornitore con il conto
      // assegnato a mano arrivava senza conto di testata, e
      // `POST /api/invoices/[id]/record` la rifiutava con «Assegna prima un
      // conto alla fattura»: su un lotto da 226 fatture, lavoro a mano che
      // prima non c'era.
      const contoDelFornitore = await suggestAccountForSupplier(supplierId)
      if (contoDelFornitore) {
        accountId = contoDelFornitore
        status = 'CATEGORIZED'
        logger.info('Conto assegnato dal fornitore', {
          invoiceNumber: fattura.numero,
          supplierId,
          contoId: contoDelFornitore,
        })
      }
    }

    if (!accountId) {
      // Nessun conto indicato: decidono le regole dello scadenzario.
      // Le fatture elettroniche importate qui sono documenti ricevuti
      // (il cedente/prestatore è il fornitore).
      const direzione = ScheduleRuleDirection.RICEVUTI
      // Con più rate si usa la modalità della prima: le regole ragionano sul
      // documento, non sulla singola scadenza.
      const modalitaPagamento = fattura.datiPagamento?.dettagliPagamento?.[0]?.modalitaPagamento

      const contoDaRegola = await risolviContoDaRegole({
        venueId: validatedData.venueId,
        direzione,
        tipoDocumento: tipoDocumentoDaCodiceSdi(fattura.tipoDocumento, direzione),
        tipoPagamento: tipoPagamentoDaCodiceSdi(modalitaPagamento),
      })

      if (contoDaRegola) {
        accountId = contoDaRegola.contoId
        status = 'CATEGORIZED'
        regolaApplicata = { ruleId: contoDaRegola.ruleId, azione: contoDaRegola.azione }
        logger.info('Conto assegnato da regola scadenzario', {
          invoiceNumber: fattura.numero,
          ruleId: contoDaRegola.ruleId,
          contoId: contoDaRegola.contoId,
          azione: contoDaRegola.azione,
        })
      }
    }

    // Calcola importi
    const importi = calcolaImporti(fattura)

    // Estrai scadenze usando i termini di pagamento del fornitore, se noti:
    // senza, la stima ricade sul termine ordinario di 30 giorni
    const terminiFornitore = supplierId
      ? (
          await prisma.supplier.findUnique({
            where: { id: supplierId },
            select: { paymentTermsDays: true },
          })
        )?.paymentTermsDays ?? undefined
      : undefined

    // Due parametri diversi, non uno solo: `giorniPagamento` (termini del
    // fornitore) vale solo per STIMARE una scadenza che il documento non
    // riporta — una data scritta in fattura vince comunque su di lui.
    // `giorniImposti` (la scelta esplicita fatta nella finestra dei
    // conflitti) vince SEMPRE, anche sulla data del documento: è la
    // differenza fra «il fornitore non ha scritto nulla, stimiamo coi suoi
    // termini» e «il fornitore ha scritto 30 giorni, ma con noi sono 60».
    const scadenze = estraiScadenze(fattura, {
      giorniPagamento: terminiFornitore,
      giorniImposti: validatedData.giorniPagamentoScelti,
    })

    // Estrai IBAN dai dati pagamento (se disponibile)
    const extractIban = (index: number): string | null => {
      const dettagli = fattura.datiPagamento?.dettagliPagamento
      if (dettagli && dettagli[index]) {
        return dettagli[index].iban || null
      }
      return null
    }

    // Estrai dati estesi per salvataggio JSON
    let datiEstesi
    try {
      datiEstesi = estraiDatiEstesi(validatedData.xmlContent)
    } catch (extendedError) {
      logger.warn('Errore estrazione dati estesi', { error: extendedError })
      // Non blocchiamo l'import se l'estrazione estesa fallisce
      datiEstesi = null
    }

    // Documento, rate e scadenze nascono insieme o non nascono affatto.
    //
    // Prima le scadenze si generavano dopo, fuori transazione, e il loro errore
    // veniva solo scritto a log: la fattura restava a database senza scadenze,
    // invisibile nel calendario e nel saldo scalare, e il re-import rispondeva
    // "già importata" — nessun modo di rimediare se non a mano sul database.
    const { invoice, schedulesResult } = await prisma.$transaction(
      async (tx) => {
        // Prima si archivia la vecchia (fattura e sue scadenze), poi si crea
        // la nuova: l'indice unico parziale su (numero, data, P.IVA) esclude
        // solo le righe con `deletedAt` valorizzato, quindi la create qui
        // sotto urterebbe ancora contro la vecchia se non fosse già archiviata
        // — anche dentro la stessa transazione, il vincolo si controlla ad
        // ogni istruzione, non solo al commit.
        if (idSostituita) {
          await softDeleteSchedulesForInvoice(idSostituita, session.user.id, tx)
          await tx.electronicInvoice.update({
            where: { id: idSostituita },
            data: { deletedAt: new Date(), deletedById: session.user.id },
          })
        }

        const invoice = await tx.electronicInvoice.create({
          data: {
            invoiceNumber: fattura.numero,
            invoiceDate: new Date(fattura.data),
            supplierVat: fattura.cedentePrestatore.partitaIva,
            supplierName: supplierNameForInvoice, // Use normalized name
            totalAmount: new Prisma.Decimal(importi.totalAmount.toFixed(2)),
            vatAmount: new Prisma.Decimal(importi.vatAmount.toFixed(2)),
            netAmount: new Prisma.Decimal(importi.netAmount.toFixed(2)),
            status,
            supplierId,
            accountId,
            xmlContent: validatedData.xmlContent,
            fileName: validatedData.fileName || null,
            venueId: validatedData.venueId,
            createdBy: session.user.id,
            // Nuovi campi estesi (Phase 1 PRD)
            documentType: datiEstesi?.documentType || fattura.tipoDocumento || 'TD01',
            lineItems: (datiEstesi?.lineItems ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue,
            references: (datiEstesi?.references ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue,
            vatSummary: (datiEstesi?.vatSummary ?? Prisma.DbNull) as unknown as Prisma.InputJsonValue,
            withholding: fattura.datiRitenuta as unknown as Prisma.InputJsonValue | undefined,
            causale: datiEstesi?.causale || null,
            deadlines: {
              create: scadenze.map((s, index) => ({
                dueDate: s.dueDate,
                amount: new Prisma.Decimal(s.amount.toFixed(2)),
                paymentMethod: s.paymentMethod,
                iban: extractIban(index),
              })),
            },
          },
          include: {
            supplier: true,
            account: true,
            venue: true,
            deadlines: true,
          },
        })

        // Porta le rate della fattura nello scadenzario: senza questo passaggio
        // resterebbero dentro il documento e non comparirebbero nel calendario,
        // nel saldo scalare o nell'aging.
        const schedulesResult = await generateSchedulesFromInvoice(
          {
            id: invoice.id,
            venueId: invoice.venueId,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate,
            documentType: invoice.documentType,
            supplierId: invoice.supplierId,
            supplierName: invoice.supplierName,
            deadlines: invoice.deadlines.map((d) => ({
              id: d.id,
              dueDate: d.dueDate,
              amount: d.amount,
              paymentMethod: d.paymentMethod,
              // InvoiceDeadline non ha una colonna per la stima: la nota si
              // recupera dalle rate appena estratte, correlate per data e importo
              notaStima: scadenze.find(
                (s) =>
                  s.dueDate.getTime() === d.dueDate.getTime() &&
                  Math.abs(s.amount - Number(d.amount)) < 0.01
              )?.notaStima,
            })),
          },
          session.user.id,
          tx
        )

        return { invoice, schedulesResult }
      },
      // Parsing e scritture accessorie stanno fuori: qui restano una create con
      // le rate annidate e una scadenza per rata. Il tetto è largo per i
      // documenti con molte rate, non per coprire lavoro lento.
      { timeout: 15_000 }
    )

    // Nota di credito (o di debito): risolve quale fattura rettifica, dopo la
    // creazione perché serve l'id già assegnato. Il collegamento vive
    // nell'XML (`datiFattureCollegate`) ma si persiste qui una volta sola —
    // il calcolo dei pesi alla riconciliazione (Task 6) lo interroga una
    // volta per fattura, non una volta per riga a ogni lettura.
    //
    // Non trovata non è un errore: la fattura rettificata può semplicemente
    // non essere ancora stata importata (la nota spesso arriva prima). La
    // nota resta comunque salvata con `rettificaInvoiceId: null` — E RESTA
    // COSÌ: non esiste oggi un percorso che ritenti la risoluzione più tardi.
    // Task 7 rileva la divergenza fra fette e imputazioni correnti, non
    // ri-risolve questo collegamento — una nota importata prima della sua
    // fattura resta scollegata per sempre, finché non si scrive quel
    // percorso separatamente.
    //
    // Più di un riferimento nell'XML: si usa il primo. Una nota che rettifica
    // più fatture insieme non è rappresentabile da un `rettificaInvoiceId`
    // singolo — un caso raro, fuori perimetro dichiarato nella spec.
    //
    // In un try/catch dedicato, come il tracking prezzi qui sotto: la fattura
    // è già salvata, un errore qui non deve trasformare un import riuscito in
    // una risposta di errore.
    if (datiEstesi && TIPI_DOCUMENTO_SENZA_SCADENZA.has(invoice.documentType ?? '')) {
      try {
        const riferimento = datiEstesi.references.datiFattureCollegate[0]
        if (riferimento) {
          // Numero + P.IVA da soli non sono una chiave: la rinumerazione
          // annuale delle fatture è la norma, e lo stesso fornitore può avere
          // legittimamente due fatture "1" in due anni diversi (la spec,
          // §4, chiede "quel numero e quella data" — il brief l'aveva
          // riassunto omettendo la data). Quando l'XML la porta si include
          // nella query, che così torna a essere la stessa terna di
          // `trovaFatturaEsistente`. Quando manca — non tutte le fatture
          // collegate la riportano — resta l'ambiguità: si sceglie la più
          // recente con un `orderBy` esplicito (mai l'ordine arbitrario del
          // database) e si segnala se i candidati sono più di uno.
          const dove: Prisma.ElectronicInvoiceWhereInput = {
            invoiceNumber: riferimento.idDocumento,
            // Stessa normalizzazione di trovaFatturaEsistente: le fatture
            // importate prima della normalizzazione hanno perso gli zeri
            // iniziali della P.IVA.
            OR: [
              { supplierVat: invoice.supplierVat },
              { supplierVat: normalizzaPartitaIva(invoice.supplierVat) },
            ],
          }
          if (riferimento.data) {
            dove.invoiceDate = new Date(riferimento.data)
          }

          const candidati = await prisma.electronicInvoice.findMany({
            where: dove,
            select: { id: true },
            orderBy: [{ invoiceDate: 'desc' }, { id: 'asc' }],
          })

          if (candidati.length === 0) {
            logger.info('Nota di credito: fattura rettificata non trovata (forse non ancora importata)', {
              invoiceId: invoice.id,
              numeroCercato: riferimento.idDocumento,
              dataCercata: riferimento.data ?? null,
              supplierVat: invoice.supplierVat,
            })
          } else {
            if (candidati.length > 1) {
              logger.warn('Nota di credito: più fatture candidate per numero e fornitore, presa la più recente', {
                invoiceId: invoice.id,
                numeroCercato: riferimento.idDocumento,
                supplierVat: invoice.supplierVat,
                candidati: candidati.length,
              })
            }
            await prisma.electronicInvoice.update({
              where: { id: invoice.id },
              data: { rettificaInvoiceId: candidati[0].id },
            })
          }
        }
      } catch (error) {
        logger.error('Errore nella risoluzione della fattura rettificata dalla nota di credito', error, {
          invoiceId: invoice.id,
        })
      }
    }

    // Le nuove rate del fornitore ereditano la stima del suo ritardo storico
    if (schedulesResult.created > 0 && invoice.supplierId) {
      await ricalcolaStimeFornitore(invoice.supplierId, invoice.venueId)
    }

    // Traccia l'automatismo: il conto non è stato scelto da chi ha importato
    if (regolaApplicata) {
      await createAuditLog({
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'ElectronicInvoice',
        entityId: invoice.id,
        venueId: validatedData.venueId,
        newValues: {
          accountId,
          appliedScheduleRuleId: regolaApplicata.ruleId,
          azione: regolaApplicata.azione,
          origine: 'regola_scadenzario',
        },
      })
    }

    // Track prezzi articoli dalla fattura (se c'è un fornitore associato)
    let priceTrackingResult = null
    if (supplierId && fattura.dettaglioLinee.length > 0) {
      try {
        priceTrackingResult = await trackPricesFromInvoice({
          venueId: validatedData.venueId,
          supplierId,
          invoiceId: invoice.id,
          invoiceNumber: fattura.numero,
          invoiceDate: new Date(fattura.data),
          lineItems: fattura.dettaglioLinee.map((line) => ({
            description: line.descrizione,
            code: null, // FatturaPA non ha sempre un codice articolo
            quantity: line.quantita || 1,
            unitPrice: line.prezzoUnitario,
            totalPrice: line.prezzoTotale,
            unit: line.unitaMisura || null,
          })),
        })
      } catch (priceError) {
        logger.error('Errore tracking prezzi', priceError)
        // Non blocchiamo l'import se il tracking fallisce
      }
    }

    // Proposta delle imputazioni per riga: memoria del fornitore + AI.
    //
    // NON si aspetta. La fattura è già salvata — la transazione si è chiusa
    // sopra — e far attendere il browser una chiamata a pagamento significava
    // che, con il servizio esterno lento o irraggiungibile, chi aveva caricato
    // la fattura vedeva un import fallito, ricaricava lo stesso file e si
    // sentiva rispondere «fattura già importata». Il lavoro era andato a buon
    // fine ed era impossibile capirlo.
    //
    // Le imputazioni compaiono poco dopo, da sole. La pipeline è best-effort e
    // non lancia mai, ma il `catch` c'è lo stesso: una promessa non attesa che
    // rifiutasse abbatterebbe il processo Node.
    void categorizzaRigheFattura({ invoiceId: invoice.id }).catch((err) =>
      logger.error('Categorizzazione righe fattura fallita', err, { invoiceId: invoice.id })
    )

    return NextResponse.json(
      {
        ...invoice,
        priceTracking: priceTrackingResult,
        scadenzeGenerate: schedulesResult.created,
        // Warning dal parsing (tipo documento non riconosciuto, P.IVA non standard, etc.)
        parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined,
        fornitoreCreato,
        ...(idSostituita ? { sostituisce: idSostituita } : {}),
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    // Doppio invio arrivato in contemporanea: il controllo iniziale l'ha visto
    // nuovo in entrambe le richieste, ed è stato l'indice unico del database a
    // fermare la seconda. È lo stesso esito del controllo applicativo — la
    // fattura c'è già — e va detto allo stesso modo, non come guasto del
    // server: chi ha premuto due volte deve ritrovarsi la fattura, non un 500.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      fatturaInCorso
    ) {
      const gia = await trovaFatturaEsistente(
        fatturaInCorso.numero,
        fatturaInCorso.data,
        fatturaInCorso.partitaIva
      )

      logger.info('Import concorrente della stessa fattura fermato dal vincolo unico', {
        invoiceNumber: fatturaInCorso.numero,
        existingId: gia?.id,
      })

      return NextResponse.json(
        { error: 'Fattura già importata', existingId: gia?.id ?? null },
        { status: 409 }
      )
    }

    logger.error('Errore POST /api/invoices', error)
    return NextResponse.json(
      { error: 'Errore nell\'importazione della fattura' },
      { status: 500 }
    )
  }
}
