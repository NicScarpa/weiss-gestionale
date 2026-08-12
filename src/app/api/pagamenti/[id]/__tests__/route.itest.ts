import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { toApi } from '@/lib/money'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest, centroDiCostoDiDefault } from '@/test/integration/fixtures/closures'
import { PATCH as aggiornaPagamento, DELETE as eliminaPagamento } from '../route'

/**
 * Superficie scrivibile di /api/pagamenti/[id].
 *
 * La PATCH riversava il corpo della richiesta dentro `update`: qualunque
 * colonna del modello era scrivibile dal client, comprese quelle che la
 * contabilità considera immutabili. Questi test fissano il confine: si tocca
 * solo ciò che è dichiarato, e ciò che è già in prima nota non si tocca più.
 */
setupIntegrationDb()

const IMPORTO = 500
const GIORNO = new Date('2026-05-20')

async function creaPagamento() {
  const venue = await venueDiTest()

  return prisma.payment.create({
    data: {
      venueId: venue.id,
      tipo: 'BONIFICO',
      stato: 'DA_APPROVARE',
      dataEsecuzione: GIORNO,
      importo: IMPORTO,
      beneficiarioNome: 'Fornitore di prova',
      causale: 'Fattura 42',
    },
  })
}

/** Pagamento già in prima nota: importo e data sono ormai storia contabile. */
async function creaPagamentoEseguito() {
  const pagamento = await creaPagamento()

  const movimento = await prisma.journalEntry.create({
    data: {
      venueId: pagamento.venueId,
      date: GIORNO,
      registerType: 'BANK',
      description: 'Pagamento: Fornitore di prova',
      creditAmount: IMPORTO,
      paymentId: pagamento.id,
      verified: true,
      costCenterId: await centroDiCostoDiDefault(),
    },
  })

  return prisma.payment.update({
    where: { id: pagamento.id },
    data: { stato: 'DISPOSTO', journalEntryId: movimento.id },
  })
}

async function patch(id: string, body: Record<string, unknown>) {
  return callRoute(
    aggiornaPagamento,
    jsonRequest(`/api/pagamenti/${id}`, { method: 'PATCH', body }),
    { id }
  )
}

describe('PATCH /api/pagamenti/[id]', () => {
  it('aggiorna i campi previsti di un pagamento non ancora eseguito', async () => {
    await loginAs('admin')
    const pagamento = await creaPagamento()

    const risposta = await patch(pagamento.id, {
      causale: 'Fattura 43',
      importo: 750.5,
      note: 'Rinegoziato',
    })

    expect(risposta.status).toBe(200)

    const aggiornato = await prisma.payment.findUniqueOrThrow({ where: { id: pagamento.id } })
    expect(aggiornato.causale).toBe('Fattura 43')
    expect(toApi(aggiornato.importo)).toBe(750.5)
  })

  it('accetta il cambio di stato usato dalla lista pagamenti', async () => {
    await loginAs('admin')
    const pagamento = await creaPagamento()

    const risposta = await patch(pagamento.id, { stato: 'ANNULLATO' })

    expect(risposta.status).toBe(200)
    const aggiornato = await prisma.payment.findUniqueOrThrow({ where: { id: pagamento.id } })
    expect(aggiornato.stato).toBe('ANNULLATO')
  })

  it('rifiuta la modifica dell\'importo di un pagamento già in contabilità', async () => {
    await loginAs('admin')
    const pagamento = await creaPagamentoEseguito()

    // Il movimento resterebbe da 500 €: la prima nota e il pagamento
    // racconterebbero due storie diverse.
    const risposta = await patch(pagamento.id, { importo: 1 })

    expect(risposta.status).toBe(409)
    const invariato = await prisma.payment.findUniqueOrThrow({ where: { id: pagamento.id } })
    expect(toApi(invariato.importo)).toBe(IMPORTO)
  })

  it('rifiuta lo spostamento di data di un pagamento già in contabilità', async () => {
    await loginAs('admin')
    const pagamento = await creaPagamentoEseguito()

    const risposta = await patch(pagamento.id, { dataEsecuzione: '2026-01-01' })

    expect(risposta.status).toBe(409)
    const invariato = await prisma.payment.findUniqueOrThrow({ where: { id: pagamento.id } })
    expect(invariato.dataEsecuzione).toEqual(GIORNO)
  })

  it('rifiuta un campo non previsto invece di scriverlo', async () => {
    await loginAs('admin')
    const pagamento = await creaPagamento()

    // `deletedAt` dal client è una cancellazione logica che scavalca i
    // controlli della DELETE.
    const risposta = await patch(pagamento.id, { deletedAt: new Date().toISOString() })

    expect(risposta.status).toBe(400)
    const invariato = await prisma.payment.findUniqueOrThrow({ where: { id: pagamento.id } })
    expect(invariato.deletedAt).toBeNull()
  })

  it('non lascia spostare un pagamento a un\'altra sede', async () => {
    await loginAs('admin')
    const pagamento = await creaPagamento()
    const altraSede = await prisma.venue.create({
      data: { name: 'Sede di prova', code: 'PROVA' },
    })

    const risposta = await patch(pagamento.id, { venueId: altraSede.id })

    expect(risposta.status).toBe(400)
    const invariato = await prisma.payment.findUniqueOrThrow({ where: { id: pagamento.id } })
    expect(invariato.venueId).toBe(pagamento.venueId)
  })

  it('rifiuta un importo non positivo', async () => {
    await loginAs('admin')
    const pagamento = await creaPagamento()

    const risposta = await patch(pagamento.id, { importo: -5 })

    expect(risposta.status).toBe(400)
    const invariato = await prisma.payment.findUniqueOrThrow({ where: { id: pagamento.id } })
    expect(toApi(invariato.importo)).toBe(IMPORTO)
  })

  it('non trova un pagamento cancellato', async () => {
    await loginAs('admin')
    const pagamento = await creaPagamento()
    await prisma.payment.update({
      where: { id: pagamento.id },
      data: { deletedAt: new Date() },
    })

    const risposta = await patch(pagamento.id, { causale: 'Fattura 44' })

    expect(risposta.status).toBe(404)
  })

  it('senza sessione risponde 401', async () => {
    const pagamento = await creaPagamento()

    const risposta = await patch(pagamento.id, { causale: 'Fattura 45' })

    expect(risposta.status).toBe(401)
  })
})

describe('DELETE /api/pagamenti/[id]', () => {
  async function elimina(id: string) {
    return callRoute(
      eliminaPagamento,
      jsonRequest(`/api/pagamenti/${id}`, { method: 'DELETE' }),
      { id }
    )
  }

  it('cancella logicamente un pagamento in bozza', async () => {
    await loginAs('admin')
    const pagamento = await creaPagamento()
    await prisma.payment.update({ where: { id: pagamento.id }, data: { stato: 'BOZZA' } })

    const risposta = await elimina(pagamento.id)

    expect(risposta.status).toBe(200)
    // Per rileggere un record cancellato bisogna chiederlo: nominare `deletedAt`
    // nella where disattiva il filtro automatico del client.
    const cancellato = await prisma.payment.findUniqueOrThrow({
      where: { id: pagamento.id, deletedAt: { not: null } },
    })
    expect(cancellato.deletedAt).not.toBeNull()
  })

  it('non cancella un pagamento già registrato in prima nota', async () => {
    await loginAs('admin')
    const pagamento = await creaPagamentoEseguito()
    // Lo stato si può riportare a BOZZA con una PATCH legittima: è il legame
    // col movimento, non lo stato, a dover impedire la cancellazione.
    await prisma.payment.update({ where: { id: pagamento.id }, data: { stato: 'BOZZA' } })

    const risposta = await elimina(pagamento.id)

    expect(risposta.status).toBe(409)
    const invariato = await prisma.payment.findUniqueOrThrow({ where: { id: pagamento.id } })
    expect(invariato.deletedAt).toBeNull()
  })
})
