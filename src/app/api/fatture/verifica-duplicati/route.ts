import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { normalizzaPartitaIva } from '@/lib/invoices/partita-iva'

const schema = z.object({
  fatture: z
    .array(
      z.object({
        chiave: z.string().min(1),
        numero: z.string().min(1),
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data attesa in formato YYYY-MM-DD'),
        partitaIva: z.string().min(1),
      })
    )
    .max(1000, 'Troppe fatture in una sola verifica'),
})

/**
 * Dice quali fra le fatture proposte esistono già, in una sola andata e ritorno.
 * Serve a marcare i duplicati in anteprima: l'utente decide sapendo, invece di
 * scoprire a cose fatte quante ne sono state saltate.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { fatture } = schema.parse(await request.json())
    if (fatture.length === 0) return NextResponse.json({ duplicati: [] })

    // Una query sola: si cercano tutte le fatture con uno dei numeri proposti,
    // poi si accoppia in memoria su (numero, data, P.IVA). Filtrare in SQL su
    // tutte e tre le colonne significherebbe un OR con un ramo per fattura.
    const candidate = await prisma.electronicInvoice.findMany({
      where: {
        invoiceNumber: { in: [...new Set(fatture.map((f) => f.numero))] },
        deletedAt: null,
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        supplierVat: true,
        status: true,
        importedAt: true,
      },
    })

    const indice = new Map<string, (typeof candidate)[number]>()
    for (const c of candidate) {
      const giorno = c.invoiceDate.toISOString().slice(0, 10)
      indice.set(`${c.invoiceNumber}|${giorno}|${normalizzaPartitaIva(c.supplierVat)}`, c)
    }

    const duplicati = fatture.flatMap((f) => {
      const trovata = indice.get(`${f.numero}|${f.data}|${normalizzaPartitaIva(f.partitaIva)}`)
      if (!trovata) return []
      return [
        {
          chiave: f.chiave,
          idEsistente: trovata.id,
          statoEsistente: trovata.status,
          importataIl: trovata.importedAt.toISOString(),
        },
      ]
    })

    return NextResponse.json({ duplicati })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dati non validi', details: error.issues }, { status: 400 })
    }
    logger.error('Errore POST /api/fatture/verifica-duplicati', error)
    return NextResponse.json({ error: 'Errore nella verifica dei duplicati' }, { status: 500 })
  }
}
