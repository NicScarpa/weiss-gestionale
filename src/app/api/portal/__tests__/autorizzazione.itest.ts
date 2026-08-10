import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome, entraComeUtente } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { GET as colleghi } from '../colleagues/route'
import { GET as turniMiei } from '../shifts/route'
import { GET as documentiMiei } from '../documents/route'
import { GET as scaricaDocumento } from '../documents/[id]/route'
import { GET as tipiAssenza } from '../../leave-types/route'

/**
 * Caratterizzazione dell'autorizzazione sulle route del portale dipendente,
 * scritta prima della conversione a `withAuth` e valida anche dopo: qui il
 * guard cambia forma, non effetto. Le uniche differenze volute sono annotate
 * nei singoli test.
 */
setupIntegrationDb()

async function unAltroStaff(escluso: string) {
  const user = await prisma.user.findFirst({
    where: { role: { name: 'staff' }, isActive: true, id: { not: escluso } },
    orderBy: { username: 'asc' },
  })
  if (!user) throw new Error('Serve un secondo utente staff nel seed.')
  return user
}

describe('GET /api/portal/colleagues', () => {
  it('richiede di essere autenticati', async () => {
    const { status } = await callRoute(colleghi, jsonRequest('/api/portal/colleagues'))
    expect(status).toBe(401)
  })

  it('è aperta a chiunque abbia accesso al portale', async () => {
    await entraCome('staff')
    const { status } = await callRoute(colleghi, jsonRequest('/api/portal/colleagues'))
    expect(status).toBe(200)
  })

  it('non lascia scegliere al client la sede da leggere', async () => {
    const io = await entraCome('staff')
    // Il portale è disabilitato di default: senza questo l'elenco è vuoto
    // comunque, e il test non distinguerebbe la sede giusta da quella sbagliata.
    await prisma.user.updateMany({
      where: { role: { name: 'staff' } },
      data: { portalEnabled: true },
    })

    const { status, body } = await callRoute<{ data: { id: string }[] }>(
      colleghi,
      jsonRequest('/api/portal/colleagues', {
        searchParams: { venueId: 'sede-di-qualcun-altro' },
      })
    )

    // Prima della conversione il venueId della query vinceva sulla sede vera:
    // con un id inesistente l'elenco tornava vuoto invece di ignorare il
    // parametro. Ora la sede la decide la sessione.
    expect(status).toBe(200)
    expect(body.data.length).toBeGreaterThan(0)
    expect(body.data.map((c) => c.id)).not.toContain(io.user.id)
  })
})

describe('GET /api/portal/shifts', () => {
  it('richiede di essere autenticati', async () => {
    const { status } = await callRoute(turniMiei, jsonRequest('/api/portal/shifts'))
    expect(status).toBe(401)
  })

  it('restituisce soltanto i turni di chi chiede', async () => {
    await entraCome('staff')
    const { status, body } = await callRoute<{ data: unknown[] }>(
      turniMiei,
      jsonRequest('/api/portal/shifts')
    )
    expect(status).toBe(200)
    expect(body.data).toEqual([])
  })
})

describe('GET /api/portal/documents', () => {
  it('richiede di essere autenticati', async () => {
    const { status } = await callRoute(documentiMiei, jsonRequest('/api/portal/documents'))
    expect(status).toBe(401)
  })

  it('elenca solo i documenti di chi chiede', async () => {
    const io = await entraCome('staff')
    const altro = await unAltroStaff(io.user.id)

    await prisma.employeeDocument.createMany({
      data: [
        {
          userId: io.user.id,
          category: 'CEDOLINI',
          filename: 'mio.pdf',
          originalFilename: 'mio.pdf',
          contentType: 'application/pdf',
          fileSize: 10,
          uploadedByUserId: io.user.id,
        },
        {
          userId: altro.id,
          category: 'CEDOLINI',
          filename: 'suo.pdf',
          originalFilename: 'suo.pdf',
          contentType: 'application/pdf',
          fileSize: 10,
          uploadedByUserId: altro.id,
        },
      ],
    })

    const { status, body } = await callRoute<{ documents: { originalFilename: string }[] }>(
      documentiMiei,
      jsonRequest('/api/portal/documents')
    )

    expect(status).toBe(200)
    expect(body.documents.map((d) => d.originalFilename)).toEqual(['mio.pdf'])
  })
})

describe('GET /api/portal/documents/[id]', () => {
  it('non lascia scaricare il cedolino di un collega', async () => {
    const io = await entraCome('staff')
    const altro = await unAltroStaff(io.user.id)

    const documento = await prisma.employeeDocument.create({
      data: {
        userId: altro.id,
        category: 'CEDOLINI',
        filename: 'suo.pdf',
        originalFilename: 'suo.pdf',
        contentType: 'application/pdf',
        fileSize: 10,
        uploadedByUserId: altro.id,
      },
    })

    const { status } = await callRoute(
      scaricaDocumento,
      jsonRequest(`/api/portal/documents/${documento.id}`),
      { id: documento.id }
    )

    expect(status).toBe(403)
  })

  it('richiede di essere autenticati', async () => {
    const { status } = await callRoute(
      scaricaDocumento,
      jsonRequest('/api/portal/documents/qualsiasi'),
      { id: 'qualsiasi' }
    )
    expect(status).toBe(401)
  })
})

describe('GET /api/leave-types', () => {
  it('richiede di essere autenticati', async () => {
    const { status } = await callRoute(tipiAssenza, jsonRequest('/api/leave-types'))
    expect(status).toBe(401)
  })

  it('è leggibile da chiunque sia autenticato: serve per chiedere le ferie', async () => {
    const utente = await prisma.user.findFirst({ where: { role: { name: 'staff' } } })
    await entraComeUtente(utente!.id)

    const { status } = await callRoute(tipiAssenza, jsonRequest('/api/leave-types'))
    expect(status).toBe(200)
  })
})
