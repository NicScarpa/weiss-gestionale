import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { toast } from 'sonner'
import { PaymentDialog, type PaymentFormData } from '../payment-dialog'
import {
  installaStubDom,
  montare,
  smontare,
  attendere,
  cliccare,
  cliccareTreVolte,
  scrivere,
  perTesto,
  perId,
  dialogPresente,
} from './render-helpers'

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  installaStubDom()
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  // 15 agosto 23:30 UTC: con TZ=UTC il giorno civile è il 15, a Roma è già il 16
  vi.setSystemTime(new Date('2026-08-15T23:30:00.000Z'))
})

afterEach(async () => {
  await smontare()
  vi.useRealTimers()
})

function bottoneRegistra() {
  return perTesto(/Registra Pagamento/i)
}

describe('PaymentDialog', () => {
  it('tre click rapidi registrano un solo pagamento', async () => {
    let sblocca: () => void = () => {}
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          sblocca = resolve
        })
    )
    await montare(
      <PaymentDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} importoResiduo={100} />
    )
    await scrivere(perId('importo'), '50')

    await cliccareTreVolte(bottoneRegistra())
    await attendere()

    expect(onSubmit).toHaveBeenCalledTimes(1)

    sblocca()
    await attendere()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('su errore del server il dialog resta aperto, i dati intatti e il toast lo dice', async () => {
    const onSubmit = vi.fn(() =>
      Promise.reject(
        new Error('Il pagamento di 50.00 € supera il residuo della scadenza (30.00 €)')
      )
    )
    const onOpenChange = vi.fn()
    await montare(
      <PaymentDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} importoResiduo={100} />
    )
    await scrivere(perId('importo'), '50')
    await scrivere(perId('riferimento'), 'Bonifico 12')

    await cliccare(bottoneRegistra())
    await attendere()

    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).toContain('supera il residuo')
    expect(dialogPresente()).toBe(true)
    expect(perId<HTMLInputElement>('importo')!.value).toBe('50')
    expect(perId<HTMLInputElement>('riferimento')!.value).toBe('Bonifico 12')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('la data di pagamento viaggia come giorno civile, non come istante UTC', async () => {
    const onSubmit = vi.fn<(data: PaymentFormData) => Promise<void>>(() => Promise.resolve())
    await montare(
      <PaymentDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} importoResiduo={100} />
    )
    await scrivere(perId('importo'), '50')

    await cliccare(bottoneRegistra())
    await attendere()

    const payload = onSubmit.mock.calls[0][0] as unknown as PaymentFormData
    expect(payload.dataPagamento).toBe('2026-08-15')
  })

  it('a cavallo della mezzanotte italiana invia il giorno che l’utente vede', async () => {
    const tzOriginale = process.env.TZ
    process.env.TZ = 'Europe/Rome'
    try {
      const onSubmit = vi.fn<(data: PaymentFormData) => Promise<void>>(() => Promise.resolve())
      await montare(
        <PaymentDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} importoResiduo={100} />
      )
      await scrivere(perId('importo'), '50')

      await cliccare(bottoneRegistra())
      await attendere()

      const payload = onSubmit.mock.calls[0][0] as unknown as PaymentFormData
      // A Roma sono le 01:30 del 16: `toISOString()` manderebbe il 15
      expect(payload.dataPagamento).toBe('2026-08-16')
    } finally {
      process.env.TZ = tzOriginale
    }
  })
})
