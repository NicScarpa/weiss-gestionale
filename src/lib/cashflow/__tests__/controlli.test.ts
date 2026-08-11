import { describe, it, expect } from 'vitest'
import { money } from '@/lib/money'
import type { MovimentoAggregato } from '../movimenti'
import { costruisciProspetto } from '../prospetto'
import { eseguiControlli } from '../controlli'

const codicePerConto = new Map<string, string>([
  ['c-corrispettivi', '10.01'],
  ['c-versamento', '40.4.01'],
  ['c-ignoto', '999.99'],
])

function mov(parziale: Partial<MovimentoAggregato>): MovimentoAggregato {
  return {
    accountId: 'c-corrispettivi',
    mese: 1,
    dare: money(0),
    avere: money(0),
    ivaDare: money(0),
    ivaAvere: money(0),
    ...parziale,
  }
}

function controlli(movimenti: MovimentoAggregato[], variazioneReale = money(0)) {
  const prospetto = costruisciProspetto(movimenti, codicePerConto, money(0), 2026)
  return eseguiControlli({ prospetto, movimenti, codicePerConto, variazioneReale })
}

function esito(risultati: ReturnType<typeof controlli>, codice: string) {
  return risultati.find((r) => r.codice === codice)!
}

describe('C1 — quadratura col saldo reale', () => {
  it('ok quando il prospetto spiega tutta la variazione dei saldi', () => {
    const movimenti = [mov({ dare: money(1220), ivaDare: money(220) })]
    expect(esito(controlli(movimenti, money(1220)), 'C1').esito).toBe('ok')
  })

  it('segnala la differenza quando qualcosa non è mappato', () => {
    const movimenti = [mov({ accountId: 'c-ignoto', dare: money(500) })]
    const c1 = esito(controlli(movimenti, money(500)), 'C1')

    expect(c1.esito).toBe('attenzione')
    expect(c1.valore).toBe(500)
  })
})

describe('C2 — versamenti contanti a due gambe', () => {
  it('ok quando le due gambe si elidono', () => {
    const movimenti = [
      mov({ accountId: 'c-versamento', dare: money(900) }),
      mov({ accountId: 'c-versamento', avere: money(900) }),
    ]
    expect(esito(controlli(movimenti), 'C2').esito).toBe('ok')
  })

  it('segnala la gamba mancante', () => {
    const movimenti = [mov({ accountId: 'c-versamento', dare: money(900) })]
    const c2 = esito(controlli(movimenti), 'C2')

    expect(c2.esito).toBe('attenzione')
    expect(c2.valore).toBe(900)
  })
})

describe('C3 — movimenti senza voce di conto', () => {
  it('conta i movimenti con accountId nullo', () => {
    const movimenti = [mov({ accountId: null, dare: money(100) })]
    const c3 = esito(controlli(movimenti), 'C3')

    expect(c3.esito).toBe('attenzione')
    expect(c3.valore).toBe(1)
  })
})

describe('C4 — conti non riconosciuti', () => {
  it('conta i conti movimentati che la riclassificazione non conosce', () => {
    const movimenti = [mov({ accountId: 'c-ignoto', avere: money(50) })]
    const c4 = esito(controlli(movimenti), 'C4')

    expect(c4.esito).toBe('attenzione')
    expect(c4.valore).toBe(1)
    expect(c4.spiegazione).toContain('999.99')
  })

  it('non segnala le voci fuori cassa: sono escluse di proposito', () => {
    const conMappaAmpia = new Map(codicePerConto).set('c-ammortamento', '31.01')
    const prospetto = costruisciProspetto(
      [mov({ accountId: 'c-ammortamento', avere: money(700) })],
      conMappaAmpia,
      money(0),
      2026
    )
    const risultati = eseguiControlli({
      prospetto,
      movimenti: [mov({ accountId: 'c-ammortamento', avere: money(700) })],
      codicePerConto: conMappaAmpia,
      variazioneReale: money(0),
    })

    expect(risultati.find((r) => r.codice === 'C4')!.esito).toBe('ok')
  })
})
