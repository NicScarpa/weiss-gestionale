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
  return callRoute<{ error?: string; schedule?: { id: string } }>(
    POST_genera,
    jsonRequest(`/api/scadenzario/ricorrenze/${recurrenceId}/genera`, { method: 'POST' }),
    { id: recurrenceId }
  )
}

function generaProssima(scheduleId: string) {
  return callRoute<{ error?: string; schedule?: { id: string } }>(
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

describe('ricorrenze come catena padre/figlio', () => {
  it(
    'due generazioni simultanee della prossima occorrenza producono una sola scadenza',
    { repeats: 5 },
    async () => {
      const padre = await creaScadenza({ dataScadenza: new Date('2026-08-01') })
      await prisma.schedule.update({
        where: { id: padre.id },
        data: { isRicorrente: true, ricorrenzaTipo: 'mensile', ricorrenzaAttiva: true },
      })

      const esiti = await Promise.all([generaProssima(padre.id), generaProssima(padre.id)])

      expect(esiti.filter((e) => e.status === 200)).toHaveLength(1)
      expect(esiti.filter((e) => e.status === 409)).toHaveLength(1)

      expect(await prisma.schedule.count({ where: { ricorrenzaParentId: padre.id } })).toBe(1)
    }
  )
})
