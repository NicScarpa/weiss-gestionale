import { PunchMethod, PunchType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  romeDateKey,
  romeDayRange,
  toDateOnlyUtc,
  toRomeParts,
} from '@/lib/timezone'

/**
 * Il client dentro `prisma.$transaction`: con il client esteso dall'adapter
 * il tipo `Prisma.TransactionClient` di libreria non combacia, quindi lo si
 * ricava da quello reale.
 */
export type TransactionClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

/**
 * Creazione di una timbratura manuale: trova il turno pianificato della
 * giornata, crea il record e aggiorna il consuntivo del turno.
 *
 * È in una funzione sola perché ha già due chiamanti — l'inserimento diretto
 * dell'amministratore e l'approvazione di una richiesta di correzione — e
 * duplicare questa logica significherebbe due verità diverse su come nasce
 * una timbratura manuale.
 *
 * Accetta un TransactionClient: l'approvazione di una richiesta crea entrata
 * e uscita insieme, e o entrano entrambe o nessuna.
 */

export interface ManualPunchInput {
  userId: string
  venueId: string
  workLocationId?: string | null
  punchType: PunchType
  punchedAt: Date
  /** Chi la sta inserendo (admin, manager o revisore della richiesta). */
  enteredById: string
  reason: string
  notes?: string | null
  /** Richiesta di correzione approvata da cui questa timbratura nasce. */
  correctionRequestId?: string | null
}

export async function createManualPunch(
  tx: TransactionClient,
  input: ManualPunchInput
) {
  // Il giorno è quello civile italiano della timbratura, e `date` è una
  // colonna @db.Date: si confronta con la mezzanotte UTC del giorno.
  const giornoItaliano = romeDateKey(input.punchedAt)
  const giorno = romeDayRange(giornoItaliano)

  const assignment = await tx.shiftAssignment.findFirst({
    where: {
      userId: input.userId,
      venueId: input.venueId,
      date: toDateOnlyUtc(giornoItaliano),
      schedule: {
        status: 'PUBLISHED',
      },
    },
  })

  const record = await tx.attendanceRecord.create({
    data: {
      userId: input.userId,
      venueId: input.venueId,
      assignmentId: assignment?.id ?? null,
      workLocationId: input.workLocationId ?? null,
      punchType: input.punchType,
      punchMethod: PunchMethod.MANUAL,
      punchedAt: input.punchedAt,
      isManual: true,
      manualEntryBy: input.enteredById,
      manualEntryReason: input.reason,
      notes: input.notes ?? null,
      isWithinRadius: true, // Manuale = sempre valido
      correctionRequestId: input.correctionRequestId ?? null,
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

  // Aggiorna il consuntivo del turno.
  // `actualStart`/`actualEnd` sono colonne @db.Time: orario italiano,
  // costruito in UTC per non dipendere dal fuso del server.
  if (assignment) {
    const punchMinutes = toRomeParts(input.punchedAt).minutesFromMidnight
    const timeOnly = new Date(
      Date.UTC(
        1970,
        0,
        1,
        Math.floor(punchMinutes / 60),
        punchMinutes % 60,
        input.punchedAt.getUTCSeconds()
      )
    )

    if (input.punchType === 'IN') {
      await tx.shiftAssignment.update({
        where: { id: assignment.id },
        data: { actualStart: timeOnly },
      })
    } else if (input.punchType === 'OUT') {
      // Trova l'entrata per calcolare le ore
      const clockIn = await tx.attendanceRecord.findFirst({
        where: {
          userId: input.userId,
          venueId: input.venueId,
          punchType: 'IN',
          punchedAt: {
            gte: giorno.start,
            lt: giorno.end,
          },
        },
        orderBy: { punchedAt: 'asc' },
      })

      let hoursWorked: number | null = null
      if (clockIn) {
        const diffMs = input.punchedAt.getTime() - clockIn.punchedAt.getTime()
        hoursWorked = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100
      }

      await tx.shiftAssignment.update({
        where: { id: assignment.id },
        data: {
          actualEnd: timeOnly,
          hoursWorked,
          status: 'WORKED',
        },
      })
    }
  }

  return record
}
