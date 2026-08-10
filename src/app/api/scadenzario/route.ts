import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { applicaRegolaCreaMovimento } from '@/lib/schedule-rules/engine'
import { applicaStimaSuScadenza } from '@/lib/scadenzario/stima-data-attesa'
import { createAuditLog } from '@/lib/audit'
import { ScheduleStatus, ScheduleType, SchedulePriority, ScheduleDocumentType, ScheduleSource } from '@/types/schedule'
import { getVenueId } from '@/lib/venue'

/**
 * Colonne su cui la lista si lascia ordinare.
 *
 * L'elenco è chiuso e non coincide con le colonne del modello: `orderBy` prende
 * il nome della colonna dalla query string, e senza un elenco un valore
 * inventato fa sollevare Prisma (500 riproducibile a comando da chiunque sia
 * autenticato) mentre un valore indovinato ordina su colonne che il contratto
 * non ha mai promesso — e la differenza fra 500 e 200 dice al chiamante quali
 * colonne esistono davvero.
 */
const CAMPI_ORDINABILI = [
  'dataScadenza',
  'dataAttesa',
  'dataEmissione',
  'dataPagamento',
  'importoTotale',
  'importoPagato',
  'descrizione',
  'controparteNome',
  'numeroDocumento',
  'stato',
  'priorita',
  'tipo',
  'createdAt',
  'updatedAt',
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
 * Interi positivi della paginazione. `parseInt` su testo restituisce NaN, e un
 * NaN in `skip`/`take` fa fallire la query come un campo di ordinamento
 * sbagliato: stessa famiglia di guasto, stessa cura.
 */
function interoPositivo(valore: string | null, predefinito: number): number {
  const numero = Number(valore)
  if (!Number.isInteger(numero) || numero < 1) return predefinito
  return numero
}

// Schema validazione per creazione
const createScheduleSchema = z.object({
  tipo: z.nativeEnum(ScheduleType),
  descrizione: z.string().min(1, 'Descrizione obbligatoria'),
  importoTotale: z.number().positive('Importo totale deve essere positivo'),
  dataScadenza: z.coerce.date().or(z.string()),
  dataEmissione: z.coerce.date().or(z.string()).optional(),
  tipoDocumento: z.nativeEnum(ScheduleDocumentType).default(ScheduleDocumentType.ALTRO),
  numeroDocumento: z.string().optional(),
  riferimentoDocumento: z.string().optional(),
  controparteNome: z.string().optional(),
  controparteIban: z.string().optional(),
  supplierId: z.string().optional(),
  priorita: z.nativeEnum(SchedulePriority).default(SchedulePriority.NORMALE),
  metodoPagamento: z.enum(['bonifico', 'riba', 'sdd', 'carta', 'contanti', 'f24', 'assegno', 'bollettino', 'credito_fiscale', 'senza_incasso', 'altro']).optional(),
  isRicorrente: z.boolean().default(false),
  ricorrenzaTipo: z.enum(['settimanale', 'mensile', 'bimestrale', 'trimestrale', 'semestrale', 'annuale']).optional(),
  ricorrenzaFine: z.coerce.date().or(z.string()).optional(),
  ricorrenzaAttiva: z.boolean().default(true),
  note: z.string().optional(),
})

// GET /api/scadenzario - Lista scadenze con filtri
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)

    // Filtri
    const stato = searchParams.get('stato')
    const tipo = searchParams.get('tipo')
    const priorita = searchParams.get('priorita')
    // Origine: valore fuori enum ignorato, altrimenti la query non tornerebbe
    // mai nulla senza spiegare il perché a chi guarda la lista vuota
    const sourceParam = searchParams.get('source')
    const source = Object.values(ScheduleSource).includes(sourceParam as ScheduleSource)
      ? (sourceParam as ScheduleSource)
      : null
    const search = searchParams.get('search')
    const dataInizio = searchParams.get('dataInizio')
    const dataFine = searchParams.get('dataFine')
    const isRicorrente = searchParams.get('isRicorrente')
    const verificata = searchParams.get('verificata')
    const page = interoPositivo(searchParams.get('page'), 1)
    const limit = interoPositivo(searchParams.get('limit'), 50)

    const sortBy = searchParams.get('sortBy') || 'dataScadenza'
    const sortOrder = searchParams.get('sortOrder') || 'asc'

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

    // Venue isolation
    const venueId = await getVenueId()

    const where: Prisma.ScheduleWhereInput = { venueId }

    // Filro per stato
    if (stato) {
      where.stato = stato as ScheduleStatus
    }

    // Filro per tipo
    if (tipo) {
      where.tipo = tipo as ScheduleType
    }

    // Filro per priorità
    if (priorita) {
      where.priorita = priorita as SchedulePriority
    }

    // Filtro per origine
    if (source) {
      where.source = source
    }

    // Filro ricorrenze
    if (isRicorrente === 'true') {
      where.isRicorrente = true
    } else if (isRicorrente === 'false') {
      where.isRicorrente = false
    }

    // Filtro verifica: "un umano ha guardato", ortogonale allo stato
    if (verificata === 'true') {
      where.verificata = true
    } else if (verificata === 'false') {
      where.verificata = false
    }

    // Ricerca testuale
    if (search) {
      where.OR = [
        { descrizione: { contains: search, mode: 'insensitive' } },
        { controparteNome: { contains: search, mode: 'insensitive' } },
        { numeroDocumento: { contains: search, mode: 'insensitive' } },
        { riferimentoDocumento: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Filro range date
    if (dataInizio || dataFine) {
      where.dataScadenza = {}
      if (dataInizio) {
        where.dataScadenza.gte = new Date(dataInizio)
      }
      if (dataFine) {
        where.dataScadenza.lte = new Date(dataFine)
      }
    }

    const orderBy: Prisma.ScheduleOrderByWithRelationInput = { [sortBy]: sortOrder }

    // Count totale
    const total = await prisma.schedule.count({ where })

    // Query con paginazione
    const schedules = await prisma.schedule.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        payments: {
          orderBy: { dataPagamento: 'desc' },
          take: 5,
        },
      },
    })

    // Calcola importoResiduo per ogni schedule
    const schedulesWithResiduo = schedules.map(s => ({
      ...s,
      importoResiduo: Number(s.importoTotale) - Number(s.importoPagato),
    }))

    return NextResponse.json({
      data: schedulesWithResiduo,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        stato,
        tipo,
        priorita,
        source,
        search,
        dataInizio,
        dataFine,
        isRicorrente,
        verificata,
      },
    })
  } catch (error) {
    logger.error('Errore GET /api/scadenzario', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle scadenze' },
      { status: 500 }
    )
  }
}

// POST /api/scadenzario - Crea nuova scadenza
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = createScheduleSchema.parse(body)

    // Venue isolation
    const venueId = await getVenueId()

    // Se fornitore specificato, verificha esistenza
    if (validatedData.supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: validatedData.supplierId },
      })
      if (!supplier) {
        return NextResponse.json({ error: 'Fornitore non trovato' }, { status: 404 })
      }
    }

    // Verifica data scadenza
    const dataScadenza = new Date(validatedData.dataScadenza)
    const dataEmissione = validatedData.dataEmissione ? new Date(validatedData.dataEmissione) : null
    const ricorrenzaFine = validatedData.ricorrenzaFine ? new Date(validatedData.ricorrenzaFine) : null

    // Calcola prossima generazione per ricorrenze
    let ricorrenzaProssimaGenerazione = null
    if (validatedData.isRicorrente && validatedData.ricorrenzaTipo) {
      ricorrenzaProssimaGenerazione = calcolaProssimaGenerazione(
        dataScadenza,
        validatedData.ricorrenzaTipo
      )
    }

    const schedule = await prisma.schedule.create({
      data: {
        venueId,
        tipo: validatedData.tipo,
        descrizione: validatedData.descrizione,
        importoTotale: validatedData.importoTotale,
        dataScadenza,
        dataEmissione,
        tipoDocumento: validatedData.tipoDocumento,
        numeroDocumento: validatedData.numeroDocumento,
        riferimentoDocumento: validatedData.riferimentoDocumento,
        controparteNome: validatedData.controparteNome,
        controparteIban: validatedData.controparteIban,
        supplierId: validatedData.supplierId,
        priorita: validatedData.priorita,
        metodoPagamento: validatedData.metodoPagamento,
        isRicorrente: validatedData.isRicorrente,
        ricorrenzaTipo: validatedData.ricorrenzaTipo,
        ricorrenzaFine,
        ricorrenzaProssimaGenerazione,
        ricorrenzaAttiva: validatedData.ricorrenzaAttiva,
        note: validatedData.note,
        createdById: session.user.id,
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })

    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'Schedule',
      entityId: schedule.id,
      venueId,
      newValues: { tipo: validatedData.tipo, descrizione: validatedData.descrizione, importoTotale: validatedData.importoTotale },
    })

    // Le regole dello scadenzario possono saldare da sole la scadenza creando
    // il movimento sul conto bancario indicato: serve per contanti, POS e
    // addebiti automatici, che non arrivano mai da un estratto conto
    const regola = await applicaRegolaCreaMovimento({
      scheduleId: schedule.id,
      venueId,
      userId: session.user.id,
    })

    // La data attesa di cassa si stima dal ritardo storico del fornitore
    await applicaStimaSuScadenza(schedule.id, venueId)

    // Le automazioni possono aver toccato la scadenza: si rilegge sempre
    const aggiornata = await prisma.schedule.findUnique({ where: { id: schedule.id } })

    const finale = aggiornata ?? schedule

    return NextResponse.json({
      schedule: {
        ...finale,
        importoResiduo: Number(finale.importoTotale) - Number(finale.importoPagato),
      },
      regolaApplicata: regola.applicata,
    })
  } catch (error) {
    logger.error('Errore POST /api/scadenzario', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore nella creazione della scadenza' },
      { status: 500 }
    )
  }
}

// Helper per calcolare prossima generazione ricorrenza
function calcolaProssimaGenerazione(dataScadenza: Date, tipo: string): Date {
  const result = new Date(dataScadenza)

  switch (tipo) {
    case 'settimanale':
      result.setDate(result.getDate() + 7)
      break
    case 'mensile':
      result.setMonth(result.getMonth() + 1)
      break
    case 'bimestrale':
      result.setMonth(result.getMonth() + 2)
      break
    case 'trimestrale':
      result.setMonth(result.getMonth() + 3)
      break
    case 'semestrale':
      result.setMonth(result.getMonth() + 6)
      break
    case 'annuale':
      result.setFullYear(result.getFullYear() + 1)
      break
  }

  return result
}
