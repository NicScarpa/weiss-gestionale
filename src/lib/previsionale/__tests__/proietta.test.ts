import { describe, it, expect } from 'vitest'
import { proietta, type FlussoPrevisto } from '../proietta'

/**
 * La funzione risponde a una domanda sola — quanto avrò, giorno per giorno — e
 * la parte difficile non è la somma: è decidere quale fonte vince quando due
 * descrivono lo stesso denaro.
 *
 * Il caso che ha motivato il modulo: l'affitto esiste come `RecurringExpense`
 * per la dashboard e come `Recurrence` → `Schedule` per lo scadenzario. Chi lo
 * inserisce in entrambe le pagine oggi lo vede contato due volte, e chi lo
 * inserisce in una sola non lo vede affatto nell'altra proiezione.
 */
describe('proietta', () => {
  const base = { saldoIniziale: 1000, dal: '2026-09-01', al: '2026-09-03' }

  it('accumula il saldo giorno per giorno', () => {
    const flussi: FlussoPrevisto[] = [
      { giorno: '2026-09-01', importo: 500, fonte: 'movimento', descrizione: 'Incasso' },
      { giorno: '2026-09-02', importo: -200, fonte: 'scadenza', descrizione: 'Fornitore' },
    ]

    const serie = proietta({ ...base, flussi })

    expect(serie.map((p) => p.saldo)).toEqual([1500, 1300, 1300])
  })

  it('copre ogni giorno della finestra, anche quelli senza flussi', () => {
    const serie = proietta({ ...base, flussi: [] })

    expect(serie).toHaveLength(3)
    expect(serie.map((p) => p.giorno)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
    expect(serie.every((p) => p.saldo === 1000)).toBe(true)
  })

  it('scarta la ricorrente quando una scadenza copre la stessa chiave nello stesso giorno', () => {
    const flussi: FlussoPrevisto[] = [
      { giorno: '2026-09-01', importo: -800, fonte: 'ricorrente', descrizione: 'Affitto', chiave: 'affitto' },
      { giorno: '2026-09-01', importo: -800, fonte: 'scadenza', descrizione: 'Affitto settembre', chiave: 'affitto' },
    ]

    const serie = proietta({ ...base, flussi })

    expect(serie[0].saldo).toBe(200)
    expect(serie[0].perFonte.ricorrente).toBe(0)
    expect(serie[0].perFonte.scadenza).toBe(-800)
  })

  it('scarta la scadenza quando un movimento copre la stessa chiave', () => {
    const flussi: FlussoPrevisto[] = [
      { giorno: '2026-09-01', importo: -800, fonte: 'scadenza', descrizione: 'Affitto', chiave: 'affitto' },
      { giorno: '2026-09-01', importo: -800, fonte: 'movimento', descrizione: 'Bonifico affitto', chiave: 'affitto' },
    ]

    const serie = proietta({ ...base, flussi })

    expect(serie[0].saldo).toBe(200)
    expect(serie[0].perFonte.scadenza).toBe(0)
    expect(serie[0].perFonte.movimento).toBe(-800)
  })

  it('la fonte più affidabile vince indipendentemente dall\'ordine in cui compare nell\'array', () => {
    const movimentoPrimo: FlussoPrevisto[] = [
      { giorno: '2026-09-01', importo: -800, fonte: 'movimento', descrizione: 'Bonifico affitto', chiave: 'affitto' },
      { giorno: '2026-09-01', importo: -800, fonte: 'scadenza', descrizione: 'Affitto', chiave: 'affitto' },
    ]
    const movimentoSecondo: FlussoPrevisto[] = [
      { giorno: '2026-09-01', importo: -800, fonte: 'scadenza', descrizione: 'Affitto', chiave: 'affitto' },
      { giorno: '2026-09-01', importo: -800, fonte: 'movimento', descrizione: 'Bonifico affitto', chiave: 'affitto' },
    ]

    const serieA = proietta({ ...base, flussi: movimentoPrimo })
    const serieB = proietta({ ...base, flussi: movimentoSecondo })

    expect(serieA[0].perFonte.movimento).toBe(-800)
    expect(serieA[0].perFonte.scadenza).toBe(0)
    expect(serieB[0].perFonte.movimento).toBe(-800)
    expect(serieB[0].perFonte.scadenza).toBe(0)
  })

  it('la stessa chiave in giorni diversi sono due flussi distinti: sopravvivono entrambi', () => {
    const flussi: FlussoPrevisto[] = [
      { giorno: '2026-09-01', importo: -800, fonte: 'scadenza', descrizione: 'Affitto settembre', chiave: 'affitto' },
      { giorno: '2026-09-02', importo: -800, fonte: 'scadenza', descrizione: 'Affitto ottobre', chiave: 'affitto' },
    ]

    const serie = proietta({ ...base, flussi })

    expect(serie[0].saldo).toBe(200)
    expect(serie[1].saldo).toBe(-600)
  })

  it('tiene entrambi i flussi quando le chiavi sono diverse', () => {
    const flussi: FlussoPrevisto[] = [
      { giorno: '2026-09-01', importo: -800, fonte: 'ricorrente', descrizione: 'Affitto', chiave: 'affitto' },
      { giorno: '2026-09-01', importo: -300, fonte: 'scadenza', descrizione: 'Utenze', chiave: 'utenze' },
    ]

    const serie = proietta({ ...base, flussi })

    expect(serie[0].saldo).toBe(-100)
  })

  it('tiene un flusso senza chiave: senza chiave non si può dichiarare una sovrapposizione', () => {
    const flussi: FlussoPrevisto[] = [
      { giorno: '2026-09-01', importo: -100, fonte: 'ricorrente', descrizione: 'Varie' },
      { giorno: '2026-09-01', importo: -100, fonte: 'scadenza', descrizione: 'Altro' },
    ]

    const serie = proietta({ ...base, flussi })

    expect(serie[0].saldo).toBe(800)
  })

  it('ignora i flussi fuori dalla finestra', () => {
    const flussi: FlussoPrevisto[] = [
      { giorno: '2026-08-31', importo: -999, fonte: 'scadenza', descrizione: 'Prima' },
      { giorno: '2026-09-04', importo: -999, fonte: 'scadenza', descrizione: 'Dopo' },
    ]

    const serie = proietta({ ...base, flussi })

    expect(serie.every((p) => p.saldo === 1000)).toBe(true)
  })

  it('separa entrate e uscite sullo stesso giorno', () => {
    const flussi: FlussoPrevisto[] = [
      { giorno: '2026-09-01', importo: 500, fonte: 'movimento', descrizione: 'Incasso' },
      { giorno: '2026-09-01', importo: -200, fonte: 'movimento', descrizione: 'Spesa' },
    ]

    const serie = proietta({ ...base, flussi })

    expect(serie[0].entrate).toBe(500)
    expect(serie[0].uscite).toBe(200)
    expect(serie[0].saldo).toBe(1300)
  })
})
