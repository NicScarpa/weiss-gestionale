import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { quotaMensile, type SpesaRicorrente } from '@/components/recurring-expenses/frequenza'
import { GET as listExpenses, POST as createExpense } from '../route'
import { PUT as updateExpense, DELETE as deleteExpense } from '../[id]/route'

/**
 * Il CRUD delle spese ricorrenti, che fino a oggi nessuna interfaccia chiamava
 * mentre `/api/dashboard/forecast` ne leggeva già la tabella per prevedere le
 * uscite.
 */
setupIntegrationDb()

interface Spesa {
  id: string
  name: string
  isActive: boolean
  amount: string | number
  venueId: string
}

async function creaSpesa(valori: Record<string, unknown> = {}) {
  const risposta = await callRoute<Spesa>(
    createExpense,
    jsonRequest('/api/recurring-expenses', {
      method: 'POST',
      body: {
        name: 'Affitto',
        amount: 1200,
        frequency: 'MONTHLY',
        dayOfMonth: 1,
        ...valori,
      },
    })
  )
  expect(risposta.status).toBe(201)
  return risposta.body
}

async function elenco(includeInactive = false) {
  const risposta = await callRoute<{ data: SpesaRicorrente[]; totals: { monthly: number; yearly: number } }>(
    listExpenses,
    jsonRequest('/api/recurring-expenses', {
      searchParams: includeInactive ? { includeInactive: 'true' } : undefined,
    })
  )
  expect(risposta.status).toBe(200)
  return risposta.body
}

describe('CRUD spese ricorrenti', () => {
  it('crea una spesa attiva', async () => {
    await loginAs('admin')

    const spesa = await creaSpesa({ name: 'Energia elettrica', amount: 340 })

    expect(spesa.name).toBe('Energia elettrica')
    expect(spesa.isActive).toBe(true)
  })

  it('elenca solo le spese attive, salvo richiesta esplicita', async () => {
    await loginAs('admin')
    const attiva = await creaSpesa({ name: 'Attiva' })
    const sospesa = await creaSpesa({ name: 'Sospesa' })
    await prisma.recurringExpense.update({
      where: { id: sospesa.id },
      data: { isActive: false },
    })

    expect((await elenco()).data.map((s) => s.id)).toEqual([attiva.id])
    expect((await elenco(true)).data).toHaveLength(2)
  })

  it('sospende una spesa senza cancellarla', async () => {
    await loginAs('admin')
    const spesa = await creaSpesa()

    const risposta = await callRoute<Spesa, { id: string }>(
      updateExpense,
      jsonRequest(`/api/recurring-expenses/${spesa.id}`, {
        method: 'PUT',
        body: { isActive: false },
      }),
      { id: spesa.id }
    )

    expect(risposta.status).toBe(200)
    expect(risposta.body.isActive).toBe(false)
    expect(await prisma.recurringExpense.count()).toBe(1)
  })

  it('elimina una spesa', async () => {
    await loginAs('admin')
    const spesa = await creaSpesa()

    const risposta = await callRoute(
      deleteExpense,
      jsonRequest(`/api/recurring-expenses/${spesa.id}`, { method: 'DELETE' }),
      { id: spesa.id }
    )

    expect(risposta.status).toBe(200)
    expect(await prisma.recurringExpense.count()).toBe(0)
  })

  // La pagina mostra la quota mensile riga per riga e il totale in cima: sono
  // due formule diverse, una nel client e una nella route, e devono restare la
  // stessa formula. Se qualcuno cambia un coefficiente da una parte sola,
  // questo test lo intercetta prima dell'utente.
  it('la quota mensile del client somma al totale mensile dell\'API', async () => {
    await loginAs('admin')
    await creaSpesa({ name: 'Affitto', amount: 1200, frequency: 'MONTHLY', dayOfMonth: 1 })
    await creaSpesa({ name: 'Assicurazione', amount: 1200, frequency: 'YEARLY', dayOfMonth: 15 })
    await creaSpesa({ name: 'Pulizie', amount: 90, frequency: 'WEEKLY', dayOfWeek: 1 })
    await creaSpesa({ name: 'Consulenza', amount: 900, frequency: 'QUARTERLY', dayOfMonth: 10 })

    const risposta = await elenco()
    const sommaDelClient = risposta.data.reduce((totale, spesa) => totale + quotaMensile(spesa), 0)

    expect(Math.round(sommaDelClient * 100) / 100).toBeCloseTo(risposta.totals.monthly, 1)
  })

  it('la sede non si può scegliere dal corpo della richiesta', async () => {
    await loginAs('admin')
    const altraSede = await prisma.venue.create({
      data: { name: 'Sede fantasma', code: 'GHOST', isActive: false },
    })

    const spesa = await creaSpesa({ venueId: altraSede.id })

    expect(spesa.venueId).not.toBe(altraSede.id)
  })

  it('senza sessione risponde 401', async () => {
    const risposta = await callRoute(listExpenses, jsonRequest('/api/recurring-expenses'))

    expect(risposta.status).toBe(401)
  })

  it('lo staff non può creare spese', async () => {
    await loginAs('staff')

    const risposta = await callRoute(
      createExpense,
      jsonRequest('/api/recurring-expenses', {
        method: 'POST',
        body: { name: 'Affitto', amount: 1200, frequency: 'MONTHLY', dayOfMonth: 1 },
      })
    )

    expect(risposta.status).toBe(403)
  })
})
