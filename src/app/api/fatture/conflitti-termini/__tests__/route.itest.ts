import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest } from '@/test/integration/api'
import { POST } from '../route'

setupIntegrationDb()

const richiesta = (body: unknown) =>
  jsonRequest('/api/fatture/conflitti-termini', { method: 'POST', body })

beforeEach(async () => {
  await loginAs('admin')
})

describe('POST /api/fatture/conflitti-termini', () => {
  it('segnala il fornitore i cui termini divergono dal file', async () => {
    const fornitore = await prisma.supplier.create({
      data: { name: 'PROVA CONFLITTI SRL', vatNumber: '99999999999', paymentTermsDays: 60 },
    })

    const res = await POST(
      richiesta({
        fatture: [
          { chiave: 'a.xml', partitaIva: '99999999999', denominazione: 'PROVA CONFLITTI SRL', giorniDalFile: 30, aliquote: [22] },
          { chiave: 'b.xml', partitaIva: '99999999999', denominazione: 'PROVA CONFLITTI SRL', giorniDalFile: 30, aliquote: [10] },
        ],
      })
    )

    const body = await res.json()
    expect(body.conflitti).toHaveLength(1)
    expect(body.conflitti[0]).toMatchObject({
      partitaIva: '99999999999',
      giorniDalFile: 30,
      giorniAnagrafica: 60,
    })
    expect(body.conflitti[0].chiavi).toEqual(['a.xml', 'b.xml'])
    // Le aliquote si accumulano come contesto, senza generare conflitto
    expect(body.conflitti[0].aliquote).toEqual([22, 10])

    await prisma.supplier.delete({ where: { id: fornitore.id } })
  })

  it('tace quando i termini coincidono', async () => {
    const fornitore = await prisma.supplier.create({
      data: { name: 'CONCORDE SRL', vatNumber: '88888888888', paymentTermsDays: 30 },
    })
    const res = await POST(
      richiesta({
        fatture: [{ chiave: 'a.xml', partitaIva: '88888888888', denominazione: 'CONCORDE SRL', giorniDalFile: 30 }],
      })
    )
    expect((await res.json()).conflitti).toHaveLength(0)
    await prisma.supplier.delete({ where: { id: fornitore.id } })
  })

  it('tace quando il fornitore non ha termini concordati', async () => {
    const fornitore = await prisma.supplier.create({
      data: { name: 'SENZA TERMINI SRL', vatNumber: '77777777777', paymentTermsDays: null },
    })
    const res = await POST(
      richiesta({
        fatture: [{ chiave: 'a.xml', partitaIva: '77777777777', denominazione: 'SENZA TERMINI SRL', giorniDalFile: 15 }],
      })
    )
    expect((await res.json()).conflitti).toHaveLength(0)
    await prisma.supplier.delete({ where: { id: fornitore.id } })
  })

  it('tace quando il file non porta alcuna scadenza', async () => {
    // Il fornitore ha termini concordati (45 giorni): se il filtro sul
    // `giorniDalFile: null` mancasse, il confronto con l'anagrafica
    // produrrebbe comunque un conflitto e il test lo scoprirebbe.
    const fornitore = await prisma.supplier.create({
      data: { name: 'X', vatNumber: '99999999999', paymentTermsDays: 45 },
    })
    const res = await POST(
      richiesta({
        fatture: [{ chiave: 'a.xml', partitaIva: '99999999999', denominazione: 'X', giorniDalFile: null }],
      })
    )
    expect((await res.json()).conflitti).toHaveLength(0)
    await prisma.supplier.delete({ where: { id: fornitore.id } })
  })

  it('raggruppa per partita IVA anche se la denominazione cambia fra le fatture', async () => {
    // La stessa P.IVA compare nell'archivio reale scritta in modi diversi
    // (ragione sociale libera): un raggruppamento per nome produrrebbe due
    // conflitti separati invece di uno solo.
    const fornitore = await prisma.supplier.create({
      data: { name: 'WEISS S.R.L.', vatNumber: '66666666666', paymentTermsDays: 60 },
    })
    const res = await POST(
      richiesta({
        fatture: [
          { chiave: 'a.xml', partitaIva: '66666666666', denominazione: 'WEISS S.R.L.', giorniDalFile: 30 },
          { chiave: 'b.xml', partitaIva: '66666666666', denominazione: 'WEISS SRL SOCIO UNICO', giorniDalFile: 30 },
        ],
      })
    )
    const body = await res.json()
    expect(body.conflitti).toHaveLength(1)
    expect(body.conflitti[0].chiavi).toEqual(['a.xml', 'b.xml'])
    await prisma.supplier.delete({ where: { id: fornitore.id } })
  })

  it('riconosce la stessa P.IVA scritta con gli zeri iniziali', async () => {
    // La formattazione della P.IVA fra file e anagrafica è notoriamente
    // incoerente in questo archivio (stessa incongruenza già gestita in
    // verifica-duplicati). Senza normalizzare qui, il lookup fallirebbe in
    // silenzio: falso negativo, un conflitto vero non verrebbe mai segnalato.
    const fornitore = await prisma.supplier.create({
      data: { name: 'ZERI SRL', vatNumber: '1234567890', paymentTermsDays: 60 },
    })
    const res = await POST(
      richiesta({
        fatture: [{ chiave: 'a.xml', partitaIva: '001234567890', denominazione: 'ZERI SRL', giorniDalFile: 30 }],
      })
    )
    const body = await res.json()
    expect(body.conflitti).toHaveLength(1)
    expect(body.conflitti[0]).toMatchObject({ giorniDalFile: 30, giorniAnagrafica: 60 })
    await prisma.supplier.delete({ where: { id: fornitore.id } })
  })

  it('nega l accesso a chi non è admin o manager', async () => {
    await loginAs('staff')

    const res = await POST(richiesta({ fatture: [] }))

    expect(res.status).toBe(403)
  })
})
