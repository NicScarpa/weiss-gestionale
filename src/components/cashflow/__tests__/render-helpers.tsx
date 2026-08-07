import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { vi } from 'vitest'

/**
 * Utility minime per i test dei componenti del cash flow.
 *
 * Il progetto ha `@testing-library/react` in devDependencies ma non il suo peer
 * `@testing-library/dom`: importarlo fa fallire la suite prima ancora di
 * eseguirla. Si monta quindi con l'API di React 19 (`createRoot` + `act`).
 */

let root: Root | null = null
let container: HTMLElement | null = null

/** Stub delle API DOM che Radix e recharts usano e jsdom non implementa. */
export function installaStubDom() {
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia
  }
}

export async function montare(ui: React.ReactElement): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(ui)
  })
  return container
}

export async function smontare() {
  if (root) {
    await act(async () => {
      root!.unmount()
    })
  }
  container?.remove()
  root = null
  container = null
  document.body.innerHTML = ''
}

/*
 * Per interagire con un componente (click, digitazione, ricerca per testo)
 * esistono già gli helper dello scadenzario in
 * `src/components/scadenzario/__tests__/render-helpers.tsx`. Quando serviranno
 * anche qui, la cosa giusta è promuoverli a modulo condiviso invece di
 * ricopiarli: la prima stesura di questo file li aveva duplicati tutti, e
 * cinque su nove non li usava nessuno.
 */

/** Il testo dell'intera pagina montata, con gli spazi normalizzati. */
export function testoDellaPagina(): string {
  return (document.body.textContent || '').replace(/\s+/g, ' ')
}
