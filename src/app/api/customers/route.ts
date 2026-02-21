import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma } from '@prisma/client'

import { logger } from '@/lib/logger'

// Schema validazione
const customerSchema = z.object({
  denominazione: z.string().min(1, 'Denominazione obbligatoria'),
  partitaIva: z.string().optional().nullable(),
  codiceFiscale: z.string().optional().nullable(),
  indirizzo: z.string().optional().nullable(),
  citta: z.string().optional().nullable(),
  cap: z.string().optional().nullable(),
  provincia: z.string().optional().nullable(),
  email: z.string().email('Email non valida').optional().nullable(),
  telefono: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  defaultAccountId: z.string().optional().nullable(),
  attivo: z.boolean().default(true),
})

// GET /api/customers - Lista clienti
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const showOnlyInactive = searchParams.get('showOnlyInactive') === 'true'
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const full = searchParams.get('full') === 'true' // Include tutti i campi

    const where: Prisma.CustomerWhereInput = {}

    // Logica filtro:
    // - showOnlyInactive=true: mostra SOLO inattivi
    // - includeInactive=true: mostra TUTTI (attivi + inattivi)
    // - default: mostra SOLO attivi
    if (showOnlyInactive) {
      where.attivo = false
    } else if (!includeInactive) {
      where.attivo = true
    }

    if (query) {
      where.OR = [
        { denominazione: { contains: query, mode: 'insensitive' } },
        { partitaIva: { contains: query, mode: 'insensitive' } },
        { codiceFiscale: { contains: query, mode: 'insensitive' } },
      ]
    }

    const customers = await prisma.customer.findMany({
      where,
      select: {
        id: true,
        denominazione: true,
        partitaIva: true,
        codiceFiscale: true,
        ...(full && {
          indirizzo: true,
          citta: true,
          cap: true,
          provincia: true,
          email: true,
          telefono: true,
          iban: true,
          note: true,
          defaultAccountId: true,
          defaultAccount: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          attivo: true,
          createdAt: true,
        }),
      },
      orderBy: {
        denominazione: 'asc',
      },
      ...(full ? {} : { take: 50 }),
    })

    return NextResponse.json({ customers })
  } catch (error) {
    logger.error('Errore GET /api/customers', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei clienti' },
      { status: 500 }
    )
  }
}

// POST /api/customers - Crea nuovo cliente
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = customerSchema.parse(body)

    // CHECK DUPLICATI
    // 1. Controlla Partita IVA (se presente)
    // 2. Controlla Codice Fiscale (se presente)
    // 3. Controlla Denominazione + Indirizzo per evitare omonimie

    // Costruisci le condizioni OR per il controllo duplicati
    const orConditions: Prisma.CustomerWhereInput[] = []

    // Se la Partita IVA è fornita, deve essere unica
    if (validatedData.partitaIva) {
      orConditions.push({ partitaIva: validatedData.partitaIva })
    }

    // Se il Codice Fiscale è fornito, deve essere unico
    if (validatedData.codiceFiscale) {
      orConditions.push({ codiceFiscale: validatedData.codiceFiscale })
    }

    // Controlliamo la combinazione Denominazione + (Indirizzo o Città)
    const andConditions: Prisma.CustomerWhereInput[] = [
      { denominazione: { equals: validatedData.denominazione, mode: 'insensitive' } }
    ]

    if (validatedData.indirizzo) {
      andConditions.push({ indirizzo: { equals: validatedData.indirizzo, mode: 'insensitive' } })
    }

    if (validatedData.citta) {
      andConditions.push({ citta: { equals: validatedData.citta, mode: 'insensitive' } })
    }

    if (andConditions.length > 1) {
      orConditions.push({ AND: andConditions })
    }

    const duplicate = orConditions.length > 0
      ? await prisma.customer.findFirst({
          where: { OR: orConditions },
        })
      : null

    if (duplicate) {
      const field = duplicate.partitaIva === validatedData.partitaIva
        ? 'Partita IVA'
        : duplicate.codiceFiscale === validatedData.codiceFiscale
          ? 'Codice Fiscale'
          : 'Denominazione/Indirizzo'
      return NextResponse.json(
        { error: `Cliente già presente in anagrafica (${field})` },
        { status: 409 }
      )
    }

    const customer = await prisma.customer.create({
      data: {
        denominazione: validatedData.denominazione,
        partitaIva: validatedData.partitaIva,
        codiceFiscale: validatedData.codiceFiscale,
        indirizzo: validatedData.indirizzo,
        citta: validatedData.citta,
        cap: validatedData.cap,
        provincia: validatedData.provincia,
        email: validatedData.email,
        telefono: validatedData.telefono,
        iban: validatedData.iban,
        note: validatedData.note,
        defaultAccountId: validatedData.defaultAccountId,
        attivo: validatedData.attivo,
      },
      include: {
        defaultAccount: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json({ customer })
  } catch (error) {
    logger.error('Errore POST /api/customers', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore nella creazione del cliente' },
      { status: 500 }
    )
  }
}

// PUT /api/customers - Aggiorna cliente
export async function PUT(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ error: 'ID cliente obbligatorio' }, { status: 400 })
    }

    const validatedData = customerSchema.partial().parse(data)

    // Verifica esistenza
    const existing = await prisma.customer.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Cliente non trovato' }, { status: 404 })
    }

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...(validatedData.denominazione !== undefined && { denominazione: validatedData.denominazione }),
        ...(validatedData.partitaIva !== undefined && { partitaIva: validatedData.partitaIva }),
        ...(validatedData.codiceFiscale !== undefined && { codiceFiscale: validatedData.codiceFiscale }),
        ...(validatedData.indirizzo !== undefined && { indirizzo: validatedData.indirizzo }),
        ...(validatedData.citta !== undefined && { citta: validatedData.citta }),
        ...(validatedData.cap !== undefined && { cap: validatedData.cap }),
        ...(validatedData.provincia !== undefined && { provincia: validatedData.provincia }),
        ...(validatedData.email !== undefined && { email: validatedData.email }),
        ...(validatedData.telefono !== undefined && { telefono: validatedData.telefono }),
        ...(validatedData.iban !== undefined && { iban: validatedData.iban }),
        ...(validatedData.note !== undefined && { note: validatedData.note }),
        ...(validatedData.defaultAccountId !== undefined && { defaultAccountId: validatedData.defaultAccountId }),
        ...(validatedData.attivo !== undefined && { attivo: validatedData.attivo }),
      },
      include: {
        defaultAccount: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    })

    // Nota: Le fatture elettroniche sono associate ai fornitori (Supplier), non ai clienti (Customer)
    // Non è necessario propagare le modifiche alle fatture in questo caso

    return NextResponse.json({ customer })
  } catch (error) {
    logger.error('Errore PUT /api/customers', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento del cliente' },
      { status: 500 }
    )
  }
}

// DELETE /api/customers - Elimina cliente/i (soft delete)
// Supporta: ?id=xxx per singolo, oppure body { ids: [...] } per bulk
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const singleId = searchParams.get('id')

    let ids: string[] = []

    if (singleId) {
      // Modalità singola (compatibilità retroattiva)
      ids = [singleId]
    } else {
      // Modalità bulk: leggi IDs dal body
      try {
        const body = await request.json()
        if (Array.isArray(body.ids) && body.ids.length > 0) {
          ids = body.ids
        }
      } catch {
        // Body vuoto o non JSON
      }
    }

    if (ids.length === 0) {
      return NextResponse.json({ error: 'ID cliente obbligatorio' }, { status: 400 })
    }

    // Verifica esistenza clienti
    const existing = await prisma.customer.findMany({
      where: { id: { in: ids } },
      select: { id: true }
    })

    if (existing.length === 0) {
      return NextResponse.json({ error: 'Nessun cliente trovato' }, { status: 404 })
    }

    const existingIds = existing.map(c => c.id)

    // Soft delete (singolo o multiplo)
    const result = await prisma.customer.updateMany({
      where: { id: { in: existingIds } },
      data: { attivo: false },
    })

    const count = result.count
    const message = count === 1
      ? 'Cliente disattivato'
      : `${count} clienti disattivati`

    return NextResponse.json({ message, count })
  } catch (error) {
    logger.error('Errore DELETE /api/customers', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione del cliente' },
      { status: 500 }
    )
  }
}
