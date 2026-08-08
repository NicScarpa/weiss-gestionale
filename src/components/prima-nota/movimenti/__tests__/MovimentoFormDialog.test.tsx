import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { MovimentoFormDialog } from '../MovimentoFormDialog'

/**
 * Il campo IVA dice «opzionale» e deve comportarsi come tale.
 *
 * Era registrato con `valueAsNumber`, che su casella vuota non restituisce
 * `undefined` ma `NaN`: la validazione lo rifiutava, il messaggio d'errore
 * finiva su un campo che l'etichetta dichiara facoltativo e nessun movimento
 * si salvava senza IVA. Sono i movimenti più comuni — versamenti, prelievi,
 * giroconti — dove l'IVA non esiste proprio.
 */

/** API DOM che Radix usa e jsdom non implementa. */
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

afterEach(cleanup)

function campo(nome: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[name="${nome}"]`)
  if (!input) throw new Error(`Campo "${nome}" non trovato nel modulo`)
  return input
}

function bottoneSalva(): HTMLButtonElement {
  const bottone = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === 'Salva'
  )
  if (!bottone) throw new Error('Bottone "Salva" non trovato')
  return bottone
}

/** Compila i due campi obbligatori e lascia il resto ai valori di partenza. */
function compilaObbligatori() {
  fireEvent.change(campo('amount'), { target: { value: '100' } })
  fireEvent.change(campo('description'), { target: { value: 'Versamento in banca' } })
}

async function salva() {
  await act(async () => {
    fireEvent.click(bottoneSalva())
  })
}

function montaModulo() {
  const onSave = vi.fn()
  render(<MovimentoFormDialog open onSave={onSave} />)
  return onSave
}

describe('MovimentoFormDialog, campo IVA', () => {
  it('salva il movimento quando l\'IVA non viene compilata', async () => {
    const onSave = montaModulo()

    compilaObbligatori()
    await salva()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toMatchObject({ amount: 100 })
    expect(onSave.mock.calls[0][0].vatAmount).toBeUndefined()
  })

  it('salva il movimento quando l\'IVA viene scritta e poi cancellata', async () => {
    const onSave = montaModulo()

    compilaObbligatori()
    fireEvent.change(campo('vatAmount'), { target: { value: '22' } })
    fireEvent.change(campo('vatAmount'), { target: { value: '' } })
    await salva()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].vatAmount).toBeUndefined()
  })

  it('trasmette l\'IVA come numero quando è compilata', async () => {
    const onSave = montaModulo()

    compilaObbligatori()
    fireEvent.change(campo('vatAmount'), { target: { value: '22.50' } })
    await salva()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].vatAmount).toBe(22.5)
  })
})
