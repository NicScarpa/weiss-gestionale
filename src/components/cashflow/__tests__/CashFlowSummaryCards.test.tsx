import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { CashFlowSummaryCards } from '../CashFlowSummaryCards'
import { installaStubDom, montare, smontare, testoDellaPagina } from './render-helpers'

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  installaStubDom()
})

afterEach(async () => {
  await smontare()
})

const base = {
  saldoAttuale: 12000,
  trend7gg: 0,
  previsione30gg: 12000,
  deltaPrevisione: 0,
  runwayMesi: 999,
  burnRate: 0,
}

describe('CashFlowSummaryCards', () => {
  it('mostra il trend a 7 giorni in euro, non in percentuale', async () => {
    await montare(<CashFlowSummaryCards {...base} trend7gg={1234.56} />)

    const testo = testoDellaPagina()

    // `/api/cashflow/summary` calcola trend7gg come differenza fra due saldi
    // puntuali: sono euro. Stamparlo con un `%` accanto significava dire
    // "+1234,6%" a chi in tasca ha 1.234,56 € in più.
    //
    // Il separatore delle migliaia è atteso: `formatCurrency` impone
    // `useGrouping: true` proprio perché il predefinito italiano non raggruppa
    // i numeri di quattro cifre, cioè quasi tutti gli importi di questo
    // gestionale. Il test presidia l'unità di misura E il raggruppamento.
    expect(testo).toMatch(/\+1\.234,56/)
    expect(testo).not.toMatch(/1234,6\s*%/)
    expect(testo).not.toMatch(/%/)
  })

  it('mostra la variazione attesa a 30 giorni in euro, col segno negativo', async () => {
    await montare(<CashFlowSummaryCards {...base} deltaPrevisione={-800} previsione30gg={11200} />)

    const testo = testoDellaPagina()

    expect(testo).toMatch(/-800,00/)
    expect(testo).not.toMatch(/%/)
  })

  it('dice a cosa si riferiscono le due variazioni', async () => {
    await montare(
      <CashFlowSummaryCards {...base} trend7gg={500} deltaPrevisione={-200} previsione30gg={11800} />
    )

    const testo = testoDellaPagina()

    expect(testo).toMatch(/ultimi 7 giorni/i)
    expect(testo).toMatch(/variazione attesa/i)
  })

  it('scrive "illimitato" invece di 999 mesi quando non si brucia cassa', async () => {
    await montare(<CashFlowSummaryCards {...base} runwayMesi={999} burnRate={0} />)

    const testo = testoDellaPagina()

    // 999 è la convenzione con cui l'API dice "il saldo non sta scendendo".
    // Mostrarla tale e quale fa leggere "999,0 mesi", che è una previsione
    // all'anno 3025.
    expect(testo).not.toMatch(/999/)
    expect(testo).toMatch(/illimitato/i)
  })

  it('mostra i mesi di autonomia quando la cassa sta scendendo', async () => {
    await montare(<CashFlowSummaryCards {...base} runwayMesi={4.2} burnRate={2500} />)

    const testo = testoDellaPagina()

    expect(testo).toMatch(/4,2 mesi|4\.2 mesi/)
    expect(testo).toMatch(/2\.?500,00/)
  })
})
