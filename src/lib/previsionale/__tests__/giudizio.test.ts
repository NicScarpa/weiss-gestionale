import { describe, it, expect } from 'vitest'
import { giudicaLiquidita } from '../giudizio'

describe('giudicaLiquidita', () => {
  const base = {
    saldoMinimo: 20000,
    giornoSaldoMinimo: '2026-09-20',
    soglia: 5000,
    orizzonteGiorni: 30,
    scadutoPassivo: 0,
  }

  it('è sereno quando il minimo resta sopra la soglia', () => {
    const g = giudicaLiquidita(base)
    expect(g.livello).toBe('sereno')
    expect(g.frase).toContain('Nessuna tensione prevista')
    expect(g.frase).toContain('30 giorni')
  })

  it('avvisa quando il minimo scende sotto soglia restando positivo', () => {
    const g = giudicaLiquidita({ ...base, saldoMinimo: 3000 })
    expect(g.livello).toBe('attenzione')
    expect(g.frase).toContain('sotto la soglia')
    expect(g.frase).toContain('domenica 20 settembre')
  })

  it('segnala tensione quando il saldo va in negativo', () => {
    const g = giudicaLiquidita({ ...base, saldoMinimo: -1200 })
    expect(g.livello).toBe('tensione')
    expect(g.frase).toContain('negativo')
  })

  it('nomina lo scaduto passivo anche quando la proiezione è serena', () => {
    const g = giudicaLiquidita({ ...base, scadutoPassivo: 12000 })
    expect(g.livello).toBe('attenzione')
    expect(g.frase).toContain('già scadute')
  })

  it('non nomina uno scaduto irrilevante', () => {
    const g = giudicaLiquidita({ ...base, scadutoPassivo: 50 })
    expect(g.livello).toBe('sereno')
    expect(g.frase).not.toContain('già scadute')
  })
})
