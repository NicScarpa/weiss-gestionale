import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { toast } from 'sonner'
import { CreateScheduleDialog } from '../create-schedule-sheet'
import type { CreateScheduleInput } from '@/types/schedule'
import { ScheduleType, ScheduleDocumentType, SchedulePriority } from '@/types/schedule'
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

function bottoneConferma() {
  return perTesto(/^Conferma$/i)
}

function importiScadenza() {
  return Array.from(document.body.querySelectorAll<HTMLInputElement>('input[type="number"]'))
}

async function compilaScadenzaMinima(importo = '120') {
  await scrivere(perId('descrizione'), 'Fornitura caffè')
  await scrivere(importiScadenza()[0], importo)
}

describe('CreateScheduleDialog', () => {
  it('tre click rapidi creano una sola scadenza', async () => {
    let sblocca: () => void = () => {}
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          sblocca = resolve
        })
    )
    await montare(<CreateScheduleDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />)
    await compilaScadenzaMinima()

    await cliccareTreVolte(bottoneConferma())
    await attendere()

    expect(onSubmit).toHaveBeenCalledTimes(1)

    sblocca()
    await attendere()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('su errore del server il dialog resta aperto, i dati intatti e il toast lo dice', async () => {
    const onSubmit = vi.fn(() => Promise.reject(new Error('Descrizione obbligatoria')))
    const onOpenChange = vi.fn()
    await montare(<CreateScheduleDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />)
    await compilaScadenzaMinima('250.50')

    await cliccare(bottoneConferma())
    await attendere()

    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).toContain('Descrizione obbligatoria')
    expect(dialogPresente()).toBe(true)
    expect(perId<HTMLInputElement>('descrizione')!.value).toBe('Fornitura caffè')
    expect(importiScadenza()[0].value).toBe('250.50')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('le date del payload sono giorni civili, non istanti UTC', async () => {
    const onSubmit = vi.fn<(data: CreateScheduleInput) => Promise<void>>(() => Promise.resolve())
    await montare(<CreateScheduleDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />)
    await compilaScadenzaMinima()

    await cliccare(bottoneConferma())
    await attendere()

    const payload = onSubmit.mock.calls[0][0] as unknown as Record<string, unknown>
    expect(payload.dataScadenza).toBe('2026-08-15')
    expect(payload.dataEmissione).toBe('2026-08-15')
  })

  it('a cavallo della mezzanotte italiana invia il giorno che l’utente vede', async () => {
    const tzOriginale = process.env.TZ
    process.env.TZ = 'Europe/Rome'
    try {
      const onSubmit = vi.fn<(data: CreateScheduleInput) => Promise<void>>(() => Promise.resolve())
      await montare(<CreateScheduleDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />)
      await compilaScadenzaMinima()

      await cliccare(bottoneConferma())
      await attendere()

      const payload = onSubmit.mock.calls[0][0] as unknown as Record<string, unknown>
      // A Roma sono le 01:30 del 16: `toISOString()` manderebbe il 15
      expect(payload.dataScadenza).toBe('2026-08-16')
      expect(payload.dataEmissione).toBe('2026-08-16')
    } finally {
      process.env.TZ = tzOriginale
    }
  })

  it('se una riga fallisce, quelle già salvate spariscono dal form e non si ricreano', async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Importo totale deve essere positivo'))
    await montare(<CreateScheduleDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />)
    await compilaScadenzaMinima('100')
    await cliccare(perTesto(/^Aggiungi$/i))
    await scrivere(importiScadenza()[1], '200')

    await cliccare(bottoneConferma())
    await attendere()

    expect(onSubmit).toHaveBeenCalledTimes(2)
    expect(toast.error).toHaveBeenCalledTimes(1)
    const righe = importiScadenza()
    expect(righe).toHaveLength(1)
    expect(righe[0].value).toBe('200')
  })

  it('in modifica non invia i campi che il server deriva dai pagamenti', async () => {
    const onSubmit = vi.fn<(data: CreateScheduleInput) => Promise<void>>(() => Promise.resolve())
    await montare(
      <CreateScheduleDialog
        mode="edit"
        open
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
        initialData={{
          tipo: ScheduleType.PASSIVA,
          descrizione: 'Affitto locale',
          importoTotale: 1200,
          dataScadenza: new Date('2026-09-30T00:00:00.000Z'),
          dataEmissione: new Date('2026-09-01T00:00:00.000Z'),
          // Era `ScheduleDocumentType.FATTURA`, che in questo enum non esiste:
          // i valori sono FATTURA_VENDITA e FATTURA_ACQUISTO. A runtime quel
          // campo valeva `undefined`, e il test passava lo stesso perché
          // controlla quali chiavi il payload NON contiene, non questa.
          // Trattandosi di una scadenza PASSIVA, la fattura è d'acquisto.
          tipoDocumento: ScheduleDocumentType.FATTURA_ACQUISTO,
          priorita: SchedulePriority.NORMALE,
        }}
      />
    )

    await cliccare(perTesto(/Salva modifiche/i))
    await attendere()

    const payload = onSubmit.mock.calls[0][0] as unknown as Record<string, unknown>
    expect(Object.keys(payload)).not.toContain('stato')
    expect(Object.keys(payload)).not.toContain('dataPagamento')
    expect(Object.keys(payload)).not.toContain('importoPagato')
    expect(payload.dataScadenza).toBe('2026-09-30')
  })
})
