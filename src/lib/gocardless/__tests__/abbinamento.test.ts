import { describe, it, expect } from 'vitest'
import { abbinaConti, type ContoDaBanca, type ContoDelGestionale } from '../abbinamento'

/** Impronta finta e deterministica: il test non deve dipendere da una chiave. */
const impronta = (iban: string) => `h:${iban}`

const dallaBanca = (id: string, iban: string | null): ContoDaBanca => ({
  providerAccountId: id,
  iban,
  intestatario: null,
  valuta: 'EUR',
})

const nelGestionale = (
  id: string,
  nome: string,
  iban: string | null,
  connectionId: string | null = null
): ContoDelGestionale => ({ id, nome, ibanHash: iban ? impronta(iban) : null, connectionId })

describe('abbinaConti', () => {
  it('riconosce il conto la cui impronta corrisponde', () => {
    const esito = abbinaConti({
      contiBanca: [dallaBanca('gc-1', 'IT00X001')],
      contiGestionale: [nelGestionale('ba-1', 'Conto principale', 'IT00X001')],
      ignorati: [],
      impronta,
    })
    expect(esito).toEqual([
      { tipo: 'riconosciuto', conto: dallaBanca('gc-1', 'IT00X001'), bankAccountId: 'ba-1', nomeConto: 'Conto principale' },
    ])
  })

  it('dichiara sconosciuto ciò che non corrisponde a nulla', () => {
    const esito = abbinaConti({
      contiBanca: [dallaBanca('gc-2', 'IT00X999')],
      contiGestionale: [nelGestionale('ba-1', 'Conto principale', 'IT00X001')],
      ignorati: [],
      impronta,
    })
    expect(esito[0].tipo).toBe('sconosciuto')
  })

  // Il conto personale dell'amministratore: scartato una volta, mai più chiesto.
  it('tiene ignorato ciò che è stato ignorato, anche se avrebbe una corrispondenza', () => {
    const esito = abbinaConti({
      contiBanca: [dallaBanca('gc-3', 'IT00X001')],
      contiGestionale: [nelGestionale('ba-1', 'Conto principale', 'IT00X001')],
      ignorati: ['gc-3'],
      impronta,
    })
    expect(esito[0].tipo).toBe('ignorato')
  })

  it('segnala il conto già legato a un altro collegamento invece di rubarlo', () => {
    const esito = abbinaConti({
      contiBanca: [dallaBanca('gc-4', 'IT00X001')],
      contiGestionale: [nelGestionale('ba-1', 'Conto principale', 'IT00X001', 'conn-vecchia')],
      ignorati: [],
      impronta,
    })
    expect(esito[0]).toMatchObject({ tipo: 'gia-collegato', bankAccountId: 'ba-1' })
  })

  it('un conto della banca senza IBAN resta sconosciuto, non abbinato a caso', () => {
    const esito = abbinaConti({
      contiBanca: [dallaBanca('gc-5', null)],
      contiGestionale: [nelGestionale('ba-1', 'Conto principale', 'IT00X001')],
      ignorati: [],
      impronta,
    })
    expect(esito[0].tipo).toBe('sconosciuto')
  })

  it('un conto del gestionale senza impronta non può essere abbinato', () => {
    const esito = abbinaConti({
      contiBanca: [dallaBanca('gc-6', 'IT00X001')],
      contiGestionale: [nelGestionale('ba-1', 'Cassa', null)],
      ignorati: [],
      impronta,
    })
    expect(esito[0].tipo).toBe('sconosciuto')
  })

  it('lo stesso conto del gestionale non viene abbinato a due conti della banca', () => {
    const esito = abbinaConti({
      contiBanca: [dallaBanca('gc-7', 'IT00X001'), dallaBanca('gc-8', 'IT00X001')],
      contiGestionale: [nelGestionale('ba-1', 'Conto principale', 'IT00X001')],
      ignorati: [],
      impronta,
    })
    expect(esito[0].tipo).toBe('riconosciuto')
    expect(esito[1].tipo).toBe('sconosciuto')
  })

  it('conserva l ordine dei conti come li manda la banca', () => {
    const esito = abbinaConti({
      contiBanca: [dallaBanca('gc-a', null), dallaBanca('gc-b', 'IT00X001')],
      contiGestionale: [nelGestionale('ba-1', 'Conto principale', 'IT00X001')],
      ignorati: [],
      impronta,
    })
    expect(esito.map((e) => e.conto.providerAccountId)).toEqual(['gc-a', 'gc-b'])
  })

  it('senza conti dalla banca restituisce una lista vuota', () => {
    expect(abbinaConti({ contiBanca: [], contiGestionale: [], ignorati: [], impronta })).toEqual([])
  })
})
