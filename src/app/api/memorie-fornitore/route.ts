import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'
import type { Prisma } from '@prisma/client'

/**
 * Elenco della memoria fornitore-prodotto: cosa il sistema ha imparato a
 * imputare da solo, e dove.
 *
 * Prima di questa rotta la tabella era scritta in un punto solo e letta da
 * nessuna schermata (F2-ALL-007): una conferma sbagliata — «Farina 00 kg 25»
 * sul conto «Attrezzature» — tornava a ogni fattura di quel fornitore scritta
 * come **confermata**, quindi verde e fuori da qualunque lista di controllo, e
 * l'unico modo di correggerla era ritrovare una fattura con quella riga e
 * riconfermarla a mano. Il titolare non aveva modo di sapere cosa il sistema
 * avesse imparato.
 */

const PER_PAGINA_PREDEFINITO = 50
const PER_PAGINA_MASSIMO = 200

export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const venueId = await getVenueId()
    const parametri = request.nextUrl.searchParams

    const q = parametri.get('q')?.trim()
    const supplierId = parametri.get('supplierId')?.trim()
    const pagina = Math.max(1, Number(parametri.get('pagina')) || 1)
    const perPagina = Math.min(
      PER_PAGINA_MASSIMO,
      Math.max(1, Number(parametri.get('perPagina')) || PER_PAGINA_PREDEFINITO)
    )

    // La memoria è per sede: quella di un altro locale non deve nemmeno
    // comparire, esattamente come non deve abbinare.
    const where: Prisma.SupplierProductAccountWhereInput = { venueId }
    if (supplierId) where.supplierId = supplierId
    if (q) {
      where.OR = [
        { nomeNormalizzato: { contains: q, mode: 'insensitive' } },
        { supplier: { name: { contains: q, mode: 'insensitive' } } },
      ]
    }

    const [righe, totale] = await Promise.all([
      prisma.supplierProductAccount.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          account: { select: { id: true, code: true, name: true } },
        },
        // Prima il fornitore, poi le mappature su cui il sistema è più sicuro:
        // è l'ordine in cui si legge «cosa ho imparato da questo fornitore».
        orderBy: [
          { supplier: { name: 'asc' } },
          { conferme: 'desc' },
          { nomeNormalizzato: 'asc' },
        ],
        skip: (pagina - 1) * perPagina,
        take: perPagina,
      }),
      prisma.supplierProductAccount.count({ where }),
    ])

    return NextResponse.json({
      memorie: righe.map((riga) => ({
        id: riga.id,
        nomeNormalizzato: riga.nomeNormalizzato,
        codiceArticolo: riga.codiceArticolo,
        conferme: riga.conferme,
        aggiornataIl: riga.updatedAt,
        fornitore: { id: riga.supplier.id, nome: riga.supplier.name },
        conto: { id: riga.account.id, codice: riga.account.code, nome: riga.account.name },
      })),
      totale,
      pagina,
      perPagina,
    })
  } catch (error) {
    logger.error('Errore GET /api/memorie-fornitore', error)
    return NextResponse.json(
      { error: 'Errore nel recupero delle memorie fornitore' },
      { status: 500 }
    )
  }
}
