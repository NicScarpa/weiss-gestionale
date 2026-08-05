import { prisma } from '@/lib/prisma'
import type { PolicyRules } from './timekeeping-types'

/**
 * Quale regola oraria si applica a chi.
 *
 * La precedenza è quella di NoBadge, che risolve bene il caso reale: il luogo
 * di lavoro può imporre le proprie regole a chiunque ci lavori (orari di
 * apertura, pause), altrimenti vale il contratto della singola persona,
 * altrimenti la regola predefinita dell'azienda. Se non ce n'è nessuna, il
 * calcolo resta quello che era prima che le regole esistessero.
 *
 * La precedenza è risolta in un punto solo: se venisse reinterpretata nelle
 * schermate, nell'export e nel calcolo, prima o poi darebbero risposte diverse.
 */

/** Convenzione già in uso nel calcolo paghe: settimana contrattuale su sei giorni. */
const CONTRACT_DAYS_PER_WEEK = 6

/** Forma minima di una riga di regola, così i test non dipendono da Prisma. */
export interface TimekeepingPolicyRow {
  id: string
  name: string
  dayStartMinutes: number
  dayEndMinutes: number
  lunchStartMinutes: number | null
  lunchEndMinutes: number | null
  flexMinutes: number
  roundingMinutes: number
  roundingToleranceMinutes: number
  roundingOutMinutes: number | null
  roundingOutToleranceMinutes: number | null
  maxDailyMinutes: number | null
  contractWeeklyHours: unknown
  saturdayAsOvertime: boolean
  blockSunday: boolean
  singlePunchMode: boolean
  extraBreaks: { name: string; startMinutes: number; endMinutes: number }[]
}

export interface PolicyResolutionInput {
  locationPolicy: TimekeepingPolicyRow | null
  userPolicy: TimekeepingPolicyRow | null
  defaultPolicy: TimekeepingPolicyRow | null
}

/** La regola che vince, o null se non ne è stata configurata nessuna. */
export function pickEffectivePolicy(
  input: PolicyResolutionInput
): TimekeepingPolicyRow | null {
  return input.locationPolicy ?? input.userPolicy ?? input.defaultPolicy ?? null
}

/**
 * Ore giornaliere quando né la regola né il contratto le fissano: è il default
 * che il calcolo paghe usava da sempre, e chi non ha nulla di configurato deve
 * continuare a essere calcolato così.
 */
const DEFAULT_DAILY_MINUTES = 8 * 60

/**
 * Traduce una riga di regola nei termini che il motore di calcolo capisce.
 *
 * Le ore da contratto seguono una catena di fallback: quelle fissate dalla
 * regola, altrimenti quelle del contratto del dipendente, altrimenti il
 * default storico di 8 ore. Senza fallback, una regola predefinita salvata
 * senza ore settimanali azzererebbe lo straordinario di tutto l'organico.
 */
export function toPolicyRules(
  row: TimekeepingPolicyRow,
  employeeContractWeeklyHours: number | null = null
): PolicyRules {
  const weeklyHours =
    row.contractWeeklyHours === null || row.contractWeeklyHours === undefined
      ? null
      : Number(row.contractWeeklyHours)

  return {
    dayStartMinutes: row.dayStartMinutes,
    dayEndMinutes: row.dayEndMinutes,
    lunch:
      row.lunchStartMinutes !== null && row.lunchEndMinutes !== null
        ? { startMinutes: row.lunchStartMinutes, endMinutes: row.lunchEndMinutes }
        : null,
    extraBreaks: row.extraBreaks.map((b) => ({
      name: b.name,
      startMinutes: b.startMinutes,
      endMinutes: b.endMinutes,
    })),
    flexMinutes: row.flexMinutes,
    entryRounding: {
      intervalMinutes: row.roundingMinutes,
      toleranceMinutes: row.roundingToleranceMinutes,
    },
    exitRounding: {
      intervalMinutes: row.roundingOutMinutes ?? row.roundingMinutes,
      toleranceMinutes:
        row.roundingOutToleranceMinutes ?? row.roundingToleranceMinutes,
    },
    maxDailyMinutes: row.maxDailyMinutes,
    contractDailyMinutes:
      toDailyMinutes(weeklyHours) ??
      toDailyMinutes(employeeContractWeeklyHours) ??
      DEFAULT_DAILY_MINUTES,
    saturdayAsOvertime: row.saturdayAsOvertime,
    singlePunchMode: row.singlePunchMode,
  }
}

/**
 * Regola per chi non ne ha una assegnata: nessuna finestra, nessun
 * arrotondamento, nessuna pausa dedotta d'ufficio. Le ore sono quelle timbrate,
 * esattamente come prima che le regole esistessero.
 */
export function neutralPolicy(contractWeeklyHours: number | null): PolicyRules {
  return {
    dayStartMinutes: null,
    dayEndMinutes: null,
    lunch: null,
    extraBreaks: [],
    flexMinutes: 0,
    entryRounding: { intervalMinutes: 1, toleranceMinutes: 0 },
    exitRounding: { intervalMinutes: 1, toleranceMinutes: 0 },
    maxDailyMinutes: null,
    contractDailyMinutes:
      toDailyMinutes(contractWeeklyHours) ?? DEFAULT_DAILY_MINUTES,
    saturdayAsOvertime: false,
    singlePunchMode: false,
  }
}

function toDailyMinutes(weeklyHours: number | null): number | null {
  if (weeklyHours === null || Number.isNaN(weeklyHours)) {
    return null
  }

  return Math.round((weeklyHours / CONTRACT_DAYS_PER_WEEK) * 60)
}

const policySelect = {
  id: true,
  name: true,
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
  extraBreaks: {
    select: { name: true, startMinutes: true, endMinutes: true },
  },
} as const

export interface PolicyResolutionContext {
  defaultPolicy: TimekeepingPolicyRow | null
  userPolicyByUserId: Map<string, TimekeepingPolicyRow>
  locationPolicyByLocationId: Map<string, TimekeepingPolicyRow>
}

/**
 * Carica in una volta sola tutto ciò che serve a risolvere le regole di un
 * intero organico: il calcolo mensile gira su decine di dipendenti e non può
 * interrogare il database una volta per persona.
 */
export async function loadPolicyResolutionContext(
  venueId: string
): Promise<PolicyResolutionContext> {
  const [defaultPolicy, usersWithPolicy, locationsWithPolicy] = await Promise.all([
    prisma.timekeepingPolicy.findFirst({
      where: { venueId, isDefault: true, isActive: true },
      select: policySelect,
    }),
    // Una regola disattivata non si applica a nessuno, nemmeno a chi ce
    // l'ha assegnata: chi la aveva ricade sulla predefinita o sul neutro.
    prisma.user.findMany({
      where: {
        venueId,
        timekeepingPolicyId: { not: null },
        timekeepingPolicy: { isActive: true },
      },
      select: { id: true, timekeepingPolicy: { select: policySelect } },
    }),
    prisma.workLocation.findMany({
      where: {
        venueId,
        timekeepingPolicyId: { not: null },
        timekeepingPolicy: { isActive: true },
      },
      select: { id: true, timekeepingPolicy: { select: policySelect } },
    }),
  ])

  const userPolicyByUserId = new Map<string, TimekeepingPolicyRow>()
  for (const user of usersWithPolicy) {
    if (user.timekeepingPolicy) {
      userPolicyByUserId.set(user.id, user.timekeepingPolicy)
    }
  }

  const locationPolicyByLocationId = new Map<string, TimekeepingPolicyRow>()
  for (const location of locationsWithPolicy) {
    if (location.timekeepingPolicy) {
      locationPolicyByLocationId.set(location.id, location.timekeepingPolicy)
    }
  }

  return {
    defaultPolicy: defaultPolicy ?? null,
    userPolicyByUserId,
    locationPolicyByLocationId,
  }
}

/** Le regole in vigore per una persona, pronte per il motore. */
export function resolvePolicyRules(
  context: PolicyResolutionContext,
  userId: string,
  workLocationId: string | null,
  contractWeeklyHours: number | null
): { rules: PolicyRules; policyName: string | null } {
  const row = pickEffectivePolicy({
    locationPolicy: workLocationId
      ? (context.locationPolicyByLocationId.get(workLocationId) ?? null)
      : null,
    userPolicy: context.userPolicyByUserId.get(userId) ?? null,
    defaultPolicy: context.defaultPolicy,
  })

  if (!row) {
    return { rules: neutralPolicy(contractWeeklyHours), policyName: null }
  }

  return { rules: toPolicyRules(row, contractWeeklyHours), policyName: row.name }
}

/** Le regole in vigore per una singola persona, quando serve fuori dal calcolo mensile. */
export async function getEffectiveTimekeepingPolicy(
  userId: string,
  venueId: string,
  workLocationId: string | null = null
): Promise<{ rules: PolicyRules; policyName: string | null; blockSunday: boolean }> {
  const [context, user] = await Promise.all([
    loadPolicyResolutionContext(venueId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { contractHoursWeek: true },
    }),
  ])

  const row = pickEffectivePolicy({
    locationPolicy: workLocationId
      ? (context.locationPolicyByLocationId.get(workLocationId) ?? null)
      : null,
    userPolicy: context.userPolicyByUserId.get(userId) ?? null,
    defaultPolicy: context.defaultPolicy,
  })

  const contractWeeklyHours = user?.contractHoursWeek
    ? Number(user.contractHoursWeek)
    : null

  if (!row) {
    return {
      rules: neutralPolicy(contractWeeklyHours),
      policyName: null,
      blockSunday: false,
    }
  }

  return {
    rules: toPolicyRules(row, contractWeeklyHours),
    policyName: row.name,
    blockSunday: row.blockSunday,
  }
}
