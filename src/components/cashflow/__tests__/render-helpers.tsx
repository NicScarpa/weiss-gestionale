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

/** Lascia risolvere le promise in sospeso e ri-renderizzare React. */
export async function attendere() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

export async function cliccare(el: Element | null | undefined) {
  if (!el) throw new Error('Elemento da cliccare non trovato')
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

/** Scrive in un input controllato da React passando dal setter nativo. */
export async function scrivere(el: Element | null | undefined, valore: string) {
  if (!el) throw new Error('Campo non trovato')
  const input = el as HTMLInputElement | HTMLTextAreaElement
  const prototipo =
    input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototipo, 'value')!.set!
  await act(async () => {
    setter.call(input, valore)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** Il primo elemento il cui testo visibile corrisponde. */
export function perTesto(testo: string | RegExp, selettore = 'button'): HTMLElement | undefined {
  const elementi = Array.from(document.body.querySelectorAll<HTMLElement>(selettore))
  return elementi.find((el) => {
    const contenuto = (el.textContent || '').trim()
    return typeof testo === 'string' ? contenuto.includes(testo) : testo.test(contenuto)
  })
}

export function perId<T extends HTMLElement = HTMLInputElement>(id: string): T | null {
  return document.body.querySelector<T>(`#${id}`)
}

/** Il testo dell'intera pagina montata, con gli spazi normalizzati. */
export function testoDellaPagina(): string {
  return (document.body.textContent || '').replace(/\s+/g, ' ')
}
