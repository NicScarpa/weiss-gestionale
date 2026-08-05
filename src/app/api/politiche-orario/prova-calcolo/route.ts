import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { computeRecognizedDay } from '@/lib/attendance/timekeeping-engine'
import { toPolicyRules } from '@/lib/attendance/policy-resolver'
import type { DayPunch } from '@/lib/attendance/timekeeping-types'
import { provaCalcoloSchema } from '@/lib/validations/politiche-orario'

/**
 * POST /api/politiche-orario/prova-calcolo
 *
 * Prova una regola prima di salvarla: si danno un'entrata e un'uscita e si
 * vede quante ore verrebbero riconosciute, con i passaggi del calcolo. Non
 * tocca il database e non richiede che la regola esista.
 *
 * È l'unico modo perché chi configura cinque parametri di arrotondamento
 * capisca cosa sta impostando.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    if (!['admin', 'manager'].includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }

    const body = await request.json()

    // Il calcolatore serve a capire i parametri PRIMA di impegnarsi: si può
    // provare una regola che non ha ancora un nome.
    if (body?.policy && !body.policy.name) {
      body.policy.name = 'Prova'
    }

    const dati = provaCalcoloSchema.parse(body)

    const rules = toPolicyRules({
      ...dati.policy,
      id: 'prova',
      contractWeeklyHours: dati.policy.contractWeeklyHours,
      extraBreaks: dati.policy.extraBreaks,
    })

    // Un'uscita "prima" dell'entrata si intende il giorno dopo: è il caso dei
    // turni serali, che è poi quello che si vuole provare.
    const clockOutMinutes =
      dati.clockOutMinutes <= dati.clockInMinutes
        ? dati.clockOutMinutes + 24 * 60
        : dati.clockOutMinutes

    const punches: DayPunch[] = [
      { type: 'IN', minutes: dati.clockInMinutes },
      { type: 'OUT', minutes: clockOutMinutes },
    ]

    if (dati.breakStartMinutes !== null && dati.breakEndMinutes !== null) {
      punches.push({ type: 'BREAK_START', minutes: dati.breakStartMinutes })
      punches.push({ type: 'BREAK_END', minutes: dati.breakEndMinutes })
    }

    const risultato = computeRecognizedDay(punches, rules, {
      weekday: dati.weekday,
      isHoliday: dati.isHoliday,
    })

    return NextResponse.json({ data: risultato })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Dati non validi', details: error.issues },
        { status: 400 }
      )
    }

    logger.error('Errore POST /api/politiche-orario/prova-calcolo', error)
    return NextResponse.json({ error: 'Errore nel calcolo di prova' }, { status: 500 })
  }
}
