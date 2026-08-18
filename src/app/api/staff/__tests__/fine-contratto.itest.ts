import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, logout } from '@/test/integration/auth-mock'
import { callRoute, jsonRequest } from '@/test/integration/api'
import { POST } from '../route'

/**
 * La data di fine del contratto a termine.
 *
 * Serve a farsi avvisare prima che scada, per parlare con la persona e
 * decidere del rinnovo: senza, il tempo determinato finisce e se ne accorge
 * qualcuno per caso. È obbligatoria proprio per questo — un contratto a
 * termine senza termine è un dato che non si può usare.
 */

setupIntegrationDb()

type Corpo = { error?: string; id?: string; details?: unknown }

async function creaDipendente(patch: Record<string, unknown> = {}) {
  const venue = await prisma.venue.findFirstOrThrow()
  const ruolo = await prisma.role.findFirstOrThrow({ where: { name: 'staff' } })

  return callRoute<Corpo>(
    POST,
    jsonRequest('http://localhost/api/staff', {
      method: 'POST',
      body: {
        firstName: 'Anna',
        lastName: 'Zamai',
        email: `anna.${Math.abs(Date.parse('2026-08-18'))}@esempio.it`,
        venueId: venue.id,
        roleId: ruolo.id,
        contractType: 'TEMPO_DETERMINATO',
        hireDate: '2026-06-11',
        contractEndDate: '2026-12-31',
        isFixedStaff: true,
        ...patch,
      },
    })
  )
}

beforeEach(async () => {
  logout()
  await entraCome('admin')
})

describe('data di fine sul contratto a termine', () => {
  it('si salva quando la si indica', async () => {
    const esito = await creaDipendente({ email: 'con-data@esempio.it' })
    expect(esito.status).toBeLessThan(300)

    const salvato = await prisma.user.findFirstOrThrow({ where: { email: 'con-data@esempio.it' } })
    expect(salvato.contractEndDate?.toISOString().slice(0, 10)).toBe('2026-12-31')
  })

  it('senza data, il tempo determinato non si crea', async () => {
    const esito = await creaDipendente({
      email: 'senza-data@esempio.it',
      contractEndDate: null,
    })

    expect(esito.status).toBe(400)
    expect(await prisma.user.count({ where: { email: 'senza-data@esempio.it' } })).toBe(0)
  })

  it('il tempo indeterminato non la pretende', async () => {
    const esito = await creaDipendente({
      email: 'indeterminato@esempio.it',
      contractType: 'TEMPO_INDETERMINATO',
      contractEndDate: null,
    })

    expect(esito.status).toBeLessThan(300)
  })

  it('la data di fine non può precedere l\'assunzione', async () => {
    const esito = await creaDipendente({
      email: 'a-rovescio@esempio.it',
      hireDate: '2026-06-11',
      contractEndDate: '2026-05-01',
    })

    expect(esito.status).toBe(400)
  })
})
