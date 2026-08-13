import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PassoCaricamento } from '../PassoCaricamento'
import { OPZIONI_PREDEFINITE } from '../tipi'

describe('PassoCaricamento', () => {
  it('parte con «Salta le righe duplicate» selezionata e l anagrafica non sovrascritta', () => {
    render(
      <PassoCaricamento
        opzioni={OPZIONI_PREDEFINITE}
        onOpzioniChange={vi.fn()}
        fileScelti={[]}
        onFileScelti={vi.fn()}
        inLettura={false}
      />
    )

    expect(screen.getByRole('radio', { name: /salta le righe duplicate/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /sostituisci con i nuovi dati/i })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /sovrascrivi dati anagrafici/i })).not.toBeChecked()
  })

  it('dichiara i formati accettati', () => {
    render(
      <PassoCaricamento opzioni={OPZIONI_PREDEFINITE} onOpzioniChange={vi.fn()} fileScelti={[]} onFileScelti={vi.fn()} inLettura={false} />
    )
    const testo = screen.getByText(/formati supportati/i).textContent ?? ''
    expect(testo).toContain('XML')
    expect(testo).toContain('P7M')
    expect(testo).toContain('ZIP')
    expect(testo).toContain('_metaDato.xml')
  })

  it('mostra quanti file sono stati scelti', () => {
    const tre = [
      new File(['x'], 'a.xml'),
      new File(['x'], 'b.xml.p7m'),
      new File(['x'], 'c.xml'),
    ]
    render(
      <PassoCaricamento opzioni={OPZIONI_PREDEFINITE} onOpzioniChange={vi.fn()} fileScelti={tre} onFileScelti={vi.fn()} inLettura={false} />
    )
    expect(screen.getByText('3 file selezionati')).toBeInTheDocument()
    expect(screen.getByText('a.xml')).toBeInTheDocument()
  })

  it('riferisce la scelta della politica duplicati', async () => {
    const onOpzioniChange = vi.fn()
    render(
      <PassoCaricamento opzioni={OPZIONI_PREDEFINITE} onOpzioniChange={onOpzioniChange} fileScelti={[]} onFileScelti={vi.fn()} inLettura={false} />
    )

    await userEvent.click(screen.getByRole('radio', { name: /sostituisci con i nuovi dati/i }))

    expect(onOpzioniChange).toHaveBeenCalledWith(
      expect.objectContaining({ politicaDuplicati: 'sostituisci' })
    )
  })

  it('accetta anche gli archivi nel campo file', () => {
    const { container } = render(
      <PassoCaricamento opzioni={OPZIONI_PREDEFINITE} onOpzioniChange={vi.fn()} fileScelti={[]} onFileScelti={vi.fn()} inLettura={false} />
    )
    const input = container.querySelector('input[type="file"]')
    expect(input).toHaveAttribute('accept', '.xml,.p7m,.zip,.XML,.P7M,.ZIP')
    expect(input).toHaveAttribute('multiple')
  })
})
