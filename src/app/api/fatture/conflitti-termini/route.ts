import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const schema = z.object({
  fatture: z
    .array(
      z.object({
        chiave: z.string().min(1),
        partitaIva: z.string().min(1),
        denominazione: z.string(),
        giorniDalFile: z.number().int().nullable(),
        aliquote: z.array(z.number()).default([]),
      })
    )
    .max(1000),
})

/**
 * Confronta i termini che la fattura implica (scadenza meno data documento) con
 * quelli concordati in anagrafica. Si raggruppa per partita IVA, non per nome:
 * il nome è testo libero e nello stesso archivio lo stesso soggetto compare come
 * «WEISS S.R.L.», «Weiss s.r.l.» e «WEISS SRL SOCIO UNICO».
 *
 * L'aliquota IVA non entra nel confronto: non esiste un'aliquota predefinita per
 * fornitore, e mostrarne una sarebbe promettere un'automazione che non c'è.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    if (session.user.role !== 'admin' && session.user.role !== 'manager') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { fatture } = schema.parse(await request.json())
    const conTermini = fatture.filter((f) => f.giorniDalFile !== null)
    if (conTermini.length === 0) return NextResponse.json({ conflitti: [] })

    const partiteIva = [...new Set(conTermini.map((f) => f.partitaIva))]
    const fornitori = await prisma.supplier.findMany({
      where: { vatNumber: { in: partiteIva }, isActive: true },
      select: { vatNumber: true, name: true, paymentTermsDays: true },
    })

    const terminiPerPiva = new Map(
      fornitori
        .filter((f) => f.vatNumber && f.paymentTermsDays !== null)
        .map((f) => [f.vatNumber as string, { giorni: f.paymentTermsDays as number, nome: f.name }])
    )

    const perPiva = new Map<
      string,
      {
        denominazione: string
        giorniDalFile: number
        giorniAnagrafica: number
        aliquote: number[]
        chiavi: string[]
      }
    >()

    for (const f of conTermini) {
      const anagrafica = terminiPerPiva.get(f.partitaIva)
      if (!anagrafica) continue
      if (anagrafica.giorni === f.giorniDalFile) continue

      const esistente = perPiva.get(f.partitaIva)
      if (esistente) {
        esistente.chiavi.push(f.chiave)
        for (const aliquota of f.aliquote) {
          if (!esistente.aliquote.includes(aliquota)) esistente.aliquote.push(aliquota)
        }
        continue
      }

      perPiva.set(f.partitaIva, {
        denominazione: anagrafica.nome || f.denominazione,
        giorniDalFile: f.giorniDalFile as number,
        giorniAnagrafica: anagrafica.giorni,
        aliquote: [...f.aliquote],
        chiavi: [f.chiave],
      })
    }

    return NextResponse.json({
      conflitti: [...perPiva.entries()].map(([partitaIva, dati]) => ({ partitaIva, ...dati })),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Dati non validi', details: error.issues }, { status: 400 })
    }
    logger.error('Errore POST /api/fatture/conflitti-termini', error)
    return NextResponse.json({ error: 'Errore nel calcolo dei conflitti' }, { status: 500 })
  }
}
