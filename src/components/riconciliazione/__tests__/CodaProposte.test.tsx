import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act, screen, within } from '@testing-library/react'
import { CodaProposte } from '../CodaProposte'
import { installaStubDom } from '@/components/scadenzario/__tests__/render-helpers'
import type { ContatoriLotto, PropostaDiRiconciliazione } from '@/types/riconciliazione-assistita'

beforeAll(() => installaStubDom())
afterEach(() => cleanup())

/**
 * La selezione multipla della coda.
 *
 * Approvare una per una undici proposte della fascia Alta significa undici clic
 * su schermate identiche, ed è il punto in cui chi lavora smette di leggere ciò
 * che approva. La selezione serve a quello — ma siccome ogni approvazione crea
 * una scrittura vera in prima nota, il totale in euro deve essere sotto gli
 * occhi **prima** della conferma, non dopo.
 */

function proposta(
  id: string,
  punteggio: number,
  importo: number
): PropostaDiRiconciliazione {
  return {
    id,
    regola: 'R1',
    punteggio,
    fattori: { importo: 30, riferimento: 20, controparte: 18, data: 15, codiceBanca: 10, unicita: 5 },
    motivazioni: [],
    stato: 'in_attesa',
    bankTransaction: {
      id: `banca-${id}`,
      transactionDate: '2026-08-14T00:00:00.000Z',
      description: 'Bonifico a favore di ROSSI SRL',
      amount: String(-importo),
    },
    gambe: [
      {
        id: `gamba-${id}`,
        importo: String(importo),
        schedule: {
          id: `scad-${id}`,
          descrizione: 'Fattura',
          dataScadenza: '2026-08-09T00:00:00.000Z',
          numeroDocumento: 'FT 12',
          controparteNome: 'Rossi S.r.l.',
          importoTotale: String(importo),
          importoPagato: '0',
          invoice: null,
        },
      },
    ],
  }
}

/** Due in fascia Alta (≥ 85) e una Media: serve a provare il filtro. */
const PROPOSTE = [proposta('p1', 95, 100), proposta('p2', 90, 250.5), proposta('p3', 70, 40)]

const CONTATORI: ContatoriLotto = {
  totali: 3, inAttesa: 3, approvate: 0, scartate: 0, superate: 0, alta: 2, media: 1, bassa: 0,
}

function monta(opzioni: { onApprovaInBlocco?: (ids: string[]) => Promise<void>; fascia?: 'tutte' | 'alta' } = {}) {
  const onApprovaInBlocco = opzioni.onApprovaInBlocco ? vi.fn(opzioni.onApprovaInBlocco) : undefined
  render(
    <CodaProposte
      proposte={PROPOSTE}
      contatori={CONTATORI}
      fascia={opzioni.fascia ?? 'tutte'}
      onFascia={() => {}}
      onApprova={async () => {}}
      onScarta={async () => {}}
      onApprovaInBlocco={onApprovaInBlocco}
    />
  )
  return { onApprovaInBlocco }
}

function caselle(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[data-selezione-proposta]'))
}

function perTesto(testo: RegExp): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('button')).find((b) =>
    testo.test(b.textContent ?? '')
  )
}

describe('CodaProposte — selezione multipla', () => {
  it('senza la funzione in blocco la coda resta come prima, senza caselle', () => {
    // La selezione è una capacità in più, non un cambio di funzionamento: dove
    // non serve, la schermata non deve nemmeno mostrarla.
    monta()
    expect(caselle()).toHaveLength(0)
  })

  it('mostra una casella per proposta quando l’approvazione in blocco è disponibile', () => {
    monta({ onApprovaInBlocco: async () => {} })
    expect(caselle()).toHaveLength(3)
  })

  it('selezionando due proposte dice quante sono e quanto valgono', async () => {
    monta({ onApprovaInBlocco: async () => {} })

    await act(async () => {
      fireEvent.click(caselle()[0])
      fireEvent.click(caselle()[1])
    })

    const testo = document.body.textContent ?? ''
    expect(testo).toContain('2 selezionate')
    // 100 + 250,50: il totale è la ragione per cui la barra esiste.
    expect(testo).toMatch(/350,50/)
  })

  it('«seleziona tutte» prende solo quelle visibili nel filtro corrente', async () => {
    // Sul filtro Alta ci sono due proposte su tre: selezionare anche la Media,
    // che non si sta guardando, sarebbe approvare alla cieca.
    monta({ onApprovaInBlocco: async () => {}, fascia: 'alta' })

    const tutte = document.querySelector('[data-seleziona-tutte]')
    expect(tutte).not.toBeNull()

    await act(async () => {
      fireEvent.click(tutte!)
    })

    expect(document.body.textContent).toContain('2 selezionate')
  })

it('una proposta selezionata si distingue a colpo d’occhio dalle altre', async () => {
    // Con ventisei schede identiche, sapere quali sono già state prese non può
    // dipendere da un quadratino di sedici pixel in un margine.
    monta({ onApprovaInBlocco: async () => {} })

    await act(async () => {
      fireEvent.click(caselle()[1])
    })

    const schede = Array.from(document.querySelectorAll('article[data-selezionata]'))
    expect(schede).toHaveLength(3)
    expect(schede.map((s) => s.getAttribute('data-selezionata'))).toEqual(['false', 'true', 'false'])
  })

  it('chiede conferma e solo dopo approva, passando gli id scelti', async () => {
    const chiamate: string[][] = []
    monta({ onApprovaInBlocco: async (ids) => { chiamate.push(ids) } })

    await act(async () => {
      fireEvent.click(caselle()[0])
      fireEvent.click(caselle()[2])
    })

    await act(async () => {
      perTesto(/Approva selezionate/i)?.click()
    })

    // Il dialogo ripete numero e importo: è l'ultimo punto in cui ci si accorge
    // di aver selezionato più di quanto si voleva.
    const dialogo = screen.getByRole('alertdialog')
    expect(dialogo.textContent).toMatch(/2/)
    expect(chiamate).toHaveLength(0)

    // Il bottone si cerca DENTRO il dialogo: ogni scheda ne ha uno con lo stesso
    // nome, e cercarlo nella pagina prenderebbe l'approvazione singola della
    // prima proposta — un test verde su un gesto diverso da quello in prova.
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole('button', { name: /^Approva$/ }))
    })

    expect(chiamate).toEqual([['p1', 'p3']])
  })
})
