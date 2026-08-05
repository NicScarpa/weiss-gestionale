import { describe, it, expect } from 'vitest'
import {
  getShiftBand,
  getShiftMinutesRange,
  matchesPreferredBand,
  matchesShiftType,
  calculateShiftOverlapMinutes,
  calculateShiftHours,
  getAssignmentEnd,
  getWeekStart,
  getWeekKey,
  formatDateKey,
  isConstraintActive,
  canEmployeeWorkShift,
  checkRelationshipConstraints,
  checkWeeklyRelationshipConstraints,
  getMinOverlapMinutes,
  getMaxTogetherLimit,
  calculateEmployeeScore,
  REL_CONSTRAINT_DEFAULTS,
} from '../constraints'
import {
  day,
  time,
  makeShift,
  makeEmployee,
  makeEmployeeConstraint,
  makeRelConstraint,
  makeAssignment,
  WEEK_DAYS,
} from './fixtures'

const morning = makeShift({ id: 'shift-morning', name: 'Mattina', code: 'MAT', startTime: time(6), endTime: time(14) })
const evening = makeShift({ id: 'shift-evening', name: 'Sera', code: 'SER', startTime: time(17), endTime: time(23) })

describe('getShiftBand', () => {
  it('deriva la fascia dall orario di inizio, non dal nome', () => {
    expect(getShiftBand(makeShift({ name: 'Brunch', startTime: time(10), endTime: time(15) }))).toBe('MORNING')
    expect(getShiftBand(makeShift({ name: 'Aperitivo', startTime: time(18), endTime: time(23) }))).toBe('EVENING')
    expect(getShiftBand(makeShift({ name: 'Pausa pranzo', startTime: time(13), endTime: time(16) }))).toBe('AFTERNOON')
  })

  it('usa i confini 12:00 e 17:00', () => {
    expect(getShiftBand(makeShift({ startTime: time(11, 59), endTime: time(15) }))).toBe('MORNING')
    expect(getShiftBand(makeShift({ startTime: time(12), endTime: time(16) }))).toBe('AFTERNOON')
    expect(getShiftBand(makeShift({ startTime: time(16, 59), endTime: time(20) }))).toBe('AFTERNOON')
    expect(getShiftBand(makeShift({ startTime: time(17), endTime: time(23) }))).toBe('EVENING')
  })

  it('classifica come serale un turno che scavalca la mezzanotte', () => {
    expect(getShiftBand(makeShift({ name: 'Notte', startTime: time(22), endTime: time(4) }))).toBe('EVENING')
  })
})

describe('getShiftMinutesRange', () => {
  it('calcola inizio e fine in minuti dalla mezzanotte', () => {
    expect(getShiftMinutesRange(makeShift({ startTime: time(6, 30), endTime: time(14) }))).toEqual({
      start: 390,
      end: 840,
    })
  })

  it('sposta la fine al giorno dopo per i turni notturni', () => {
    expect(getShiftMinutesRange(makeShift({ startTime: time(22), endTime: time(2) }))).toEqual({
      start: 1320,
      end: 1560,
    })
  })
})

describe('matchesPreferredBand', () => {
  it('senza preferenza accetta ogni fascia', () => {
    expect(matchesPreferredBand(null, 'EVENING')).toBe(true)
  })

  it('MORNING accetta solo la mattina', () => {
    expect(matchesPreferredBand('MORNING', 'MORNING')).toBe(true)
    expect(matchesPreferredBand('MORNING', 'AFTERNOON')).toBe(false)
    expect(matchesPreferredBand('MORNING', 'EVENING')).toBe(false)
  })

  it('EVENING accetta pomeriggio e sera', () => {
    expect(matchesPreferredBand('EVENING', 'AFTERNOON')).toBe(true)
    expect(matchesPreferredBand('EVENING', 'EVENING')).toBe(true)
    expect(matchesPreferredBand('EVENING', 'MORNING')).toBe(false)
  })
})

describe('matchesShiftType', () => {
  it('riconosce le fasce orarie in italiano e inglese', () => {
    const brunch = makeShift({ name: 'Brunch', code: 'BRU', startTime: time(10), endTime: time(15) })
    expect(matchesShiftType(brunch, 'mattina')).toBe(true)
    expect(matchesShiftType(brunch, 'morning')).toBe(true)
    expect(matchesShiftType(brunch, 'sera')).toBe(false)
  })

  it('ricade sul nome o codice quando il valore non è una fascia', () => {
    const aperitivo = makeShift({ name: 'Aperitivo', code: 'APE', startTime: time(18), endTime: time(23) })
    expect(matchesShiftType(aperitivo, 'Aperitivo')).toBe(true)
    expect(matchesShiftType(aperitivo, 'APE')).toBe(true)
    expect(matchesShiftType(aperitivo, 'Colazione')).toBe(false)
  })

  it('un valore vuoto non matcha nulla', () => {
    expect(matchesShiftType(morning, '')).toBe(false)
  })
})

describe('calculateShiftOverlapMinutes', () => {
  it('è zero per turni che non si toccano', () => {
    expect(calculateShiftOverlapMinutes(morning, evening)).toBe(0)
  })

  it('misura la sovrapposizione per il passaggio di consegne', () => {
    const pomeriggio = makeShift({ id: 'p', startTime: time(13, 30), endTime: time(20) })
    expect(calculateShiftOverlapMinutes(morning, pomeriggio)).toBe(30)
  })

  it('gestisce i turni a cavallo della mezzanotte', () => {
    const notte = makeShift({ id: 'n', startTime: time(22), endTime: time(4) })
    const serale = makeShift({ id: 's', startTime: time(18), endTime: time(23) })
    expect(calculateShiftOverlapMinutes(notte, serale)).toBe(60)
  })
})

describe('calculateShiftHours', () => {
  it('sottrae la pausa', () => {
    expect(calculateShiftHours(makeShift({ startTime: time(6), endTime: time(14), breakMinutes: 30 }))).toBe(7.5)
  })

  it('gestisce i turni notturni', () => {
    expect(calculateShiftHours(makeShift({ startTime: time(22), endTime: time(2) }))).toBe(4)
  })
})

describe('getAssignmentEnd', () => {
  it('ricompone l orario di fine sul giorno dell assegnazione', () => {
    const end = getAssignmentEnd(makeAssignment('emp-1', day(0), morning))
    expect(formatDateKey(end)).toBe(formatDateKey(day(0)))
    expect(end.getHours()).toBe(14)
  })

  it('sposta al giorno dopo la fine di un turno notturno', () => {
    const notte = makeShift({ id: 'n', startTime: time(22), endTime: time(4) })
    const end = getAssignmentEnd(makeAssignment('emp-1', day(0), notte))
    expect(formatDateKey(end)).toBe(formatDateKey(day(1)))
    expect(end.getHours()).toBe(4)
  })
})

describe('getWeekStart / getWeekKey', () => {
  it('riporta al lunedì della settimana', () => {
    expect(formatDateKey(getWeekStart(day(3)))).toBe(formatDateKey(day(0)))
  })

  it('la domenica appartiene alla settimana che comincia il lunedì precedente', () => {
    const sunday = day(6)
    expect(sunday.getDay()).toBe(0)
    expect(getWeekKey(sunday)).toBe(getWeekKey(day(0)))
  })

  it('giorni di settimane diverse hanno chiavi diverse', () => {
    expect(getWeekKey(day(7))).not.toBe(getWeekKey(day(6)))
  })
})

describe('isConstraintActive', () => {
  it('rispetta la finestra di validità', () => {
    const constraint = makeRelConstraint('NEVER_TOGETHER', ['emp-1', 'emp-2'], {
      validFrom: day(2),
      validTo: day(4),
    })
    expect(isConstraintActive(constraint, day(1))).toBe(false)
    expect(isConstraintActive(constraint, day(3))).toBe(true)
    expect(isConstraintActive(constraint, day(5))).toBe(false)
  })
})

describe('canEmployeeWorkShift - turno preferito', () => {
  it('blocca il turno serale a chi preferisce la mattina, anche con nomi non standard', () => {
    const employee = makeEmployee({ defaultShift: 'MORNING' })
    const aperitivo = makeShift({ id: 'ape', name: 'Aperitivo', code: 'APE', startTime: time(18), endTime: time(23) })

    const result = canEmployeeWorkShift(employee, aperitivo, day(0), [], [])

    expect(result.canWork).toBe(false)
    expect(result.reason).toBe('Turno preferito: mattina')
  })

  it('permette un turno mattutino con nome non standard a chi preferisce la mattina', () => {
    const employee = makeEmployee({ defaultShift: 'MORNING' })
    const brunch = makeShift({ id: 'bru', name: 'Brunch', code: 'BRU', startTime: time(10), endTime: time(15) })

    expect(canEmployeeWorkShift(employee, brunch, day(0), [], []).canWork).toBe(true)
  })

  it('blocca il turno mattutino a chi preferisce la sera', () => {
    const employee = makeEmployee({ defaultShift: 'EVENING' })
    expect(canEmployeeWorkShift(employee, morning, day(0), [], []).canWork).toBe(false)
  })
})

describe('canEmployeeWorkShift - riposo minimo', () => {
  const notte = makeShift({ id: 'notte', name: 'Notte', code: 'NOT', startTime: time(18), endTime: time(2) })

  it('blocca il turno se il riposo dal turno precedente è insufficiente', () => {
    const employee = makeEmployee()
    const constraint = makeEmployeeConstraint('MIN_REST', { minRestHours: 11 })
    // Turno serale fino alle 02:00 di martedì, poi mattina dalle 06:00: 4 ore di riposo
    const previous = makeAssignment('emp-1', day(0), notte)

    const result = canEmployeeWorkShift(employee, morning, day(1), [constraint], [previous])

    expect(result.canWork).toBe(false)
    expect(result.reason).toContain('Riposo insufficiente')
  })

  it('permette il turno se il riposo è sufficiente', () => {
    const employee = makeEmployee()
    const constraint = makeEmployeeConstraint('MIN_REST', { minRestHours: 11 })
    // Mattina fino alle 14:00, poi mattina successiva dalle 06:00: 16 ore
    const previous = makeAssignment('emp-1', day(0), morning)

    expect(canEmployeeWorkShift(employee, morning, day(1), [constraint], [previous]).canWork).toBe(true)
  })

  it('come soft constraint penalizza invece di bloccare', () => {
    const employee = makeEmployee()
    const constraint = makeEmployeeConstraint('MIN_REST', { minRestHours: 11 }, { isHardConstraint: false })
    const previous = makeAssignment('emp-1', day(0), notte)

    const result = canEmployeeWorkShift(employee, morning, day(1), [constraint], [previous])

    expect(result.canWork).toBe(true)
    expect(result.isPenalized).toBe(true)
  })
})

describe('canEmployeeWorkShift - ore massime settimanali', () => {
  it('blocca il turno che sfonderebbe il tetto settimanale', () => {
    const employee = makeEmployee()
    const constraint = makeEmployeeConstraint('MAX_HOURS', { maxHours: 20 })
    // 3 turni da 8 ore = 24h già oltre il tetto
    const existing = [day(0), day(1), day(2)].map(d => makeAssignment('emp-1', d, morning))

    const result = canEmployeeWorkShift(employee, morning, day(3), [constraint], existing)

    expect(result.canWork).toBe(false)
    expect(result.reason).toContain('ore max settimanali')
  })

  it('permette il turno se il tetto non viene superato', () => {
    const employee = makeEmployee()
    const constraint = makeEmployeeConstraint('MAX_HOURS', { maxHours: 40 })
    const existing = [day(0), day(1)].map(d => makeAssignment('emp-1', d, morning))

    expect(canEmployeeWorkShift(employee, morning, day(3), [constraint], existing).canWork).toBe(true)
  })

  it('non conta le ore di altre settimane', () => {
    const employee = makeEmployee()
    const constraint = makeEmployeeConstraint('MAX_HOURS', { maxHours: 20 })
    const previousWeek = [day(-7), day(-6), day(-5)].map(d => makeAssignment('emp-1', d, morning))

    expect(canEmployeeWorkShift(employee, morning, day(3), [constraint], previousWeek).canWork).toBe(true)
  })
})

describe('canEmployeeWorkShift - altri vincoli hard', () => {
  it('esclude chi è già assegnato quel giorno', () => {
    const employee = makeEmployee()
    const existing = [makeAssignment('emp-1', day(0), morning)]

    expect(canEmployeeWorkShift(employee, evening, day(0), [], existing).reason).toBe(
      'Già assegnato in questo giorno'
    )
  })

  it('esclude chi è in ferie approvate', () => {
    const employee = makeEmployee()
    const leave = {
      id: 'leave-1',
      userId: 'emp-1',
      startDate: day(0),
      endDate: day(2),
      status: 'APPROVED' as const,
    }

    expect(canEmployeeWorkShift(employee, morning, day(1), [], [], [leave]).reason).toBe('In ferie/permesso')
  })

  it('esclude chi non ha le competenze richieste', () => {
    const employee = makeEmployee({ skills: ['CAFFETTERIA'] })
    const shift = makeShift({ requiredSkills: ['CUCINA'] })

    expect(canEmployeeWorkShift(employee, shift, day(0), [], []).reason).toBe('Competenze mancanti')
  })

  it('esclude lo staff extra nei giorni non disponibili', () => {
    // availableDays usa 0 = lunedì; day(2) è mercoledì
    const employee = makeEmployee({ isFixedStaff: false, availableDays: [0, 1] })

    expect(canEmployeeWorkShift(employee, morning, day(2), [], []).canWork).toBe(false)
  })
})

describe('checkRelationshipConstraints - NEVER_TOGETHER', () => {
  const constraint = makeRelConstraint('NEVER_TOGETHER', ['emp-1', 'emp-2'])

  it('segnala la violazione nello stesso turno dello stesso giorno', () => {
    const violations = checkRelationshipConstraints(
      { userId: 'emp-1', date: day(0), shiftDefinitionId: morning.id },
      { userId: 'emp-2', date: day(0), shiftDefinitionId: morning.id },
      [constraint]
    )

    expect(violations).toHaveLength(1)
    expect(violations[0].constraintType).toBe('NEVER_TOGETHER')
    expect(violations[0].severity).toBe('hard')
  })

  it('non segnala nulla se sono in turni diversi', () => {
    const violations = checkRelationshipConstraints(
      { userId: 'emp-1', date: day(0), shiftDefinitionId: morning.id },
      { userId: 'emp-2', date: day(0), shiftDefinitionId: evening.id },
      [constraint]
    )

    expect(violations).toHaveLength(0)
  })

  it('ignora le coppie estranee al vincolo', () => {
    const violations = checkRelationshipConstraints(
      { userId: 'emp-1', date: day(0), shiftDefinitionId: morning.id },
      { userId: 'emp-9', date: day(0), shiftDefinitionId: morning.id },
      [constraint]
    )

    expect(violations).toHaveLength(0)
  })
})

describe('checkRelationshipConstraints - ALWAYS_TOGETHER', () => {
  const constraint = makeRelConstraint('ALWAYS_TOGETHER', ['emp-1', 'emp-2'])

  it('segnala la violazione quando lavorano in turni diversi lo stesso giorno', () => {
    const violations = checkRelationshipConstraints(
      { userId: 'emp-1', date: day(0), shiftDefinitionId: morning.id },
      { userId: 'emp-2', date: day(0), shiftDefinitionId: evening.id },
      [constraint]
    )

    expect(violations).toHaveLength(1)
    expect(violations[0].constraintType).toBe('ALWAYS_TOGETHER')
  })

  it('non segnala nulla quando sono nello stesso turno', () => {
    const violations = checkRelationshipConstraints(
      { userId: 'emp-1', date: day(0), shiftDefinitionId: morning.id },
      { userId: 'emp-2', date: day(0), shiftDefinitionId: morning.id },
      [constraint]
    )

    expect(violations).toHaveLength(0)
  })
})

describe('checkRelationshipConstraints - MIN_OVERLAP', () => {
  const shifts = [morning, evening]

  it('usa il default documentato quando config è vuota', () => {
    const constraint = makeRelConstraint('MIN_OVERLAP', ['emp-1', 'emp-2'])
    expect(getMinOverlapMinutes(constraint)).toBe(REL_CONSTRAINT_DEFAULTS.MIN_OVERLAP_MINUTES)
  })

  it('legge i minuti richiesti da config', () => {
    expect(getMinOverlapMinutes(makeRelConstraint('MIN_OVERLAP', [], { config: { minOverlapMinutes: 45 } }))).toBe(45)
    expect(getMinOverlapMinutes(makeRelConstraint('MIN_OVERLAP', [], { config: { minutes: 20 } }))).toBe(20)
    expect(getMinOverlapMinutes(makeRelConstraint('MIN_OVERLAP', [], { config: { value: 15 } }))).toBe(15)
  })

  it('segnala la violazione quando i turni non si sovrappongono abbastanza', () => {
    const constraint = makeRelConstraint('MIN_OVERLAP', ['emp-1', 'emp-2'], {
      config: { minOverlapMinutes: 30 },
    })

    const violations = checkRelationshipConstraints(
      { userId: 'emp-1', date: day(0), shiftDefinitionId: morning.id },
      { userId: 'emp-2', date: day(0), shiftDefinitionId: evening.id },
      [constraint],
      shifts
    )

    expect(violations).toHaveLength(1)
    expect(violations[0].message).toContain('Sovrapposizione insufficiente')
  })

  it('non segnala nulla se la sovrapposizione basta', () => {
    const pomeriggio = makeShift({ id: 'pom', name: 'Pomeriggio', code: 'POM', startTime: time(13), endTime: time(20) })
    const constraint = makeRelConstraint('MIN_OVERLAP', ['emp-1', 'emp-2'], {
      config: { minOverlapMinutes: 30 },
    })

    const violations = checkRelationshipConstraints(
      { userId: 'emp-1', date: day(0), shiftDefinitionId: morning.id },
      { userId: 'emp-2', date: day(0), shiftDefinitionId: pomeriggio.id },
      [constraint],
      [morning, pomeriggio]
    )

    expect(violations).toHaveLength(0)
  })

  it('non si applica allo stesso turno né a giorni diversi', () => {
    const constraint = makeRelConstraint('MIN_OVERLAP', ['emp-1', 'emp-2'], {
      config: { minOverlapMinutes: 30 },
    })

    const sameShift = checkRelationshipConstraints(
      { userId: 'emp-1', date: day(0), shiftDefinitionId: morning.id },
      { userId: 'emp-2', date: day(0), shiftDefinitionId: morning.id },
      [constraint],
      shifts
    )
    const otherDay = checkRelationshipConstraints(
      { userId: 'emp-1', date: day(0), shiftDefinitionId: morning.id },
      { userId: 'emp-2', date: day(1), shiftDefinitionId: evening.id },
      [constraint],
      shifts
    )

    expect(sameShift).toHaveLength(0)
    expect(otherDay).toHaveLength(0)
  })

  it('senza definizioni turno non inventa violazioni', () => {
    const constraint = makeRelConstraint('MIN_OVERLAP', ['emp-1', 'emp-2'])

    const violations = checkRelationshipConstraints(
      { userId: 'emp-1', date: day(0), shiftDefinitionId: morning.id },
      { userId: 'emp-2', date: day(0), shiftDefinitionId: evening.id },
      [constraint]
    )

    expect(violations).toHaveLength(0)
  })
})

describe('checkWeeklyRelationshipConstraints - SAME_DAY_OFF', () => {
  const constraint = makeRelConstraint('SAME_DAY_OFF', ['emp-1', 'emp-2'])

  it('non segnala nulla se esiste un giorno di riposo in comune', () => {
    // Entrambi liberi la domenica, day(6)
    const assignments = [
      ...WEEK_DAYS.slice(0, 6).map(d => makeAssignment('emp-1', d, morning)),
      ...WEEK_DAYS.slice(0, 6).map(d => makeAssignment('emp-2', d, evening)),
    ]

    const violations = checkWeeklyRelationshipConstraints(assignments, [constraint], {
      daysInPeriod: WEEK_DAYS,
    })

    expect(violations).toHaveLength(0)
  })

  it('segnala la violazione se i riposi non coincidono mai', () => {
    // emp-1 riposa domenica, emp-2 riposa mercoledì: nessun giorno in comune
    const assignments = [
      ...WEEK_DAYS.filter((_, i) => i !== 6).map(d => makeAssignment('emp-1', d, morning)),
      ...WEEK_DAYS.filter((_, i) => i !== 2).map(d => makeAssignment('emp-2', d, evening)),
    ]

    const violations = checkWeeklyRelationshipConstraints(assignments, [constraint], {
      daysInPeriod: WEEK_DAYS,
    })

    expect(violations).toHaveLength(1)
    expect(violations[0].constraintType).toBe('SAME_DAY_OFF')
    expect(violations[0].employeeIds).toEqual(['emp-1', 'emp-2'])
  })

  it('valuta ogni settimana separatamente', () => {
    const twoWeeks = [...WEEK_DAYS, ...Array.from({ length: 7 }, (_, i) => day(7 + i))]
    // Prima settimana senza riposo comune, seconda con tutti liberi
    const assignments = [
      ...WEEK_DAYS.filter((_, i) => i !== 6).map(d => makeAssignment('emp-1', d, morning)),
      ...WEEK_DAYS.filter((_, i) => i !== 2).map(d => makeAssignment('emp-2', d, evening)),
      makeAssignment('emp-1', day(7), morning),
      makeAssignment('emp-2', day(7), evening),
    ]

    const violations = checkWeeklyRelationshipConstraints(assignments, [constraint], {
      daysInPeriod: twoWeeks,
    })

    expect(violations).toHaveLength(1)
  })

  it('non giudica una settimana pianificata solo in parte', () => {
    // Lunedì-venerdì: il riposo comune può cadere nel weekend, fuori periodo
    const workDays = WEEK_DAYS.slice(0, 5)
    const assignments = workDays.flatMap(d => [
      makeAssignment('emp-1', d, morning),
      makeAssignment('emp-2', d, evening),
    ])

    expect(checkWeeklyRelationshipConstraints(assignments, [constraint], { daysInPeriod: workDays })).toHaveLength(0)
  })

  it('non segnala nulla se nessuno dei coinvolti lavora', () => {
    const violations = checkWeeklyRelationshipConstraints(
      [makeAssignment('emp-9', day(0), morning)],
      [constraint],
      { daysInPeriod: WEEK_DAYS }
    )

    expect(violations).toHaveLength(0)
  })
})

describe('checkWeeklyRelationshipConstraints - MAX_TOGETHER', () => {
  it('usa il default in turni quando config è vuota', () => {
    expect(getMaxTogetherLimit(makeRelConstraint('MAX_TOGETHER', []))).toEqual({
      unit: 'shifts',
      limit: REL_CONSTRAINT_DEFAULTS.MAX_SHIFTS_TOGETHER,
    })
  })

  it('legge il limite in turni o in ore da config', () => {
    expect(getMaxTogetherLimit(makeRelConstraint('MAX_TOGETHER', [], { config: { maxShiftsTogether: 2 } }))).toEqual({
      unit: 'shifts',
      limit: 2,
    })
    expect(getMaxTogetherLimit(makeRelConstraint('MAX_TOGETHER', [], { config: { maxHoursTogether: 10 } }))).toEqual({
      unit: 'hours',
      limit: 10,
    })
  })

  it('segnala la violazione oltre il numero di turni consentiti', () => {
    const constraint = makeRelConstraint('MAX_TOGETHER', ['emp-1', 'emp-2'], {
      config: { maxShiftsTogether: 2 },
    })
    const assignments = [day(0), day(1), day(2)].flatMap(d => [
      makeAssignment('emp-1', d, morning),
      makeAssignment('emp-2', d, morning),
    ])

    const violations = checkWeeklyRelationshipConstraints(assignments, [constraint], {
      daysInPeriod: WEEK_DAYS,
    })

    expect(violations).toHaveLength(1)
    expect(violations[0].message).toContain('Troppi turni insieme')
  })

  it('resta nel limite se i turni condivisi non lo superano', () => {
    const constraint = makeRelConstraint('MAX_TOGETHER', ['emp-1', 'emp-2'], {
      config: { maxShiftsTogether: 2 },
    })
    const assignments = [day(0), day(1)].flatMap(d => [
      makeAssignment('emp-1', d, morning),
      makeAssignment('emp-2', d, morning),
    ])

    expect(checkWeeklyRelationshipConstraints(assignments, [constraint], { daysInPeriod: WEEK_DAYS })).toHaveLength(0)
  })

  it('conta solo i turni realmente condivisi, non i giorni in comune', () => {
    const constraint = makeRelConstraint('MAX_TOGETHER', ['emp-1', 'emp-2'], {
      config: { maxShiftsTogether: 0 },
    })
    // Stessi giorni ma turni diversi: nessun tempo passato insieme
    const assignments = [day(0), day(1), day(2)].flatMap(d => [
      makeAssignment('emp-1', d, morning),
      makeAssignment('emp-2', d, evening),
    ])

    expect(checkWeeklyRelationshipConstraints(assignments, [constraint], { daysInPeriod: WEEK_DAYS })).toHaveLength(0)
  })

  it('applica il limite espresso in ore', () => {
    const constraint = makeRelConstraint('MAX_TOGETHER', ['emp-1', 'emp-2'], {
      config: { maxHoursTogether: 10 },
    })
    // Due turni da 8 ore insieme = 16h
    const assignments = [day(0), day(1)].flatMap(d => [
      makeAssignment('emp-1', d, morning),
      makeAssignment('emp-2', d, morning),
    ])

    const violations = checkWeeklyRelationshipConstraints(assignments, [constraint], {
      daysInPeriod: WEEK_DAYS,
    })

    expect(violations).toHaveLength(1)
    expect(violations[0].message).toContain('16h vs max 10h')
  })

  it('rispetta la finestra di validità del vincolo', () => {
    const constraint = makeRelConstraint('MAX_TOGETHER', ['emp-1', 'emp-2'], {
      config: { maxShiftsTogether: 0 },
      validFrom: day(4),
    })
    const assignments = [day(0), day(1)].flatMap(d => [
      makeAssignment('emp-1', d, morning),
      makeAssignment('emp-2', d, morning),
    ])

    expect(checkWeeklyRelationshipConstraints(assignments, [constraint], { daysInPeriod: WEEK_DAYS })).toHaveLength(0)
  })
})

describe('calculateEmployeeScore', () => {
  const params = { preferFixedStaff: true, balanceHours: false, minimizeCost: false }

  it('premia lo staff fisso', () => {
    const fixed = calculateEmployeeScore(makeEmployee({ isFixedStaff: true }), morning, day(0), [], [], params)
    const extra = calculateEmployeeScore(makeEmployee({ isFixedStaff: false }), morning, day(0), [], [], params)

    expect(fixed).toBeGreaterThan(extra)
  })

  it('premia la fascia preferita anche con nomi turno non standard', () => {
    const brunch = makeShift({ id: 'bru', name: 'Brunch', code: 'BRU', startTime: time(10), endTime: time(15) })
    const pref = makeEmployeeConstraint('PREFERRED_SHIFT', { shiftType: 'mattina', preference: 'PREFER' })

    const preferred = calculateEmployeeScore(makeEmployee(), brunch, day(0), [pref], [], params)
    const neutral = calculateEmployeeScore(makeEmployee(), brunch, day(0), [], [], params)

    expect(preferred).toBeGreaterThan(neutral)
  })

  it('penalizza il costo solo se la tariffa è nota', () => {
    const costParams = { ...params, minimizeCost: true }

    const withRate = calculateEmployeeScore(makeEmployee({ hourlyRateBase: 15 }), morning, day(0), [], [], costParams)
    const withoutRate = calculateEmployeeScore(
      makeEmployee({ hourlyRateBase: null }),
      morning,
      day(0),
      [],
      [],
      costParams
    )

    expect(withRate).toBe(withoutRate - 15)
  })
})
