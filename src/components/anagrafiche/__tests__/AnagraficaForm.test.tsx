import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'

import { AnagraficaForm } from '../AnagraficaForm'
import { CAMPI_ANAGRAFICA } from '@/lib/anagrafiche/campi'

/**
 * Il modulo dell'anagrafica, uno per clienti e fornitori.
 *
 * La difformità fra le due anagrafiche non era una scelta: erano due schermate
 * cresciute per conto proprio, e ognuna aveva perso per strada qualcosa
 * dell'altra. Qui il modulo è uno solo, e questi test tengono ferma la cosa
 * che conta — che entrambe le anagrafiche mostrino gli stessi campi e che
 * ciascuna li rimandi con i nomi di colonna che la sua rotta si aspetta.
 */

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

/** Il selettore dei conti interroga l'API: qui interessa solo che ci sia. */
vi.mock('@/components/prima-nota/shared/AccountCombobox', () => ({
  AccountCombobox: ({ value }: { value?: string }) => (
    <input aria-label="Conto predefinito" readOnly value={value ?? ''} />
  ),
}))

afterEach(cleanup)

function campo(etichetta: string): HTMLInputElement | HTMLTextAreaElement {
  const elemento = Array.from(document.querySelectorAll('label')).find(
    (l) => l.textContent?.replace('*', '').trim() === etichetta
  )
  const id = elemento?.getAttribute('for')
  const controllo = id ? document.getElementById(id) : null
  if (!controllo) throw new Error(`Campo «${etichetta}» non trovato nel modulo`)
  return controllo as HTMLInputElement | HTMLTextAreaElement
}

function etichettePresenti(): string[] {
  return Array.from(document.querySelectorAll('label')).map(
    (l) => l.textContent?.replace('*', '').trim() ?? ''
  )
}

function bottoneSalva(): HTMLButtonElement {
  const b = Array.from(document.querySelectorAll('button')).find(
    (x) => x.textContent?.trim() === 'Salva'
  )
  if (!b) throw new Error('Bottone «Salva» non trovato')
  return b
}

async function monta(props: Partial<Parameters<typeof AnagraficaForm>[0]> = {}) {
  const onSalva = vi.fn().mockResolvedValue(undefined)
  await act(async () => {
    render(
      <AnagraficaForm
        variante={props.variante ?? 'cliente'}
        valoriIniziali={props.valoriIniziali}
        onSalva={props.onSalva ?? onSalva}
        onAnnulla={props.onAnnulla ?? (() => {})}
      />
    )
  })
  return onSalva
}

async function salva() {
  await act(async () => {
    fireEvent.click(bottoneSalva())
  })
}

describe('modulo anagrafica', () => {
  it('mostra tutti i campi dichiarati, per il cliente', async () => {
    await monta({ variante: 'cliente' })
    const presenti = etichettePresenti()

    const mancanti = CAMPI_ANAGRAFICA.filter((c) => !presenti.includes(c.etichetta))
    expect(mancanti.map((c) => c.etichetta)).toEqual([])
  })

  it('mostra esattamente gli stessi campi per il fornitore', async () => {
    await monta({ variante: 'cliente' })
    const delCliente = etichettePresenti().sort()
    cleanup()

    await monta({ variante: 'fornitore' })
    const delFornitore = etichettePresenti().sort()

    expect(delFornitore).toEqual(delCliente)
  })

  it('senza denominazione non salva e lo dice', async () => {
    const onSalva = await monta()
    await salva()

    expect(onSalva).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Denominazione obbligatoria')
  })

  it('rifiuta un indirizzo email malformato', async () => {
    const onSalva = await monta()
    await act(async () => {
      fireEvent.change(campo('Denominazione'), { target: { value: 'Bar Centrale' } })
      fireEvent.change(campo('Email'), { target: { value: 'non-una-email' } })
    })
    await salva()

    expect(onSalva).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Email non valida')
  })

  it('manda al cliente le sue colonne in italiano', async () => {
    const onSalva = await monta({ variante: 'cliente' })
    await act(async () => {
      fireEvent.change(campo('Denominazione'), { target: { value: 'Bar Centrale' } })
      fireEvent.change(campo('CAP'), { target: { value: '33077' } })
    })
    await salva()

    expect(onSalva).toHaveBeenCalledWith(
      expect.objectContaining({ denominazione: 'Bar Centrale', cap: '33077' })
    )
  })

  it('manda al fornitore le sue colonne in inglese', async () => {
    const onSalva = await monta({ variante: 'fornitore' })
    await act(async () => {
      fireEvent.change(campo('Denominazione'), { target: { value: 'Caffè Trieste' } })
      fireEvent.change(campo('CAP'), { target: { value: '34121' } })
    })
    await salva()

    expect(onSalva).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Caffè Trieste', postalCode: '34121' })
    )
  })

  it('riempie i campi con il record che sta modificando', async () => {
    await monta({
      variante: 'fornitore',
      valoriIniziali: { name: 'Caffè Trieste', city: 'Trieste', phone: '+39 040 000000' },
    })

    expect(campo('Denominazione').value).toBe('Caffè Trieste')
    expect(campo('Città').value).toBe('Trieste')
    expect(campo('Telefono').value).toBe('+39 040 000000')
  })

  it('mette il codice fiscale in maiuscolo mentre lo si scrive', async () => {
    const onSalva = await monta()
    await act(async () => {
      fireEvent.change(campo('Denominazione'), { target: { value: 'Bar Centrale' } })
      fireEvent.change(campo('Codice fiscale'), { target: { value: 'rssmra85m01h501w' } })
    })
    await salva()

    expect(onSalva).toHaveBeenCalledWith(
      expect.objectContaining({ codiceFiscale: 'RSSMRA85M01H501W' })
    )
  })

  it('il paese parte da IT', async () => {
    await monta()
    expect(campo('Paese').value).toBe('IT')
  })
})
