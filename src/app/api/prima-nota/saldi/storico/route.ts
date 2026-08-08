import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { RegisterType } from '@prisma/client'
import { auth } from '@/lib/auth'
import { getVenueId } from '@/lib/venue'
import { logger } from '@/lib/logger'
import { money, toApi, type Money } from '@/lib/money'
import { toDateOnlyUtc } from '@/lib/timezone'
import {
  REGISTRI,
  giornoCorrente,
  movimentiPerGiorno,
  primoGiornoConMovimenti,
  saldiAlGiorno,
} from '@/lib/saldi'

/**
 * GET /api/prima-nota/saldi/storico — andamento dei saldi nel tempo.
 *
 * Il saldo progressivo parte dal saldo reale del giorno che precede la finestra
 * richiesta, non da zero: uno storico che comincia da zero disegna la curva
 * giusta alla quota sbagliata, e l'ultimo punto non coincide mai con il saldo
 * mostrato altrove nell'applicazione. Apertura e movimenti arrivano entrambi da
 * `@/lib/saldi`, che è anche ciò che rende quel confronto sensato.
 */

/** Accetta 'yyyy-MM-dd' e le date ISO complete, di cui tiene il solo giorno. */
const giornoSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'Data attesa nel formato yyyy-MM-dd')
  .transform((valore) => valore.slice(0, 10))

const storicoFiltersSchema = z.object({
  dateFrom: giornoSchema.optional(),
  dateTo: giornoSchema.optional(),
  registerType: z.enum(['CASH', 'BANK']).optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
})

type Raggruppamento = z.infer<typeof storicoFiltersSchema>['groupBy']

interface RegistroDelPeriodo {
  openingBalance: number
  debits: number
  credits: number
  netMovement: number
  closingBalance: number
  movementCount: number
}

interface PeriodoStorico {
  period: string
  registers: Record<string, RegistroDelPeriodo>
  totalAvailable: number
}

/**
 * Etichetta del periodo a cui un giorno appartiene. Si calcola sulla data UTC
 * perché i giorni arrivano già come giorni civili ('yyyy-MM-dd'): passare per
 * il fuso della macchina li sposterebbe di uno.
 */
function periodoDelGiorno(giorno: string, groupBy: Raggruppamento): string {
  if (groupBy === 'day') return giorno
  if (groupBy === 'month') return giorno.slice(0, 7)

  // Settimana: si etichetta col lunedì. `getUTCDay()` vale 0 di domenica, che
  // in Italia chiude la settimana invece di aprirla.
  const data = toDateOnlyUtc(giorno)
  const giorniDaLunedi = (data.getUTCDay() + 6) % 7

  return new Date(data.getTime() - giorniDaLunedi * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)

    const filters = storicoFiltersSchema.parse({
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
      registerType: searchParams.get('registerType') || undefined,
      groupBy: searchParams.get('groupBy') || 'day',
    })

    const venueId = await getVenueId()

    const al = filters.dateTo ?? giornoCorrente()
    const saldiFinali = await saldiAlGiorno(venueId, al)
    const dal =
      filters.dateFrom ??
      saldiFinali.dal ??
      (await primoGiornoConMovimenti(venueId)) ??
      al

    const registriRichiesti: RegisterType[] = filters.registerType
      ? [filters.registerType]
      : [...REGISTRI]

    const movimenti = await movimentiPerGiorno(venueId, {
      dal,
      al,
      registerType: filters.registerType,
    })

    // Somma dei movimenti di ogni periodo, per registro, e totale della finestra.
    const perPeriodo = new Map<string, Map<RegisterType, { dare: Money; avere: Money; n: number }>>()
    const totaliFinestra = new Map<RegisterType, { dare: Money; avere: Money }>(
      registriRichiesti.map((registro) => [registro, { dare: money(0), avere: money(0) }])
    )

    for (const giorno of movimenti) {
      const periodo = periodoDelGiorno(giorno.giorno, filters.groupBy)
      const registri = perPeriodo.get(periodo) ?? new Map()
      const corrente = registri.get(giorno.registerType) ?? {
        dare: money(0),
        avere: money(0),
        n: 0,
      }

      registri.set(giorno.registerType, {
        dare: corrente.dare.plus(giorno.dare),
        avere: corrente.avere.plus(giorno.avere),
        n: corrente.n + giorno.movimenti,
      })
      perPeriodo.set(periodo, registri)

      const finestra = totaliFinestra.get(giorno.registerType)!
      totaliFinestra.set(giorno.registerType, {
        dare: finestra.dare.plus(giorno.dare),
        avere: finestra.avere.plus(giorno.avere),
      })
    }

    // L'apertura si ricava all'indietro dal saldo di fine finestra, che è quello
    // autorevole: così l'ultimo punto della serie coincide per costruzione con
    // il saldo mostrato altrove. Chiedere invece il saldo "del giorno prima"
    // sbaglierebbe proprio al capodanno, dove il giorno prima cade in un anno
    // che il saldo iniziale non copre.
    const progressivo = new Map<RegisterType, Money>(
      registriRichiesti.map((registro) => {
        const { dare, avere } = totaliFinestra.get(registro)!

        return [
          registro,
          money(saldiFinali.registers[registro].closingBalance).minus(dare).plus(avere),
        ]
      })
    )

    const history: PeriodoStorico[] = []

    for (const periodo of Array.from(perPeriodo.keys()).sort()) {
      const registri = perPeriodo.get(periodo)!
      const voce: PeriodoStorico = { period: periodo, registers: {}, totalAvailable: 0 }

      for (const registro of registriRichiesti) {
        const { dare, avere, n } = registri.get(registro) ?? {
          dare: money(0),
          avere: money(0),
          n: 0,
        }

        const openingBalance = progressivo.get(registro)!
        const closingBalance = openingBalance.plus(dare).minus(avere)
        progressivo.set(registro, closingBalance)

        voce.registers[registro] = {
          openingBalance: toApi(openingBalance),
          debits: toApi(dare),
          credits: toApi(avere),
          netMovement: toApi(dare.minus(avere)),
          closingBalance: toApi(closingBalance),
          movementCount: n,
        }
      }

      voce.totalAvailable = toApi(
        Array.from(progressivo.values()).reduce((somma, saldo) => somma.plus(saldo), money(0))
      )

      history.push(voce)
    }

    return NextResponse.json({
      data: history,
      filters: { ...filters, dateFrom: dal, dateTo: al, venueId },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Parametri non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore GET /api/prima-nota/saldi/storico', error)
    return NextResponse.json(
      { error: 'Errore nel recupero dello storico saldi' },
      { status: 500 }
    )
  }
}
