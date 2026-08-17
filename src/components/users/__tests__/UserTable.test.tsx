import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'

import { UserTable, type UserData } from '../UserTable'

/**
 * Il menu dei tre puntini in «Livelli di Accesso».
 *
 * «Visualizza» e «Modifica» puntavano a `/impostazioni/utenti/<id>`, indirizzo
 * rimasto indietro di un trasloco: `/impostazioni/utenti` esiste ma è solo un
 * rimando e non ha figli, quindi entrambe le voci davano 404. Qui si guarda
 * l'`href` che finisce davvero nel DOM, non la stringa scritta nel sorgente.
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

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { role: 'admin', id: 'admin-1' } },
    status: 'authenticated',
  }),
}))

afterEach(cleanup)

const UTENTE: UserData = {
  id: 'utente-7',
  firstName: 'Anna',
  lastName: 'Zamai',
  username: 'zamai.anna',
  email: 'annazamai@weisscafe.com',
  role: { id: 'r-staff', name: 'staff' },
  venue: { id: 'v-1', name: 'Weiss Cafè', code: 'WEISS' },
  isActive: true,
  isFixedStaff: true,
  contractType: 'TEMPO_DETERMINATO',
}

async function apriMenu() {
  render(
    <UserTable users={[UTENTE]} onResetPassword={async () => {}} onToggleActive={async () => {}} />
  )
  const trigger = document.querySelector<HTMLElement>('button[aria-haspopup="menu"]')
  if (!trigger) throw new Error('Il bottone dei tre puntini non è nel DOM')
  await act(async () => {
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
  })
}

function collegamenti(): string[] {
  return Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href') ?? '')
}

describe('UserTable - menu delle azioni', () => {
  it('«Visualizza» apre la scheda sotto /anagrafiche/utenti', async () => {
    await apriMenu()
    expect(collegamenti()).toContain('/anagrafiche/utenti/utente-7')
  })

  it('«Modifica» apre la stessa scheda in modifica', async () => {
    await apriMenu()
    expect(collegamenti()).toContain('/anagrafiche/utenti/utente-7?edit=true')
  })

  it('nessuna voce punta più alla vecchia posizione /impostazioni', async () => {
    await apriMenu()
    expect(collegamenti().filter((h) => h.startsWith('/impostazioni'))).toEqual([])
  })
})
