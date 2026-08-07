import { PunchMethod, PunchType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  romeDateKey,
  romeDayRange,
  romeTimeString,
  timeColumnToMinutes,
  toDateOnlyUtc,
  toRomeParts,
} from '@/lib/timezone'
import { getEffectiveTimekeepingPolicy } from './policy-resolver'
import { toWorkdayMinutes } from './workday'

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
  /**
   * Giornata lavorativa di appartenenza, 'yyyy-MM-dd'. Senza indicazione vale
   * il giorno civile italiano della timbratura — ma l'uscita all'1:30 del
   * turno serale appartiene al giorno prima, e chi lo sa deve dirlo.
   */
  workdayKey?: string
  /**
   * Esito della segnalazione anticipo/straordinario per le regole che
   * seguono il turno. 'APPROVED' (default) per gli orari già decisi da un
   * umano — inserimento admin, correzione approvata — così le ore contano
   * subito; 'PENDING' quando la revisione deve ancora avvenire, come per le
   * uscite confermate in chiusura di cassa.
   */
  revisioneScostamento?: 'APPROVED' | 'PENDING'
}

/**
 * Con le regole che seguono il turno, una timbratura manuale fuori dal
 * pianificato deve produrre la stessa anomalia della timbratura vera:
 * senza, le ore oltre il turno resterebbero sospese per sempre, con
 * l'export bloccato e niente da approvare.
 */
async function segnalaScostamentoDalTurno(
  tx: TransactionClient,
  input: ManualPunchInput,
  recordId: string,
  workdayKey: string
): Promise<void> {
  if (input.punchType !== 'IN' && input.punchType !== 'OUT') {
    return
  }

  const { rules } = await getEffectiveTimekeepingPolicy(
    input.userId,
    input.venueId,
    input.workLocationId ?? null
  )
  if (!rules.useShiftAsWindow) {
    return
  }

  const turni = await tx.shiftAssignment.findMany({
    where: {
      userId: input.userId,
      venueId: input.venueId,
      date: toDateOnlyUtc(workdayKey),
      schedule: { status: 'PUBLISHED' },
    },
    select: { id: true, startTime: true, endTime: true },
  })

  const finestre = turni
    .filter((t) => t.startTime && t.endTime)
    .map((t) => {
      const inizio = timeColumnToMinutes(t.startTime!)
      let fine = timeColumnToMinutes(t.endTime!)
      if (fine <= inizio) {
        fine += 24 * 60
      }
      return { id: t.id, inizio, fine }
    })
  if (finestre.length === 0) {
    return
  }

  const formatta = (minuti: number) =>
    `${String(Math.floor((minuti % 1440) / 60)).padStart(2, '0')}:` +
    String(minuti % 60).padStart(2, '0')

  const minuti = toWorkdayMinutes(input.punchedAt, workdayKey)

  let anomalia: {
    anomalyType: 'EARLY_CLOCK_IN' | 'OVERTIME'
    assignmentId: string
    description: string
    expectedValue: string
    differenceMinutes: number
  } | null = null

  if (input.punchType === 'IN') {
    const prossima = finestre
      .filter((f) => f.inizio > minuti)
      .sort((a, b) => a.inizio - b.inizio)[0]
    const anticipo = prossima ? prossima.inizio - minuti : 0

    if (prossima && anticipo > rules.entryRounding.toleranceMinutes) {
      anomalia = {
        anomalyType: 'EARLY_CLOCK_IN',
        assignmentId: prossima.id,
        description:
          `Entrata ${anticipo} minuti prima dell'inizio del turno ` +
          'pianificato (timbratura manuale)',
        expectedValue: formatta(prossima.inizio),
        differenceMinutes: anticipo,
      }
    }
  } else {
    const riferimento = [...finestre].sort(
      (a, b) => Math.abs(a.fine - minuti) - Math.abs(b.fine - minuti)
    )[0]
    const oltre = minuti - riferimento.fine

    if (oltre > rules.exitRounding.toleranceMinutes) {
      anomalia = {
        anomalyType: 'OVERTIME',
        assignmentId: riferimento.id,
        description:
          `Uscita ${oltre} minuti oltre la fine del turno pianificato ` +
          '(timbratura manuale)',
        expectedValue: formatta(riferimento.fine),
        differenceMinutes: oltre,
      }
    }
  }

  if (!anomalia) {
    return
  }

  const esito = input.revisioneScostamento ?? 'APPROVED'
  await tx.attendanceAnomaly.create({
    data: {
      userId: input.userId,
      venueId: input.venueId,
      recordId,
      assignmentId: anomalia.assignmentId,
      anomalyType: anomalia.anomalyType,
      status: esito,
      date: toDateOnlyUtc(workdayKey),
      description: anomalia.description,
      actualValue: romeTimeString(input.punchedAt),
      expectedValue: anomalia.expectedValue,
      differenceMinutes: anomalia.differenceMinutes,
      ...(esito === 'APPROVED' && {
        resolvedBy: input.enteredById,
        resolvedAt: new Date(),
        resolutionNotes: 'Decisa insieme alla timbratura manuale',
      }),
    },
  })
}

export async function createManualPunch(
  tx: TransactionClient,
  input: ManualPunchInput
) {
  // Il giorno è quello civile italiano della timbratura — salvo che il
  // chiamante sappia che la giornata lavorativa è un'altra (l'uscita dopo
  // mezzanotte del turno serale). `date` è una colonna @db.Date: si
  // confronta con la mezzanotte UTC del giorno.
  const giornoItaliano = input.workdayKey ?? romeDateKey(input.punchedAt)
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

  await segnalaScostamentoDalTurno(tx, input, record.id, giornoItaliano)

  return record
}
