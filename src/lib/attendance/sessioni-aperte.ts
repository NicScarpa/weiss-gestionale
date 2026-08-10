import { prisma } from '@/lib/prisma'
import {
  romeDayRange,
  romeTimeString,
  timeColumnToMinutes,
  toDateOnlyUtc,
} from '@/lib/timezone'

/**
 * Le sessioni di timbratura ancora aperte di una giornata: chi è entrato e
 * non ha mai timbrato l'uscita. Servono alla chiusura di cassa, che per
 * decisione di prodotto termina il servizio: prima dell'invio l'operatore
 * conferma o corregge l'orario di uscita di chi risulta ancora dentro.
 */

/**
 * Dagli eventi della giornata, chi risulta dentro: per ogni persona conta
 * l'ultima timbratura IN oppure OUT (le pause non chiudono la sessione).
 * Ritorna l'orario dell'entrata che ha aperto la sessione ancora in corso.
 */
export function ultimeEntrateAperte(
  records: { userId: string; punchType: string; punchedAt: Date }[]
): Map<string, Date> {
  const ordered = [...records].sort(
    (a, b) => a.punchedAt.getTime() - b.punchedAt.getTime()
  )

  const aperte = new Map<string, Date>()
  for (const record of ordered) {
    if (record.punchType === 'IN') {
      if (!aperte.has(record.userId)) {
        aperte.set(record.userId, record.punchedAt)
      }
    } else if (record.punchType === 'OUT') {
      aperte.delete(record.userId)
    }
  }

  return aperte
}

export interface SessioneAperta {
  userId: string
  firstName: string
  lastName: string
  /** Istante dell'entrata che ha aperto la sessione. */
  entrataAlle: Date
  /** Orario italiano 'HH:mm' dell'entrata, per la UI. */
  dentroDalle: string
  /** Fine dell'ultimo turno pianificato del giorno, 'HH:mm', se esiste. */
  finePrevista: string | null
}

/** Le sessioni aperte della giornata italiana `dateKey` per la sede. */
export async function trovaSessioniAperte(
  venueId: string,
  dateKey: string
): Promise<SessioneAperta[]> {
  const giornata = romeDayRange(dateKey)

  const records = await prisma.attendanceRecord.findMany({
    where: {
      venueId,
      punchType: { in: ['IN', 'OUT'] },
      punchedAt: { gte: giornata.start, lt: giornata.end },
    },
    select: { userId: true, punchType: true, punchedAt: true },
    orderBy: { punchedAt: 'asc' },
  })

  const aperte = ultimeEntrateAperte(records)
  if (aperte.size === 0) {
    return []
  }

  const userIds = [...aperte.keys()]
  const [utenti, turni] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.shiftAssignment.findMany({
      where: {
        venueId,
        userId: { in: userIds },
        date: toDateOnlyUtc(dateKey),
        schedule: { status: 'PUBLISHED' },
      },
      select: { userId: true, startTime: true, endTime: true },
    }),
  ])

  // La fine prevista è quella dell'ultimo turno pianificato del giorno: col
  // turno spezzato conta la fine della sera, non quella di mezzogiorno.
  const finePerUtente = new Map<string, number>()
  for (const turno of turni) {
    if (!turno.startTime || !turno.endTime) continue
    const inizio = timeColumnToMinutes(turno.startTime)
    let fine = timeColumnToMinutes(turno.endTime)
    if (fine <= inizio) {
      fine += 24 * 60
    }
    const attuale = finePerUtente.get(turno.userId)
    if (attuale === undefined || fine > attuale) {
      finePerUtente.set(turno.userId, fine)
    }
  }

  const formatta = (minuti: number) =>
    `${String(Math.floor((minuti % 1440) / 60)).padStart(2, '0')}:` +
    String(minuti % 60).padStart(2, '0')

  return utenti
    .map((utente) => {
      const entrataAlle = aperte.get(utente.id)!
      const fine = finePerUtente.get(utente.id)
      return {
        userId: utente.id,
        firstName: utente.firstName,
        lastName: utente.lastName,
        entrataAlle,
        dentroDalle: romeTimeString(entrataAlle),
        finePrevista: fine !== undefined ? formatta(fine) : null,
      }
    })
    .sort((a, b) => a.lastName.localeCompare(b.lastName))
}
