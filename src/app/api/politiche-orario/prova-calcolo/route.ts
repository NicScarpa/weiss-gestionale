import { NextRequest } from 'next/server'
import { handleApiError, ok, withAuth } from '@/lib/api-utils'
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
export const POST = withAuth(async (request: NextRequest) => {
  try {
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

    // Turno pianificato simulato: la fine "prima" dell'inizio è il giorno dopo.
    let shiftWindows: { startMinutes: number; endMinutes: number }[] | undefined
    if (dati.shiftStartMinutes !== null && dati.shiftEndMinutes !== null) {
      shiftWindows = [
        {
          startMinutes: dati.shiftStartMinutes,
          endMinutes:
            dati.shiftEndMinutes <= dati.shiftStartMinutes
              ? dati.shiftEndMinutes + 24 * 60
              : dati.shiftEndMinutes,
        },
      ]
    }

    const risultato = computeRecognizedDay(punches, rules, {
      weekday: dati.weekday,
      isHoliday: dati.isHoliday,
      shiftWindows,
    })

    return ok({ data: risultato })
  } catch (error) {
    return handleApiError(
      error,
      'POST /api/politiche-orario/prova-calcolo',
      'Errore nel calcolo di prova'
    )
  }
}, { roles: ['admin', 'manager'] })
