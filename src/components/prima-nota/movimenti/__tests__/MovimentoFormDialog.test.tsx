import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MovimentoFormDialog } from '../MovimentoFormDialog'
import type { EntryType, RegisterType } from '@/types/prima-nota'

/**
 * Il campo IVA dice «opzionale» e deve comportarsi come tale.
 *
 * Era registrato con `valueAsNumber`, che su casella vuota non restituisce
 * `undefined` ma `NaN`: la validazione lo rifiutava, il messaggio d'errore
 * finiva su un campo che l'etichetta dichiara facoltativo e nessun movimento
 * si salvava senza IVA. Sono i movimenti più comuni — versamenti, prelievi,
 * giroconti — dove l'IVA non esiste proprio.
 */

/** API DOM che Radix usa e jsdom non implementa. */
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

afterEach(cleanup)

function campo(nome: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[name="${nome}"]`)
  if (!input) throw new Error(`Campo "${nome}" non trovato nel modulo`)
  return input
}

/** Il bottone di conferma: si chiama «Aggiorna» quando il modulo apre su un movimento esistente. */
function bottoneSalva(): HTMLButtonElement {
  const bottone = Array.from(document.querySelectorAll('button')).find((b) =>
    ['Salva', 'Aggiorna'].includes(b.textContent?.trim() ?? '')
  )
  if (!bottone) throw new Error('Bottone di conferma non trovato')
  return bottone
}

/** Compila i due campi obbligatori e lascia il resto ai valori di partenza. */
function compilaObbligatori() {
  fireEvent.change(campo('amount'), { target: { value: '100' } })
  fireEvent.change(campo('description'), { target: { value: 'Versamento in banca' } })
}

async function salva() {
  await act(async () => {
    fireEvent.click(bottoneSalva())
  })
}

/**
 * Nell'applicazione il QueryClientProvider sta nel layout radice, quindi il
 * modulo lo dà per scontato: legge conti e centri di costo con TanStack Query
 * per sapere se il conto scelto ne pretende uno. Senza provider il test
 * fallirebbe con «No QueryClient set», che è un difetto del banco di prova e
 * non del prodotto. Il client è nuovo a ogni montaggio, così la cache di un
 * test non sopravvive nel successivo; `retry: false` evita che le richieste
 * verso `/api` — che qui nessuno serve — vengano ritentate con backoff.
 */
function conQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
}

function montaModulo() {
  const onSave = vi.fn()
  render(conQueryClient(<MovimentoFormDialog open onSave={onSave} />))
  return onSave
}

/**
 * Monta il modulo già su un tipo di movimento preciso. I selettori Radix non si
 * pilotano con `fireEvent` — aprono su eventi di puntatore che jsdom non
 * produce — e il tipo è comunque un valore iniziale come un altro.
 */
function montaModuloCon(entryType: EntryType, registerType: RegisterType = 'CASH') {
  const onSave = vi.fn()
  render(
    conQueryClient(
      <MovimentoFormDialog
        open
        onSave={onSave}
        entry={{
          date: new Date('2026-08-05'),
          registerType,
          entryType,
          amount: 0,
          description: '',
        }}
      />
    )
  )
  return onSave
}

describe('MovimentoFormDialog, campo IVA', () => {
  it('salva il movimento quando l\'IVA non viene compilata', async () => {
    const onSave = montaModulo()

    compilaObbligatori()
    await salva()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toMatchObject({ amount: 100 })
    expect(onSave.mock.calls[0][0].vatAmount).toBeUndefined()
  })

  it('salva il movimento quando l\'IVA viene scritta e poi cancellata', async () => {
    const onSave = montaModulo()

    compilaObbligatori()
    fireEvent.change(campo('vatAmount'), { target: { value: '22' } })
    fireEvent.change(campo('vatAmount'), { target: { value: '' } })
    await salva()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].vatAmount).toBeUndefined()
  })

  it('trasmette l\'IVA come numero quando è compilata', async () => {
    const onSave = montaModulo()

    compilaObbligatori()
    fireEvent.change(campo('vatAmount'), { target: { value: '22.50' } })
    await salva()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].vatAmount).toBe(22.5)
  })

  // Spostare contante fra cassa e banca non è un'operazione imponibile: il
  // server scarta l'IVA dei trasferimenti, e un campo che non ha effetto è
  // peggio di un campo assente.
  it.each(['VERSAMENTO', 'PRELIEVO', 'GIROCONTO'] as const)(
    'non chiede l\'IVA per un %s',
    (tipo) => {
      montaModuloCon(tipo)

      expect(document.querySelector('input[name="vatAmount"]')).toBeNull()
    }
  )
})

/**
 * Un trasferimento è una scrittura in due righe: il modulo deve dire da quale
 * registro il denaro esce e in quale entra. Ne chiedeva uno solo, e l'altra
 * riga non veniva mai scritta.
 */
describe('MovimentoFormDialog, registri dei trasferimenti', () => {
  it('il versamento parte dalla cassa e arriva in banca senza chiederlo', async () => {
    const onSave = montaModuloCon('VERSAMENTO')

    compilaObbligatori()
    await salva()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toMatchObject({
      entryType: 'VERSAMENTO',
      registerType: 'CASH',
      counterRegisterType: 'BANK',
    })
  })

  it('il prelievo parte dalla banca e arriva in cassa', async () => {
    const onSave = montaModuloCon('PRELIEVO', 'BANK')

    compilaObbligatori()
    await salva()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toMatchObject({
      entryType: 'PRELIEVO',
      registerType: 'BANK',
      counterRegisterType: 'CASH',
    })
  })

  // Il giroconto non ha una direzione implicita nel nome. Senza destinazione il
  // server risponde 400: il modulo se ne accorge prima, invece di far riscrivere
  // tutto il movimento.
  it('il giroconto senza registro di destinazione non viene inviato', async () => {
    const onSave = montaModuloCon('GIROCONTO')

    compilaObbligatori()
    await salva()

    expect(onSave).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Indica il registro di destinazione')
  })

  it('i movimenti a riga singola non portano con sé un registro di destinazione', async () => {
    const onSave = montaModuloCon('INCASSO')

    compilaObbligatori()
    await salva()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].counterRegisterType).toBeUndefined()
  })
})
