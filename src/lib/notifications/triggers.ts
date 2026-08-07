/**
 * Notification Triggers
 *
 * Funzioni per inviare notifiche quando si verificano eventi specifici.
 * Queste funzioni dovrebbero essere chiamate dalle API quando gli eventi si verificano.
 */

import { prisma } from '@/lib/prisma'
import { sendNotification, sendBulkNotification } from './send'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

/**
 * Invia notifiche quando i turni vengono pubblicati
 */
export async function notifyShiftPublished(
  scheduleId: string,
  options?: { excludeUserId?: string }
): Promise<void> {
  const schedule = await prisma.shiftSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      venue: true,
      assignments: {
        select: { userId: true },
      },
    },
  })

  if (!schedule) return

  // Ottieni utenti unici assegnati
  let userIds = [...new Set(schedule.assignments.map((a) => a.userId))]

  // Escludi l'utente che ha pubblicato (se specificato)
  if (options?.excludeUserId) {
    userIds = userIds.filter((id) => id !== options.excludeUserId)
  }

  if (userIds.length === 0) return

  const startDate = format(schedule.startDate, 'd MMMM', { locale: it })
  const endDate = format(schedule.endDate, 'd MMMM', { locale: it })

  await sendBulkNotification({
    userIds,
    payload: {
      type: 'SHIFT_PUBLISHED',
      title: 'Nuovi Turni Pubblicati',
      body: `I turni dal ${startDate} al ${endDate} sono stati pubblicati`,
      url: '/portale/turni',
      referenceId: scheduleId,
      referenceType: 'ShiftSchedule',
      data: {
        scheduleId,
        startDate: schedule.startDate.toISOString(),
        endDate: schedule.endDate.toISOString(),
        venueName: schedule.venue.name,
      },
    },
  })
}

/**
 * Invia promemoria turno
 */
export async function notifyShiftReminder(
  assignmentId: string
): Promise<void> {
  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      user: true,
      venue: true,
      shiftDefinition: true,
    },
  })

  if (!assignment) return

  const startTime = format(assignment.startTime, 'HH:mm', { locale: it })
  const shiftName = assignment.shiftDefinition?.name || 'Turno'

  await sendNotification({
    userId: assignment.userId,
    payload: {
      type: 'SHIFT_REMINDER',
      title: 'Promemoria Turno',
      body: `Il tuo turno "${shiftName}" inizia alle ${startTime}`,
      url: '/portale/timbra',
      referenceId: assignmentId,
      referenceType: 'ShiftAssignment',
      data: {
        assignmentId,
        shiftName,
        startTime,
        venueName: assignment.venue.name,
      },
    },
  })
}

/**
 * Invia notifica anomalia creata (al dipendente e al manager)
 */
export async function notifyAnomalyCreated(
  anomalyId: string
): Promise<void> {
  const anomaly = await prisma.attendanceAnomaly.findUnique({
    where: { id: anomalyId },
    include: {
      user: true,
      venue: {
        include: {
          users: {
            where: {
              role: {
                name: { in: ['admin', 'manager'] },
              },
            },
            select: { id: true },
          },
        },
      },
    },
  })

  if (!anomaly) return

  const date = format(anomaly.date, 'd MMMM', { locale: it })
  const anomalyTypeLabels: Record<string, string> = {
    EARLY_CLOCK_IN: 'Timbratura anticipata',
    LATE_CLOCK_IN: 'Ritardo',
    EARLY_CLOCK_OUT: 'Uscita anticipata',
    LATE_CLOCK_OUT: 'Straordinario',
    OUTSIDE_LOCATION: 'Fuori sede',
    MISSING_CLOCK_OUT: 'Uscita mancante',
    OVERTIME: 'Ore extra',
    MISSING_BREAK: 'Pausa mancante',
    SHORT_BREAK: 'Pausa breve',
  }

  const typeLabel = anomalyTypeLabels[anomaly.anomalyType] || anomaly.anomalyType

  // Notifica al dipendente
  await sendNotification({
    userId: anomaly.userId,
    payload: {
      type: 'ANOMALY_CREATED',
      title: 'Anomalia Rilevata',
      body: `${typeLabel} del ${date}`,
      url: '/portale/presenze',
      referenceId: anomalyId,
      referenceType: 'AttendanceAnomaly',
      data: {
        anomalyId,
        anomalyType: anomaly.anomalyType,
        date: anomaly.date.toISOString(),
      },
    },
  })

  // Notifica ai manager della sede
  const managerIds = anomaly.venue.users.map((u) => u.id)
  if (managerIds.length > 0) {
    await sendBulkNotification({
      userIds: managerIds,
      payload: {
        type: 'STAFF_ANOMALY',
        title: 'Anomalia Staff',
        body: `${typeLabel} per ${anomaly.user.firstName} ${anomaly.user.lastName}`,
        url: '/presenze/anomalie',
        referenceId: anomalyId,
        referenceType: 'AttendanceAnomaly',
        data: {
          anomalyId,
          anomalyType: anomaly.anomalyType,
          date: anomaly.date.toISOString(),
          employeeName: `${anomaly.user.firstName} ${anomaly.user.lastName}`,
        },
      },
    })
  }
}

/**
 * Uscita ben prima della fine del turno pianificato: niente approvazione —
 * le ore restano quelle reali e gli errori li corregge l'admin a mano — ma
 * il responsabile deve saperlo subito, non scoprirlo a fine mese.
 */
export async function notifyUscitaAnticipata(input: {
  userId: string
  venueId: string
  minutiAnticipo: number
  orarioUscita: string
  fineTurno: string
}): Promise<void> {
  const [dipendente, responsabili] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { firstName: true, lastName: true },
    }),
    prisma.user.findMany({
      where: {
        venueId: input.venueId,
        isActive: true,
        role: { name: { in: ['admin', 'manager'] } },
      },
      select: { id: true },
    }),
  ])

  if (!dipendente || responsabili.length === 0) return

  await sendBulkNotification({
    userIds: responsabili.map((r) => r.id),
    payload: {
      type: 'STAFF_ANOMALY',
      title: 'Uscita anticipata',
      body:
        `${dipendente.firstName} ${dipendente.lastName} ha timbrato l'uscita ` +
        `alle ${input.orarioUscita}, ${input.minutiAnticipo} min prima della ` +
        `fine del turno (${input.fineTurno})`,
      url: '/presenze',
    },
  })
}

/**
 * Mancata uscita a metà del turno spezzato: il buco non verrà contato, ma
 * dipendente e responsabile devono saperlo subito per correggere in giornata.
 */
export async function notifyMancataUscitaSpezzato(input: {
  userId: string
  venueId: string
  fineFinestra: string
}): Promise<void> {
  const [dipendente, responsabili] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { firstName: true, lastName: true },
    }),
    prisma.user.findMany({
      where: {
        venueId: input.venueId,
        isActive: true,
        role: { name: { in: ['admin', 'manager'] } },
      },
      select: { id: true },
    }),
  ])

  if (!dipendente || responsabili.length === 0) return

  await sendBulkNotification({
    userIds: responsabili.map((r) => r.id),
    payload: {
      type: 'STAFF_ANOMALY',
      title: 'Uscita non timbrata (turno spezzato)',
      body:
        `${dipendente.firstName} ${dipendente.lastName} non ha timbrato ` +
        `l'uscita della prima parte del turno spezzato (fine ${input.fineFinestra}): ` +
        'il buco fra le due parti non verrà contato',
      url: '/presenze',
    },
  })
}

/**
 * Invia notifica anomalia risolta
 */
export async function notifyAnomalyResolved(
  anomalyId: string
): Promise<void> {
  const anomaly = await prisma.attendanceAnomaly.findUnique({
    where: { id: anomalyId },
    include: { user: true },
  })

  if (!anomaly) return

  const date = format(anomaly.date, 'd MMMM', { locale: it })

  await sendNotification({
    userId: anomaly.userId,
    payload: {
      type: 'ANOMALY_RESOLVED',
      title: 'Anomalia Risolta',
      body: `L'anomalia del ${date} è stata risolta`,
      url: '/portale/presenze',
      referenceId: anomalyId,
      referenceType: 'AttendanceAnomaly',
    },
  })
}

/**
 * Invia notifica ferie approvate
 */
export async function notifyLeaveApproved(
  requestId: string
): Promise<void> {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { leaveType: true },
  })

  if (!request) return

  const startDate = format(request.startDate, 'd MMMM', { locale: it })
  const endDate = format(request.endDate, 'd MMMM', { locale: it })
  const period =
    request.startDate.getTime() === request.endDate.getTime()
      ? startDate
      : `${startDate} - ${endDate}`

  await sendNotification({
    userId: request.userId,
    payload: {
      type: 'LEAVE_APPROVED',
      title: `${request.leaveType.name} Approvate`,
      body: `La tua richiesta per ${period} è stata approvata`,
      url: '/portale/ferie',
      referenceId: requestId,
      referenceType: 'LeaveRequest',
      data: {
        requestId,
        leaveType: request.leaveType.name,
        startDate: request.startDate.toISOString(),
        endDate: request.endDate.toISOString(),
        status: 'APPROVED',
      },
    },
  })
}

/**
 * Invia notifica ferie rifiutate
 */
export async function notifyLeaveRejected(
  requestId: string,
  reason?: string
): Promise<void> {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { leaveType: true },
  })

  if (!request) return

  const startDate = format(request.startDate, 'd MMMM', { locale: it })
  const endDate = format(request.endDate, 'd MMMM', { locale: it })
  const period =
    request.startDate.getTime() === request.endDate.getTime()
      ? startDate
      : `${startDate} - ${endDate}`

  await sendNotification({
    userId: request.userId,
    payload: {
      type: 'LEAVE_REJECTED',
      title: `${request.leaveType.name} Non Approvate`,
      body: reason
        ? `La tua richiesta per ${period} non è stata approvata: ${reason}`
        : `La tua richiesta per ${period} non è stata approvata`,
      url: '/portale/ferie',
      referenceId: requestId,
      referenceType: 'LeaveRequest',
      data: {
        requestId,
        leaveType: request.leaveType.name,
        startDate: request.startDate.toISOString(),
        endDate: request.endDate.toISOString(),
        status: 'REJECTED',
      },
    },
  })
}

/**
 * Invia notifica nuova richiesta ferie (ai manager)
 */
export async function notifyNewLeaveRequest(
  requestId: string
): Promise<void> {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      user: {
        include: {
          venue: {
            include: {
              users: {
                where: {
                  role: {
                    name: { in: ['admin', 'manager'] },
                  },
                },
                select: { id: true },
              },
            },
          },
        },
      },
      leaveType: true,
    },
  })

  if (!request || !request.user.venue) return

  const startDate = format(request.startDate, 'd MMMM', { locale: it })
  const endDate = format(request.endDate, 'd MMMM', { locale: it })
  const period =
    request.startDate.getTime() === request.endDate.getTime()
      ? startDate
      : `${startDate} - ${endDate}`

  const managerIds = request.user.venue.users.map((u) => u.id)
  if (managerIds.length === 0) return

  await sendBulkNotification({
    userIds: managerIds,
    payload: {
      type: 'NEW_LEAVE_REQUEST',
      title: 'Nuova Richiesta Ferie',
      body: `${request.user.firstName} ${request.user.lastName} richiede ${request.leaveType.name} (${period})`,
      url: '/ferie',
      referenceId: requestId,
      referenceType: 'LeaveRequest',
      data: {
        requestId,
        leaveType: request.leaveType.name,
        startDate: request.startDate.toISOString(),
        endDate: request.endDate.toISOString(),
        employeeName: `${request.user.firstName} ${request.user.lastName}`,
      },
    },
  })
}

/**
 * Invia notifica richiesta scambio turno (al collega destinatario)
 */
export async function notifySwapRequest(
  assignmentId: string
): Promise<void> {
  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      user: true,
      venue: true,
      shiftDefinition: true,
    },
  })

  if (!assignment || !assignment.swapWithUserId) return

  // Ottieni info su chi ha richiesto lo scambio
  const requester = assignment.swapRequestedById
    ? await prisma.user.findUnique({
        where: { id: assignment.swapRequestedById },
        select: { firstName: true, lastName: true },
      })
    : null

  const date = format(assignment.date, 'd MMMM', { locale: it })
  const shiftName = assignment.shiftDefinition?.name || 'Turno'
  const requesterName = requester
    ? `${requester.firstName} ${requester.lastName}`
    : 'Un collega'

  await sendNotification({
    userId: assignment.swapWithUserId,
    payload: {
      type: 'SHIFT_SWAP_REQUEST',
      title: 'Richiesta Scambio Turno',
      body: `${requesterName} ti chiede di scambiare il turno "${shiftName}" del ${date}`,
      url: '/portale/scambi',
      referenceId: assignmentId,
      referenceType: 'ShiftAssignment',
      data: {
        assignmentId,
        shiftName,
        date: assignment.date.toISOString(),
        requesterName,
        venueName: assignment.venue.name,
      },
    },
  })
}

/**
 * Invia notifica scambio turno approvato (a chi ha richiesto lo scambio)
 */
export async function notifySwapApproved(
  assignmentId: string
): Promise<void> {
  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      venue: true,
      shiftDefinition: true,
    },
  })

  if (!assignment || !assignment.swapRequestedById) return

  // Ottieni info su chi ha accettato lo scambio
  const accepter = assignment.swapWithUserId
    ? await prisma.user.findUnique({
        where: { id: assignment.swapWithUserId },
        select: { firstName: true, lastName: true },
      })
    : null

  const date = format(assignment.date, 'd MMMM', { locale: it })
  const shiftName = assignment.shiftDefinition?.name || 'Turno'
  const accepterName = accepter
    ? `${accepter.firstName} ${accepter.lastName}`
    : 'Il collega'

  await sendNotification({
    userId: assignment.swapRequestedById,
    payload: {
      type: 'SHIFT_SWAP_APPROVED',
      title: 'Scambio Turno Accettato',
      body: `${accepterName} ha accettato lo scambio del turno "${shiftName}" del ${date}`,
      url: '/portale/scambi',
      referenceId: assignmentId,
      referenceType: 'ShiftAssignment',
      data: {
        assignmentId,
        shiftName,
        date: assignment.date.toISOString(),
        accepterName,
        venueName: assignment.venue.name,
      },
    },
  })
}

/**
 * Invia notifica scambio turno rifiutato (a chi ha richiesto lo scambio)
 */
export async function notifySwapRejected(
  assignmentId: string,
  rejecterId: string,
  requesterId: string
): Promise<void> {
  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      venue: true,
      shiftDefinition: true,
    },
  })

  if (!assignment) return

  // Ottieni info su chi ha rifiutato
  const rejecter = await prisma.user.findUnique({
    where: { id: rejecterId },
    select: { firstName: true, lastName: true },
  })

  const date = format(assignment.date, 'd MMMM', { locale: it })
  const shiftName = assignment.shiftDefinition?.name || 'Turno'
  const rejecterName = rejecter
    ? `${rejecter.firstName} ${rejecter.lastName}`
    : 'Il collega'

  await sendNotification({
    userId: requesterId,
    payload: {
      type: 'SHIFT_SWAP_REJECTED',
      title: 'Scambio Turno Rifiutato',
      body: `${rejecterName} ha rifiutato lo scambio del turno "${shiftName}" del ${date}`,
      url: '/portale/scambi',
      referenceId: assignmentId,
      referenceType: 'ShiftAssignment',
      data: {
        assignmentId,
        shiftName,
        date: assignment.date.toISOString(),
        rejecterName,
        venueName: assignment.venue.name,
      },
    },
  })
}

/**
 * Nuova richiesta di correzione timbrature: avvisa i responsabili della sede.
 */
export async function notifyNewCorrectionRequest(
  requestId: string
): Promise<void> {
  const request = await prisma.attendanceCorrectionRequest.findUnique({
    where: { id: requestId },
    include: {
      user: {
        include: {
          venue: {
            include: {
              users: {
                where: {
                  role: {
                    name: { in: ['admin', 'manager'] },
                  },
                },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  })

  if (!request || !request.user.venue) return

  const managerIds = request.user.venue.users.map((u) => u.id)
  if (managerIds.length === 0) return

  const giorno = format(request.date, 'd MMMM', { locale: it })

  await sendBulkNotification({
    userIds: managerIds,
    payload: {
      type: 'NEW_CORRECTION_REQUEST',
      title: 'Richiesta di Correzione Timbrature',
      body: `${request.user.firstName} ${request.user.lastName} chiede una correzione per il ${giorno}`,
      url: '/presenze/richieste',
      referenceId: requestId,
      referenceType: 'AttendanceCorrectionRequest',
      data: {
        requestId,
        date: request.date.toISOString(),
        employeeName: `${request.user.firstName} ${request.user.lastName}`,
      },
    },
  })
}

/**
 * Richiesta di correzione approvata: avvisa chi l'aveva chiesta.
 */
export async function notifyCorrectionApproved(
  requestId: string
): Promise<void> {
  const request = await prisma.attendanceCorrectionRequest.findUnique({
    where: { id: requestId },
  })

  if (!request) return

  const giorno = format(request.date, 'd MMMM', { locale: it })

  await sendNotification({
    userId: request.userId,
    payload: {
      type: 'CORRECTION_APPROVED',
      title: 'Correzione Approvata',
      body: `La correzione delle timbrature del ${giorno} è stata approvata`,
      url: '/portale/correzioni',
      referenceId: requestId,
      referenceType: 'AttendanceCorrectionRequest',
      data: {
        requestId,
        date: request.date.toISOString(),
        status: 'APPROVED',
      },
    },
  })
}

/**
 * Richiesta di correzione rifiutata: avvisa chi l'aveva chiesta, con il motivo.
 */
export async function notifyCorrectionRejected(
  requestId: string,
  reason?: string
): Promise<void> {
  const request = await prisma.attendanceCorrectionRequest.findUnique({
    where: { id: requestId },
  })

  if (!request) return

  const giorno = format(request.date, 'd MMMM', { locale: it })

  await sendNotification({
    userId: request.userId,
    payload: {
      type: 'CORRECTION_REJECTED',
      title: 'Correzione Rifiutata',
      body: reason
        ? `La correzione del ${giorno} è stata rifiutata: ${reason}`
        : `La correzione delle timbrature del ${giorno} è stata rifiutata`,
      url: '/portale/correzioni',
      referenceId: requestId,
      referenceType: 'AttendanceCorrectionRequest',
      data: {
        requestId,
        date: request.date.toISOString(),
        status: 'REJECTED',
      },
    },
  })
}
