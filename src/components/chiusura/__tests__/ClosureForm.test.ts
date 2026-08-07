import { describe, it, expect } from 'vitest'
import { getDraftBlockingIssues, type ClosureFormData } from '../ClosureForm'

// NOTA: nessuna infrastruttura di test per il rendering di componenti React
// in questo progetto (vedi report Task 11/12/13/14). `getDraftBlockingIssues`
// è già una funzione pura usata sia da "Salva bozza" sia da "Invia": è
// verificata qui direttamente.

function createFormData(overrides?: Partial<ClosureFormData>): ClosureFormData {
  return {
    date: new Date('2026-08-07'),
    venueId: 'venue-123',
    isEvent: false,
    costCenterId: 'weiss-id',
    stations: [],
    partials: [],
    expenses: [],
    attendance: [],
    ...overrides,
  }
}

describe('getDraftBlockingIssues — centro di costo di testata', () => {
  it('blocca il salvataggio se manca il centro di costo', () => {
    const data = createFormData({ costCenterId: undefined })

    const issues = getDraftBlockingIssues(data)

    expect(issues).toContain('Seleziona il centro di costo della chiusura')
  })

  it('blocca anche una stringa vuota (non solo undefined)', () => {
    const data = createFormData({ costCenterId: '' })

    const issues = getDraftBlockingIssues(data)

    expect(issues).toContain('Seleziona il centro di costo della chiusura')
  })

  it('non blocca quando il centro di costo è presente (default WEISS)', () => {
    const data = createFormData({ costCenterId: 'weiss-id' })

    const issues = getDraftBlockingIssues(data)

    expect(issues).not.toContain('Seleziona il centro di costo della chiusura')
  })

  it('si accumula insieme alle altre segnalazioni bloccanti, senza sostituirle', () => {
    const data = createFormData({
      costCenterId: undefined,
      attendance: [{ userId: '', shift: 'MORNING', isExtra: false } as ClosureFormData['attendance'][0]],
    })

    const issues = getDraftBlockingIssues(data)

    expect(issues).toContain('Seleziona il centro di costo della chiusura')
    expect(issues.some((i) => i.startsWith('Presenze:'))).toBe(true)
  })
})
