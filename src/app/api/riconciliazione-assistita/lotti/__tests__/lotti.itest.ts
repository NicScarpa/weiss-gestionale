import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'
import { setupIntegrationDb } from '@/test/integration/db'
import { entraCome } from '@/test/integration/auth-mock'
import { jsonRequest, callRoute } from '@/test/integration/api'
import { venueDiTest } from '@/test/integration/fixtures/closures'
import { POST, GET } from '../route'
import { GET as GET_UNO, DELETE } from '../[id]/route'

/**
 * Il vincolo che questi test difendono oltre al funzionamento: i contatori
 * contano proposte, e la somma delle fasce fa il totale in attesa. Chi filtra
 * su "Media" deve vedere qualcosa quando esiste una proposta da 77 punti.
 */
setupIntegrationDb()

const PERCORSO = '/api/riconciliazione-assistita/lotti'

/**
 * Monta la sessione e restituisce la sede che la route userà.
 *
 * Le due cose devono coincidere: la route è `venueScoped`, quindi legge la sede
 * dalla sessione, e le righe seminate su un'altra sede sarebbero invisibili.
 * L'admin del seed può non avere una sede in sessione — lì `withAuth` ricade su
 * `getVenueId()`, e questo aiuto fa lo stesso.
 */
async function sedeDiSessione(): Promise<string> {
  const sessione = await entraCome('admin')
  return sessione.user.venueId ?? (await venueDiTest()).id
}

interface CorpoLotto {
  batchId?: string
  contaProposte?: number
  error?: string
}

describe('POST /api/riconciliazione-assistita/lotti', () => {
  it('rifiuta un periodo rovesciato', async () => {
    await sedeDiSessione()
    const risposta = await callRoute<CorpoLotto>(
      POST,
      jsonRequest(PERCORSO, {
        method: 'POST',
        body: { dateFrom: '2026-08-31', dateTo: '2026-05-01', regole: ['R1'] },
      })
    )
    expect(risposta.status).toBe(400)
  })

  it('rifiuta una sigla di regola sconosciuta', async () => {
    await sedeDiSessione()
    const risposta = await callRoute<CorpoLotto>(
      POST,
      jsonRequest(PERCORSO, {
        method: 'POST',
        body: { dateFrom: '2026-05-01', dateTo: '2026-08-31', regole: ['R99'] },
      })
    )
    expect(risposta.status).toBe(400)
  })

  it('crea un lotto vuoto quando non c\'è nulla da abbinare', async () => {
    await sedeDiSessione()
    const risposta = await callRoute<CorpoLotto>(
      POST,
      jsonRequest(PERCORSO, {
        method: 'POST',
        body: { dateFrom: '2026-05-01', dateTo: '2026-08-31', regole: ['R1'] },
      })
    )
    expect(risposta.status).toBe(201)
    expect(risposta.body.contaProposte).toBe(0)
    expect(risposta.body.batchId).toBeTruthy()
  })

  it('nega l\'accesso a chi non è admin né manager', async () => {
    await entraCome('staff')
    const risposta = await callRoute<CorpoLotto>(
      POST,
      jsonRequest(PERCORSO, {
        method: 'POST',
        body: { dateFrom: '2026-05-01', dateTo: '2026-08-31', regole: ['R1'] },
      })
    )
    expect(risposta.status).toBe(403)
  })
})

describe('GET /api/riconciliazione-assistita/lotti', () => {
  it('elenca i lotti della sede, dal più recente', async () => {
    const venueId = await sedeDiSessione()
    await prisma.reconciliationBatch.createMany({
      data: [
        {
          venueId,
          dateFrom: new Date('2026-05-01'),
          dateTo: new Date('2026-06-30'),
          regoleUsate: ['R1'],
          createdAt: new Date('2026-08-01'),
        },
        {
          venueId,
          dateFrom: new Date('2026-07-01'),
          dateTo: new Date('2026-08-31'),
          regoleUsate: ['R1'],
          createdAt: new Date('2026-08-10'),
        },
      ],
    })

    const risposta = await callRoute<{ lotti: Array<{ createdAt: string }> }>(
      GET,
      jsonRequest(PERCORSO)
    )
    expect(risposta.status).toBe(200)
    expect(risposta.body.lotti).toHaveLength(2)
    expect(new Date(risposta.body.lotti[0].createdAt).getTime()).toBeGreaterThan(
      new Date(risposta.body.lotti[1].createdAt).getTime()
    )
  })

  it('non elenca i lotti di un\'altra sede', async () => {
    await sedeDiSessione()
    const altraSede = await prisma.venue.create({
      data: { name: 'Sede di prova', code: 'PROVA-LOTTI-COLLEZIONE' },
    })
    await prisma.reconciliationBatch.create({
      data: {
        venueId: altraSede.id,
        dateFrom: new Date('2026-05-01'),
        dateTo: new Date('2026-06-30'),
        regoleUsate: ['R1'],
      },
    })

    const risposta = await callRoute<{ lotti: Array<{ id: string }> }>(GET, jsonRequest(PERCORSO))
    expect(risposta.status).toBe(200)
    expect(risposta.body.lotti).toHaveLength(0)
  })
})

interface Contatori {
  totali: number
  inAttesa: number
  approvate: number
  scartate: number
  superate: number
  alta: number
  media: number
  bassa: number
}

describe('GET /api/riconciliazione-assistita/lotti/[id]', () => {
  it('restituisce contatori la cui somma per fascia fa il totale in attesa', async () => {
    const venueId = await sedeDiSessione()
    const lotto = await prisma.reconciliationBatch.create({
      data: {
        venueId,
        dateFrom: new Date('2026-07-01'),
        dateTo: new Date('2026-07-31'),
        regoleUsate: ['R1'],
        contaProposte: 3,
      },
    })
    // Uno per fascia: 92 alta, 70 media, 45 bassa
    for (const punteggio of [92, 70, 45]) {
      await prisma.reconciliationProposal.create({
        data: {
          batchId: lotto.id,
          regola: 'R1',
          punteggio,
          fattori: {},
          motivazioni: [],
        },
      })
    }

    const risposta = await callRoute<{ contatori: Contatori }, { id: string }>(
      GET_UNO,
      jsonRequest(`${PERCORSO}/${lotto.id}`),
      { id: lotto.id }
    )
    expect(risposta.status).toBe(200)

    const { contatori } = risposta.body
    expect(contatori.inAttesa).toBe(3)
    expect(contatori.alta + contatori.media + contatori.bassa).toBe(contatori.inAttesa)
    expect(contatori.alta).toBe(1)
    expect(contatori.media).toBe(1)
    expect(contatori.bassa).toBe(1)
  })

  it('risponde 404 per un lotto che non esiste in questa sede', async () => {
    await sedeDiSessione()
    const risposta = await callRoute<{ error?: string }, { id: string }>(
      GET_UNO,
      jsonRequest(`${PERCORSO}/inesistente`),
      { id: 'inesistente' }
    )
    expect(risposta.status).toBe(404)
  })

  it('risponde 404 per un lotto che esiste ma appartiene a un\'altra sede', async () => {
    await sedeDiSessione()
    const altraSede = await prisma.venue.create({
      data: { name: 'Sede di prova', code: 'PROVA-LOTTI-GET' },
    })
    const lottoAltrove = await prisma.reconciliationBatch.create({
      data: {
        venueId: altraSede.id,
        dateFrom: new Date('2026-07-01'),
        dateTo: new Date('2026-07-31'),
        regoleUsate: ['R1'],
      },
    })

    const risposta = await callRoute<{ error?: string }, { id: string }>(
      GET_UNO,
      jsonRequest(`${PERCORSO}/${lottoAltrove.id}`),
      { id: lottoAltrove.id }
    )
    expect(risposta.status).toBe(404)
  })
})

describe('DELETE /api/riconciliazione-assistita/lotti/[id]', () => {
  it('cancella un lotto non lavorato', async () => {
    const venueId = await sedeDiSessione()
    const lotto = await prisma.reconciliationBatch.create({
      data: {
        venueId,
        dateFrom: new Date('2026-07-01'),
        dateTo: new Date('2026-07-31'),
        regoleUsate: ['R1'],
      },
    })

    const risposta = await callRoute<null, { id: string }>(
      DELETE,
      jsonRequest(`${PERCORSO}/${lotto.id}`, { method: 'DELETE' }),
      { id: lotto.id }
    )
    expect(risposta.status).toBe(204)
    expect(await prisma.reconciliationBatch.findUnique({ where: { id: lotto.id } })).toBeNull()
  })

  it('rifiuta di cancellare un lotto con proposte già approvate', async () => {
    const venueId = await sedeDiSessione()
    const lotto = await prisma.reconciliationBatch.create({
      data: {
        venueId,
        dateFrom: new Date('2026-07-01'),
        dateTo: new Date('2026-07-31'),
        regoleUsate: ['R1'],
        contaApprovate: 1,
      },
    })

    const risposta = await callRoute<{ error?: string }, { id: string }>(
      DELETE,
      jsonRequest(`${PERCORSO}/${lotto.id}`, { method: 'DELETE' }),
      { id: lotto.id }
    )
    expect(risposta.status).toBe(409)
    expect(await prisma.reconciliationBatch.findUnique({ where: { id: lotto.id } })).not.toBeNull()
  })

  it('non cancella un lotto che esiste ma appartiene a un\'altra sede', async () => {
    await sedeDiSessione()
    const altraSede = await prisma.venue.create({
      data: { name: 'Sede di prova', code: 'PROVA-LOTTI-DELETE' },
    })
    const lottoAltrove = await prisma.reconciliationBatch.create({
      data: {
        venueId: altraSede.id,
        dateFrom: new Date('2026-07-01'),
        dateTo: new Date('2026-07-31'),
        regoleUsate: ['R1'],
      },
    })

    const risposta = await callRoute<{ error?: string }, { id: string }>(
      DELETE,
      jsonRequest(`${PERCORSO}/${lottoAltrove.id}`, { method: 'DELETE' }),
      { id: lottoAltrove.id }
    )
    expect(risposta.status).toBe(404)
    // Il 404 da solo non basta a provare che il DELETE non abbia comunque
    // attraversato il confine: qui si rilegge il lotto per esserne certi.
    expect(
      await prisma.reconciliationBatch.findUnique({ where: { id: lottoAltrove.id } })
    ).not.toBeNull()
  })
})
