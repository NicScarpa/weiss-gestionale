import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import {
  conflict,
  errorResponse,
  handleApiError,
  notFound,
  ok,
  withAuth,
} from '@/lib/api-utils'
import { politicaOrarioSchema } from '@/lib/validations/politiche-orario'
import { toDateOnlyUtc } from '@/lib/timezone'
import { politicaSelect, RUOLI_REGOLE } from '../condiviso'

type Params = { id: string }
const OPZIONI = { roles: RUOLI_REGOLE, venueScoped: true } as const

/**
 * La decorrenza di una modifica: i giorni precedenti restano calcolati con
 * la regola com'era (i valori si congelano in una versione), così i mesi già
 * consegnati al consulente non cambiano. Senza decorrenza la modifica vale
 * anche per il passato — utile per correggere un errore di battitura.
 */
const decorrenzaSchema = z.object({
  decorrenza: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Decorrenza non valida (attesa yyyy-MM-dd)')
    .nullable()
    .optional(),
})

// La lettura della singola regola non esiste: la lista di
// GET /api/politiche-orario porta già tutti i campi, e il form di modifica
// parte da quelli. Una route senza consumatore invecchierebbe in silenzio.

// PUT /api/politiche-orario/[id]
export const PUT = withAuth<Params>(async (request: NextRequest, { params, user, venueId }) => {
  try {
    const { id } = params

    const esistente = await prisma.timekeepingPolicy.findFirst({
      where: { id, venueId },
      select: politicaSelect,
    })

    if (!esistente) {
      return notFound('Regola non trovata')
    }

    const body = await request.json()
    const dati = politicaOrarioSchema.parse(body)
    const { decorrenza } = decorrenzaSchema.parse(body)
    const { extraBreaks, ...campi } = dati

    if (decorrenza) {
      // Le versioni devono restare in ordine: una decorrenza precedente a
      // una già registrata renderebbe ambiguo quale valga per quei giorni.
      const ultimaVersione = await prisma.timekeepingPolicyVersion.findFirst({
        where: { policyId: id },
        orderBy: { effectiveUntil: 'desc' },
        select: { effectiveUntil: true },
      })
      const ultimaKey = ultimaVersione?.effectiveUntil.toISOString().slice(0, 10)
      if (ultimaKey && decorrenza <= ultimaKey) {
        return errorResponse(
          'La decorrenza deve essere successiva all\'ultima modifica già ' +
            `registrata (${ultimaKey.split('-').reverse().join('/')})`,
          422
        )
      }
    }

    const politica = await prisma.$transaction(async (tx) => {
      if (campi.isDefault) {
        await tx.timekeepingPolicy.updateMany({
          where: { venueId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        })
      }

      // Con la decorrenza, i valori correnti si congelano in una versione
      // valida per i giorni precedenti, prima di essere sovrascritti.
      if (decorrenza) {
        await tx.timekeepingPolicyVersion.create({
          data: {
            policyId: id,
            effectiveUntil: toDateOnlyUtc(decorrenza),
            name: esistente.name,
            dayStartMinutes: esistente.dayStartMinutes,
            dayEndMinutes: esistente.dayEndMinutes,
            lunchStartMinutes: esistente.lunchStartMinutes,
            lunchEndMinutes: esistente.lunchEndMinutes,
            useShiftAsWindow: esistente.useShiftAsWindow,
            flexMinutes: esistente.flexMinutes,
            roundingMinutes: esistente.roundingMinutes,
            roundingToleranceMinutes: esistente.roundingToleranceMinutes,
            roundingOutMinutes: esistente.roundingOutMinutes,
            roundingOutToleranceMinutes: esistente.roundingOutToleranceMinutes,
            maxDailyMinutes: esistente.maxDailyMinutes,
            contractWeeklyHours: esistente.contractWeeklyHours,
            saturdayAsOvertime: esistente.saturdayAsOvertime,
            blockSunday: esistente.blockSunday,
            singlePunchMode: esistente.singlePunchMode,
            extraBreaks: esistente.extraBreaks.map((pausa) => ({
              name: pausa.name,
              startMinutes: pausa.startMinutes,
              endMinutes: pausa.endMinutes,
            })),
          },
        })
      }

      // Le pause si riscrivono per intero: sono poche e senza identità propria
      // fuori dalla regola che le contiene.
      await tx.timekeepingPolicyBreak.deleteMany({ where: { policyId: id } })

      return tx.timekeepingPolicy.update({
        where: { id },
        data: {
          ...campi,
          extraBreaks: { create: extraBreaks },
        },
        select: politicaSelect,
      })
    })

    await createAuditLog({
      userId: user.id,
      action: 'UPDATE',
      entityType: 'TimekeepingPolicy',
      entityId: id,
      venueId,
      oldValues: esistente,
      newValues: { ...politica, decorrenza: decorrenza ?? null },
    })

    return ok({ data: politica })
  } catch (err) {
    return handleApiError(
      err,
      'PUT /api/politiche-orario/[id]',
      "Errore nell'aggiornamento della regola orario"
    )
  }
}, OPZIONI)

// DELETE /api/politiche-orario/[id]
export const DELETE = withAuth<Params>(async (_request: NextRequest, { params, user, venueId }) => {
  try {
    const { id } = params

    const politica = await prisma.timekeepingPolicy.findFirst({
      where: { id, venueId },
      select: {
        id: true,
        name: true,
        isDefault: true,
        _count: { select: { users: true, workLocations: true } },
      },
    })

    if (!politica) {
      return notFound('Regola non trovata')
    }

    // Cancellare una regola in uso cambierebbe in silenzio le ore già calcolate
    // di chi la sta usando: meglio costringere a riassegnare prima.
    const assegnazioni = politica._count.users + politica._count.workLocations
    if (assegnazioni > 0) {
      return conflict(
        `La regola è assegnata a ${assegnazioni} fra dipendenti e luoghi di lavoro: riassegnali prima di eliminarla`
      )
    }

    if (politica.isDefault) {
      return conflict(
        'Questa è la regola predefinita: impostane un altra come predefinita prima di eliminarla'
      )
    }

    await prisma.timekeepingPolicy.delete({ where: { id } })

    await createAuditLog({
      userId: user.id,
      action: 'DELETE',
      entityType: 'TimekeepingPolicy',
      entityId: id,
      venueId,
      oldValues: politica,
    })

    return ok({ success: true })
  } catch (err) {
    return handleApiError(
      err,
      'DELETE /api/politiche-orario/[id]',
      "Errore nell'eliminazione della regola orario"
    )
  }
}, OPZIONI)
