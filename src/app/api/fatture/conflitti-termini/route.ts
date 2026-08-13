import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { normalizzaPartitaIva } from '@/lib/invoices/partita-iva'

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
export const POST = withAuth(async (request) => {
  try {
    const { fatture } = schema.parse(await request.json())
    const conTermini = fatture.filter((f) => f.giorniDalFile !== null)
    if (conTermini.length === 0) return NextResponse.json({ conflitti: [] })

    // Come in verifica-duplicati: la formattazione della P.IVA fra file e
    // anagrafica è notoriamente incoerente (zeri iniziali). Senza normalizzare
    // qui il confronto fallirebbe in silenzio — falso negativo, non falso
    // positivo: un conflitto vero non verrebbe mai segnalato. Non si può
    // filtrare la query sui valori esatti proposti dal file per lo stesso
    // motivo, quindi si prendono tutti i fornitori con termini concordati e si
    // confronta in memoria sulla forma normalizzata. La normalizzazione è
    // quella condivisa: la P.IVA normalizzata esce da qui come chiave del
    // conflitto, e il wizard deve poterla ritrovare con la stessa regola.
    const fornitori = await prisma.supplier.findMany({
      where: { vatNumber: { not: null }, isActive: true, paymentTermsDays: { not: null } },
      select: { vatNumber: true, name: true, paymentTermsDays: true },
    })

    const terminiPerPiva = new Map(
      fornitori.map((f) => [
        normalizzaPartitaIva(f.vatNumber as string),
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
      const piva = normalizzaPartitaIva(f.partitaIva)
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
        // a *mostrare* il conflitto e a far scegliere fra file e anagrafica.
        // Il valore mostrato non diventa mai operativo: scegliendo
        // «Importazione» il wizard non manda alcun termine e la data scritta
        // sul singolo documento vince da sé, riga per riga; solo la scelta
        // «Anagrafica» spedisce un numero, ed è `giorniAnagrafica`.
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
}, { roles: ['admin', 'manager'] })
