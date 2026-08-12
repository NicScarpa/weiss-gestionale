import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { creaScadenza, creaRicorrenza } from '@/test/integration/fixtures/scadenzario'
import { getVenueId } from '@/lib/venue'
import { leggiFlussi } from '../leggi'

/**
 * Il test che conta è l'ultimo: la scadenza generata da una ricorrenza e la
 * ricorrenza stessa non devono produrre due flussi per lo stesso giorno.
 */
setupIntegrationDb()

beforeEach(async () => {
  await loginAs('admin')
})

describe('leggiFlussi', () => {
  it('legge le scadenze aperte come flussi con segno corretto', async () => {
    const venueId = await getVenueId()
    await creaScadenza({
      importoTotale: 300,
      tipo: 'passiva',
      dataScadenza: new Date('2026-09-10'),
    })

    const flussi = await leggiFlussi(venueId, '2026-09-01', '2026-09-30')
    const scadenze = flussi.filter((f) => f.fonte === 'scadenza')

    expect(scadenze).toHaveLength(1)
    expect(scadenze[0].importo).toBe(-300)
    expect(scadenze[0].giorno).toBe('2026-09-10')
  })

  it('usa la data attesa quando diverge dalla contrattuale', async () => {
    const venueId = await getVenueId()
    await creaScadenza({
      importoTotale: 300,
      tipo: 'passiva',
      dataScadenza: new Date('2026-09-10'),
      dataAttesa: new Date('2026-09-20'),
    })

    const flussi = await leggiFlussi(venueId, '2026-09-01', '2026-09-30')

    expect(flussi.find((f) => f.fonte === 'scadenza')?.giorno).toBe('2026-09-20')
  })

  it('la scadenza da ricorrenza porta la chiave della ricorrenza', async () => {
    const venueId = await getVenueId()
    const ricorrenza = await creaRicorrenza({ importo: 800, tipo: 'passiva' })
    await creaScadenza({
      importoTotale: 800,
      tipo: 'passiva',
      dataScadenza: new Date('2026-09-10'),
      recurrenceId: ricorrenza.id,
    })

    const flussi = await leggiFlussi(venueId, '2026-09-01', '2026-09-30')
    const scadenza = flussi.find((f) => f.fonte === 'scadenza')

    expect(scadenza?.chiave).toBe(`ricorrenza:${ricorrenza.id}`)
  })

  it('la scadenza generata batte la ricorrente sullo stesso giorno', async () => {
    const venueId = await getVenueId()
    const ricorrenza = await creaRicorrenza({
      importo: 800,
      tipo: 'passiva',
      giornoDelMese: 10,
    })
    await creaScadenza({
      importoTotale: 800,
      tipo: 'passiva',
      dataScadenza: new Date('2026-09-10'),
      recurrenceId: ricorrenza.id,
    })

    const flussi = await leggiFlussi(venueId, '2026-09-01', '2026-09-30')
    const del10 = flussi.filter((f) => f.giorno === '2026-09-10')

    // Entrambi i flussi esistono con la stessa chiave: sarà `proietta` a
    // scartarne uno. Qui si verifica che la chiave li leghi.
    const chiavi = new Set(del10.map((f) => f.chiave))
    expect(chiavi.size).toBe(1)
    expect([...chiavi][0]).toBe(`ricorrenza:${ricorrenza.id}`)
  })

  // Questo è il test che dà senso all'intero task: una `RecurringExpense` e
  // una `Recurrence` sono due modelli disgiunti dello stesso concetto, e
  // l'euristica (nome normalizzato + importo) le aggancia. Se entrambe
  // emettessero un'occorrenza sullo stesso giorno — stessa chiave, stessa
  // fonte `ricorrente` — `proietta` non le deduplicherebbe (due flussi della
  // stessa fonte non si escludono mai a vicenda, per costruzione): l'uscita
  // verrebbe contata due volte, esattamente il difetto che il modulo esiste
  // per chiudere.
  it('la spesa ricorrente agganciata per euristica a una ricorrenza attiva non emette una propria occorrenza', async () => {
    const venueId = await getVenueId()
    const sessione = await loginAs('admin')

    const ricorrenza = await creaRicorrenza({
      descrizione: 'Canone software',
      importo: 90,
      tipo: 'passiva',
      giornoDelMese: 12,
    })

    await prisma.recurringExpense.create({
      data: {
        venueId,
        name: 'Canone software',
        amount: 90,
        frequency: 'MONTHLY',
        dayOfMonth: 12,
        createdBy: sessione.user.id,
      },
    })

    const flussi = await leggiFlussi(venueId, '2026-09-01', '2026-09-30')
    const delGiorno12 = flussi.filter((f) => f.giorno === '2026-09-12' && f.fonte === 'ricorrente')

    // Un solo flusso: quello della `Recurrence`, la fonte autorevole. La
    // `RecurringExpense` agganciata non ne produce uno proprio.
    expect(delGiorno12).toHaveLength(1)
    expect(delGiorno12[0].chiave).toBe(`ricorrenza:${ricorrenza.id}`)
  })
})
