import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest } from '@/test/integration/api'
import { xmlFattura } from '@/test/factories/fattura-xml.factory'
import { POST } from '../route'

/**
 * I tre gradini con cui l'import sceglie il conto di testata: `accountId`
 * mandato dal client, conto abituale del fornitore, regole dello scadenzario.
 *
 * Il gradino di mezzo è quello che il wizard aveva perso: i due dialog che ha
 * sostituito chiedevano al server un'anteprima e ne rimandavano il conto
 * suggerito, il wizard non manda `accountId` affatto. Senza il
 * gradino, una fattura di un fornitore con il conto assegnato a mano restava
 * senza conto, e `POST /api/invoices/[id]/record` la rifiutava con «Assegna
 * prima un conto alla fattura».
 */

setupIntegrationDb()

const richiesta = (body: unknown) => jsonRequest('/api/invoices', { method: 'POST', body })

/** Due conti qualsiasi dal piano del seed: servono solo come bersagli
 * distinguibili, non conta quali siano. */
async function dueConti() {
  const conti = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    take: 2,
    select: { id: true },
  })
  return { conto: conti[0].id, altroConto: conti[1].id }
}

beforeEach(async () => {
  await loginAs('admin')
  // Come negli altri test d'import: senza chiave la categorizzazione AI delle
  // righe viene saltata subito, e non parte una chiamata vera a pagamento.
  vi.stubEnv('ANTHROPIC_API_KEY', '')
})

describe('POST /api/invoices — conto di testata', () => {
  // Stessa P.IVA degli altri test d'import, e volutamente diversa da quelle
  // del seed: qui il fornitore lo creiamo noi, con il conto che ci serve.
  const PIVA = '07945211006'
  const base = { fileName: 'f.xml', venueId: 'auto', createSupplier: true }

  it('applica il conto predefinito del fornitore quando il client non ne manda uno', async () => {
    const { conto } = await dueConti()
    const fornitore = await prisma.supplier.create({
      data: { name: 'FORNITORE CON CONTO', vatNumber: PIVA, defaultAccountId: conto },
    })

    const res = await POST(
      richiesta({
        ...base,
        xmlContent: xmlFattura({ numero: 'CF-1', data: '2026-06-01', piva: PIVA }),
      })
    )
    const { id } = await res.json()

    const fattura = await prisma.electronicInvoice.findUnique({ where: { id } })
    expect(fattura?.supplierId).toBe(fornitore.id)
    expect(fattura?.accountId).toBe(conto)
    // Il conto c'è: la fattura è categorizzata, non solo agganciata al
    // fornitore. È lo stato che `record` pretende.
    expect(fattura?.status).toBe('CATEGORIZED')
  })

  it('eredita il conto dall\'ultima fattura categorizzata dello stesso fornitore', async () => {
    // Il secondo ramo di `suggestAccountForSupplier`: nessun conto predefinito
    // in anagrafica, ma lo storico del fornitore lo dice comunque.
    const { conto } = await dueConti()
    await prisma.supplier.create({
      data: { name: 'FORNITORE SENZA DEFAULT', vatNumber: PIVA },
    })

    const prima = await POST(
      richiesta({
        ...base,
        fileName: 'prima.xml',
        accountId: conto,
        xmlContent: xmlFattura({ numero: 'CF-2', data: '2026-06-01', piva: PIVA }),
      })
    )
    expect((await prima.json()).id).toBeTruthy()

    const seconda = await POST(
      richiesta({
        ...base,
        fileName: 'seconda.xml',
        xmlContent: xmlFattura({ numero: 'CF-3', data: '2026-06-02', piva: PIVA }),
      })
    )
    const { id } = await seconda.json()

    const fattura = await prisma.electronicInvoice.findUnique({ where: { id } })
    expect(fattura?.accountId).toBe(conto)
  })

  it('il conto mandato dal client vince su quello del fornitore', async () => {
    const { conto, altroConto } = await dueConti()
    await prisma.supplier.create({
      data: { name: 'FORNITORE CON CONTO', vatNumber: PIVA, defaultAccountId: conto },
    })

    const res = await POST(
      richiesta({
        ...base,
        accountId: altroConto,
        xmlContent: xmlFattura({ numero: 'CF-4', data: '2026-06-01', piva: PIVA }),
      })
    )
    const { id } = await res.json()

    const fattura = await prisma.electronicInvoice.findUnique({ where: { id } })
    expect(fattura?.accountId).toBe(altroConto)
  })

  it('il conto del fornitore vince sulle regole dello scadenzario', async () => {
    // Le regole ragionano per tipo documento e tipo pagamento: non sanno *chi*
    // ha emesso il documento, quindi non possono distinguere due fornitori che
    // vanno su conti diversi. Il fornitore, che lo sa, viene prima.
    const { conto, altroConto } = await dueConti()
    const venue = await prisma.venue.findFirstOrThrow()
    await prisma.supplier.create({
      data: { name: 'FORNITORE CON CONTO', vatNumber: PIVA, defaultAccountId: conto },
    })
    await prisma.scheduleRule.create({
      data: { venueId: venue.id, direzione: 'ricevuti', contoId: altroConto, isActive: true },
    })

    const res = await POST(
      richiesta({
        ...base,
        xmlContent: xmlFattura({ numero: 'CF-5', data: '2026-06-01', piva: PIVA }),
      })
    )
    const { id } = await res.json()

    const fattura = await prisma.electronicInvoice.findUnique({ where: { id } })
    expect(fattura?.accountId).toBe(conto)
  })

  it('senza conto del fornitore restano le regole a decidere', async () => {
    // Il gradino nuovo non deve scavalcare quello che c'era: se il fornitore
    // non ha né conto predefinito né storico, la regola si applica come prima.
    const { altroConto } = await dueConti()
    const venue = await prisma.venue.findFirstOrThrow()
    await prisma.supplier.create({ data: { name: 'FORNITORE NUDO', vatNumber: PIVA } })
    await prisma.scheduleRule.create({
      data: { venueId: venue.id, direzione: 'ricevuti', contoId: altroConto, isActive: true },
    })

    const res = await POST(
      richiesta({
        ...base,
        xmlContent: xmlFattura({ numero: 'CF-6', data: '2026-06-01', piva: PIVA }),
      })
    )
    const { id } = await res.json()

    const fattura = await prisma.electronicInvoice.findUnique({ where: { id } })
    expect(fattura?.accountId).toBe(altroConto)
  })
})
