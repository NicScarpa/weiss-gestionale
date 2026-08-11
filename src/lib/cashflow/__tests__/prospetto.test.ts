import { describe, it, expect } from 'vitest'
import { money } from '@/lib/money'
import type { MovimentoAggregato } from '../movimenti'
import { costruisciProspetto, type Prospetto } from '../prospetto'

/** Conti finti: id = codice della voce, così la mappa è l'identità. */
const codicePerConto = new Map<string, string>([
  ['10.01', '10.01'],
  ['20.1.01', '20.1.01'],
  ['20.4.01', '20.4.01'],
  ['28.1.01', '28.1.01'],
  ['26.03', '26.03'],
  ['32.3.01', '32.3.01'],
  ['40.2.01', '40.2.01'],
  ['40.3.03', '40.3.03'],
  ['40.4.01', '40.4.01'],
  ['31.01', '31.01'],
])

function mov(parziale: Partial<MovimentoAggregato>): MovimentoAggregato {
  return {
    accountId: 'x',
    mese: 1,
    dare: money(0),
    avere: money(0),
    ivaDare: money(0),
    ivaAvere: money(0),
    ...parziale,
  }
}

function riga(p: Prospetto, codice: string) {
  const trovata = p.righe.find((r) => r.codice === codice)
  if (!trovata) throw new Error(`riga ${codice} assente dal prospetto`)
  return trovata
}

describe('costruisciProspetto', () => {
  it('porta un incasso al netto sulla voce, sul sottogruppo e sulla famiglia', () => {
    const p = costruisciProspetto(
      [mov({ accountId: '10.01', dare: money(1220), ivaDare: money(220) })],
      codicePerConto,
      money(0),
      2026
    )

    expect(riga(p, '10.01').valori.jan).toBe(1000)
    expect(riga(p, 'A1').valori.jan).toBe(1000)
    expect(riga(p, 'A').valori.jan).toBe(1000)
    expect(riga(p, 'A').valori.annual).toBe(1000)
  })

  it("l'IVA incassata finisce in G1, quella pagata in G2 col segno giusto", () => {
    const p = costruisciProspetto(
      [
        mov({ accountId: '10.01', dare: money(1220), ivaDare: money(220) }),
        mov({ accountId: '20.1.01', avere: money(610), ivaAvere: money(110) }),
      ],
      codicePerConto,
      money(0),
      2026
    )

    expect(riga(p, 'G1').valori.jan).toBe(220)
    expect(riga(p, 'G2').valori.jan).toBe(-110)
    expect(riga(p, 'G').valori.jan).toBe(110)
  })

  it('le uscite sono negative e il margine di contribuzione le sottrae', () => {
    const p = costruisciProspetto(
      [
        mov({ accountId: '10.01', dare: money(1000) }),
        mov({ accountId: '20.4.01', avere: money(300) }),
      ],
      codicePerConto,
      money(0),
      2026
    )

    expect(riga(p, '20.4.01').valori.jan).toBe(-300)
    expect(riga(p, 'B').valori.jan).toBe(-300)
    expect(riga(p, 'MDC').valori.jan).toBe(700)
  })

  it('la variazione di cassa somma tutte le famiglie e la cassa finale ci si appoggia', () => {
    const p = costruisciProspetto(
      [
        mov({ accountId: '10.01', dare: money(1000) }),
        mov({ accountId: '28.1.01', avere: money(400) }),
        mov({ accountId: '40.2.01', avere: money(200) }),
      ],
      codicePerConto,
      money(5000),
      2026
    )

    expect(riga(p, 'CFO').valori.jan).toBe(600)
    expect(riga(p, 'VAR').valori.jan).toBe(400)
    expect(p.cassaIniziale).toBe(5000)
    expect(p.cassaFinale).toBe(5400)
  })

  it('la riga memo della manodopera somma personale, manodopera evento e F24', () => {
    const p = costruisciProspetto(
      [
        mov({ accountId: '28.1.01', avere: money(1000) }),
        mov({ accountId: '26.03', avere: money(300) }),
        mov({ accountId: '40.3.03', avere: money(500) }),
      ],
      codicePerConto,
      money(0),
      2026
    )

    expect(riga(p, 'M1').valori.jan).toBe(-1800)
  })

  it('le righe memo non entrano in nessun totale', () => {
    const p = costruisciProspetto(
      [mov({ accountId: '40.4.01', dare: money(900) })],
      codicePerConto,
      money(0),
      2026
    )

    expect(riga(p, 'M3').valori.jan).toBe(900)
    expect(riga(p, 'VAR').valori.jan).toBe(0)
  })

  it('una voce fuori cassa non compare e non sposta nulla', () => {
    const p = costruisciProspetto(
      [mov({ accountId: '31.01', avere: money(700) })],
      codicePerConto,
      money(0),
      2026
    )

    expect(p.righe.find((r) => r.codice === '31.01')).toBeUndefined()
    expect(riga(p, 'VAR').valori.jan).toBe(0)
  })

  it('tiene i mesi separati e somma il totale annuo', () => {
    const p = costruisciProspetto(
      [
        mov({ accountId: '10.01', mese: 1, dare: money(100) }),
        mov({ accountId: '10.01', mese: 7, dare: money(250) }),
      ],
      codicePerConto,
      money(0),
      2026
    )

    expect(riga(p, '10.01').valori.jan).toBe(100)
    expect(riga(p, '10.01').valori.jul).toBe(250)
    expect(riga(p, '10.01').valori.annual).toBe(350)
  })

  it('espone tutte le righe della struttura, anche quelle senza movimenti', () => {
    const p = costruisciProspetto([], codicePerConto, money(0), 2026)

    // 9 famiglie + 39 sottogruppi + 149 voci + 3 totali + 3 memo.
    // Cassa iniziale e finale non sono righe: sono campi del prospetto.
    expect(p.righe).toHaveLength(203)
    expect(riga(p, 'E8').valori.annual).toBe(0)
  })

  it('le righe di voce portano il nome del piano dei conti, non il codice', () => {
    const p = costruisciProspetto([], codicePerConto, money(0), 2026)

    expect(riga(p, '20.1.01').nome).toBe('Birra fusto')
    expect(riga(p, '10.01').nome).toBe('Corrispettivi')
  })

  it("l'albero è navigabile: ogni voce dichiara il sottogruppo, ogni sottogruppo la famiglia", () => {
    const p = costruisciProspetto([], codicePerConto, money(0), 2026)

    expect(riga(p, '20.1.01').padre).toBe('B1')
    expect(riga(p, 'B1').padre).toBe('B')
    expect(riga(p, 'B').padre).toBeUndefined()
    expect(riga(p, 'MDC').padre).toBeUndefined()
  })
})
