import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { ScheduleStatus, ScheduleType, SchedulePriority, ScheduleDocumentType, ScheduleSource } from '@/types/schedule'
import { getVenueId } from '@/lib/venue'

// Schema validazione per creazione
const createScheduleSchema = z.object({
  tipo: z.nativeEnum(ScheduleType),
  descrizione: z.string().min(1, 'Descrizione obbligatoria'),
  importoTotale: z.number().positive('Importo totale deve essere positivo'),
  valuta: z.string().default('EUR'),
  dataScadenza: z.coerce.date().or(z.string()),
  dataEmissione: z.coerce.date().or(z.string()).optional(),
  tipoDocumento: z.nativeEnum(ScheduleDocumentType).default(ScheduleDocumentType.ALTRO),
  numeroDocumento: z.string().optional(),
  riferimentoDocumento: z.string().optional(),
  controparteNome: z.string().optional(),
  controparteIban: z.string().optional(),
  supplierId: z.string().optional(),
  priorita: z.nativeEnum(SchedulePriority).default(SchedulePriority.NORMALE),
  metodoPagamento: z.enum(['bonifico', 'riba', 'sdd', 'carta', 'contanti', 'f24', 'altro']).optional(),
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

    const { searchParams } = new URL(request.url)

    // Filtri
    const stato = searchParams.get('stato')
    const tipo = searchParams.get('tipo')
    const priorita = searchParams.get('priorita')
    const search = searchParams.get('search')
    const dataInizio = searchParams.get('dataInizio')
    const dataFine = searchParams.get('dataFine')
    const isRicorrente = searchParams.get('isRicorrente')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const sortBy = searchParams.get('sortBy') || 'dataScadenza'
    const sortOrder = searchParams.get('sortOrder') || 'asc'

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

    // Filro ricorrenze
    if (isRicorrente === 'true') {
      where.isRicorrente = true
    } else if (isRicorrente === 'false') {
      where.isRicorrente = false
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

    // Count totale
    const total = await prisma.schedule.count({ where })

    // Query con paginazione
    const schedules = await prisma.schedule.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
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
        search,
        dataInizio,
        dataFine,
        isRicorrente,
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

    return NextResponse.json({
      schedule: {
        ...schedule,
        importoResiduo: Number(schedule.importoTotale),
      },
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
