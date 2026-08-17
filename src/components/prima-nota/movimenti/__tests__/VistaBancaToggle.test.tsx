import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  VistaBancaToggle,
  paramsPerVista,
  righeEstrattoConto,
  vistaDaSearchParams,
} from '../VistaBancaToggle'

describe('vistaDaSearchParams', () => {
  it('senza `vista` si apre sull’estratto conto', () => {
    expect(vistaDaSearchParams(new URLSearchParams('register=BANK'))).toBe('estratto')
  })

  it('`vista=scritture` porta alle scritture', () => {
    expect(vistaDaSearchParams(new URLSearchParams('register=BANK&vista=scritture'))).toBe(
      'scritture'
    )
  })

  // Un URL incollato male, o avanzato da una versione precedente, non deve
  // lasciare la pagina senza nessuna delle due viste.
  it('un valore che non esiste cade sull’estratto conto', () => {
    expect(vistaDaSearchParams(new URLSearchParams('vista=qualcosa'))).toBe('estratto')
  })
})

describe('paramsPerVista', () => {
  it('conserva il registro e segna solo le scritture', () => {
    const sp = paramsPerVista('scritture', new URLSearchParams('register=BANK'))

    expect(sp.get('register')).toBe('BANK')
    expect(sp.get('vista')).toBe('scritture')
  })

  // L'estratto conto è il valore di partenza: scriverlo nell'URL lo
  // ingombrerebbe con un parametro che non dice nulla in più.
  it('tornando all’estratto conto toglie `vista` dall’URL', () => {
    const sp = paramsPerVista('estratto', new URLSearchParams('register=BANK&vista=scritture'))

    expect(sp.get('register')).toBe('BANK')
    expect(sp.has('vista')).toBe(false)
  })

  // Restare nell'URL li rimetterebbe in vigore al rientro sull'estratto conto,
  // senza che il pannello dei filtri li abbia mai mostrati: la lista sembrerebbe
  // vuota mentre è solo filtrata.
  it('passando alle scritture lascia indietro i filtri dell’estratto conto', () => {
    const sp = paramsPerVista(
      'scritture',
      new URLSearchParams('register=BANK&search=enel&tipo=uscite&cestino=1&page=3')
    )

    expect(sp.get('register')).toBe('BANK')
    expect(sp.has('search')).toBe(false)
    expect(sp.has('tipo')).toBe(false)
    expect(sp.has('cestino')).toBe(false)
    expect(sp.has('page')).toBe(false)
  })

  it('non si porta via i parametri di altri (es. `register`)', () => {
    const sp = paramsPerVista('estratto', new URLSearchParams('register=BANK&altro=1'))

    expect(sp.get('altro')).toBe('1')
  })
})

describe('righeEstrattoConto', () => {
  it('somma le tre schede vive', () => {
    expect(righeEstrattoConto({ attivi: 200, delegheF24: 20, cbillPagopa: 11, cestino: 0 })).toBe(231)
  })

  // Il numero della sotto-scheda deve restare fermo quando una riga cambia
  // scheda: prima veniva dal `total` della lista, che conta la sola scheda
  // aperta, e ogni «Sposta in» faceva calare il conteggio come se il movimento
  // fosse sparito.
  it('non cambia spostando una riga fra le schede', () => {
    const prima = righeEstrattoConto({ attivi: 231, delegheF24: 0, cbillPagopa: 0, cestino: 0 })
    const dopo = righeEstrattoConto({ attivi: 230, delegheF24: 1, cbillPagopa: 0, cestino: 0 })

    expect(dopo).toBe(prima)
  })

  // Cestinare invece toglie: quelle righe si sono volute togliere, e contarle
  // manderebbe a cercare in un elenco dove non stanno.
  it('lascia fuori il Cestino', () => {
    expect(righeEstrattoConto({ attivi: 5, delegheF24: 0, cbillPagopa: 0, cestino: 40 })).toBe(5)
  })
})

describe('VistaBancaToggle', () => {
  it('mostra i conteggi accanto ai due nomi e segna quella scelta', () => {
    render(
      <VistaBancaToggle
        vista="estratto"
        conteggioEstratto={231}
        conteggioScritture={4}
        onCambia={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Estratto conto (231)' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Scritture (4)' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  // Uno zero è un conteggio vero — «non c'è niente qui» — e deve comparire.
  it('lo zero si vede, il conteggio non ancora letto no', () => {
    render(
      <VistaBancaToggle
        vista="scritture"
        conteggioEstratto={undefined}
        conteggioScritture={0}
        onCambia={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Estratto conto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scritture (0)' })).toBeInTheDocument()
  })

  it('cliccando l’altra scheda dice quale', async () => {
    const onCambia = vi.fn()
    render(<VistaBancaToggle vista="estratto" onCambia={onCambia} />)

    screen.getByRole('button', { name: 'Scritture' }).click()

    expect(onCambia).toHaveBeenCalledWith('scritture')
  })
})
