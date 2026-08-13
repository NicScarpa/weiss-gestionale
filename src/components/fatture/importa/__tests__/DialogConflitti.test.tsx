import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DialogConflitti } from '../DialogConflitti'

const conflitti = [
  { partitaIva: '111', denominazione: 'ROMA GIANFRANCO SRL', giorniDalFile: 1, giorniAnagrafica: 3, aliquote: [10], chiavi: ['a.xml', 'b.xml'] },
  { partitaIva: '222', denominazione: 'Cromo SRL', giorniDalFile: 0, giorniAnagrafica: 3, aliquote: [22], chiavi: ['c.xml'] },
]

describe('DialogConflitti', () => {
  it('conta le fatture toccate, non i fornitori', () => {
    render(<DialogConflitti aperto conflitti={conflitti} onAnnulla={vi.fn()} onContinua={vi.fn()} />)
    expect(screen.getByText(/trovate 3 fatture con valori in conflitto/i)).toBeInTheDocument()
  })

  it('propone «Importazione» per tutti come scelta iniziale', async () => {
    const onContinua = vi.fn()
    render(<DialogConflitti aperto conflitti={conflitti} onAnnulla={vi.fn()} onContinua={onContinua} />)

    fireEvent.click(screen.getByRole('button', { name: /continua importazione/i }))

    expect(onContinua).toHaveBeenCalledWith({ '111': 'importazione', '222': 'importazione' })
  })

  it('cambia una riga sola senza toccare le altre', async () => {
    const onContinua = vi.fn()
    render(<DialogConflitti aperto conflitti={conflitti} onAnnulla={vi.fn()} onContinua={onContinua} />)

    fireEvent.click(screen.getByRole('button', { name: /usa l['’\s]anagrafica per ROMA GIANFRANCO SRL/i }))
    fireEvent.click(screen.getByRole('button', { name: /continua importazione/i }))

    expect(onContinua).toHaveBeenCalledWith({ '111': 'anagrafica', '222': 'importazione' })
  })

  it('risolve tutto in blocco con «Tutti Anagrafica»', async () => {
    const onContinua = vi.fn()
    render(<DialogConflitti aperto conflitti={conflitti} onAnnulla={vi.fn()} onContinua={onContinua} />)

    fireEvent.click(screen.getByRole('button', { name: /tutti anagrafica/i }))
    fireEvent.click(screen.getByRole('button', { name: /continua importazione/i }))

    expect(onContinua).toHaveBeenCalledWith({ '111': 'anagrafica', '222': 'anagrafica' })
  })

  it('mostra i due valori a confronto', () => {
    render(<DialogConflitti aperto conflitti={conflitti} onAnnulla={vi.fn()} onContinua={vi.fn()} />)
    expect(screen.getByText('1 giorno data fattura')).toBeInTheDocument()
    expect(screen.getAllByText('3 giorni data fattura')).toHaveLength(2)
  })

  it('azzera le scelte quando cambia la lista dei conflitti, anche se il dialog resta montato', () => {
    const onContinua = vi.fn()
    const { rerender } = render(
      <DialogConflitti aperto conflitti={conflitti} onAnnulla={vi.fn()} onContinua={onContinua} />
    )

    fireEvent.click(screen.getByRole('button', { name: /usa l['’\s]anagrafica per ROMA GIANFRANCO SRL/i }))

    // Un secondo import (Task 12): il dialog resta montato, cambia solo la
    // prop `conflitti` — con un nuovo array che ripropone la stessa partita
    // IVA già vista prima.
    const secondoImport = [
      { partitaIva: '111', denominazione: 'ROMA GIANFRANCO SRL', giorniDalFile: 5, giorniAnagrafica: 3, aliquote: [10], chiavi: ['d.xml'] },
    ]
    rerender(<DialogConflitti aperto conflitti={secondoImport} onAnnulla={vi.fn()} onContinua={onContinua} />)

    fireEvent.click(screen.getByRole('button', { name: /continua importazione/i }))

    expect(onContinua).toHaveBeenCalledWith({ '111': 'importazione' })
  })
})
