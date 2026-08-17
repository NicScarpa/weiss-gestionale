import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { PaymentDialog } from '../payment-dialog'

/**
 * La finestra che registra il pagamento di una scadenza.
 *
 * Da quando il pagamento entra anche in prima nota, serve sapere **su quale
 * conto**: la scadenza non ne porta uno, e il server rifiuta il pagamento
 * senza. Il campo deve stare qui, altrimenti il rifiuto indicherebbe
 * un'azione che dalla finestra non si può compiere — lo stesso vicolo cieco
 * già visto sullo sgancio della riconciliazione.
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

/** Il selettore dei conti interroga l'API: qui basta poterlo pilotare. */
vi.mock('@/components/prima-nota/shared/AccountCombobox', () => ({
  AccountCombobox: ({
    value,
    onChange,
  }: {
    value?: string
    onChange: (v: string | undefined) => void
  }) => (
    <input
      aria-label="Conto"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  ),
}))

afterEach(cleanup)

function conQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
}

async function monta() {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  await act(async () => {
    render(
      conQueryClient(
        <PaymentDialog
          open
          onOpenChange={() => {}}
          onSubmit={onSubmit}
          isLoading={false}
          importoResiduo={100}
        />
      )
    )
  })
  return onSubmit
}

function campoConto(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Conto"]')
  if (!input) throw new Error('Il campo «Conto» non è nella finestra')
  return input
}

function campoImporto(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('#importo')
  if (!input) throw new Error('Campo importo non trovato')
  return input
}

async function registra() {
  const bottone = Array.from(document.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Registra')
  )
  if (!bottone) throw new Error('Bottone di registrazione non trovato')
  await act(async () => {
    fireEvent.click(bottone)
  })
}

describe('finestra del pagamento', () => {
  it('chiede su quale conto imputare il pagamento', async () => {
    await monta()
    expect(() => campoConto()).not.toThrow()
  })

  it('senza conto non registra e lo dice', async () => {
    const onSubmit = await monta()

    await act(async () => {
      fireEvent.change(campoImporto(), { target: { value: '100' } })
    })
    await registra()

    expect(onSubmit).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Scegli il conto')
  })

  it('manda il conto scelto insieme al pagamento', async () => {
    const onSubmit = await monta()

    await act(async () => {
      fireEvent.change(campoImporto(), { target: { value: '100' } })
      fireEvent.change(campoConto(), { target: { value: 'conto-7' } })
    })
    await registra()

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ importo: 100, accountId: 'conto-7' })
    )
  })
})
