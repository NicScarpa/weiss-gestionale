import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Prisma, type AccountType } from '@prisma/client'

import { logger } from '@/lib/logger'
import { erroreCoerenzaGerarchia, erroreIncoerenzaConPianoUfficiale } from '@/lib/accounts/validate-account-hierarchy'
// Schema validazione
const accountSchema = z.object({
  code: z.string().min(1, 'Codice obbligatorio').max(20, 'Codice max 20 caratteri'),
  name: z.string().min(1, 'Nome obbligatorio'),
  type: z.enum(['RICAVO', 'COSTO', 'ATTIVO', 'PASSIVO']),
  category: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  // Gerarchia del piano v4 (Task 18: form voce con mastro/gruppo). mastroCode
  // e mastroNome viaggiano sempre in coppia dal client (l'ammnistrazione li
  // deriva da un menu a discesa sui dati esistenti, mai testo libero), stessa
  // cosa per gruppoCode/gruppoNome quando il mastro è articolato in gruppi.
  mastroCode: z.string().optional().nullable(),
  mastroNome: z.string().optional().nullable(),
  gruppoCode: z.string().optional().nullable(),
  gruppoNome: z.string().optional().nullable(),
  costCenterRule: z.enum(['OBBLIGATORIO', 'DEFAULT_STR']).optional(),
})

// GET /api/accounts - Lista conti (per uscite)
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') // retrocompatibile: RICAVO, COSTO, ATTIVO, PASSIVO
    const typesParam = searchParams.get('types') // CSV, es. 'COSTO,RICAVO'
    const includeInactive = searchParams.get('includeInactive') === 'true'
    const full = searchParams.get('full') === 'true'

    const where: Prisma.AccountWhereInput = {}

    if (!includeInactive) {
      where.isActive = true
    }

    if (typesParam) {
      const types = typesParam
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean) as AccountType[]
      if (types.length > 0) {
        where.type = { in: types }
      }
    } else if (type) {
      where.type = type as Prisma.EnumAccountTypeFilter
    }

    const accounts = await prisma.account.findMany({
      where,
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        // Gerarchia del piano v4 (mastro/gruppo), null sui conti patrimoniali
        // e legacy: alimenta il raggruppamento di AccountCombobox.
        mastroCode: true,
        mastroNome: true,
        gruppoCode: true,
        gruppoNome: true,
        costCenterRule: true,
        // Categoria derivata dalla mappatura budget (Fase 0), usata dal
        // budget e da altri punti che raggruppano i conti per categoria.
        budgetMapping: {
          select: {
            includeInBudget: true,
            budgetCategory: {
              select: { id: true, name: true },
            },
          },
        },
        ...(full && {
          category: true,
          parentId: true,
          parent: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          isActive: true,
          createdAt: true,
          _count: {
            select: {
              expenses: true,
              journalEntries: true,
            },
          },
        }),
      },
      orderBy: {
        code: 'asc',
      },
    })

    // Appiattisce budgetMapping in budgetCategory: null se il conto non è
    // mappato o è escluso dal budget (stessa regola di derivaBudgetCategoryDaConto).
    const accountsConCategoria = accounts.map(({ budgetMapping, ...account }) => ({
      ...account,
      budgetCategory: budgetMapping?.includeInBudget ? budgetMapping.budgetCategory : null,
    }))

    return NextResponse.json({ accounts: accountsConCategoria })
  } catch (error) {
    logger.error('Errore GET /api/accounts', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dei conti' },
      { status: 500 }
    )
  }
}

// POST /api/accounts - Crea nuovo conto
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
    const validatedData = accountSchema.parse(body)

    const datiGerarchia = {
      code: validatedData.code,
      mastroCode: validatedData.mastroCode ?? null,
      gruppoCode: validatedData.gruppoCode ?? null,
    }
    const erroreGerarchia = erroreCoerenzaGerarchia(datiGerarchia)
    if (erroreGerarchia) {
      return NextResponse.json({ error: erroreGerarchia }, { status: 400 })
    }
    const errorePiano = erroreIncoerenzaConPianoUfficiale(datiGerarchia)
    if (errorePiano) {
      return NextResponse.json({ error: errorePiano }, { status: 400 })
    }

    // Verifica codice unico
    const existingCode = await prisma.account.findUnique({
      where: { code: validatedData.code },
    })

    if (existingCode) {
      return NextResponse.json(
        { error: 'Codice conto gia esistente' },
        { status: 400 }
      )
    }

    const account = await prisma.account.create({
      data: {
        code: validatedData.code,
        name: validatedData.name,
        type: validatedData.type,
        category: validatedData.category,
        parentId: validatedData.parentId,
        isActive: validatedData.isActive,
        mastroCode: validatedData.mastroCode,
        mastroNome: validatedData.mastroNome,
        gruppoCode: validatedData.gruppoCode,
        gruppoNome: validatedData.gruppoNome,
        ...(validatedData.costCenterRule && { costCenterRule: validatedData.costCenterRule }),
      },
      include: {
        parent: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json({ account })
  } catch (error) {
    logger.error('Errore POST /api/accounts', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore nella creazione del conto' },
      { status: 500 }
    )
  }
}

// PUT /api/accounts - Aggiorna conto
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
      return NextResponse.json({ error: 'ID conto obbligatorio' }, { status: 400 })
    }

    const validatedData = accountSchema.partial().parse(data)

    // Verifica esistenza
    const existing = await prisma.account.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Conto non trovato' }, { status: 404 })
    }

    // Coerenza codice/mastro/gruppo sullo stato risultante (esistente +
    // patch), non solo sul payload: un PUT che tocca solo il gruppo deve
    // comunque vedere il mastro (e il code) già presenti sul conto.
    const codeRisultante = validatedData.code !== undefined ? validatedData.code : existing.code
    const mastroCodeRisultante =
      validatedData.mastroCode !== undefined ? validatedData.mastroCode : existing.mastroCode
    const gruppoCodeRisultante =
      validatedData.gruppoCode !== undefined ? validatedData.gruppoCode : existing.gruppoCode

    const datiGerarchiaRisultanti = {
      code: codeRisultante,
      mastroCode: mastroCodeRisultante,
      gruppoCode: gruppoCodeRisultante,
    }
    const erroreGerarchia = erroreCoerenzaGerarchia(datiGerarchiaRisultanti)
    if (erroreGerarchia) {
      return NextResponse.json({ error: erroreGerarchia }, { status: 400 })
    }
    const errorePiano = erroreIncoerenzaConPianoUfficiale(datiGerarchiaRisultanti)
    if (errorePiano) {
      return NextResponse.json({ error: errorePiano }, { status: 400 })
    }

    // Verifica codice unico se modificato
    if (validatedData.code && validatedData.code !== existing.code) {
      const existingCode = await prisma.account.findUnique({
        where: { code: validatedData.code },
      })
      if (existingCode) {
        return NextResponse.json(
          { error: 'Codice conto gia esistente' },
          { status: 400 }
        )
      }
    }

    const account = await prisma.account.update({
      where: { id },
      data: {
        ...(validatedData.code && { code: validatedData.code }),
        ...(validatedData.name && { name: validatedData.name }),
        ...(validatedData.type && { type: validatedData.type }),
        ...(validatedData.category !== undefined && { category: validatedData.category }),
        ...(validatedData.parentId !== undefined && { parentId: validatedData.parentId }),
        ...(validatedData.isActive !== undefined && { isActive: validatedData.isActive }),
        ...(validatedData.mastroCode !== undefined && { mastroCode: validatedData.mastroCode }),
        ...(validatedData.mastroNome !== undefined && { mastroNome: validatedData.mastroNome }),
        ...(validatedData.gruppoCode !== undefined && { gruppoCode: validatedData.gruppoCode }),
        ...(validatedData.gruppoNome !== undefined && { gruppoNome: validatedData.gruppoNome }),
        ...(validatedData.costCenterRule !== undefined && { costCenterRule: validatedData.costCenterRule }),
      },
      include: {
        parent: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json({ account })
  } catch (error) {
    logger.error('Errore PUT /api/accounts', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Errore nell\'aggiornamento del conto' },
      { status: 500 }
    )
  }
}

// DELETE /api/accounts - Elimina conto (soft delete)
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
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID conto obbligatorio' }, { status: 400 })
    }

    // Verifica esistenza e utilizzo
    const existing = await prisma.account.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            expenses: true,
            journalEntries: true,
            children: true,
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Conto non trovato' }, { status: 404 })
    }

    // Se ha sotto-conti, non permettere eliminazione
    if (existing._count.children > 0) {
      return NextResponse.json(
        { error: 'Impossibile eliminare: il conto ha sotto-conti associati' },
        { status: 400 }
      )
    }

    // Se ha movimenti, fai soft delete
    if (existing._count.expenses > 0 || existing._count.journalEntries > 0) {
      await prisma.account.update({
        where: { id },
        data: { isActive: false },
      })
      return NextResponse.json({ message: 'Conto disattivato (aveva movimenti associati)' })
    }

    // Altrimenti elimina fisicamente
    await prisma.account.delete({ where: { id } })

    return NextResponse.json({ message: 'Conto eliminato' })
  } catch (error) {
    logger.error('Errore DELETE /api/accounts', error)
    return NextResponse.json(
      { error: 'Errore nell\'eliminazione del conto' },
      { status: 500 }
    )
  }
}
