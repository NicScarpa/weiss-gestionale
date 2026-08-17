import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StoricoLotti } from '../StoricoLotti'
import { installaStubDom } from '@/components/scadenzario/__tests__/render-helpers'
import type { LottoNelloStorico } from '@/types/riconciliazione-assistita'

beforeAll(() => installaStubDom())

/**
 * Lo storico è il modo in cui un lavoro lungo si interrompe senza perdersi:
 * dodici proposte non si decidono in una volta, e il giorno dopo si riprende
 * dal lotto giusto invece di ricalcolarne uno nuovo.
 */
const LOTTI: LottoNelloStorico[] = [
  {
    id: 'lotto-1',
    dateFrom: '2026-01-01T00:00:00.000Z',
    dateTo: '2026-08-16T00:00:00.000Z',
    stato: 'aperto',
    contaProposte: 12,
    contaApprovate: 5,
    contaScartate: 2,
    contaSuperate: 0,
    aiRefertoAt: null,
    createdAt: '2026-08-16T18:00:00.000Z',
  },
  {
    id: 'lotto-2',
    dateFrom: '2026-06-01T00:00:00.000Z',
    dateTo: '2026-06-30T00:00:00.000Z',
    stato: 'aperto',
    contaProposte: 4,
    contaApprovate: 4,
    contaScartate: 0,
    contaSuperate: 0,
    aiRefertoAt: null,
    createdAt: '2026-06-30T18:00:00.000Z',
  },
]

describe('StoricoLotti', () => {
  it('elenca i lotti col periodo, i contatori e la percentuale decisa', () => {
    render(<StoricoLotti lotti={LOTTI} />)

    const testo = document.body.textContent ?? ''

    // Il periodo, che è ciò che distingue un lotto dall'altro.
    expect(testo).toContain('01/01/2026')
    expect(testo).toContain('16/08/2026')

    // I contatori: quante proposte e come sono finite.
    expect(testo).toContain('12 proposte')
    expect(testo).toContain('5 approvate')
    expect(testo).toContain('2 scartate')

    // 7 decise su 12 = 58%. È la sola cifra che dice se vale la pena riprendere.
    expect(testo).toContain('58% deciso')
    // Il secondo lotto è finito: 4 su 4.
    expect(testo).toContain('100% deciso')
  })

  it('«Riprendi» riapre la coda di quel lotto', () => {
    render(<StoricoLotti lotti={LOTTI} />)

    const riprendi = screen.getAllByRole('link', { name: /riprendi/i })
    expect(riprendi).toHaveLength(2)
    // Lo stato della coda vive nell'URL: riprendere è un link, non uno stato
    // interno da ricostruire.
    expect(riprendi[0]).toHaveAttribute('href', '/riconciliazione?lotto=lotto-1')
    expect(riprendi[1]).toHaveAttribute('href', '/riconciliazione?lotto=lotto-2')
  })

  it('senza lotti non mostra nulla', () => {
    const { container } = render(<StoricoLotti lotti={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('un lotto senza proposte non produce una percentuale senza senso', () => {
    render(
      <StoricoLotti
        lotti={[{ ...LOTTI[0], id: 'vuoto', contaProposte: 0, contaApprovate: 0, contaScartate: 0 }]}
      />
    )
    const testo = document.body.textContent ?? ''
    expect(testo).toContain('Nessuna proposta')
    expect(testo).not.toContain('NaN')
  })
})
