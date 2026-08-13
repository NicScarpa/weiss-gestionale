import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

/**
 * Utility minime per i test dei componenti dello scadenzario.
 *
 * Il progetto ha `@testing-library/react` in devDependencies ma non il suo
 * peer `@testing-library/dom`: importarlo fa fallire la suite prima ancora di
 * eseguirla. Finché la dipendenza non viene aggiunta si monta con l'API di
 * React 19 (`createRoot` + `act`), che non richiede nulla di nuovo.
 */

let root: Root | null = null
let container: HTMLElement | null = null

/** Stub delle API DOM che Radix usa e jsdom non implementa. */
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

/**
 * Nell'applicazione il QueryClientProvider sta nel layout radice, quindi i
 * componenti che usano TanStack Query lo danno per scontato: senza, il test
 * fallisce con "No QueryClient set" per un difetto del banco di prova, non del
 * prodotto.
 *
 * Due scelte che sembrano superflue e non lo sono, da non smontare:
 *
 * - **Il client è creato qui dentro, uno nuovo a ogni montaggio**, non una volta
 *   sola a livello di modulo. Condividendolo, la cache di un test sopravvive nel
 *   successivo e si ottengono due guasti che sembrano difetti del prodotto: un
 *   test che passa solo se eseguito dopo un altro, e un componente che pare non
 *   ricaricare i dati mentre in realtà li sta leggendo dalla cache del test
 *   precedente.
 * - **`retry: false`**: col default, un test che verifica lo stato d'errore
 *   aspetta i tre tentativi con backoff e diventa lento o intermittente.
 */
export async function montare(ui: React.ReactElement): Promise<HTMLElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  await act(async () => {
    root!.render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
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

/** Click sincroni ravvicinati: nessuna attesa fra l'uno e l'altro. */
export async function cliccareTreVolte(el: Element | null | undefined) {
  if (!el) throw new Error('Elemento da cliccare non trovato')
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
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

export function dialogPresente(): boolean {
  return document.body.querySelector('[role="dialog"]') !== null
}

/**
 * Il testo dell'intera pagina montata, con gli spazi normalizzati. Nasce nella
 * copia del cash flow (`src/components/cashflow/__tests__/render-helpers.tsx`),
 * dove non serve il `QueryClientProvider`; qui serve entrambe le cose insieme,
 * quindi si aggiunge qui invece di aprire una terza copia del file.
 */
export function testoDellaPagina(): string {
  return (document.body.textContent || '').replace(/\s+/g, ' ')
}
