import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { POST } from '../route'

setupIntegrationDb()

async function fatturaInArchivio(numero: string, data: string, piva: string) {
  return prisma.electronicInvoice.create({
    data: {
      invoiceNumber: numero,
      invoiceDate: new Date(`${data}T00:00:00.000Z`),
      supplierVat: piva,
      supplierName: 'FORNITORE DI PROVA SRL',
      netAmount: 100,
      vatAmount: 22,
      totalAmount: 122,
      venueId: (await venueDiTest()).id,
    },
  })
}

describe('POST /api/fatture/verifica-duplicati', () => {
  it('segnala solo le fatture già presenti', async () => {
    await loginAs('admin')
    const esistente = await fatturaInArchivio('DUP-1', '2026-06-01', '01234567890')

    const res = await POST(
      jsonRequest('/api/fatture/verifica-duplicati', {
        method: 'POST',
        body: {
          fatture: [
            { chiave: 'gia-vista.xml', numero: 'DUP-1', data: '2026-06-01', partitaIva: '01234567890' },
            { chiave: 'mai-vista.xml', numero: 'MAI-9999', data: '2026-08-01', partitaIva: '01234567890' },
          ],
        },
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.duplicati).toHaveLength(1)
    expect(body.duplicati[0].chiave).toBe('gia-vista.xml')
    expect(body.duplicati[0].idEsistente).toBe(esistente.id)
  })

  it('riconosce la stessa fattura scritta con gli zeri iniziali', async () => {
    await loginAs('admin')
    await fatturaInArchivio('ZERI-1', '2026-06-02', '1234567890')

    const res = await POST(
      jsonRequest('/api/fatture/verifica-duplicati', {
        method: 'POST',
        body: {
          fatture: [{ chiave: 'a.xml', numero: 'ZERI-1', data: '2026-06-02', partitaIva: '0001234567890' }],
        },
      })
    )

    expect((await res.json()).duplicati).toHaveLength(1)
  })

  it('ignora le fatture archiviate', async () => {
    await loginAs('admin')
    const archiviata = await fatturaInArchivio('CANC-1', '2026-06-03', '01234567890')
    await prisma.electronicInvoice.update({
      where: { id: archiviata.id },
      data: { deletedAt: new Date() },
    })

    const res = await POST(
      jsonRequest('/api/fatture/verifica-duplicati', {
        method: 'POST',
        body: {
          fatture: [{ chiave: 'a.xml', numero: 'CANC-1', data: '2026-06-03', partitaIva: '01234567890' }],
        },
      })
    )

    expect((await res.json()).duplicati).toHaveLength(0)
  })

  it('nega l accesso a chi non è admin o manager', async () => {
    await loginAs('staff')

    const res = await POST(
      jsonRequest('/api/fatture/verifica-duplicati', { method: 'POST', body: { fatture: [] } })
    )

    expect(res.status).toBe(403)
  })
})
