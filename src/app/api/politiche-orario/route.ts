import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createAuditLog } from '@/lib/audit'
import { created, handleApiError, ok, withAuth } from '@/lib/api-utils'
import { politicaOrarioSchema } from '@/lib/validations/politiche-orario'

/** Le regole orario decidono le ore pagate di tutti: solo admin e manager. */
export const RUOLI_REGOLE = ['admin', 'manager'] as const

/** Campi restituiti al client, uguali in lista e in dettaglio. */
export const politicaSelect = {
  id: true,
  name: true,
  isDefault: true,
  isActive: true,
  dayStartMinutes: true,
  dayEndMinutes: true,
  lunchStartMinutes: true,
  lunchEndMinutes: true,
  flexMinutes: true,
  roundingMinutes: true,
  roundingToleranceMinutes: true,
  roundingOutMinutes: true,
  roundingOutToleranceMinutes: true,
  maxDailyMinutes: true,
  contractWeeklyHours: true,
  saturdayAsOvertime: true,
  blockSunday: true,
  singlePunchMode: true,
  useShiftAsWindow: true,
  createdAt: true,
  updatedAt: true,
  extraBreaks: {
    select: { id: true, name: true, startMinutes: true, endMinutes: true },
    orderBy: { startMinutes: 'asc' },
  },
  // Il conteggio deve combaciare con la guardia dell'eliminazione, che conta
  // dipendenti E luoghi: mostrare solo i dipendenti fa cercare assegnazioni
  // che non esistono.
  _count: { select: { users: true, workLocations: true } },
} as const

// GET /api/politiche-orario - Elenco delle regole orario
export const GET = withAuth(async (_request: NextRequest, { venueId }) => {
  try {
    const politiche = await prisma.timekeepingPolicy.findMany({
      where: { venueId },
      select: politicaSelect,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })

    return ok({ data: politiche })
  } catch (error) {
    return handleApiError(
      error,
      'GET /api/politiche-orario',
      'Errore nel recupero delle regole orario'
    )
  }
}, { roles: RUOLI_REGOLE, venueScoped: true })

// POST /api/politiche-orario - Crea una regola orario
export const POST = withAuth(async (request: NextRequest, { user, venueId }) => {
  try {
    const dati = politicaOrarioSchema.parse(await request.json())

    const { extraBreaks, ...campi } = dati

    // Una sola regola predefinita per volta: il vincolo non è esprimibile nello
    // schema, quindi si applica qui, dentro la transazione che crea la regola.
    const politica = await prisma.$transaction(async (tx) => {
      if (campi.isDefault) {
        await tx.timekeepingPolicy.updateMany({
          where: { venueId, isDefault: true },
          data: { isDefault: false },
        })
      }

      return tx.timekeepingPolicy.create({
        data: {
          ...campi,
          venueId,
          extraBreaks: { create: extraBreaks },
        },
        select: politicaSelect,
      })
    })

    await createAuditLog({
      userId: user.id,
      action: 'CREATE',
      entityType: 'TimekeepingPolicy',
      entityId: politica.id,
      venueId,
      newValues: politica,
    })

    return created({ data: politica })
  } catch (error) {
    return handleApiError(
      error,
      'POST /api/politiche-orario',
      'Errore nella creazione della regola orario'
    )
  }
}, { roles: RUOLI_REGOLE, venueScoped: true })
