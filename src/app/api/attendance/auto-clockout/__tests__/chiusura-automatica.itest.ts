import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { prisma } from '@/lib/prisma'
import { romeDateKey, romeInstant, toDateOnlyUtc } from '@/lib/timezone'
import { generatePayrollData } from '@/lib/attendance/payroll-calculator'
import { POST as chiusuraAutomatica } from '../route'

/**
 * La chiusura automatica scrive un'uscita che nessuno ha timbrato, e quelle
 * ore finiscono in busta paga. Questi test guardano il DOPO: non solo che
 * l'orario sia giusto, ma che ciò che la chiusura produce sia **decidibile da
 * un umano**.
 *
 * Il difetto che hanno colto: con le regole che seguono il turno pianificato,
 * i minuti fuori dal turno restano sospesi (`pendingReviewMinutes`) finché un
 * responsabile non li approva o li rifiuta. La chiusura automatica scriveva
 * l'uscita con una `create` diretta, saltando `createManualPunch`, che è
 * l'unico punto in cui nasce l'anomalia da approvare. Risultato: ore né
 * pagate né perse, con l'export delle paghe bloccato e **niente in nessuna
 * schermata su cui cliccare**.
 */

vi.mock('@/lib/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notifications')>()),
  notifyAnomalyCreated: vi.fn().mockResolvedValue(undefined),
}))

setupIntegrationDb()

const CRON_SECRET = 'segreto-di-prova'

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET
})

/** Orario di una colonna `@db.Time`: 1° gennaio 1970 in UTC. */
function orarioTurno(minuti: number): Date {
  return new Date(Date.UTC(1970, 0, 1, Math.floor(minuti / 60), minuti % 60))
}

/**
 * Tre giorni fa: l'entrata deve essere più vecchia della soglia di chiusura
 * (12 ore) e dentro la finestra di recupero, senza dipendere dall'ora in cui
 * la suite gira.
 */
function giornoDiTest(): string {
  return romeDateKey(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000))
}

interface ScenarioInput {
  /** Orario dell'entrata timbrata, in minuti dalla mezzanotte italiana. */
  entrataMinuti: number
  /** Turno pianificato del giorno, in minuti dalla mezzanotte italiana. */
  turno: { inizio: number; fine: number }
  useShiftAsWindow?: boolean
}

async function preparaScenario(input: ScenarioInput) {
  const venue = await prisma.venue.findFirstOrThrow({ where: { isActive: true } })
  // Il calcolo paghe guarda solo chi ha il portale attivo: senza, il mese di
  // questa persona non verrebbe calcolato affatto e il test non misurerebbe
  // nulla.
  const utente = await prisma.user.update({
    where: {
      id: (
        await prisma.user.findFirstOrThrow({
          where: { venueId: venue.id, isActive: true },
        })
      ).id,
    },
    data: { portalEnabled: true },
  })
  const giorno = giornoDiTest()

  await prisma.timekeepingPolicy.create({
    data: {
      venueId: venue.id,
      name: 'Regola a turno',
      isDefault: true,
      isActive: true,
      dayStartMinutes: 6 * 60,
      dayEndMinutes: 24 * 60,
      useShiftAsWindow: input.useShiftAsWindow ?? true,
      // Blocchi da 30 minuti con 10 di tolleranza: le decisioni di prodotto
      // già in vigore per le regole che seguono il turno.
      roundingMinutes: 30,
      roundingToleranceMinutes: 10,
    },
  })

  const schedule = await prisma.shiftSchedule.create({
    data: {
      venueId: venue.id,
      startDate: toDateOnlyUtc(giorno),
      endDate: toDateOnlyUtc(giorno),
      status: 'PUBLISHED',
    },
  })

  const assignment = await prisma.shiftAssignment.create({
    data: {
      scheduleId: schedule.id,
      userId: utente.id,
      venueId: venue.id,
      date: toDateOnlyUtc(giorno),
      startTime: orarioTurno(input.turno.inizio),
      endTime: orarioTurno(input.turno.fine),
    },
  })

  const entrata = await prisma.attendanceRecord.create({
    data: {
      userId: utente.id,
      venueId: venue.id,
      assignmentId: assignment.id,
      punchType: 'IN',
      punchMethod: 'APP',
      punchedAt: romeInstant(giorno, input.entrataMinuti),
    },
  })

  return { venue, utente, giorno, assignment, entrata }
}

async function eseguiChiusuraAutomatica() {
  return callRoute(
    chiusuraAutomatica,
    jsonRequest('/api/attendance/auto-clockout', {
      method: 'POST',
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    })
  )
}

describe('POST /api/attendance/auto-clockout', () => {
  it('lascia da approvare le ore che tiene sospese', async () => {
    // Turno del mattino, ma la persona è entrata alle 14:00 e non ha mai
    // timbrato l'uscita: il lavoro cade tutto fuori dal pianificato. Il motore
    // sospende quelle ore, quindi qualcuno le deve poter decidere.
    const { utente, giorno } = await preparaScenario({
      entrataMinuti: 14 * 60,
      turno: { inizio: 9 * 60, fine: 13 * 60 },
    })

    const { status, body } = await eseguiChiusuraAutomatica()
    expect(status).toBe(200)
    expect((body as { summary: { autoClockoutsCreated: number } }).summary.autoClockoutsCreated).toBe(1)

    const daApprovare = await prisma.attendanceAnomaly.findMany({
      where: {
        userId: utente.id,
        date: toDateOnlyUtc(giorno),
        anomalyType: { in: ['EARLY_CLOCK_IN', 'OVERTIME'] },
        status: 'PENDING',
      },
    })

    expect(daApprovare).toHaveLength(1)
    expect(daApprovare[0].anomalyType).toBe('OVERTIME')
  })

  it('non lascia ore sospese senza nulla da decidere', async () => {
    // Il criterio in una frase: se il calcolo delle paghe tiene dei minuti in
    // sospeso, sulla stessa giornata deve esistere un'anomalia da approvare.
    // Prima non era così, e il mese restava non esportabile per sempre.
    const { utente, venue, giorno } = await preparaScenario({
      entrataMinuti: 14 * 60,
      turno: { inizio: 9 * 60, fine: 13 * 60 },
    })

    await eseguiChiusuraAutomatica()

    const [anno, mese] = giorno.split('-').map(Number)
    const paghe = await generatePayrollData(mese, anno, venue.id, {
      userIds: [utente.id],
    })
    const sospesi = paghe.summaries[0]?.totalPendingReviewMinutes ?? 0

    expect(sospesi).toBeGreaterThan(0)

    const daApprovare = await prisma.attendanceAnomaly.count({
      where: {
        userId: utente.id,
        anomalyType: { in: ['EARLY_CLOCK_IN', 'OVERTIME'] },
        status: 'PENDING',
      },
    })

    expect(daApprovare).toBeGreaterThan(0)
  })

  it("scrive l'uscita in modo che si distingua da una timbratura vera", async () => {
    // `WEB` è il valore di chi timbra dal telefono: usarlo per un orario che
    // il sistema ha supposto rendeva le due indistinguibili nei dati.
    const { utente } = await preparaScenario({
      entrataMinuti: 14 * 60,
      turno: { inizio: 9 * 60, fine: 13 * 60 },
    })

    await eseguiChiusuraAutomatica()

    const uscita = await prisma.attendanceRecord.findFirstOrThrow({
      where: { userId: utente.id, punchType: 'OUT' },
    })

    expect(uscita.punchMethod).toBe('MANUAL')
    expect(uscita.isManual).toBe(true)
    expect(uscita.manualEntryBy).toBe('SYSTEM')
  })

  it("segnala comunque l'uscita mancante", async () => {
    // L'anomalia storica non deve sparire: è quella che dice al titolare
    // perché su quella giornata c'è un orario che nessuno ha timbrato.
    const { utente, giorno } = await preparaScenario({
      entrataMinuti: 14 * 60,
      turno: { inizio: 9 * 60, fine: 13 * 60 },
    })

    await eseguiChiusuraAutomatica()

    const mancanti = await prisma.attendanceAnomaly.findMany({
      where: {
        userId: utente.id,
        date: toDateOnlyUtc(giorno),
        anomalyType: 'MISSING_CLOCK_OUT',
      },
    })

    expect(mancanti).toHaveLength(1)
    expect(mancanti[0].status).toBe('PENDING')
  })

  it('con l uscita alla fine del turno non inventa nulla da approvare', async () => {
    // Il caso ordinario: entrata regolare, uscita dimenticata, chiusura alla
    // fine del turno pianificato. Non c'è niente da decidere e non deve
    // comparire nessuna richiesta.
    const { utente } = await preparaScenario({
      entrataMinuti: 9 * 60,
      turno: { inizio: 9 * 60, fine: 13 * 60 },
    })

    await eseguiChiusuraAutomatica()

    const daApprovare = await prisma.attendanceAnomaly.count({
      where: {
        userId: utente.id,
        anomalyType: { in: ['EARLY_CLOCK_IN', 'OVERTIME'] },
      },
    })

    expect(daApprovare).toBe(0)
  })

  it("una correzione approvata prevale sull'orario scritto dal sistema", async () => {
    // Questo test presidia una **stringa**: il motore riconosce che un orario
    // è una supposizione del programma da `manualEntryBy === 'SYSTEM'`
    // (`AUTORE_SISTEMA`), e solo per questo una correzione approvata lo
    // sostituisce. Scritta e riletta stanno in due file diversi: se un domani
    // qualcuno cambia la costante da una parte sola, senza questo test le ore
    // tornerebbero sbagliate in silenzio.
    //
    // Turno del mattino, uscita dimenticata: il sistema chiude alle 13:00. La
    // persona era invece uscita alle 15:00 e la correzione viene approvata.
    // Senza il riconoscimento l'uscita delle 15:00 resterebbe orfana e la
    // giornata varrebbe 4 ore invece di 6.
    const { utente, venue, giorno } = await preparaScenario({
      entrataMinuti: 9 * 60,
      turno: { inizio: 9 * 60, fine: 13 * 60 },
      useShiftAsWindow: false,
    })

    await eseguiChiusuraAutomatica()

    const richiesta = await prisma.attendanceCorrectionRequest.create({
      data: {
        userId: utente.id,
        venueId: venue.id,
        date: toDateOnlyUtc(giorno),
        requestedClockOut: romeInstant(giorno, 15 * 60),
        reason: 'Uscita reale alle 15:00',
        status: 'APPROVED',
      },
    })

    await prisma.attendanceRecord.create({
      data: {
        userId: utente.id,
        venueId: venue.id,
        punchType: 'OUT',
        punchMethod: 'MANUAL',
        punchedAt: romeInstant(giorno, 15 * 60),
        isManual: true,
        manualEntryBy: utente.id,
        manualEntryReason: 'Correzione approvata',
        correctionRequestId: richiesta.id,
      },
    })

    const [anno, mese] = giorno.split('-').map(Number)
    const paghe = await generatePayrollData(mese, anno, venue.id, {
      userIds: [utente.id],
    })
    const giornata = paghe.records.find(
      (r) => r.date.toISOString().slice(0, 10) === giorno
    )

    expect(giornata?.hours.total).toBe(6)
  })

  it('chiude una sola volta la stessa entrata', async () => {
    const { utente } = await preparaScenario({
      entrataMinuti: 14 * 60,
      turno: { inizio: 9 * 60, fine: 13 * 60 },
    })

    await eseguiChiusuraAutomatica()
    await eseguiChiusuraAutomatica()

    const uscite = await prisma.attendanceRecord.count({
      where: { userId: utente.id, punchType: 'OUT' },
    })

    expect(uscite).toBe(1)
  })
})
