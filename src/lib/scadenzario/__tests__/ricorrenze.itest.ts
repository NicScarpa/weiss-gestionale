import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaRicorrenza, creaScadenza } from '@/test/integration/fixtures/scadenzario'
import { POST as POST_genera } from '@/app/api/scadenzario/ricorrenze/[id]/genera/route'
import { POST as POST_generaProssima } from '@/app/api/scadenzario/[id]/genera-prossima/route'

/**
 * Generazione delle occorrenze ricorrenti.
 *
 * Creazione della scadenza e avanzamento della ricorrenza erano due passi
 * separati: due click (o due cron sovrapposti) generavano due scadenze per lo
 * stesso periodo, e l'affitto di settembre compariva due volte nel previsionale.
 */
setupIntegrationDb()

beforeEach(async () => {
  await loginAs('admin')
})

function genera(recurrenceId: string) {
  return callRoute<{ error?: string; schedule?: { id: string } }, { id: string }>(
    POST_genera,
    jsonRequest(`/api/scadenzario/ricorrenze/${recurrenceId}/genera`, { method: 'POST' }),
    { id: recurrenceId }
  )
}

function generaProssima(scheduleId: string) {
  return callRoute<{ error?: string; schedule?: { id: string } }, { id: string }>(
    POST_generaProssima,
    jsonRequest(`/api/scadenzario/${scheduleId}/genera-prossima`, { method: 'POST' }),
    { id: scheduleId }
  )
}

describe('ricorrenze come template', () => {
  it(
    'due generazioni simultanee producono una sola scadenza',
    { repeats: 5 },
    async () => {
      const ricorrenza = await creaRicorrenza({ prossimaGenerazione: new Date('2026-09-01') })

      const esiti = await Promise.all([genera(ricorrenza.id), genera(ricorrenza.id)])

      expect(esiti.filter((e) => e.status === 200)).toHaveLength(1)
      expect(esiti.filter((e) => e.status === 409)).toHaveLength(1)

      expect(await prisma.schedule.count({ where: { recurrenceId: ricorrenza.id } })).toBe(1)
    }
  )

  it('il doppio click in sequenza sulla stessa occorrenza risponde 409, non 500', async () => {
    const ricorrenza = await creaRicorrenza({ prossimaGenerazione: new Date('2026-09-01') })

    expect((await genera(ricorrenza.id)).status).toBe(200)

    // Ricorrenza riportata indietro a mano: simula il retry di una richiesta
    // il cui avanzamento è andato perso
    await prisma.recurrence.update({
      where: { id: ricorrenza.id },
      data: { prossimaGenerazione: new Date('2026-09-01') },
    })

    const secondo = await genera(ricorrenza.id)
    expect(secondo.status).toBe(409)
    expect(secondo.body.error).toMatch(/gi[àa] stata generata/i)
    expect(await prisma.schedule.count({ where: { recurrenceId: ricorrenza.id } })).toBe(1)
  })

  it("la ricorrenza avanza solo se la scadenza è stata creata davvero", async () => {
    const ricorrenza = await creaRicorrenza({ prossimaGenerazione: new Date('2026-09-01') })

    await genera(ricorrenza.id)
    const dopoPrima = await prisma.recurrence.findUniqueOrThrow({ where: { id: ricorrenza.id } })

    await prisma.recurrence.update({
      where: { id: ricorrenza.id },
      data: { prossimaGenerazione: new Date('2026-09-01') },
    })
    await genera(ricorrenza.id)

    const dopoRifiuto = await prisma.recurrence.findUniqueOrThrow({ where: { id: ricorrenza.id } })
    expect(dopoRifiuto.prossimaGenerazione?.toISOString()).toBe(
      new Date('2026-09-01').toISOString()
    )
    expect(dopoPrima.prossimaGenerazione).not.toBeNull()
  })
})

/** Le date delle occorrenze generate, in ordine, come giorni civili. */
async function dateGenerate(where: { ricorrenzaParentId: string } | { recurrenceId: string }) {
  const figli = await prisma.schedule.findMany({
    where,
    select: { dataScadenza: true },
    orderBy: { dataScadenza: 'asc' },
  })
  return figli.map((f) => f.dataScadenza.toISOString().slice(0, 10))
}

async function creaPadreRicorrente(dataScadenza: string) {
  const padre = await creaScadenza({ dataScadenza: new Date(dataScadenza) })
  await prisma.schedule.update({
    where: { id: padre.id },
    data: { isRicorrente: true, ricorrenzaTipo: 'mensile', ricorrenzaAttiva: true },
  })
  return padre
}

describe('ricorrenze come catena padre/figlio', () => {
  // Il test che mancava, ed è il motivo per cui il difetto è sopravvissuto a
  // una suite che sembrava coprirlo: si contavano le occorrenze senza mai
  // guardarne le DATE. Tre generazioni di un affitto mensile producevano
  // settembre, novembre e gennaio — la catena avanzava di due mesi per volta e
  // metà delle uscite ricorrenti non entrava mai nel previsionale.
  it('generazioni successive non saltano un mese', async () => {
    const padre = await creaPadreRicorrente('2026-08-01')

    for (let i = 0; i < 3; i++) {
      expect((await generaProssima(padre.id)).status).toBe(200)
    }

    expect(await dateGenerate({ ricorrenzaParentId: padre.id })).toEqual([
      '2026-09-01',
      '2026-10-01',
      '2026-11-01',
    ])
  })

  it('la prima generazione parte dalla data del padre', async () => {
    const padre = await creaPadreRicorrente('2026-08-01')

    expect((await generaProssima(padre.id)).status).toBe(200)

    expect(await dateGenerate({ ricorrenzaParentId: padre.id })).toEqual(['2026-09-01'])
    const dopo = await prisma.schedule.findUniqueOrThrow({ where: { id: padre.id } })
    // Il campo dichiara la prossima occorrenza DA generare, non l'ultima generata
    expect(dopo.ricorrenzaProssimaGenerazione?.toISOString().slice(0, 10)).toBe('2026-10-01')
  })

  it(
    'due generazioni simultanee non producono mai due occorrenze per la stessa data',
    { repeats: 5 },
    async () => {
      const padre = await creaPadreRicorrente('2026-08-01')

      const esiti = await Promise.all([generaProssima(padre.id), generaProssima(padre.id)])

      // Nessuna richiesta deve rompersi: o crea, o viene respinta con un 409
      expect(esiti.every((e) => e.status === 200 || e.status === 409)).toBe(true)

      // L'invariante che il database garantisce davvero, ed è quella che
      // conta: l'indice parziale ux_schedules_ricorrenza_parent_occorrenza
      // impedisce due occorrenze per la stessa data.
      //
      // Deliberatamente NON si pretende «esattamente un 200 e un 409». Quel
      // comportamento non è garantito: se la seconda richiesta legge il padre
      // dopo il commit della prima, vede la ricorrenza già avanzata e genera
      // l'occorrenza SUCCESSIVA — che è legittima, non un doppione. Che due
      // click ravvicinati debbano produrre una sola occorrenza è una scelta di
      // prodotto ancora aperta, non un fatto: finché non è decisa, questo test
      // asserisce ciò che il sistema promette e non ciò che ci piacerebbe.
      const date = await dateGenerate({ ricorrenzaParentId: padre.id })
      expect(new Set(date).size).toBe(date.length)
      expect(date.length).toBeGreaterThanOrEqual(1)
      expect(date.length).toBeLessThanOrEqual(2)
      expect(date[0]).toBe('2026-09-01')
    }
  )
})
