import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma: il matching è puro, ma i resolver leggono regole e conti dal DB
vi.mock('@/lib/prisma', () => ({
  prisma: {
    scheduleRule: { findMany: vi.fn() },
    account: { findUnique: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  trovaRegolaApplicabile,
  tipoDocumentoDaCodiceSdi,
  tipoPagamentoDaCodiceSdi,
  risolviContoDaRegole,
  type MatchableScheduleRule,
} from '../engine'
import {
  ScheduleDocumentType,
  SchedulePaymentMethod,
  ScheduleRuleDirection,
} from '@/types/schedule'

function regola(overrides: Partial<MatchableScheduleRule> & { id: string }): MatchableScheduleRule {
  return {
    direzione: ScheduleRuleDirection.RICEVUTI,
    tipoDocumento: null,
    tipoPagamento: null,
    azione: 'crea_riconcilia_movimento',
    contoId: `conto-${overrides.id}`,
    ordine: 0,
    isActive: true,
    ...overrides,
  }
}

describe('trovaRegolaApplicabile - matching per direzione', () => {
  it('ignora le regole di direzione diversa', () => {
    const rules = [
      regola({ id: 'emessi', direzione: ScheduleRuleDirection.EMESSI, ordine: 0 }),
      regola({ id: 'ricevuti', direzione: ScheduleRuleDirection.RICEVUTI, ordine: 1 }),
    ]

    const match = trovaRegolaApplicabile(
      { direzione: ScheduleRuleDirection.RICEVUTI },
      rules
    )

    expect(match?.rule.id).toBe('ricevuti')
  })

  it('restituisce null se nessuna regola ha la direzione richiesta', () => {
    const rules = [regola({ id: 'a', direzione: ScheduleRuleDirection.EMESSI })]

    expect(
      trovaRegolaApplicabile({ direzione: ScheduleRuleDirection.RICEVUTI }, rules)
    ).toBeNull()
  })
})

describe('trovaRegolaApplicabile - criteri jolly', () => {
  it('un criterio null sulla regola accetta qualsiasi valore', () => {
    const rules = [
      regola({ id: 'jolly', tipoDocumento: null, tipoPagamento: null }),
    ]

    const match = trovaRegolaApplicabile(
      {
        direzione: ScheduleRuleDirection.RICEVUTI,
        tipoDocumento: ScheduleDocumentType.FATTURA_ACQUISTO,
        tipoPagamento: SchedulePaymentMethod.BONIFICO,
      },
      rules
    )

    expect(match?.rule.id).toBe('jolly')
  })

  it('un criterio valorizzato richiede uguaglianza esatta', () => {
    const rules = [
      regola({ id: 'bonifico', tipoPagamento: SchedulePaymentMethod.BONIFICO }),
    ]

    expect(
      trovaRegolaApplicabile(
        {
          direzione: ScheduleRuleDirection.RICEVUTI,
          tipoPagamento: SchedulePaymentMethod.RIBA,
        },
        rules
      )
    ).toBeNull()
  })

  it('una regola con criterio valorizzato non matcha un documento privo di quel dato', () => {
    const rules = [
      regola({ id: 'con-tipo-doc', tipoDocumento: ScheduleDocumentType.UTENZA }),
    ]

    expect(
      trovaRegolaApplicabile(
        { direzione: ScheduleRuleDirection.RICEVUTI, tipoDocumento: null },
        rules
      )
    ).toBeNull()
  })

  it('richiede che tutti i criteri valorizzati siano soddisfatti insieme', () => {
    const rules = [
      regola({
        id: 'doppio-criterio',
        tipoDocumento: ScheduleDocumentType.FATTURA_ACQUISTO,
        tipoPagamento: SchedulePaymentMethod.BONIFICO,
      }),
    ]

    const contesto = {
      direzione: ScheduleRuleDirection.RICEVUTI,
      tipoDocumento: ScheduleDocumentType.FATTURA_ACQUISTO,
      tipoPagamento: SchedulePaymentMethod.CONTANTI,
    }

    expect(trovaRegolaApplicabile(contesto, rules)).toBeNull()
    expect(
      trovaRegolaApplicabile(
        { ...contesto, tipoPagamento: SchedulePaymentMethod.BONIFICO },
        rules
      )?.rule.id
    ).toBe('doppio-criterio')
  })
})

describe('trovaRegolaApplicabile - ordine di priorità', () => {
  const contesto = {
    direzione: ScheduleRuleDirection.RICEVUTI,
    tipoDocumento: ScheduleDocumentType.FATTURA_ACQUISTO,
    tipoPagamento: SchedulePaymentMethod.BONIFICO,
  }

  it('vince la prima regola che corrisponde, non la più specifica', () => {
    const rules = [
      regola({ id: 'generica', ordine: 0 }),
      regola({
        id: 'specifica',
        ordine: 1,
        tipoDocumento: ScheduleDocumentType.FATTURA_ACQUISTO,
        tipoPagamento: SchedulePaymentMethod.BONIFICO,
      }),
    ]

    expect(trovaRegolaApplicabile(contesto, rules)?.rule.id).toBe('generica')
  })

  it('spostando la regola specifica sopra la generica cambia il risultato', () => {
    const rules = [
      regola({ id: 'generica', ordine: 1 }),
      regola({
        id: 'specifica',
        ordine: 0,
        tipoDocumento: ScheduleDocumentType.FATTURA_ACQUISTO,
        tipoPagamento: SchedulePaymentMethod.BONIFICO,
      }),
    ]

    expect(trovaRegolaApplicabile(contesto, rules)?.rule.id).toBe('specifica')
  })

  it('non dipende dall ordine con cui le regole vengono passate', () => {
    const prima = regola({ id: 'prima', ordine: 0 })
    const seconda = regola({ id: 'seconda', ordine: 1 })

    expect(trovaRegolaApplicabile(contesto, [seconda, prima])?.rule.id).toBe('prima')
  })
})

describe('trovaRegolaApplicabile - regole disattivate', () => {
  it('salta le regole con isActive false e passa alla successiva', () => {
    const rules = [
      regola({ id: 'disattivata', ordine: 0, isActive: false }),
      regola({ id: 'attiva', ordine: 1 }),
    ]

    expect(
      trovaRegolaApplicabile({ direzione: ScheduleRuleDirection.RICEVUTI }, rules)?.rule.id
    ).toBe('attiva')
  })

  it('considera attiva una regola senza il campo isActive', () => {
    const rules = [{ ...regola({ id: 'senza-flag' }), isActive: undefined }]

    expect(
      trovaRegolaApplicabile({ direzione: ScheduleRuleDirection.RICEVUTI }, rules)?.rule.id
    ).toBe('senza-flag')
  })
})

describe('trovaRegolaApplicabile - esito', () => {
  it('riporta azione e conti della regola vincente', () => {
    const rules = [
      regola({ id: 'a', ordine: 0, azione: 'crea_riconcilia_movimento', contoId: 'conto-1' }),
    ]

    expect(trovaRegolaApplicabile({ direzione: ScheduleRuleDirection.RICEVUTI }, rules)).toEqual({
      rule: rules[0],
      azione: 'crea_riconcilia_movimento',
      contoId: 'conto-1',
      bankAccountId: null,
    })
  })

  it('riporta il conto bancario su cui creare il movimento', () => {
    // È il conto della regola che conta: quello contabile viene dal fornitore
    const rules = [
      regola({ id: 'a', ordine: 0, azione: 'crea_riconcilia_movimento', bankAccountId: 'banca-1' }),
    ]

    const match = trovaRegolaApplicabile({ direzione: ScheduleRuleDirection.RICEVUTI }, rules)
    expect(match?.bankAccountId).toBe('banca-1')
  })

  it('restituisce null con una lista vuota', () => {
    expect(trovaRegolaApplicabile({ direzione: ScheduleRuleDirection.EMESSI }, [])).toBeNull()
  })
})

describe('tipoDocumentoDaCodiceSdi', () => {
  it('traduce le note di credito e di debito', () => {
    expect(tipoDocumentoDaCodiceSdi('TD04', ScheduleRuleDirection.RICEVUTI)).toBe(
      ScheduleDocumentType.NOTA_CREDITO
    )
    expect(tipoDocumentoDaCodiceSdi('TD05', ScheduleRuleDirection.RICEVUTI)).toBe(
      ScheduleDocumentType.NOTA_DEBITO
    )
  })

  it('distingue fattura di acquisto e di vendita dalla direzione', () => {
    expect(tipoDocumentoDaCodiceSdi('TD01', ScheduleRuleDirection.RICEVUTI)).toBe(
      ScheduleDocumentType.FATTURA_ACQUISTO
    )
    expect(tipoDocumentoDaCodiceSdi('TD01', ScheduleRuleDirection.EMESSI)).toBe(
      ScheduleDocumentType.FATTURA_VENDITA
    )
  })

  it('restituisce null per codici assenti o non riconosciuti', () => {
    expect(tipoDocumentoDaCodiceSdi(null, ScheduleRuleDirection.RICEVUTI)).toBeNull()
    expect(tipoDocumentoDaCodiceSdi('', ScheduleRuleDirection.RICEVUTI)).toBeNull()
    expect(tipoDocumentoDaCodiceSdi('XX99', ScheduleRuleDirection.RICEVUTI)).toBeNull()
  })
})

describe('tipoPagamentoDaCodiceSdi', () => {
  it('traduce le modalità più comuni', () => {
    expect(tipoPagamentoDaCodiceSdi('MP05')).toBe(SchedulePaymentMethod.BONIFICO)
    expect(tipoPagamentoDaCodiceSdi('MP12')).toBe(SchedulePaymentMethod.RIBA)
    expect(tipoPagamentoDaCodiceSdi('MP19')).toBe(SchedulePaymentMethod.SDD)
    expect(tipoPagamentoDaCodiceSdi('MP01')).toBe(SchedulePaymentMethod.CONTANTI)
    expect(tipoPagamentoDaCodiceSdi('MP08')).toBe(SchedulePaymentMethod.CARTA)
  })

  it('restituisce null per codici assenti o non mappati', () => {
    expect(tipoPagamentoDaCodiceSdi(undefined)).toBeNull()
    expect(tipoPagamentoDaCodiceSdi('MP99')).toBeNull()
  })

  it('un codice non mappato lascia matchare solo le regole a jolly', () => {
    const rules = [
      regola({ id: 'specifica', ordine: 0, tipoPagamento: SchedulePaymentMethod.BONIFICO }),
      regola({ id: 'jolly', ordine: 1 }),
    ]

    const match = trovaRegolaApplicabile(
      {
        direzione: ScheduleRuleDirection.RICEVUTI,
        tipoPagamento: tipoPagamentoDaCodiceSdi('MP99'),
      },
      rules
    )

    expect(match?.rule.id).toBe('jolly')
  })
})

describe('risolviContoDaRegole', () => {
  const findManyMock = vi.mocked(prisma.scheduleRule.findMany)
  const findUniqueMock = vi.mocked(prisma.account.findUnique)

  const contesto = {
    venueId: 'venue-1',
    direzione: ScheduleRuleDirection.RICEVUTI,
    tipoDocumento: ScheduleDocumentType.FATTURA_ACQUISTO,
    tipoPagamento: SchedulePaymentMethod.BONIFICO,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('restituisce il conto della regola vincente', async () => {
    findManyMock.mockResolvedValue([regola({ id: 'r1', contoId: 'conto-1' })] as never)
    findUniqueMock.mockResolvedValue({ id: 'conto-1', isActive: true } as never)

    await expect(risolviContoDaRegole(contesto)).resolves.toEqual({
      contoId: 'conto-1',
      ruleId: 'r1',
      azione: 'crea_riconcilia_movimento',
    })
  })

  it('chiede al DB solo le regole attive della sede e della direzione, in ordine', async () => {
    findManyMock.mockResolvedValue([] as never)

    await risolviContoDaRegole(contesto)

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { venueId: 'venue-1', direzione: ScheduleRuleDirection.RICEVUTI, isActive: true },
        orderBy: { ordine: 'asc' },
      })
    )
  })

  it('restituisce null se nessuna regola corrisponde', async () => {
    findManyMock.mockResolvedValue([] as never)

    await expect(risolviContoDaRegole(contesto)).resolves.toBeNull()
    expect(findUniqueMock).not.toHaveBeenCalled()
  })

  it('restituisce null se la regola vincente non indica un conto', async () => {
    findManyMock.mockResolvedValue([regola({ id: 'r1', contoId: null })] as never)

    await expect(risolviContoDaRegole(contesto)).resolves.toBeNull()
  })

  it('ignora la regola se il conto non è più attivo', async () => {
    findManyMock.mockResolvedValue([regola({ id: 'r1', contoId: 'conto-1' })] as never)
    findUniqueMock.mockResolvedValue({ id: 'conto-1', isActive: false } as never)

    await expect(risolviContoDaRegole(contesto)).resolves.toBeNull()
  })

  it('non propaga gli errori del database', async () => {
    findManyMock.mockRejectedValue(new Error('connessione persa') as never)

    await expect(risolviContoDaRegole(contesto)).resolves.toBeNull()
  })
})
