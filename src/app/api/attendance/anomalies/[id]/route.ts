import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { handleApiError, notFound, badRequest, ok, withAuth } from '@/lib/api-utils'

type Params = { id: string }

/**
 * Il dettaglio comprende email, coordinate GPS e modello del dispositivo della
 * persona segnalata: è riservato a chi le anomalie le deve gestire, gli stessi
 * ruoli che possono risolverle qui sotto. Fino ad agosto 2026 la sola GET non
 * aveva alcun controllo di ruolo e la proteggeva soltanto il fatto che il cuid
 * non si indovina.
 */
const RUOLI_GESTIONE = ['admin', 'manager'] as const

// GET /api/attendance/anomalies/[id] - Dettaglio anomalia
export const GET = withAuth<Params>(
  async (_request: NextRequest, { params }) => {
    try {
      const anomaly = await prisma.attendanceAnomaly.findUnique({
        where: { id: params.id },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          venue: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          record: {
            select: {
              id: true,
              punchType: true,
              punchMethod: true,
              punchedAt: true,
              latitude: true,
              longitude: true,
              distanceFromVenue: true,
              isWithinRadius: true,
              deviceInfo: true,
            },
          },
          assignment: {
            select: {
              id: true,
              date: true,
              startTime: true,
              endTime: true,
              actualStart: true,
              actualEnd: true,
              shiftDefinition: {
                select: {
                  name: true,
                  code: true,
                  color: true,
                },
              },
            },
          },
        },
      })

      if (!anomaly) {
        return notFound('Anomalia non trovata')
      }

      return ok({ data: anomaly })
    } catch (error) {
      return handleApiError(
        error,
        'GET /api/attendance/anomalies/[id]',
        "Errore nel recupero dell'anomalia"
      )
    }
  },
  { roles: RUOLI_GESTIONE }
)

// Schema per risoluzione
const resolveSchema = z.object({
  action: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().optional(),
})

// PUT /api/attendance/anomalies/[id] - Risolvi anomalia
export const PUT = withAuth<Params>(
  async (request: NextRequest, { params, user }) => {
    try {
      const body = await request.json()
      const validatedData = resolveSchema.parse(body)

      const anomaly = await prisma.attendanceAnomaly.findUnique({
        where: { id: params.id },
      })

      if (!anomaly) {
        return notFound('Anomalia non trovata')
      }

      if (anomaly.status !== 'PENDING') {
        return badRequest('Anomalia già risolta')
      }

      // Aggiorna anomalia
      const updated = await prisma.attendanceAnomaly.update({
        where: { id: params.id },
        data: {
          status: validatedData.action,
          resolvedBy: user.id,
          resolvedAt: new Date(),
          resolutionNotes: validatedData.notes ?? null,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          venue: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      })

      return ok({
        success: true,
        data: updated,
      })
    } catch (error) {
      return handleApiError(
        error,
        'PUT /api/attendance/anomalies/[id]',
        "Errore nella risoluzione dell'anomalia"
      )
    }
  },
  { roles: RUOLI_GESTIONE }
)
