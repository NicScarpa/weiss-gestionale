import { describe, it, expect } from 'vitest'
import { generateShiftsGreedy, optimizeSchedule, validateRelationshipConstraints } from '../greedy-solver'
import { formatDateKey } from '../constraints'
import type {
  Employee,
  EmployeeConstraint,
  RelationshipConstraint,
  ShiftAssignment,
  ShiftDefinition,
  GenerationParams,
} from '../types'
import {
  VENUE_ID,
  day,
  time,
  makeShift,
  makeEmployee,
  makeEmployeeConstraint,
  makeRelConstraint,
  makeAssignment,
  WEEK_DAYS,
} from './fixtures'

const MORNING = makeShift({
  id: 'shift-morning',
  name: 'Mattina',
  code: 'MAT',
  startTime: time(6),
  endTime: time(14),
  minStaff: 2,
  position: 1,
})

const EVENING = makeShift({
  id: 'shift-evening',
  name: 'Sera',
  code: 'SER',
  startTime: time(17),
  endTime: time(23),
  minStaff: 2,
  position: 2,
})

/** Quattro dipendenti senza preferenze: ogni giorno coprono esattamente i due turni */
function makeTeam(): Employee[] {
  return [
    makeEmployee({ id: 'emp-1', firstName: 'Anna', lastName: 'Bianchi', hourlyRateBase: 12 }),
    makeEmployee({ id: 'emp-2', firstName: 'Bruno', lastName: 'Conti', hourlyRateBase: 11 }),
    makeEmployee({ id: 'emp-3', firstName: 'Carla', lastName: 'Doni', hourlyRateBase: 13 }),
    makeEmployee({ id: 'emp-4', firstName: 'Dario', lastName: 'Esposito', hourlyRateBase: 10 }),
  ]
}

function makeContext(overrides: {
  employees?: Employee[]
  shiftDefinitions?: ShiftDefinition[]
  employeeConstraints?: Map<string, EmployeeConstraint[]>
  relationshipConstraints?: RelationshipConstraint[]
  params?: Partial<GenerationParams>
} = {}) {
  return {
    employees: overrides.employees ?? makeTeam(),
    shiftDefinitions: overrides.shiftDefinitions ?? [MORNING, EVENING],
    employeeConstraints: overrides.employeeConstraints ?? new Map<string, EmployeeConstraint[]>(),
    relationshipConstraints: overrides.relationshipConstraints ?? [],
    leaveRequests: [],
    scheduleId: 'schedule-1',
    params: {
      venueId: VENUE_ID,
      startDate: day(0),
      endDate: day(6),
      preferFixedStaff: true,
      balanceHours: true,
      minimizeCost: false,
      ...overrides.params,
    },
  }
}

/** Coppie userId+giorno duplicate: nessuno può stare in due turni lo stesso giorno */
function findDuplicateAssignments(assignments: ShiftAssignment[]): string[] {
  const seen = new Set<string>()
  const duplicates: string[] = []

  for (const assignment of assignments) {
    const key = `${assignment.userId}_${formatDateKey(assignment.date)}`
    if (seen.has(key)) duplicates.push(key)
    seen.add(key)
  }

  return duplicates
}

describe('generateShiftsGreedy - smoke end-to-end', () => {
  it('copre entrambi i turni per tutta la settimana', () => {
    const result = generateShiftsGreedy(makeContext())

    // 7 giorni x 2 turni x 2 persone
    expect(result.assignments).toHaveLength(28)
    expect(result.warnings.filter(w => w.type === 'UNDERSTAFFED')).toHaveLength(0)
    expect(result.success).toBe(true)
  })

  it('non assegna mai la stessa persona a due turni nello stesso giorno', () => {
    const result = generateShiftsGreedy(makeContext())

    expect(findDuplicateAssignments(result.assignments)).toEqual([])
  })

  it('resta dentro il periodo richiesto', () => {
    const result = generateShiftsGreedy(makeContext())
    const dateKeys = new Set(result.assignments.map(a => formatDateKey(a.date)))

    expect([...dateKeys].sort()).toEqual(WEEK_DAYS.map(formatDateKey))
  })

  it('ignora i turni di un altra sede', () => {
    const otherVenueShift = makeShift({ id: 'shift-other', venueId: 'venue-2', minStaff: 2 })
    const result = generateShiftsGreedy(
      makeContext({ shiftDefinitions: [MORNING, EVENING, otherVenueShift] })
    )

    expect(result.assignments.some(a => a.shiftDefinitionId === 'shift-other')).toBe(false)
  })

  it('segnala il sottorganico quando il personale non basta', () => {
    const result = generateShiftsGreedy(
      makeContext({ employees: makeTeam().slice(0, 2), params: { endDate: day(0) } })
    )

    const understaffed = result.warnings.filter(w => w.type === 'UNDERSTAFFED')
    expect(understaffed).toHaveLength(1)
    expect(result.success).toBe(false)
  })

  it('rispetta un override di organico a zero', () => {
    const result = generateShiftsGreedy(
      makeContext({
        params: {
          endDate: day(0),
          staffingRequirements: { [`${formatDateKey(day(0))}_${EVENING.id}`]: 0 },
        },
      })
    )

    expect(result.assignments.every(a => a.shiftDefinitionId === MORNING.id)).toBe(true)
  })
})

describe('generateShiftsGreedy - vincoli hard del dipendente', () => {
  it('non supera le ore massime settimanali', () => {
    const constraints = new Map<string, EmployeeConstraint[]>([
      ['emp-1', [makeEmployeeConstraint('MAX_HOURS', { maxHours: 16 }, { userId: 'emp-1' })]],
    ])

    const result = generateShiftsGreedy(makeContext({ employeeConstraints: constraints }))

    const hours = result.assignments
      .filter(a => a.userId === 'emp-1')
      .reduce((sum, a) => sum + a.hoursScheduled, 0)

    expect(hours).toBeLessThanOrEqual(16)
  })

  it('rispetta il riposo minimo fra sera e mattina successiva', () => {
    const constraints = new Map<string, EmployeeConstraint[]>(
      makeTeam().map(e => [
        e.id,
        [makeEmployeeConstraint('MIN_REST', { minRestHours: 11 }, { userId: e.id })],
      ])
    )

    const result = generateShiftsGreedy(makeContext({ employeeConstraints: constraints }))

    // Sera finisce alle 23:00, la mattina dopo comincia alle 06:00: solo 7 ore
    const eveningByUserDay = new Set(
      result.assignments
        .filter(a => a.shiftDefinitionId === EVENING.id)
        .map(a => `${a.userId}_${formatDateKey(a.date)}`)
    )

    const violations = result.assignments.filter(a => {
      if (a.shiftDefinitionId !== MORNING.id) return false
      const previous = new Date(a.date)
      previous.setDate(previous.getDate() - 1)
      return eveningByUserDay.has(`${a.userId}_${formatDateKey(previous)}`)
    })

    expect(violations).toEqual([])
  })

  it('non assegna chi è in ferie approvate', () => {
    const context = {
      ...makeContext(),
      leaveRequests: [
        {
          id: 'leave-1',
          userId: 'emp-1',
          startDate: day(0),
          endDate: day(2),
          status: 'APPROVED' as const,
        },
      ],
    }

    const result = generateShiftsGreedy(context)

    const emp1Days = result.assignments
      .filter(a => a.userId === 'emp-1')
      .map(a => formatDateKey(a.date))

    expect(emp1Days).not.toContain(formatDateKey(day(1)))
  })
})

describe('generateShiftsGreedy - vincoli relazionali hard', () => {
  it('NEVER_TOGETHER: non mette i due nello stesso turno', () => {
    const constraint = makeRelConstraint('NEVER_TOGETHER', ['emp-1', 'emp-2'])
    const result = generateShiftsGreedy(makeContext({ relationshipConstraints: [constraint] }))

    const together = result.assignments.filter(a => a.userId === 'emp-1').some(a1 =>
      result.assignments.some(
        a2 =>
          a2.userId === 'emp-2' &&
          a2.shiftDefinitionId === a1.shiftDefinitionId &&
          formatDateKey(a2.date) === formatDateKey(a1.date)
      )
    )

    expect(together).toBe(false)
  })

  it('MIN_OVERLAP: non li mette in turni senza sovrapposizione lo stesso giorno', () => {
    // Mattina 06-14 e sera 17-23 non si toccano: con il vincolo hard i due
    // devono stare nello stesso turno o non lavorare quel giorno
    const constraint = makeRelConstraint('MIN_OVERLAP', ['emp-1', 'emp-2'], {
      config: { minOverlapMinutes: 30 },
    })

    const result = generateShiftsGreedy(makeContext({ relationshipConstraints: [constraint] }))

    const splitDays = result.assignments.filter(a => a.userId === 'emp-1').filter(a1 =>
      result.assignments.some(
        a2 =>
          a2.userId === 'emp-2' &&
          formatDateKey(a2.date) === formatDateKey(a1.date) &&
          a2.shiftDefinitionId !== a1.shiftDefinitionId
      )
    )

    expect(splitDays).toEqual([])
  })

  it('MAX_TOGETHER: non supera i turni condivisi consentiti', () => {
    const constraint = makeRelConstraint('MAX_TOGETHER', ['emp-1', 'emp-2'], {
      config: { maxShiftsTogether: 2 },
    })

    const result = generateShiftsGreedy(makeContext({ relationshipConstraints: [constraint] }))

    const sharedShifts = result.assignments.filter(
      a1 =>
        a1.userId === 'emp-1' &&
        result.assignments.some(
          a2 =>
            a2.userId === 'emp-2' &&
            a2.shiftDefinitionId === a1.shiftDefinitionId &&
            formatDateKey(a2.date) === formatDateKey(a1.date)
        )
    ).length

    expect(sharedShifts).toBeLessThanOrEqual(2)
  })

  it('ALWAYS_TOGETHER: non li separa su turni diversi dello stesso giorno', () => {
    const constraint = makeRelConstraint('ALWAYS_TOGETHER', ['emp-1', 'emp-2'])
    const result = generateShiftsGreedy(makeContext({ relationshipConstraints: [constraint] }))

    const separated = result.assignments.filter(a => a.userId === 'emp-1').filter(a1 =>
      result.assignments.some(
        a2 =>
          a2.userId === 'emp-2' &&
          formatDateKey(a2.date) === formatDateKey(a1.date) &&
          a2.shiftDefinitionId !== a1.shiftDefinitionId
      )
    )

    expect(separated).toEqual([])
  })

  it('SAME_DAY_OFF: segnala la settimana senza riposo comune', () => {
    // Tre dipendenti per due turni da 2: ogni giorno uno solo riposa, quindi i
    // due vincolati non possono avere lo stesso giorno libero
    const employees = makeTeam().slice(0, 3)
    const constraint = makeRelConstraint('SAME_DAY_OFF', ['emp-1', 'emp-2'], {
      isHardConstraint: false,
    })

    const result = generateShiftsGreedy(
      makeContext({
        employees,
        relationshipConstraints: [constraint],
        shiftDefinitions: [MORNING, { ...EVENING, minStaff: 1 }],
      })
    )

    const sameDayOffWarnings = result.warnings.filter(w => w.constraintType === 'SAME_DAY_OFF')

    expect(sameDayOffWarnings).toHaveLength(1)
    expect(sameDayOffWarnings[0].message).toContain('riposo in comune')
  })

  it('SAME_DAY_OFF: nessun avviso quando il riposo comune esiste', () => {
    const constraint = makeRelConstraint('SAME_DAY_OFF', ['emp-1', 'emp-2'], {
      isHardConstraint: false,
    })

    // Un solo giorno pianificato in cui entrambi lavorano: il resto della
    // settimana non è nel periodo, quindi nessuna violazione
    const result = generateShiftsGreedy(
      makeContext({ relationshipConstraints: [constraint], params: { endDate: day(0) } })
    )

    expect(result.warnings.filter(w => w.constraintType === 'SAME_DAY_OFF')).toHaveLength(0)
  })
})

describe('generateShiftsGreedy - tariffa oraria mancante', () => {
  const teamWithMissingRate = () => {
    const team = makeTeam()
    team[0] = { ...team[0], hourlyRateBase: null }
    return team
  }

  it('non inventa una tariffa: il costo di quel dipendente resta a zero', () => {
    const result = generateShiftsGreedy(makeContext({ employees: teamWithMissingRate() }))

    const emp1Assignments = result.assignments.filter(a => a.userId === 'emp-1')

    expect(emp1Assignments.length).toBeGreaterThan(0)
    expect(emp1Assignments.every(a => a.costEstimated === 0)).toBe(true)
  })

  it('segnala il dato mancante una sola volta per dipendente', () => {
    const result = generateShiftsGreedy(makeContext({ employees: teamWithMissingRate() }))

    const missingRate = result.warnings.filter(w => w.type === 'MISSING_RATE')

    expect(missingRate).toHaveLength(1)
    expect(missingRate[0].employeeId).toBe('emp-1')
    expect(missingRate[0].message).toContain('Anna Bianchi')
  })

  it('marca le statistiche come incomplete ed espone le ore non valorizzate', () => {
    const result = generateShiftsGreedy(makeContext({ employees: teamWithMissingRate() }))

    expect(result.stats.costIncomplete).toBe(true)
    expect(result.stats.employeesWithoutRate).toEqual([{ userId: 'emp-1', name: 'Anna Bianchi' }])
    expect(result.stats.unpricedHours).toBeGreaterThan(0)

    const emp1Stats = result.stats.employeeStats.find(s => s.userId === 'emp-1')
    expect(emp1Stats?.hasHourlyRate).toBe(false)
  })

  it('il totale costi somma solo i dipendenti con tariffa nota', () => {
    const result = generateShiftsGreedy(makeContext({ employees: teamWithMissingRate() }))

    const expected = result.assignments
      .filter(a => a.userId !== 'emp-1')
      .reduce((sum, a) => sum + a.costEstimated, 0)

    expect(result.stats.totalCost).toBeCloseTo(expected, 6)
  })

  it('con tutte le tariffe presenti le statistiche sono complete', () => {
    const result = generateShiftsGreedy(makeContext())

    expect(result.stats.costIncomplete).toBe(false)
    expect(result.stats.employeesWithoutRate).toEqual([])
    expect(result.stats.unpricedHours).toBe(0)
    expect(result.stats.totalCost).toBeGreaterThan(0)
  })
})

describe('validateRelationshipConstraints', () => {
  it('non produce avvisi senza vincoli configurati', () => {
    const assignments = [makeAssignment('emp-1', day(0), MORNING)]

    expect(validateRelationshipConstraints(assignments, [])).toEqual([])
  })

  it('classifica per severità hard e soft', () => {
    const hard = makeRelConstraint('NEVER_TOGETHER', ['emp-1', 'emp-2'], { id: 'rel-hard' })
    const soft = makeRelConstraint('NEVER_TOGETHER', ['emp-3', 'emp-4'], {
      id: 'rel-soft',
      isHardConstraint: false,
    })
    const assignments = [
      makeAssignment('emp-1', day(0), MORNING),
      makeAssignment('emp-2', day(0), MORNING),
      makeAssignment('emp-3', day(0), EVENING),
      makeAssignment('emp-4', day(0), EVENING),
    ]

    const warnings = validateRelationshipConstraints(assignments, [hard, soft], [MORNING, EVENING], [day(0)])

    expect(warnings.find(w => w.severity === 'high')?.type).toBe('HARD_CONSTRAINT_VIOLATED')
    expect(warnings.find(w => w.severity === 'low')?.type).toBe('SOFT_CONSTRAINT_VIOLATED')
  })

  it('non duplica la stessa violazione', () => {
    const constraint = makeRelConstraint('NEVER_TOGETHER', ['emp-1', 'emp-2'])
    const assignments = [
      makeAssignment('emp-1', day(0), MORNING),
      makeAssignment('emp-2', day(0), MORNING),
      makeAssignment('emp-3', day(0), MORNING),
    ]

    const warnings = validateRelationshipConstraints(assignments, [constraint], [MORNING], [day(0)])

    expect(warnings).toHaveLength(1)
  })
})

describe('optimizeSchedule', () => {
  /** Preferenza soft per la mattina: lo scambio con un turno serale migliora il punteggio */
  const prefersMorningSoft = (userId: string) =>
    makeEmployeeConstraint(
      'PREFERRED_SHIFT',
      { preference: 'PREFER', shiftType: 'mattina' },
      { userId, isHardConstraint: false, id: `pref-${userId}` }
    )

  it('senza margini di miglioramento il piano resta identico', () => {
    const context = makeContext()
    const result = generateShiftsGreedy(context)

    const optimized = optimizeSchedule(result.assignments, context)

    expect(optimized.assignments).toHaveLength(result.assignments.length)
    expect(findDuplicateAssignments(optimized.assignments)).toEqual([])

    const key = (a: ShiftAssignment) => `${a.userId}_${formatDateKey(a.date)}_${a.shiftDefinitionId}`
    expect(optimized.assignments.map(key).sort()).toEqual(result.assignments.map(key).sort())
  })

  it('scambia due dipendenti fra turni diversi quando le preferenze migliorano', () => {
    const constraints = new Map<string, EmployeeConstraint[]>([
      ['emp-1', [prefersMorningSoft('emp-1')]],
    ])
    const assignments = [
      makeAssignment('emp-1', day(0), EVENING),
      makeAssignment('emp-2', day(0), MORNING),
    ]

    const optimized = optimizeSchedule(assignments, makeContext({ employeeConstraints: constraints }))

    expect(optimized.improved).toBe(true)
    expect(optimized.assignments.find(a => a.shiftDefinitionId === MORNING.id)?.userId).toBe('emp-1')
    expect(optimized.assignments.find(a => a.shiftDefinitionId === EVENING.id)?.userId).toBe('emp-2')
  })

  it('ricalcola il costo con la tariffa del nuovo assegnatario', () => {
    const constraints = new Map<string, EmployeeConstraint[]>([
      ['emp-1', [prefersMorningSoft('emp-1')]],
    ])
    const assignments = [
      makeAssignment('emp-1', day(0), EVENING),
      makeAssignment('emp-2', day(0), MORNING),
    ]

    const optimized = optimizeSchedule(assignments, makeContext({ employeeConstraints: constraints }))

    // Mattina 06-14 = 8h a 12€/h (emp-1); sera 17-23 = 6h a 11€/h (emp-2)
    expect(optimized.assignments.find(a => a.shiftDefinitionId === MORNING.id)?.costEstimated).toBe(96)
    expect(optimized.assignments.find(a => a.shiftDefinitionId === EVENING.id)?.costEstimated).toBe(66)
  })

  it('rifiuta lo scambio che violerebbe il riposo minimo', () => {
    const constraints = new Map<string, EmployeeConstraint[]>([
      ['emp-1', [
        prefersMorningSoft('emp-1'),
        makeEmployeeConstraint('MIN_REST', { minRestHours: 11 }, { userId: 'emp-1', id: 'rest-emp-1' }),
      ]],
    ])
    // emp-1 chiude lunedì sera alle 23: la mattina di martedì alle 06 sono solo 7 ore di riposo
    const assignments = [
      makeAssignment('emp-1', day(0), EVENING),
      makeAssignment('emp-1', day(1), EVENING),
      makeAssignment('emp-2', day(1), MORNING),
    ]

    const optimized = optimizeSchedule(assignments, makeContext({ employeeConstraints: constraints }))

    expect(optimized.improved).toBe(false)
    expect(optimized.assignments).toEqual(assignments)
  })

  it('rifiuta lo scambio che violerebbe un NEVER_TOGETHER hard', () => {
    const constraints = new Map<string, EmployeeConstraint[]>([
      ['emp-1', [prefersMorningSoft('emp-1')]],
    ])
    // emp-1 non può stare né con emp-3 né con emp-4: ogni strada verso la mattina è chiusa
    const relationshipConstraints = [
      makeRelConstraint('NEVER_TOGETHER', ['emp-1', 'emp-3'], { id: 'nt-1-3' }),
      makeRelConstraint('NEVER_TOGETHER', ['emp-1', 'emp-4'], { id: 'nt-1-4' }),
    ]
    const assignments = [
      makeAssignment('emp-3', day(0), MORNING),
      makeAssignment('emp-4', day(0), MORNING),
      makeAssignment('emp-1', day(0), EVENING),
      makeAssignment('emp-2', day(0), EVENING),
    ]

    const optimized = optimizeSchedule(
      assignments,
      makeContext({ employeeConstraints: constraints, relationshipConstraints })
    )

    expect(optimized.improved).toBe(false)
    expect(optimized.assignments).toEqual(assignments)
  })

  it('non sposta un turno su chi è in ferie approvate', () => {
    const constraints = new Map<string, EmployeeConstraint[]>([
      ['emp-1', [prefersMorningSoft('emp-1')]],
    ])
    const assignments = [
      makeAssignment('emp-1', day(0), EVENING),
      makeAssignment('emp-2', day(1), MORNING),
    ]
    const context = {
      ...makeContext({ employeeConstraints: constraints }),
      leaveRequests: [
        {
          id: 'leave-1',
          userId: 'emp-2',
          startDate: day(0),
          endDate: day(0),
          status: 'APPROVED' as const,
        },
      ],
    }

    const optimized = optimizeSchedule(assignments, context)

    expect(optimized.improved).toBe(false)
    expect(optimized.assignments).toEqual(assignments)
  })

  it('non scambia assegnazioni di settimane diverse', () => {
    // Uno scambio fra settimane cambierebbe i giorni lavorati per settimana,
    // che il greedy garantisce (workDaysPerWeek, ore massime settimanali)
    const constraints = new Map<string, EmployeeConstraint[]>([
      ['emp-1', [prefersMorningSoft('emp-1')]],
    ])
    const assignments = [
      makeAssignment('emp-1', day(0), EVENING),
      makeAssignment('emp-2', day(7), MORNING),
    ]

    const optimized = optimizeSchedule(
      assignments,
      makeContext({ employeeConstraints: constraints, params: { endDate: day(13) } })
    )

    expect(optimized.improved).toBe(false)
    expect(optimized.assignments).toEqual(assignments)
  })
})
