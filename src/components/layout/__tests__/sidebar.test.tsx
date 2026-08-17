import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

import { Sidebar } from '../sidebar'

/**
 * Il difetto da cui nascono questi test: un dipendente (ruolo `staff`) apriva
 * la chiusura cassa da telefono, toccava la rail e gli si apriva il sottomenu
 * completo della prima nota — Movimenti, Pagamenti, Regole, Riconciliazione.
 * La rail filtrava le voci per ruolo, ma il pannello a comparsa le cercava
 * nella lista completa: bastava che il percorso corrente (`/chiusura-cassa`)
 * fosse una sottovoce di «Prima Nota» perché quel menu risultasse attivo.
 */

const percorso = vi.hoisted(() => ({ valore: '/chiusura-cassa' }))

vi.mock('next/navigation', () => ({
  usePathname: () => percorso.valore,
}))

/**
 * framer-motion in jsdom funziona, ma `layoutId` misura il DOM a ogni render:
 * nei test è solo rumore. Le props di animazione vanno filtrate, altrimenti
 * React avvisa di attributi sconosciuti su `div` e `aside`.
 */
vi.mock('framer-motion', () => {
  type PropsAnimate = Record<string, unknown>
  const soloDom = (props: PropsAnimate) => {
    const { initial, animate, exit, transition, layoutId, ...resto } = props
    void initial
    void animate
    void exit
    void transition
    void layoutId
    return resto
  }
  return {
    motion: {
      div: (props: PropsAnimate) => <div {...soloDom(props)} />,
      aside: (props: PropsAnimate) => <aside {...soloDom(props)} />,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  }
})

/** Voci che solo admin e manager devono poter vedere. */
const VOCI_RISERVATE = [
  'Movimenti',
  'Pagamenti',
  'Regole',
  'Riconciliazione',
  'Fatture',
  'Dipendenti',
  'Livelli di Accesso',
]

/**
 * Il pannello si apre sull'ingresso del puntatore sulla barra: su un telefono
 * lo stesso gesto lo genera il tocco, che è il caso segnalato.
 *
 * Va emesso `mouseover`, non `mouseenter`: React non ascolta `mouseenter`, lo
 * sintetizza da `mouseover`/`mouseout` guardando `relatedTarget`. Con
 * `fireEvent.mouseEnter` gli `onMouseEnter` non venivano chiamati affatto, il
 * pannello non si apriva mai e il test passava anche con il difetto rimesso
 * dentro: verde che non prova niente.
 */
async function entraCon(elemento: HTMLElement) {
  await act(async () => {
    fireEvent.mouseOver(elemento, { relatedTarget: null })
  })
}

beforeEach(() => {
  percorso.valore = '/chiusura-cassa'
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ totaleScadute: 0 }), { status: 200 })
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Sidebar, ruolo staff', () => {
  it('mostra in rail solo le voci consentite allo staff', () => {
    render(<Sidebar role="staff" />)

    expect(screen.getByLabelText('Chiusure Cassa')).toBeInTheDocument()
    expect(screen.getByLabelText('Portale')).toBeInTheDocument()

    for (const voce of ['Dashboard', 'Prima Nota', 'Budget', 'Personale', 'Impostazioni']) {
      expect(screen.queryByLabelText(voce)).not.toBeInTheDocument()
    }
  })

  it('non apre il sottomenu della prima nota quando è sulla chiusura cassa', async () => {
    const { container } = render(<Sidebar role="staff" />)

    // Il gesto del difetto segnalato: il dito arriva sulla barra — sopra il
    // logo, non su una voce — e il pannello mostra la sezione *attiva*. Con
    // `/chiusura-cassa` cercata nella lista completa, attiva risultava «Prima
    // Nota»: si apriva Movimenti, Pagamenti, Regole, Riconciliazione.
    await entraCon(container.firstElementChild as HTMLElement)

    for (const voce of VOCI_RISERVATE) {
      expect(screen.queryByRole('link', { name: voce })).not.toBeInTheDocument()
    }
    expect(screen.queryByText('Contabilità')).not.toBeInTheDocument()
  })

  it('non interroga lo scadenzario, che gli risponderebbe 403', () => {
    render(<Sidebar role="staff" />)

    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

describe('Sidebar, ruolo admin', () => {
  it('apre il sottomenu della sezione attiva', async () => {
    percorso.valore = '/prima-nota/movimenti'
    const { container } = render(<Sidebar role="admin" />)

    await entraCon(container.firstElementChild as HTMLElement)

    // Le voci della rail hanno come nome accessibile quello della sezione
    // («Prima Nota»): un link di nome «Movimenti» può venire solo dal pannello.
    expect(screen.getByRole('link', { name: 'Movimenti' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Riconciliazione' })).toBeInTheDocument()
  })

  it('mostra tutte le voci principali', () => {
    percorso.valore = '/'
    render(<Sidebar role="admin" />)

    for (const voce of ['Dashboard', 'Prima Nota', 'Fatturazione', 'Budget', 'Personale', 'Impostazioni']) {
      expect(screen.getByLabelText(voce)).toBeInTheDocument()
    }
  })
})
