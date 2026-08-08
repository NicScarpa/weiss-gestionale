import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { Session } from 'next-auth'
import { PATCH } from '../route'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    journalEntry: { findUnique: vi.fn(), update: vi.fn() },
    account: { findMany: vi.fn() },
    costCenter: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/audit', () => ({
  createAuditLog: vi.fn(),
}))

vi.mock('@/lib/accounts/mapping', () => ({
  derivaBudgetCategoryDaConto: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { derivaBudgetCategoryDaConto } from '@/lib/accounts/mapping'
import { createAuditLog } from '@/lib/audit'

const sessione = { user: { id: 'user-1', role: 'admin' } } as unknown as Session
const sessioneManager = { user: { id: 'user-2', role: 'manager' } } as unknown as Session

function patchCon(body: Record<string, unknown>) {
  const request = new NextRequest('http://localhost:3000/api/prima-nota/entry-1/categorize', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
  return { request, context: { params: Promise.resolve({ id: 'entry-1' }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue(sessione as never)
  vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
    id: 'entry-1',
    costCenterId: null,
    closureId: null,
    _count: { allocations: 0 },
  } as never)
  // Conto che non pretende un centro: la risoluzione cade sul default (STR).
  vi.mocked(prisma.account.findMany).mockResolvedValue([
    { id: 'conto-1', code: '710010', name: 'Vendite bar', costCenterRule: 'DEFAULT_STR' },
  ] as never)
  vi.mocked(prisma.costCenter.findFirst).mockResolvedValue({
    id: 'cc-str', isDefault: true, isActive: true,
  } as never)
})

describe('PATCH /api/prima-nota/[id]/categorize - la categoria si deriva dal conto', () => {
  it('con accountId la categoria si deriva dal conto', async () => {
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-derivata')
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ accountId: 'conto-1' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'conto-1',
          budgetCategoryId: 'cat-derivata',
          categorizationSource: 'manual',
        }),
      })
    )
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: expect.objectContaining({ budgetCategoryId: 'cat-derivata' }),
      })
    )
  })

  it('il conto vince: budgetCategoryId esplicito ignorato se c\'è accountId', async () => {
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-derivata')
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ accountId: 'conto-1', budgetCategoryId: 'cat-esplicita' })
    await PATCH(request, context)

    const data = vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data
    expect(data.budgetCategoryId).toBe('cat-derivata')
  })

  it('conto non mappato: la categoria derivata è null', async () => {
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue(null)
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ accountId: 'conto-1' })
    await PATCH(request, context)

    expect(vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data.budgetCategoryId).toBeNull()
  })

  it('corpo vuoto: la categoria non si tocca, non si azzera', async () => {
    // Un corpo senza campi non è una richiesta di cancellare la categoria.
    // Il caso è raggiungibile anche sui movimenti da chiusura, dove il
    // filtro sulle chiavi lascia passare proprio perché non ci sono chiavi.
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({})
    await PATCH(request, context)

    const data = vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data
    expect(data.budgetCategoryId).toBeUndefined()
  })

  it('senza conto, la categoria esplicita resta accettata (transizione)', async () => {
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ budgetCategoryId: 'cat-1' })
    await PATCH(request, context)

    const data = vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data
    expect(data.budgetCategoryId).toBe('cat-1')
    expect(derivaBudgetCategoryDaConto).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/prima-nota/[id]/categorize - il centro di costo del nuovo conto', () => {
  it('il conto non pretende un centro: il movimento prende il default', async () => {
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-derivata')
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ accountId: 'conto-1' })
    await PATCH(request, context)

    expect(vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data.costCenterId).toBe('cc-str')
  })

  it('conto OBBLIGATORIO su un movimento senza centro: 400 con il code e nessuna scrittura', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-1', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ] as never)

    const { request, context } = patchCon({ accountId: 'conto-1' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('Il conto 620010 — Manutenzioni richiede un centro di costo.')
    expect(body.code).toBe('CENTRO_DI_COSTO_OBBLIGATORIO')
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })

  it('stesso conto OBBLIGATORIO ma il movimento ha già un centro: passa e lo conserva', async () => {
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      id: 'entry-1',
      costCenterId: 'cc-produzione',
      _count: { allocations: 0 },
    } as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-1', code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ] as never)
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-produzione', isActive: true,
    } as never)
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ accountId: 'conto-1' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data.costCenterId).toBe(
      'cc-produzione'
    )
  })

  it('senza conto nel corpo il centro non si tocca', async () => {
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ budgetCategoryId: 'cat-1' })
    await PATCH(request, context)

    expect(vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data.costCenterId).toBeUndefined()
    expect(vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data.costCenterSource).toBeUndefined()
    expect(prisma.costCenter.findFirst).not.toHaveBeenCalled()
  })

  it('il centro si scrive sempre con la sua provenienza, altrimenti passa per indovinato', async () => {
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-derivata')
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ accountId: 'conto-1' })
    await PATCH(request, context)

    // Conto senza obbligo di centro: la regola del piano manda su STR, e la
    // provenienza lo dice ('piano'), così una rivalutazione successiva sa che
    // quel centro seguiva il conto di prima e non una scelta di qualcuno.
    expect(vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data).toMatchObject({
      costCenterId: 'cc-str',
      costCenterSource: 'piano',
    })
  })

  it('anche su un movimento da chiusura il centro scritto porta la sua provenienza', async () => {
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      id: 'entry-1',
      costCenterId: 'cc-produzione',
      closureId: 'chiusura-1',
      _count: { allocations: 0 },
    } as never)
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-produzione', isActive: true,
    } as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-derivata')
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ accountId: 'conto-1' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    // Il perimetro ristretto dei movimenti da chiusura riguarda le chiavi
    // ammesse nel body, non i campi che il server deriva: se scrive il centro
    // deve scriverne anche la provenienza, o resta il buco che la colonna
    // serve a chiudere.
    expect(vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data).toMatchObject({
      costCenterId: 'cc-produzione',
      costCenterSource: 'scelto',
    })
  })
})

describe('PATCH /api/prima-nota/[id]/categorize - un movimento da chiusura segue il gate admin', () => {
  it('manager su movimento da chiusura: 403 e update mai chiamato', async () => {
    vi.mocked(auth).mockResolvedValue(sessioneManager as never)
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      id: 'entry-1',
      costCenterId: null,
      closureId: 'chiusura-1',
      _count: { allocations: 0 },
    } as never)

    const { request, context } = patchCon({ accountId: 'conto-1' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error).toBe('Solo un amministratore può riclassificare i movimenti generati da chiusura')
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })

  it('admin su movimento da chiusura: procede normalmente', async () => {
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      id: 'entry-1',
      costCenterId: null,
      closureId: 'chiusura-1',
      _count: { allocations: 0 },
    } as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-derivata')
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ accountId: 'conto-1' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    expect(prisma.journalEntry.update).toHaveBeenCalled()
  })
})

describe('PATCH /api/prima-nota/[id]/categorize - su un movimento da chiusura scrive solo conto (difetto: perimetro diverso dal PUT)', () => {
  // Prima della correzione, superato il gate di ruolo, la route scriveva
  // sempre anche notes, categorizationSource e verified: true — campi che
  // PUT /api/prima-nota/[id] rifiuta con 400 per lo stesso movimento da
  // chiusura. Due strade sullo stesso oggetto con regole diverse, che
  // nessuno aveva deciso.

  it('admin su movimento da chiusura: la scrittura non include notes, categorizationSource né verified', async () => {
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      id: 'entry-1',
      costCenterId: null,
      closureId: 'chiusura-1',
      _count: { allocations: 0 },
    } as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-derivata')
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ accountId: 'conto-1' })
    await PATCH(request, context)

    const data = vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data
    expect(data).not.toHaveProperty('notes')
    expect(data).not.toHaveProperty('categorizationSource')
    expect(data).not.toHaveProperty('verified')
    // Il conto resta scrivibile, come nel PUT; budgetCategoryId, centro di
    // costo e la sua provenienza sono conseguenza automatica di accountId,
    // non campi scelti a parte (questa route non ha mai avuto un campo
    // costCenterId proprio). 'piano': il conto ha regola DEFAULT_STR, non è
    // una supposizione del sistema.
    expect(data).toMatchObject({
      accountId: 'conto-1',
      budgetCategoryId: 'cat-derivata',
      costCenterSource: 'piano',
    })
  })

  it('admin su movimento da chiusura con costCenterId nel body (mai stato un campo di questa route): 400, fuori perimetro', async () => {
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      id: 'entry-1',
      costCenterId: 'cc-vecchio',
      closureId: 'chiusura-1',
      _count: { allocations: 0 },
    } as never)

    const { request, context } = patchCon({ costCenterId: 'cc-nuovo' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(400)
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })

  it('admin su movimento da chiusura con un campo fuori perimetro (notes): 400 con lo stesso code del PUT, update mai chiamato', async () => {
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      id: 'entry-1',
      costCenterId: null,
      closureId: 'chiusura-1',
      _count: { allocations: 0 },
    } as never)

    const { request, context } = patchCon({ accountId: 'conto-1', notes: 'nota manuale' })
    const response = await PATCH(request, context)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.code).toBe('MOVIMENTO_DA_CHIUSURA_SOLO_RICLASSIFICA')
    expect(body.error).toBe(
      'Sui movimenti generati da chiusura si possono modificare solo conto e centro di costo.'
    )
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })

  it('admin su movimento da chiusura con budgetCategoryId esplicito (senza accountId): 400, fuori perimetro', async () => {
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      id: 'entry-1',
      costCenterId: null,
      closureId: 'chiusura-1',
      _count: { allocations: 0 },
    } as never)

    const { request, context } = patchCon({ budgetCategoryId: 'cat-1' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(400)
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })

  it('un movimento NON da chiusura mantiene il comportamento pieno (notes, categorizationSource, verified)', async () => {
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      id: 'entry-1',
      costCenterId: null,
      closureId: null,
      _count: { allocations: 0 },
    } as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-derivata')
    vi.mocked(prisma.journalEntry.update).mockResolvedValue({ id: 'entry-1' } as never)

    const { request, context } = patchCon({ accountId: 'conto-1', notes: 'nota manuale' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(200)
    const data = vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data
    expect(data).toMatchObject({
      notes: 'nota manuale',
      categorizationSource: 'manual',
      verified: true,
      costCenterSource: 'piano',
    })
  })
})

describe('PATCH /api/prima-nota/[id]/categorize - un movimento suddiviso in fette è protetto', () => {
  it('movimento con fette: 409 e update mai chiamato', async () => {
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      id: 'entry-1',
      _count: { allocations: 2 },
    } as never)

    const { request, context } = patchCon({ budgetCategoryId: 'cat-1' })
    const response = await PATCH(request, context)

    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.error).toBe('Il movimento è suddiviso in fette: rimuovi prima la suddivisione')
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })
})
