import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { money } from '@/lib/money'
import { costruisciProspetto } from '@/lib/cashflow/prospetto'
import { ProspettoTable } from '../ProspettoTable'
import { installaStubDom, montare, smontare, testoDellaPagina } from './render-helpers'

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true
  installaStubDom()
})

afterEach(async () => {
  await smontare()
})

const prospetto = costruisciProspetto([], new Map(), money(1000), 2026)

describe('ProspettoTable', () => {
  it('mostra la cassa a fine anno quando il prospetto quadra', async () => {
    await montare(
      <ProspettoTable
        righe={prospetto.righe}
        cassaIniziale={1000}
        cassaFinale={4321}
      />
    )

    expect(testoDellaPagina()).toContain('4321')
  })

  it('non mostra la cassa a fine anno quando C1 è fuori tolleranza', async () => {
    // È il numero che il lettore guarda per primo, in grassetto in fondo alla
    // tabella. Se il prospetto non spiega tutta la variazione dei saldi quella
    // somma è inventata: si sopprime e si dice perché, invece di stamparla con
    // un'avvertenza accanto — un numero sbagliato con l'asterisco resta un
    // numero che qualcuno copia.
    await montare(
      <ProspettoTable
        righe={prospetto.righe}
        cassaIniziale={1000}
        cassaFinale={4321}
        motivoCassaFinaleInattendibile="Il prospetto spiega 220 € dei 5.000 € di variazione reale."
      />
    )

    const testo = testoDellaPagina()

    expect(testo).not.toContain('4321')
    expect(testo).toContain('non calcolabile')
    expect(testo).toContain('Il prospetto spiega 220 €')
  })
})
