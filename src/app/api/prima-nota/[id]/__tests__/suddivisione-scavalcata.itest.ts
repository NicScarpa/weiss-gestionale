import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { loginAs } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { creaMovimento } from '@/test/integration/fixtures/scadenzario'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { PUT as PUT_movimento } from '../route'
import { PATCH as PATCH_categorize } from '../categorize/route'
import { POST as POST_recategorize } from '../../recategorize/route'

/**
 * Le tre strade per cambiare il conto di un movimento, messe una accanto
 * all'altra.
 *
 * Un movimento suddiviso in fette ha il conto governato dalla suddivisione:
 * `aggiornaContoDominante` lo riscrive sul conto della fetta più grossa a ogni
 * modifica delle fette. Chi cambia il conto per un'altra strada non ottiene un
 * effetto duraturo, ottiene un movimento che dichiara un conto che nessuna
 * delle sue fette sostiene — e che alla prima riconciliazione successiva viene
 * riscritto di nuovo. Due strade su tre lo sapevano; la terza no, e questo file
 * esiste per tenerle allineate.
 */
setupIntegrationDb()

let venueId: string
let contoIniziale: string
let contoAltro: string

async function movimentoSuddiviso(importo = 1000) {
  const movimento = await creaMovimento({ uscita: importo, venueId })
  await prisma.journalEntry.update({
    where: { id: movimento.id },
    data: { accountId: contoIniziale, categorizationSource: 'split' },
  })
  await prisma.journalEntryAllocation.createMany({
    data: [
      { journalEntryId: movimento.id, accountId: contoIniziale, importo: importo * 0.7, origine: 'manuale' },
      { journalEntryId: movimento.id, accountId: contoAltro, importo: importo * 0.3, origine: 'manuale' },
    ],
  })
  return movimento
}

function modifica(id: string, body: Record<string, unknown>) {
  return callRoute<{ error?: string }, { id: string }>(
    PUT_movimento,
    jsonRequest(`/api/prima-nota/${id}`, { method: 'PUT', body }),
    { id }
  )
}

async function contoDelMovimento(id: string) {
  const entry = await prisma.journalEntry.findUniqueOrThrow({
    where: { id },
    select: { accountId: true, description: true, categorizationSource: true },
  })
  return entry
}

beforeEach(async () => {
  await loginAs('admin')
  venueId = (await venueDiTest()).id
  const conti = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { code: 'asc' },
    take: 3,
  })
  contoIniziale = conti[0].id
  contoAltro = conti[1].id
})

describe('modificare il movimento non scavalca la suddivisione', () => {
  it('cambiare il conto di un movimento suddiviso è rifiutato', async () => {
    const movimento = await movimentoSuddiviso()
    const terzoConto = (
      await prisma.account.findFirstOrThrow({
        where: { isActive: true, id: { notIn: [contoIniziale, contoAltro] } },
        select: { id: true },
      })
    ).id

    const esito = await modifica(movimento.id, {
      description: 'Bonifico fornitore',
      accountId: terzoConto,
    })

    expect(esito.status).toBe(409)
    expect(esito.body.error).toMatch(/suddivis/i)
    // Il conto è rimasto quello che le fette sostengono
    expect((await contoDelMovimento(movimento.id)).accountId).toBe(contoIniziale)
  })

  it('gli altri campi di un movimento suddiviso restano modificabili', async () => {
    const movimento = await movimentoSuddiviso()

    const esito = await modifica(movimento.id, {
      description: 'Bonifico rettificato',
      documentRef: 'BON-2026-118',
    })

    expect(esito.status).toBe(200)
    const dopo = await contoDelMovimento(movimento.id)
    expect(dopo.description).toBe('Bonifico rettificato')
    expect(dopo.accountId).toBe(contoIniziale)
    expect(dopo.categorizationSource).toBe('split')
  })

  it('rimandare lo stesso conto non è un cambio e non viene rifiutato', async () => {
    // Il form rispedisce tutti i campi, conto compreso: rifiutare qui
    // renderebbe immodificabile la descrizione di ogni movimento suddiviso.
    const movimento = await movimentoSuddiviso()

    const esito = await modifica(movimento.id, {
      description: 'Bonifico fornitore',
      accountId: contoIniziale,
    })

    expect(esito.status).toBe(200)
  })

  it('su un movimento senza fette il conto si cambia liberamente', async () => {
    const movimento = await creaMovimento({ uscita: 500, venueId })
    await prisma.journalEntry.update({
      where: { id: movimento.id },
      data: { accountId: contoIniziale },
    })

    const esito = await modifica(movimento.id, {
      description: 'Bonifico fornitore',
      accountId: contoAltro,
    })

    expect(esito.status).toBe(200)
    expect((await contoDelMovimento(movimento.id)).accountId).toBe(contoAltro)
  })
})

describe('le altre due strade, per confronto', () => {
  it('la categorizzazione singola rifiuta un movimento suddiviso', async () => {
    const movimento = await movimentoSuddiviso()

    const esito = await callRoute<{ error?: string }, { id: string }>(
      PATCH_categorize,
      jsonRequest(`/api/prima-nota/${movimento.id}/categorize`, {
        method: 'PATCH',
        body: { accountId: contoAltro },
      }),
      { id: movimento.id }
    )

    expect(esito.status).toBe(409)
    expect(esito.body.error).toMatch(/suddivis/i)
    expect((await contoDelMovimento(movimento.id)).accountId).toBe(contoIniziale)
  })

  it('la ricategorizzazione massiva salta i movimenti suddivisi', async () => {
    const suddiviso = await movimentoSuddiviso()
    const semplice = await creaMovimento({
      uscita: 300,
      venueId,
      description: 'Bonifico fornitore',
    })

    await prisma.categorizationRule.create({
      data: {
        venueId,
        name: 'Tutti i bonifici',
        direction: 'OUTFLOW',
        keywords: ['bonifico'],
        accountId: contoAltro,
        priority: 10,
      },
    })

    const esito = await callRoute(
      POST_recategorize,
      jsonRequest('/api/prima-nota/recategorize', { method: 'POST', body: {} })
    )
    expect(esito.status).toBe(200)

    // La regola ha preso il movimento semplice e non quello suddiviso
    expect((await contoDelMovimento(semplice.id)).accountId).toBe(contoAltro)
    expect((await contoDelMovimento(suddiviso.id)).accountId).toBe(contoIniziale)
  })
})
