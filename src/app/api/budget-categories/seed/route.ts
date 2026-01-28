import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

import { logger } from '@/lib/logger'
// Categorie di sistema predefinite
const SYSTEM_CATEGORIES = [
  // Categorie root (sistema)
  {
    code: 'RICAVI_TOTALI',
    name: 'Ricavi Totali',
    categoryType: 'REVENUE' as const,
    color: '#22C55E',
    icon: 'trending-up',
    benchmarkPercentage: 100,
    benchmarkComparison: 'GREATER_THAN' as const,
    isSystem: true,
    displayOrder: 0,
  },
  {
    code: 'COSTI_TOTALI',
    name: 'Costi Totali',
    categoryType: 'COST' as const,
    color: '#EF4444',
    icon: 'trending-down',
    isSystem: true,
    displayOrder: 100,
  },
  {
    code: 'MARGINE_OPERATIVO',
    name: 'Margine Operativo Lordo',
    categoryType: 'KPI' as const,
    color: '#3B82F6',
    icon: 'calculator',
    benchmarkPercentage: 15,
    benchmarkComparison: 'GREATER_THAN' as const,
    isSystem: true,
    displayOrder: 200,
  },

  // Sottocategorie costi comuni
  {
    code: 'COSTI_PERSONALE',
    name: 'Costi del Personale',
    categoryType: 'COST' as const,
    parentCode: 'COSTI_TOTALI',
    color: '#F59E0B',
    icon: 'users',
    benchmarkPercentage: 30,
    benchmarkComparison: 'LESS_THAN' as const,
    alertThresholdPercent: 10,
    displayOrder: 101,
  },
  {
    code: 'FOOD_COST',
    name: 'Food Cost (Materie Prime)',
    categoryType: 'COST' as const,
    parentCode: 'COSTI_TOTALI',
    color: '#10B981',
    icon: 'package',
    benchmarkPercentage: 28,
    benchmarkComparison: 'LESS_THAN' as const,
    alertThresholdPercent: 5,
    displayOrder: 102,
  },
  {
    code: 'BEVERAGE_COST',
    name: 'Beverage Cost',
    categoryType: 'COST' as const,
    parentCode: 'COSTI_TOTALI',
    color: '#8B5CF6',
    icon: 'wine',
    benchmarkPercentage: 22,
    benchmarkComparison: 'LESS_THAN' as const,
    alertThresholdPercent: 5,
    displayOrder: 103,
  },
  {
    code: 'COSTI_FISSI',
    name: 'Costi Fissi (Affitto, Utenze)',
    categoryType: 'COST' as const,
    parentCode: 'COSTI_TOTALI',
    color: '#6B7280',
    icon: 'building',
    displayOrder: 104,
  },
  {
    code: 'COSTI_VARIABILI',
    name: 'Costi Variabili',
    categoryType: 'COST' as const,
    parentCode: 'COSTI_TOTALI',
    color: '#EC4899',
    icon: 'activity',
    displayOrder: 105,
  },
  {
    code: 'MARKETING',
    name: 'Marketing e Pubblicità',
    categoryType: 'COST' as const,
    parentCode: 'COSTI_TOTALI',
    color: '#14B8A6',
    icon: 'megaphone',
    benchmarkPercentage: 3,
    benchmarkComparison: 'LESS_THAN' as const,
    displayOrder: 106,
  },

  // Sottocategorie ricavi
  {
    code: 'RICAVI_BAR',
    name: 'Ricavi Bar',
    categoryType: 'REVENUE' as const,
    parentCode: 'RICAVI_TOTALI',
    color: '#22C55E',
    icon: 'coffee',
    displayOrder: 1,
  },
  {
    code: 'RICAVI_RISTORAZIONE',
    name: 'Ricavi Ristorazione',
    categoryType: 'REVENUE' as const,
    parentCode: 'RICAVI_TOTALI',
    color: '#84CC16',
    icon: 'utensils',
    displayOrder: 2,
  },
  {
    code: 'RICAVI_EVENTI',
    name: 'Ricavi Eventi',
    categoryType: 'REVENUE' as const,
    parentCode: 'RICAVI_TOTALI',
    color: '#A3E635',
    icon: 'calendar',
    displayOrder: 3,
  },

  // Imposte
  {
    code: 'IMPOSTE_CONTRIBUTI',
    name: 'Imposte e Contributi',
    categoryType: 'TAX' as const,
    color: '#DC2626',
    icon: 'file-text',
    displayOrder: 300,
  },
]

// POST /api/budget-categories/seed - Crea categorie di sistema per una venue
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await request.json()
    const { venueId, skipExisting = true } = body

    if (!venueId) {
      return NextResponse.json({ error: 'venueId richiesto' }, { status: 400 })
    }

    // Verifica che la venue esista
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
    })

    if (!venue) {
      return NextResponse.json({ error: 'Sede non trovata' }, { status: 404 })
    }

    // Controlla se esistono già categorie per questa venue
    const existingCount = await prisma.budgetCategory.count({
      where: { venueId },
    })

    if (existingCount > 0 && skipExisting) {
      return NextResponse.json({
        message: 'Categorie già esistenti, seed saltato',
        existingCount,
        created: 0,
      })
    }

    // Crea le categorie in ordine (prima root, poi children)
    const created: { id: string; code: string; name: string }[] = []
    const parentIdMap: Record<string, string> = {}

    // Prima passa: crea categorie root
    for (const cat of SYSTEM_CATEGORIES.filter(c => !c.parentCode)) {
      const existing = await prisma.budgetCategory.findUnique({
        where: { venueId_code: { venueId, code: cat.code } },
      })

      if (!existing) {
        const newCat = await prisma.budgetCategory.create({
          data: {
            venueId,
            code: cat.code,
            name: cat.name,
            categoryType: cat.categoryType,
            color: cat.color,
            icon: cat.icon,
            benchmarkPercentage: cat.benchmarkPercentage,
            benchmarkComparison: cat.benchmarkComparison || 'LESS_THAN',
            alertThresholdPercent: cat.alertThresholdPercent ?? 10,
            isSystem: cat.isSystem || false,
            displayOrder: cat.displayOrder,
            createdBy: session.user.id,
          },
        })
        parentIdMap[cat.code] = newCat.id
        created.push({ id: newCat.id, code: newCat.code, name: newCat.name })
      } else {
        parentIdMap[cat.code] = existing.id
      }
    }

    // Seconda passa: crea sottocategorie
    for (const cat of SYSTEM_CATEGORIES.filter(c => c.parentCode)) {
      const existing = await prisma.budgetCategory.findUnique({
        where: { venueId_code: { venueId, code: cat.code } },
      })

      if (!existing) {
        const parentId = parentIdMap[cat.parentCode!]
        if (!parentId) {
          logger.warn(`Parent ${cat.parentCode} non trovato per ${cat.code}`)
          continue
        }

        const newCat = await prisma.budgetCategory.create({
          data: {
            venueId,
            code: cat.code,
            name: cat.name,
            parentId,
            categoryType: cat.categoryType,
            color: cat.color,
            icon: cat.icon,
            benchmarkPercentage: cat.benchmarkPercentage,
            benchmarkComparison: cat.benchmarkComparison || 'LESS_THAN',
            alertThresholdPercent: cat.alertThresholdPercent ?? 10,
            isSystem: false,
            displayOrder: cat.displayOrder,
            createdBy: session.user.id,
          },
        })
        created.push({ id: newCat.id, code: newCat.code, name: newCat.name })
      }
    }

    return NextResponse.json({
      success: true,
      message: `${created.length} categorie create`,
      created,
      total: existingCount + created.length,
    })
  } catch (error: unknown) {
    logger.error('Errore POST budget-categories/seed', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorCode = error instanceof Object && 'code' in error ? (error as { code: unknown }).code : undefined
    return NextResponse.json(
      {
        error: 'Errore nel seed delle categorie',
        details: errorMessage,
        code: errorCode
      },
      { status: 500 }
    )
  }
}

// GET /api/budget-categories/seed - Restituisce le categorie predefinite
export async function GET() {
  return NextResponse.json({
    categories: SYSTEM_CATEGORIES,
    description: 'Categorie budget predefinite per il wizard di configurazione',
  })
}
