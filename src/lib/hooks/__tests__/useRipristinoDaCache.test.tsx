import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRipristinoDaCache } from '../useRipristinoDaCache'

function pageShow(persisted: boolean) {
  const evento = new Event('pageshow') as PageTransitionEvent
  Object.defineProperty(evento, 'persisted', { value: persisted })
  window.dispatchEvent(evento)
}

describe('useRipristinoDaCache', () => {
  it('scatta quando la pagina torna dalla cache del browser', () => {
    const alRipristino = vi.fn()
    renderHook(() => useRipristinoDaCache(alRipristino))

    pageShow(true)

    expect(alRipristino).toHaveBeenCalledTimes(1)
  })

  // Un `pageshow` con `persisted: false` è un caricamento normale: lì i
  // componenti si montano e le query si rileggono da sole. Reagire anche a
  // quello raddoppierebbe ogni lettura all'apertura della pagina.
  it('non scatta su un caricamento normale', () => {
    const alRipristino = vi.fn()
    renderHook(() => useRipristinoDaCache(alRipristino))

    pageShow(false)

    expect(alRipristino).not.toHaveBeenCalled()
  })

  it('smette di ascoltare quando il componente si smonta', () => {
    const alRipristino = vi.fn()
    const { unmount } = renderHook(() => useRipristinoDaCache(alRipristino))

    unmount()
    pageShow(true)

    expect(alRipristino).not.toHaveBeenCalled()
  })
})
