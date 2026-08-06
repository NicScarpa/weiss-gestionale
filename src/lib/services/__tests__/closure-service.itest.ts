import { describe, it, expect } from 'vitest'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaChiusura } from '@/test/integration/fixtures/closures'
import { validateClosure } from '../closure-service'
import { POST as validaChiusura } from '@/app/api/chiusure/[id]/validate/route'

/**
 * Test di riferimento dell'harness di integrazione.
 *
 * Non insegue un bug: dimostra che i pezzi funzionano insieme — database vero
 * con lo schema di Prisma, seed applicato, reset fra un test e l'altro, utenti
 * reali nella sessione e route dell'App Router invocate direttamente. I casi
 * scelti sono quelli che si fermano prima di scrivere in prima nota, così il
 * verde dice qualcosa sull'harness e non sulla contabilità.
 */
setupIntegrationDb()

describe('validateClosure sul database reale', () => {
  it('rifiuta una chiusura che non è stata inviata', async () => {
    const closure = await creaChiusura({ status: 'DRAFT' })
    const { user } = await loginAs('admin')

    const result = await validateClosure({
      closureId: closure.id,
      userId: user.id,
      action: 'approve',
    })

    expect(result).toEqual({ outcome: 'invalid_status', currentStatus: 'DRAFT' })
  })

  it('segnala una chiusura inesistente', async () => {
    const { user } = await loginAs('admin')

    const result = await validateClosure({
      closureId: 'chiusura-che-non-esiste',
      userId: user.id,
      action: 'approve',
    })

    expect(result).toEqual({ outcome: 'not_found' })
  })

  it('il reset riporta il database allo stato del seed fra un test e l\'altro', async () => {
    // Stessa data del primo test: passerebbe solo se la chiusura precedente è
    // sparita, perché sede+data sono uniche.
    const closure = await creaChiusura({ status: 'DRAFT' })

    expect(closure.id).toBeTruthy()
  })
})

describe('POST /api/chiusure/[id]/validate', () => {
  it('senza sessione risponde 401', async () => {
    const closure = await creaChiusura({ status: 'DRAFT' })

    const response = await callRoute(
      validaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}/validate`, {
        method: 'POST',
        body: { action: 'approve' },
      }),
      { id: closure.id }
    )

    expect(response.status).toBe(401)
  })

  it('lo staff non può validare', async () => {
    const closure = await creaChiusura({ status: 'DRAFT' })
    await loginAs('staff')

    const response = await callRoute(
      validaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}/validate`, {
        method: 'POST',
        body: { action: 'approve' },
      }),
      { id: closure.id }
    )

    expect(response.status).toBe(403)
  })

  it('l\'admin riceve 400 su una chiusura ancora in bozza', async () => {
    const closure = await creaChiusura({ status: 'DRAFT' })
    await loginAs('admin')

    const response = await callRoute<{ error: string }>(
      validaChiusura,
      jsonRequest(`/api/chiusure/${closure.id}/validate`, {
        method: 'POST',
        body: { action: 'approve' },
      }),
      { id: closure.id }
    )

    expect(response.status).toBe(400)
    expect(response.body.error).toContain('inviate')
  })
})
