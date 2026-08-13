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

    // Come in verifica-duplicati: la formattazione della P.IVA fra file e
    // anagrafica è notoriamente incoerente (zeri iniziali). Senza normalizzare
    // qui il confronto fallirebbe in silenzio — falso negativo, non falso
    // positivo: un conflitto vero non verrebbe mai segnalato. Non si può
    // filtrare la query sui valori esatti proposti dal file per lo stesso
    // motivo, quindi si prendono tutti i fornitori con termini concordati e si
    // confronta in memoria sulla forma normalizzata.
    const senzaZeri = (piva: string) => piva.replace(/^0+/, '')
    const fornitori = await prisma.supplier.findMany({
      where: { vatNumber: { not: null }, isActive: true, paymentTermsDays: { not: null } },
      select: { vatNumber: true, name: true, paymentTermsDays: true },
    })

    const terminiPerPiva = new Map(
      fornitori.map((f) => [
        senzaZeri(f.vatNumber as string),
        { giorni: f.paymentTermsDays as number, nome: f.name },
      ])
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
      const piva = senzaZeri(f.partitaIva)
      const anagrafica = terminiPerPiva.get(piva)
      if (!anagrafica) continue
      if (anagrafica.giorni === f.giorniDalFile) continue

      const esistente = perPiva.get(piva)
      if (esistente) {
        esistente.chiavi.push(f.chiave)
        for (const aliquota of f.aliquote) {
          if (!esistente.aliquote.includes(aliquota)) esistente.aliquote.push(aliquota)
        }
        // `giorniDalFile` resta quello della prima fattura del gruppo: se due
        // fatture della stessa P.IVA divergono fra loro (es. 30 e 45 giorni),
        // qui non si distinguono. Non è un difetto: questa risposta serve solo
        // a *mostrare* il conflitto e a far scegliere fra file e anagrafica; la
        // scelta «usa i valori del file» viene poi applicata riga per riga, con
        // il `giorniDalFile` della singola fattura — non con quello mostrato
        // qui, che è indicativo e mai operativo.
        continue
      }

      perPiva.set(piva, {
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
