import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/payee-suggestions?q=xxx&venueId=xxx
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim()
    const venueId = searchParams.get('venueId')

    if (!query || query.length < 2) {
      return NextResponse.json({ suggestions: [] })
    }

    // Query parallele: fornitori registrati + beneficiari storici
    const [suppliers, historicalPayees] = await Promise.all([
      // 1. Fornitori attivi che matchano il nome
      prisma.supplier.findMany({
        where: {
          isActive: true,
          name: { contains: query, mode: 'insensitive' },
        },
        select: {
          name: true,
          defaultAccountId: true,
        },
        take: 10,
        orderBy: { name: 'asc' },
      }),

      // 2. Beneficiari storici dalle uscite di cassa (distinct)
      prisma.dailyExpense.findMany({
        where: {
          payee: { contains: query, mode: 'insensitive' },
          // Escludi le righe auto-generate
          NOT: [
            { payee: { startsWith: '[EXTRA]' } },
            { payee: { startsWith: '[PAGATO]' } },
          ],
          // Filtra per venue se specificato
          ...(venueId && {
            closure: { venueId },
          }),
        },
        select: {
          payee: true,
        },
        distinct: ['payee'],
        take: 20,
        orderBy: { payee: 'asc' },
      }),
    ])

    // Deduplica: se un nome storico corrisponde a un fornitore, tieni solo il fornitore
    const supplierNames = new Set(
      suppliers.map((s) => s.name.toLowerCase())
    )

    const suggestions: {
      name: string
      source: 'supplier' | 'historical'
      defaultAccountId?: string | null
    }[] = []

    // Aggiungi fornitori
    for (const s of suppliers) {
      suggestions.push({
        name: s.name,
        source: 'supplier',
        defaultAccountId: s.defaultAccountId,
      })
    }

    // Aggiungi storici (solo se non già presenti come fornitore)
    for (const h of historicalPayees) {
      if (!supplierNames.has(h.payee.toLowerCase())) {
        suggestions.push({
          name: h.payee,
          source: 'historical',
        })
      }
    }

    return NextResponse.json({ suggestions })
  } catch (error) {
    console.error('Errore payee-suggestions:', error)
    return NextResponse.json(
      { error: 'Errore nel recupero suggerimenti' },
      { status: 500 }
    )
  }
}
