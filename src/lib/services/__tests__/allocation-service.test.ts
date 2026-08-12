import { describe, it, expect, vi, beforeEach } from 'vitest'

// setEntryAllocations è tutto accesso al database: si mocca prisma e si
// osserva cosa scrive. $transaction esegue la callback passando il mock
// stesso come tx (pattern di schedule-reconciliation-service.test.ts).
//
// `$queryRaw` c'è perché il movimento viene bloccato con `SELECT … FOR UPDATE`
// prima di qualunque decisione: qui la riga risulta sempre trovata, e ciò che
// il lock protegge davvero — due richieste simultanee — sta in
// `allocation-service.itest.ts`, perché su un Prisma finto non esiste nulla da
// contendere.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    journalEntry: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    journalEntryAllocation: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      aggregate: vi.fn(),
    },
    account: { findMany: vi.fn() },
    costCenter: { findUnique: vi.fn(), findFirst: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/accounts/mapping', () => ({
  derivaBudgetCategoryDaConto: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { derivaBudgetCategoryDaConto } from '@/lib/accounts/mapping'
import {
  aggiornaContoDominante,
  calcolaPesiConIva,
  calcolaPesiDaRighe,
  contiScartatiConPeso,
  ripartisciProQuota,
  ripartisciProQuotaConIva,
  setEntryAllocations,
} from '../allocation-service'

describe('ripartisciProQuota', () => {
  it('quota piena: le fette restano identiche', () => {
    expect(
      ripartisciProQuota([{ accountId: 'a', importo: 700 }, { accountId: 'b', importo: 300 }], 1000)
    ).toEqual([{ accountId: 'a', importo: 700 }, { accountId: 'b', importo: 300 }])
  })

  it('quota parziale: pro-quota al centesimo', () => {
    expect(
      ripartisciProQuota([{ accountId: 'a', importo: 700 }, { accountId: 'b', importo: 300 }], 500)
    ).toEqual([{ accountId: 'a', importo: 350 }, { accountId: 'b', importo: 150 }])
  })

  it('gli arrotondamenti quadrano sull\'ultima fetta: la somma è sempre la quota', () => {
    const out = ripartisciProQuota(
      [{ accountId: 'a', importo: 33.33 }, { accountId: 'b', importo: 33.33 }, { accountId: 'c', importo: 33.34 }],
      50
    )
    const somma = out.reduce((s, f) => s + f.importo, 0)
    expect(Math.round(somma * 100) / 100).toBe(50)
    out.forEach((f) => expect(f.importo).toBe(Math.round(f.importo * 100) / 100))
  })

  it('fette che si azzerano vengono escluse', () => {
    const out = ripartisciProQuota(
      [{ accountId: 'a', importo: 1000 }, { accountId: 'b', importo: 0.01 }],
      0.5
    )
    expect(out.every((f) => f.importo > 0)).toBe(true)
    expect(Math.round(out.reduce((s, f) => s + f.importo, 0) * 100) / 100).toBe(0.5)
  })

  // La funzione dichiara «la somma restituita è SEMPRE esattamente la quota».
  // Non era vero: l'ultima fetta prendeva il resto, ma se il resto era
  // negativo — perché gli arrotondamenti delle fette precedenti avevano già
  // consumato più della quota — veniva buttato via invece che sottratto, e la
  // somma superava la quota. Il codice non poteva perdere denaro, solo
  // crearne, fino a circa mezzo centesimo per conto.
  describe('la somma è esattamente la quota, sempre', () => {
    const sommaCentesimi = (fette: ReturnType<typeof ripartisciProQuota>) =>
      fette.reduce((s, f) => s + Math.round(f.importo * 100), 0)

    const pesi = (importi: number[]) =>
      importi.map((importo, k) => ({ accountId: `conto-${k}`, importo }))

    it('nove conti di peso identico su cinque centesimi', () => {
      // Ogni fetta esatta varrebbe 5/9 = 0,55… cent, che Math.round porta a 1:
      // le prime otto ne prendevano 8 su una quota che ne valeva 5, e il resto
      // di −3 spariva. 0,08 € contro 0,05 €.
      expect(sommaCentesimi(ripartisciProQuota(pesi([1, 1, 1, 1, 1, 1, 1, 1, 1]), 0.05))).toBe(5)
    })

    it('undici conti con una riga di coda da un centesimo (il caso della relazione)', () => {
      const out = ripartisciProQuota(
        pesi([835.9, 830.73, 806.77, 719.39, 694.6, 547.51, 401.33, 219.16, 214.38, 105.97, 0.01]),
        731.34
      )
      expect(sommaCentesimi(out)).toBe(73134)
    })

    it('gli stessi conti senza la riga di coda: era già a posto e resta a posto', () => {
      const out = ripartisciProQuota(
        pesi([835.9, 830.73, 806.77, 719.39, 694.6, 547.51, 401.33, 219.16, 214.38, 105.97]),
        731.34
      )
      expect(sommaCentesimi(out)).toBe(73134)
    })

    // Il difetto non si trova generando pesi tutti dello stesso ordine di
    // grandezza: serve una coda minuscola accanto a molti conti, ed è il
    // motivo per cui una ricerca su 200.000 combinazioni può dare zero. Il
    // generatore qui sotto la produce di proposito, con un seme fisso perché
    // un fallimento resti riproducibile.
    it('50.000 ripartizioni con una riga di coda: nessuno sbilancio, nessuna fetta negativa', () => {
      let seme = 20260808
      const casuale = () => {
        seme = (seme * 1103515245 + 12345) % 2147483648
        return seme / 2147483648
      }

      const sbilanci: string[] = []
      for (let i = 0; i < 50_000; i++) {
        const conti = 3 + Math.floor(casuale() * 12)
        const importi = Array.from({ length: conti }, () =>
          Math.round((5 + casuale() * 895) * 100) / 100
        )
        importi.push(Math.max(0.01, Math.round(casuale() * 100) / 100))
        const quota = Math.round((50 + casuale() * 2950) * 100) / 100

        const out = ripartisciProQuota(pesi(importi), quota)
        const scarto = sommaCentesimi(out) - Math.round(quota * 100)
        if (scarto !== 0 || out.some((f) => f.importo <= 0)) {
          sbilanci.push(`quota ${quota} su [${importi.join(', ')}] → scarto ${scarto} cent`)
        }
      }

      expect(sbilanci.slice(0, 3)).toEqual([])
    })
  })
})

describe('calcolaPesiDaRighe', () => {
  it('raggruppa per conto, scarta i totali a zero o negativi, ordina per importo decrescente', () => {
    expect(
      calcolaPesiDaRighe([
        { accountId: 'b', importo: 100 },
        { accountId: 'a', importo: 400 },
        { accountId: 'b', importo: 200 },
        { accountId: 'c', importo: 0 },
        { accountId: 'd', importo: -50 },
      ])
    ).toEqual([
      { accountId: 'a', importo: 400 },
      { accountId: 'b', importo: 300 },
    ])
  })
})

describe('calcolaPesiConIva', () => {
  it('porta il lordo e l\'IVA esatta di ciascuna aliquota', () => {
    const pesi = calcolaPesiConIva([
      { accountId: 'alimentari', imponibile: 1000, aliquota: 10 },
      { accountId: 'pulizia', imponibile: 100, aliquota: 22 },
    ])

    expect(pesi).toEqual([
      { accountId: 'alimentari', importo: 1100, iva: 100 },
      { accountId: 'pulizia', importo: 122, iva: 22 },
    ])
  })

  it('somma le righe che vanno sullo stesso conto, IVA compresa', () => {
    const pesi = calcolaPesiConIva([
      { accountId: 'alimentari', imponibile: 1000, aliquota: 10 },
      { accountId: 'alimentari', imponibile: 500, aliquota: 4 },
    ])

    expect(pesi).toEqual([{ accountId: 'alimentari', importo: 1620, iva: 120 }])
  })

  it('azzera l\'IVA di TUTTE le fette se anche una sola riga non ha aliquota', () => {
    // Mescolare fette esatte e fette stimate darebbe un totale che non torna
    // con nessuna delle due logiche: meglio un'intera fattura dichiaratamente
    // approssimata.
    const pesi = calcolaPesiConIva([
      { accountId: 'alimentari', imponibile: 1000, aliquota: 10 },
      { accountId: 'pulizia', imponibile: 100, aliquota: undefined },
    ])

    expect(pesi.every((p) => p.iva === null)).toBe(true)
    // Senza aliquota il lordo di quella riga è l'imponibile stesso.
    expect(pesi.find((p) => p.accountId === 'pulizia')?.importo).toBe(100)
  })

  it('la riga di sconto negativa sparisce dai pesi, e l\'IVA delle rimaste resta dichiarata', () => {
    // Una riga a `PrezzoTotale` negativo — il parser non normalizza il segno —
    // porta il suo conto sotto zero e il filtro lo scarta. Documenta la scelta
    // misurata: le fette rimaste tengono la loro IVA anziché azzerarla tutta.
    // Su questo documento (978 lordi, 78 di IVA) tenerla dichiara 88,91 alla
    // riconciliazione, cioè 10,91 di troppo; azzerarla ne farebbe dichiarare
    // zero, perché una fetta senza IVA lascia senza IVA anche la testata e il
    // ripiego pro-quota finisce per dividere zero. Settantotto contro undici.
    const pesi = calcolaPesiConIva([
      { accountId: 'alimentari', imponibile: 1000, aliquota: 10 },
      { accountId: 'sconti', imponibile: -100, aliquota: 22 },
    ])

    expect(pesi.map((p) => p.accountId)).toEqual(['alimentari'])
    expect(pesi[0]).toEqual({ accountId: 'alimentari', importo: 1100, iva: 100 })
  })

  it('conta come scartato solo il conto che si portava via qualcosa', () => {
    // La riga negativa toglie davvero qualcosa alla somma; la riga in omaggio
    // e il conto che si annulla da sé no. Un avviso che grida quando non è
    // successo niente insegna a ignorarlo, e il primo caso vero passerebbe
    // inosservato.
    expect(
      contiScartatiConPeso([
        { accountId: 'alimentari', imponibile: 1000, aliquota: 10 },
        { accountId: 'sconti', imponibile: -100, aliquota: 22 },
      ])
    ).toBe(1)

    expect(
      contiScartatiConPeso([
        { accountId: 'alimentari', imponibile: 1000, aliquota: 10 },
        { accountId: 'omaggi', imponibile: 0, aliquota: 22 },
        { accountId: 'resi', imponibile: 50, aliquota: 22 },
        { accountId: 'resi', imponibile: -50, aliquota: 22 },
      ])
    ).toBe(0)
  })

  it('un conto che si annulla da sé sparisce senza portarsi via nulla', () => {
    // Riga e suo storno sullo stesso conto: importo e IVA si azzerano a
    // vicenda, quindi lo scarto non toglie niente alla somma del documento.
    const pesi = calcolaPesiConIva([
      { accountId: 'alimentari', imponibile: 1000, aliquota: 10 },
      { accountId: 'resi', imponibile: 50, aliquota: 22 },
      { accountId: 'resi', imponibile: -50, aliquota: 22 },
    ])

    expect(pesi).toEqual([{ accountId: 'alimentari', importo: 1100, iva: 100 }])
  })
})

describe('ripartisciProQuotaConIva', () => {
  it('scala l\'IVA con la stessa frazione dell\'importo su un pagamento parziale', () => {
    const fette = ripartisciProQuotaConIva(
      [
        { accountId: 'alimentari', importo: 1100, iva: 100 },
        { accountId: 'pulizia', importo: 122, iva: 22 },
      ],
      611 // metà esatta di 1222
    )

    expect(fette).toEqual([
      { accountId: 'alimentari', importo: 550, iva: 50 },
      { accountId: 'pulizia', importo: 61, iva: 11 },
    ])
  })

  it('propaga il null senza inventare uno zero', () => {
    const fette = ripartisciProQuotaConIva(
      [{ accountId: 'alimentari', importo: 1000, iva: null }],
      500
    )

    expect(fette).toEqual([{ accountId: 'alimentari', importo: 500, iva: null }])
  })

  it('il peso che si azzera nell\'arrotondamento porta via meno di un millesimo di IVA', () => {
    // La fetta si perde solo se vale meno di un centesimo della quota, quindi
    // l'IVA che si porta dietro è al massimo l'aliquota di un centesimo: qui
    // 0,0022 €. Le rimaste tengono la propria, che resta esatta al centesimo.
    const fette = ripartisciProQuotaConIva(
      [
        { accountId: 'alimentari', importo: 1000, iva: 90.91 },
        { accountId: 'imballo', importo: 0.01, iva: 0.0022 },
      ],
      0.5
    )

    expect(fette).toEqual([{ accountId: 'alimentari', importo: 0.5, iva: 0.05 }])
  })
})

describe('setEntryAllocations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.$transaction).mockImplementation(
      async (cb: unknown) => (cb as (tx: typeof prisma) => Promise<unknown>)(prisma)
    )
    // Il `SELECT … FOR UPDATE` di bloccaMovimento trova la riga: senza questo
    // il movimento risulterebbe inesistente in ogni test.
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: 'entry-1' }] as never)
    // Di default il movimento non ha fette ereditate: la guardia di
    // quadratura (manuali + ereditate ≤ importo utile) è un no-op silenzioso.
    vi.mocked(prisma.journalEntryAllocation.aggregate).mockResolvedValue({
      _sum: { importo: null },
    } as never)
    // Il centro del movimento: di default nessuna fetta lo pretende, quindi
    // la risoluzione cade sul centro di default e la suddivisione passa.
    vi.mocked(prisma.costCenter.findFirst).mockResolvedValue({
      id: 'cc-str', isDefault: true, isActive: true,
    } as never)
  })

  it('scrive le fette, il conto dominante e la source split', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
    } as never)
    // Non c'erano allocazioni manuali preesistenti
    vi.mocked(prisma.journalEntryAllocation.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-a', isActive: true }, { id: 'conto-b', isActive: true },
    ] as never)
    // Dentro la transazione, dopo la scrittura, si rileggono TUTTE le fette
    // rimaste: qui simuliamo che siano proprio quelle appena create.
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([
      { accountId: 'conto-a', importo: new Prisma.Decimal(700) },
      { accountId: 'conto-b', importo: new Prisma.Decimal(300) },
    ] as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-a')

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [
        { accountId: 'conto-a', importo: 700, note: 'quota affitto' },
        { accountId: 'conto-b', importo: 300 },
      ],
    })

    expect(esito).toEqual({ outcome: 'ok', allocazioni: 2 })
    expect(prisma.journalEntryAllocation.deleteMany).toHaveBeenCalledWith({
      where: { journalEntryId: 'entry-1', origine: 'manuale' },
    })
    expect(prisma.journalEntryAllocation.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ accountId: 'conto-a', note: 'quota affitto' }),
        expect.objectContaining({ accountId: 'conto-b', note: null }),
      ]),
    })
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'conto-a', // dominante (700 > 300)
          budgetCategoryId: 'cat-a',
          categorizationSource: 'split',
        }),
      })
    )
  })

  it("somma oltre l'importo utile: invalid", async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
    } as never)

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [
        { accountId: 'conto-a', importo: 700 },
        { accountId: 'conto-b', importo: 400 },
      ],
    })

    expect(esito).toEqual({
      outcome: 'invalid',
      motivo: expect.stringContaining("supera l'importo del movimento"),
    })
    expect(prisma.account.findMany).not.toHaveBeenCalled()
    expect(prisma.journalEntryAllocation.deleteMany).not.toHaveBeenCalled()
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })

  it('somma manuali nuove + fette ereditate già a DB oltre l\'importo utile: invalid', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
    } as never)
    // Il movimento ha già 700 di fette ereditate dalla riconciliazione (Fase 3):
    // da sole le fette manuali proposte (400) starebbero nel limite, ma sommate
    // alle ereditate esistenti sforano l'importo utile.
    vi.mocked(prisma.journalEntryAllocation.aggregate).mockResolvedValue({
      _sum: { importo: new Prisma.Decimal(700) },
    } as never)

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [{ accountId: 'conto-a', importo: 400 }],
    })

    expect(esito).toEqual({
      outcome: 'invalid',
      motivo: expect.stringContaining("supera l'importo del movimento"),
    })
    expect(prisma.journalEntryAllocation.aggregate).toHaveBeenCalledWith({
      where: { journalEntryId: 'entry-1', origine: 'ereditata' },
      _sum: { importo: true },
    })
    expect(prisma.account.findMany).not.toHaveBeenCalled()
    expect(prisma.journalEntryAllocation.deleteMany).not.toHaveBeenCalled()
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
  })

  it('conto inesistente o non attivo: invalid', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
    } as never)
    // Ne chiediamo 2, ne torna solo 1: uno dei due conti non esiste o non è attivo.
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-a', isActive: true },
    ] as never)

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [
        { accountId: 'conto-a', importo: 700 },
        { accountId: 'conto-inesistente', importo: 300 },
      ],
    })

    expect(esito).toEqual({
      outcome: 'invalid',
      motivo: expect.stringContaining('non esistono o non sono attivi'),
    })
    expect(prisma.journalEntryAllocation.deleteMany).not.toHaveBeenCalled()
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })

  it('array vuoto su movimento SENZA fette manuali preesistenti: no-op', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
    } as never)
    // deleteMany ritorna count: 0 perché il movimento non aveva allocazioni manuali
    vi.mocked(prisma.journalEntryAllocation.deleteMany).mockResolvedValue({ count: 0 } as never)
    // Nemmeno allocazioni ereditate: findMany non viene nemmeno chiamato in caso di no-op
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([] as never)

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [],
    })

    expect(esito).toEqual({ outcome: 'ok', allocazioni: 0 })
    expect(prisma.account.findMany).not.toHaveBeenCalled()
    expect(prisma.journalEntryAllocation.deleteMany).toHaveBeenCalledWith({
      where: { journalEntryId: 'entry-1', origine: 'manuale' },
    })
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
    // Il movimento non aveva fette manuali, quindi NON deve fare update (no-op)
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })

  it('array vuoto: rimuove le manuali e ripristina la source manual', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
    } as never)
    // deleteMany ritorna count: 1 perché è stato rimosso 1 allocazione manuale
    vi.mocked(prisma.journalEntryAllocation.deleteMany).mockResolvedValue({ count: 1 } as never)
    // Dopo la delete delle manuali non restano più fette (nessuna ereditata).
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([] as never)

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [],
    })

    expect(esito).toEqual({ outcome: 'ok', allocazioni: 0 })
    expect(prisma.account.findMany).not.toHaveBeenCalled()
    expect(prisma.journalEntryAllocation.deleteMany).toHaveBeenCalledWith({
      where: { journalEntryId: 'entry-1', origine: 'manuale' },
    })
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { categorizationSource: 'manual' },
      })
    )
  })

  it('fetta su un conto OBBLIGATORIO e movimento senza centro: invalid, non si scrive nulla', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null, costCenterId: null,
    } as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-a', isActive: true, code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ] as never)

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [{ accountId: 'conto-a', importo: 500 }],
    })

    expect(esito).toEqual({
      outcome: 'invalid',
      motivo: 'Scegli il centro di costo del movimento prima di suddividerlo.',
    })
    expect(prisma.journalEntryAllocation.deleteMany).not.toHaveBeenCalled()
    expect(prisma.journalEntryAllocation.createMany).not.toHaveBeenCalled()
    expect(prisma.journalEntry.update).not.toHaveBeenCalled()
  })

  it('stessa fetta OBBLIGATORIO ma movimento con centro: la suddivisione passa', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
      costCenterId: 'cc-produzione',
    } as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-a', isActive: true, code: '620010', name: 'Manutenzioni', costCenterRule: 'OBBLIGATORIO' },
    ] as never)
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-produzione', isActive: true,
    } as never)
    vi.mocked(prisma.journalEntryAllocation.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([
      { accountId: 'conto-a', importo: new Prisma.Decimal(500) },
    ] as never)

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [{ accountId: 'conto-a', importo: 500 }],
    })

    expect(esito).toEqual({ outcome: 'ok', allocazioni: 1 })
    expect(prisma.journalEntryAllocation.createMany).toHaveBeenCalled()
    // Il centro resta quello del movimento: la suddivisione non lo tocca.
    expect(vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data).not.toHaveProperty(
      'costCenterId'
    )
  })

  it('rimuovere la suddivisione non passa dalla validazione del centro', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null, costCenterId: null,
    } as never)
    vi.mocked(prisma.journalEntryAllocation.deleteMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([] as never)

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [],
    })

    expect(esito).toEqual({ outcome: 'ok', allocazioni: 0 })
    expect(prisma.costCenter.findFirst).not.toHaveBeenCalled()
    expect(prisma.costCenter.findUnique).not.toHaveBeenCalled()
  })

  it('le fette ereditate non si toccano: il dominante si calcola su tutte', async () => {
    vi.mocked(prisma.journalEntry.findFirst).mockResolvedValue({
      id: 'entry-1', creditAmount: new Prisma.Decimal(1000), debitAmount: null,
    } as never)
    // C'era una fetta manuale precedente che viene rimossa
    vi.mocked(prisma.journalEntryAllocation.deleteMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-a', isActive: true },
    ] as never)
    // deleteMany tocca solo le 'manuale': quella 'ereditata' resta e viene
    // riletta insieme alla nuova fetta manuale appena scritta.
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([
      { accountId: 'conto-a', importo: new Prisma.Decimal(200) },
      { accountId: 'conto-ereditato', importo: new Prisma.Decimal(800) },
    ] as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-ereditata')

    const esito = await setEntryAllocations({
      journalEntryId: 'entry-1', venueId: 'venue-1', userId: 'user-1',
      fette: [{ accountId: 'conto-a', importo: 200 }],
    })

    expect(esito).toEqual({ outcome: 'ok', allocazioni: 2 })
    expect(prisma.journalEntryAllocation.deleteMany).toHaveBeenCalledWith({
      where: { journalEntryId: 'entry-1', origine: 'manuale' },
    })
    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'conto-ereditato', // dominante (800 > 200), non toccata dal delete
          budgetCategoryId: 'cat-ereditata',
          categorizationSource: 'split',
        }),
      })
    )
  })
})

/**
 * Il conto può arrivare DOPO il centro: il movimento nasce dall'import senza
 * conto, prende il centro che si dà a chi non ne ha uno, e solo alla
 * riconciliazione eredita dalla fattura un conto che un centro lo pretendeva.
 * In quel momento il centro va rivalutato — senza però sovrascrivere una
 * scelta umana.
 */
describe('aggiornaContoDominante — percorso automatico', () => {
  const STR = { id: 'cc-str', code: 'STR', isDefault: true, isActive: true }
  const WEISS = { id: 'cc-weiss', code: 'WEISS', isDefault: false, isActive: true }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.journalEntryAllocation.findMany).mockResolvedValue([
      { accountId: 'conto-birra', importo: new Prisma.Decimal(700) },
      { accountId: 'conto-vino', importo: new Prisma.Decimal(300) },
    ] as never)
    vi.mocked(derivaBudgetCategoryDaConto).mockResolvedValue('cat-birra')
    vi.mocked(prisma.costCenter.findFirst).mockImplementation(
      (async ({ where }: { where: { isDefault?: boolean; code?: string } }) =>
        where.code === 'WEISS' ? WEISS : where.isDefault ? STR : null) as never
    )
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-birra', code: '600020', name: 'Acquisti bevande', costCenterRule: 'OBBLIGATORIO' },
    ] as never)
  })

  it('conto dominante OBBLIGATORIO su un movimento fermo al centro di sistema: passa al centro operativo e resta da verificare', async () => {
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      costCenterId: 'cc-str',
    } as never)

    const fette = await aggiornaContoDominante(prisma as never, 'entry-1', 'automatico')

    expect(fette).toBe(2)
    expect(prisma.journalEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: {
        accountId: 'conto-birra',
        budgetCategoryId: 'cat-birra',
        categorizationSource: 'split',
        costCenterId: 'cc-weiss',
        costCenterSource: 'supposto',
        verified: false,
      },
    })
  })

  it('movimento senza centro: il centro operativo lo riempie', async () => {
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({ costCenterId: null } as never)

    await aggiornaContoDominante(prisma as never, 'entry-1', 'automatico')

    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costCenterId: 'cc-weiss', verified: false }),
      })
    )
  })

  it('centro scelto da un umano (CAS): non viene toccato, ma il movimento torna da verificare', async () => {
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      costCenterId: 'cc-cas',
    } as never)
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-cas', isActive: true,
    } as never)

    await aggiornaContoDominante(prisma as never, 'entry-1', 'automatico')

    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costCenterId: 'cc-cas', verified: false }),
      })
    )
  })

  it('conto dominante con regola DEFAULT_STR: il centro di sistema resta quello giusto', async () => {
    vi.mocked(prisma.account.findMany).mockResolvedValue([
      { id: 'conto-birra', code: '240010', name: 'Consulenze', costCenterRule: 'DEFAULT_STR' },
    ] as never)
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      costCenterId: 'cc-str',
    } as never)

    await aggiornaContoDominante(prisma as never, 'entry-1', 'automatico')

    expect(prisma.journalEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costCenterId: 'cc-str', verified: false }),
      })
    )
  })

  it('centro del movimento nel frattempo disattivato: il conto si aggiorna, il centro resta com\'è e si logga', async () => {
    vi.mocked(prisma.journalEntry.findUnique).mockResolvedValue({
      costCenterId: 'cc-dismesso',
    } as never)
    vi.mocked(prisma.costCenter.findUnique).mockResolvedValue({
      id: 'cc-dismesso', isActive: false,
    } as never)

    await aggiornaContoDominante(prisma as never, 'entry-1', 'automatico')

    const dati = vi.mocked(prisma.journalEntry.update).mock.calls[0][0].data as Record<string, unknown>
    expect(dati).not.toHaveProperty('costCenterId')
    expect(dati.verified).toBe(false)
    expect(logger.warn).toHaveBeenCalledWith(
      'Centro non rivalutabile dopo il conto dominante: si lascia quello del movimento',
      expect.objectContaining({ journalEntryId: 'entry-1' })
    )
  })

  it('percorso interattivo (default): centro e stato di verifica non si toccano', async () => {
    await aggiornaContoDominante(prisma as never, 'entry-1')

    expect(prisma.journalEntry.findUnique).not.toHaveBeenCalled()
    expect(prisma.journalEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: {
        accountId: 'conto-birra',
        budgetCategoryId: 'cat-birra',
        categorizationSource: 'split',
      },
    })
  })
})
