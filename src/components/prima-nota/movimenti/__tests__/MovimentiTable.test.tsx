import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MovimentiTable } from '../MovimentiTable'
import type { JournalEntry } from '@/types/prima-nota'

function scrittura(extra: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'e1', venueId: 'v1', date: new Date('2026-08-14'), registerType: 'BANK', entryType: 'USCITA',
    description: 'Commissioni', creditAmount: 0.75, createdAt: new Date(), updatedAt: new Date(),
    ...extra,
  } as JournalEntry
}

describe('MovimentiTable — «dalla banca»', () => {
  it('una scrittura nata da una riga della banca lo dice, e porta alla riga', () => {
    render(<MovimentiTable data={[scrittura({ bankTransactionId: 'bt1' })]} />)
    const link = screen.getByRole('link', { name: /dalla banca/ })
    expect(link).toHaveAttribute('href', '/prima-nota/movimenti?register=BANK&movimento=bt1')
  })

  it('una scrittura senza riga non lo dice', () => {
    render(<MovimentiTable data={[scrittura()]} />)
    expect(screen.queryByText(/dalla banca/)).toBeNull()
  })
})
