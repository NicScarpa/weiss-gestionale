import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api-utils'
import type { RuleDirection } from '@/types/prima-nota'

const DIREZIONI_VALIDE: RuleDirection[] = ['INFLOW', 'OUTFLOW']

// POST /api/categorization-rules/anteprima - Quante righe aggancerebbe una regola con queste keyword
//
// È la domanda inversa di `/test`, che prova una causale contro le regole già
// scritte: qui invece si stima quanti movimenti una regola non ancora salvata
// toccherebbe.
//
// I tre criteri riproducono il motore (recategorize/route.ts:56-100):
// candidati non verificati / non nascosti / senza fette / non da chiusura,
// corrispondenza sulla sola `description`, direzione per segno dell'importo.
// `deletedAt: null` è in più, di proposito: il motore non lo filtra (omissione
// sua, fuori perimetro di questo task), ma qui mostrare un conteggio che
// include righe che l'utente non può vedere da nessuna parte sarebbe peggio
// che divergere da quel comportamento.
export const POST = withAuth(
  async (request, { venueId }) => {
    try {
      const body = await request.json()
      const { keywords, direction } = body

      if (!Array.isArray(keywords)) {
        return NextResponse.json(
          { error: 'keywords deve essere un array di stringhe' },
          { status: 400 }
        )
      }

      if (!DIREZIONI_VALIDE.includes(direction)) {
        return NextResponse.json(
          { error: "direction deve essere 'INFLOW' o 'OUTFLOW'" },
          { status: 400 }
        )
      }

      // Scarta le keyword vuote. Con l'array risultante vuoto un `OR: []` di
      // Prisma non filtra nulla e catturerebbe TUTTO: è il modo più diretto
      // per annunciare "3.000 movimenti corrispondono" a chi non ha ancora
      // scritto niente. Si esce prima di interrogare il database.
      const parole = keywords
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim())
        .filter((k) => k.length > 0)

      if (parole.length === 0) {
        return NextResponse.json({ totale: 0, esempi: [] })
      }

      const dove = {
        venueId,
        verified: false,
        hiddenAt: null,
        deletedAt: null,
        allocations: { none: {} },
        closureId: null,
        ...(direction === 'INFLOW'
          ? { debitAmount: { gt: 0 } }
          : { creditAmount: { gt: 0 } }),
        OR: parole.map((k) => ({
          description: { contains: k, mode: 'insensitive' as const },
        })),
      }

      const [totale, entries] = await Promise.all([
        prisma.journalEntry.count({ where: dove }),
        prisma.journalEntry.findMany({
          where: dove,
          select: { description: true },
          take: 5,
          orderBy: { date: 'desc' },
        }),
      ])

      return NextResponse.json({
        totale,
        esempi: entries.map((e) => e.description),
      })
    } catch (error) {
      console.error('Error computing categorization rule preview:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  },
  { roles: ['admin', 'manager'], venueScoped: true }
)
