import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

import { MobileNav } from '../mobile-nav'

/**
 * Il cassetto è la navigazione da telefono: qui si verifica che filtri per
 * ruolo come la barra da desktop — è la stessa fonte (`navigazionePerRuolo`),
 * e questi test tengono che resti così.
 */

const percorso = vi.hoisted(() => ({ valore: '/chiusura-cassa' }))

vi.mock('next/navigation', () => ({
  usePathname: () => percorso.valore,
}))

async function apriCassetto(role: string) {
  render(<MobileNav role={role} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Apri il menu' }))
  })
}

/** Gli `href` presenti nel DOM: dentro il cassetto ci sono solo quelli del menu. */
function collegamenti(): string[] {
  return Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href') ?? '')
}

beforeEach(() => {
  percorso.valore = '/chiusura-cassa'
})

afterEach(cleanup)

describe('MobileNav', () => {
  it('allo staff mostra solo chiusura cassa e portale', async () => {
    await apriCassetto('staff')

    expect(collegamenti().sort()).toEqual(['/chiusura-cassa', '/portale'])
  })

  it("all'admin mostra anche le sottovoci delle sezioni", async () => {
    await apriCassetto('admin')

    const href = collegamenti()
    expect(href).toContain('/prima-nota/movimenti')
    expect(href).toContain('/spese-ricorrenti')
    expect(href).toContain('/anagrafiche/utenti')
    expect(href).toContain('/impostazioni/conti')
  })

  it('nessuna voce riservata compare allo staff', async () => {
    await apriCassetto('staff')

    const riservate = collegamenti().filter((h) =>
      ['/prima-nota', '/budget', '/fatture', '/impostazioni', '/anagrafiche', '/riconciliazione'].some(
        (prefisso) => h.startsWith(prefisso)
      )
    )
    expect(riservate).toEqual([])
  })

  it('si chiude quando si tocca una voce', async () => {
    await apriCassetto('staff')

    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'Portale' }))
    })

    expect(screen.queryByRole('link', { name: 'Portale' })).not.toBeInTheDocument()
  })
})
