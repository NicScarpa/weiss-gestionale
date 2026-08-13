import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import {
  aggregaContoEconomico,
  inCentesimi,
  UNASSIGNED,
  type MovimentoContoEconomico,
  type VoceConto,
} from '../conto-economico'
import { aggregaMovimenti, type MovimentoPrimaNota } from '@/lib/cashflow/movimenti'

const CENTRI = [{ code: 'STR' }, { code: 'WEISS' }, { code: 'VV' }, { code: 'CAS' }]

/** Voce del piano v4: i campi che il report legge, con i default più comuni. */
function voce(partial: Partial<VoceConto> & Pick<VoceConto, 'code' | 'type'>): VoceConto {
  return {
    id: `acc-${partial.code}`,
    name: `Voce ${partial.code}`,
    mastroCode: partial.code.split('.')[0],
    mastroNome: `Mastro ${partial.code.split('.')[0]}`,
    gruppoCode: null,
    gruppoNome: null,
    ...partial,
  }
}

const CORRISPETTIVI = voce({
  code: '10.01',
  name: 'Corrispettivi',
  type: 'RICAVO',
  mastroNome: 'Ricavi delle vendite e delle prestazioni',
})
const RESI_SU_VENDITE = voce({
  code: '10.09',
  name: 'Resi, sconti e abbuoni su vendite',
  type: 'RICAVO',
  mastroNome: 'Ricavi delle vendite e delle prestazioni',
})
const BEVERAGE = voce({
  code: '20.1.01',
  name: 'Birra',
  type: 'COSTO',
  gruppoCode: '20.1',
  gruppoNome: 'Beverage alcolico',
})
const FOOD = voce({
  code: '20.2.01',
  name: 'Gastronomia',
  type: 'COSTO',
  gruppoCode: '20.2',
  gruppoNome: 'Food',
})
const RIMANENZE_FINALI = voce({
  code: '20.6.03',
  name: 'Rimanenze finali',
  type: 'COSTO',
  gruppoCode: '20.6',
  gruppoNome: 'Rettifiche',
})
const PULIZIE = voce({
  code: '20.3.01',
  name: 'Detergenti e materiali di pulizia',
  type: 'COSTO',
  gruppoCode: '20.3',
  gruppoNome: 'Pulizia',
})
const BANCA = voce({ code: '90.01', name: 'Banca c/c', type: 'ATTIVO' })

let contatore = 0

/** Movimento di prima nota: importi su un solo lato, come in produzione. */
function movimento(
  partial: Partial<MovimentoContoEconomico> & {
    account?: VoceConto | null
    centro?: string | null
  }
): MovimentoContoEconomico {
  const { centro, ...resto } = partial
  return {
    id: `mov-${++contatore}`,
    accountId: resto.account ? resto.account.id : null,
    account: resto.account ?? null,
    costCenter: centro ? { code: centro } : null,
    debitAmount: null,
    creditAmount: null,
    allocations: [],
    ...resto,
  }
}

/** Fetta di ripartizione: importo sempre positivo, verso quello del movimento. */
function fetta(account: VoceConto, importo: number) {
  return { accountId: account.id, account, importo }
}

describe('inCentesimi', () => {
  it('accetta il Decimal di Prisma, i numeri e le stringhe', () => {
    expect(inCentesimi(new Prisma.Decimal('1234.56'))).toBe(123456)
    expect(inCentesimi(new Prisma.Decimal('-0.07'))).toBe(-7)
    expect(inCentesimi(1234.56)).toBe(123456)
    expect(inCentesimi('1234.56')).toBe(123456)
  })

  it('tratta assente e non numerico come zero', () => {
    expect(inCentesimi(null)).toBe(0)
    expect(inCentesimi(undefined)).toBe(0)
    expect(inCentesimi('non un numero')).toBe(0)
  })

  it('non perde centesimi sugli importi che il float sbaglierebbe', () => {
    // In virgola mobile 8.29 * 100 fa 828.9999999999999, 1.15 * 100 fa
    // 114.99999999999999 e 0.29 * 100 fa 28.999999999999996: troncare
    // perderebbe un centesimo su ognuno.
    expect(inCentesimi(8.29)).toBe(829)
    expect(inCentesimi(1.15)).toBe(115)
    expect(inCentesimi(0.29)).toBe(29)
    // Il massimo che ci sta in un Decimal(10,2)
    expect(inCentesimi(new Prisma.Decimal('99999999.99'))).toBe(9999999999)
  })
})

describe('aggregaContoEconomico — movimento semplice', () => {
  it('porta un ricavo sulla colonna del suo centro', () => {
    const risultato = aggregaContoEconomico(
      [movimento({ account: CORRISPETTIVI, centro: 'WEISS', creditAmount: 1000 })],
      CENTRI
    )

    expect(risultato.rows).toHaveLength(1)
    const riga = risultato.rows[0]
    expect(riga.code).toBe('10.01')
    expect(riga.name).toBe('Corrispettivi')
    expect(riga.type).toBe('RICAVO')
    expect(riga.mastroCode).toBe('10')
    expect(riga.mastroNome).toBe('Ricavi delle vendite e delle prestazioni')
    expect(riga.amounts).toEqual({ STR: 0, WEISS: 1000, VV: 0, CAS: 0, [UNASSIGNED]: 0 })
    expect(riga.total).toBe(1000)
    expect(risultato.totals).toEqual({ ricavi: 1000, costi: 0, margine: 1000 })
  })

  it('somma più movimenti sulla stessa voce e riporta gruppo e mastro', () => {
    const risultato = aggregaContoEconomico(
      [
        movimento({ account: BEVERAGE, centro: 'VV', debitAmount: 120.5 }),
        movimento({ account: BEVERAGE, centro: 'VV', debitAmount: 79.5 }),
        movimento({ account: BEVERAGE, centro: 'CAS', debitAmount: 10 }),
      ],
      CENTRI
    )

    expect(risultato.rows).toHaveLength(1)
    expect(risultato.rows[0].gruppoCode).toBe('20.1')
    expect(risultato.rows[0].gruppoNome).toBe('Beverage alcolico')
    expect(risultato.rows[0].amounts.VV).toBe(200)
    expect(risultato.rows[0].amounts.CAS).toBe(10)
    expect(risultato.rows[0].total).toBe(210)
    expect(risultato.totals).toEqual({ ricavi: 0, costi: 210, margine: -210 })
  })

  it('ordina le righe per codice voce', () => {
    const risultato = aggregaContoEconomico(
      [
        movimento({ account: RIMANENZE_FINALI, centro: 'STR', creditAmount: 1 }),
        movimento({ account: CORRISPETTIVI, centro: 'STR', creditAmount: 1 }),
        movimento({ account: FOOD, centro: 'STR', debitAmount: 1 }),
        movimento({ account: BEVERAGE, centro: 'STR', debitAmount: 1 }),
      ],
      CENTRI
    )

    expect(risultato.rows.map((r) => r.code)).toEqual([
      '10.01',
      '20.1.01',
      '20.2.01',
      '20.6.03',
    ])
  })

  it('ordina i segmenti come numeri, non alfabeticamente', () => {
    // Il giorno in cui un mastro arriverà a dieci gruppi, l'ordine alfabetico
    // metterebbe '20.10.01' prima di '20.2.01'.
    const decimoGruppo = voce({ code: '20.10.01', type: 'COSTO' })
    const centesimaVoce = voce({ code: '20.1.100', type: 'COSTO' })

    const risultato = aggregaContoEconomico(
      [
        movimento({ account: decimoGruppo, centro: 'STR', debitAmount: 1 }),
        movimento({ account: FOOD, centro: 'STR', debitAmount: 1 }),
        movimento({ account: centesimaVoce, centro: 'STR', debitAmount: 1 }),
        movimento({ account: BEVERAGE, centro: 'STR', debitAmount: 1 }),
      ],
      CENTRI
    )

    expect(risultato.rows.map((r) => r.code)).toEqual([
      '20.1.01',
      '20.1.100',
      '20.2.01',
      '20.10.01',
    ])
  })

  it('regge i codici legacy non numerici senza perdere il determinismo', () => {
    const risultato = aggregaContoEconomico(
      [
        movimento({ account: voce({ code: 'CASSA', type: 'COSTO' }), centro: 'STR', debitAmount: 1 }),
        movimento({ account: BEVERAGE, centro: 'STR', debitAmount: 1 }),
        movimento({ account: voce({ code: '20.1', type: 'COSTO' }), centro: 'STR', debitAmount: 1 }),
      ],
      CENTRI
    )

    // Numerici prima (Number('CASSA') è NaN → confronto alfabetico), e il
    // codice più corto prima di quello che lo estende.
    expect(risultato.rows.map((r) => r.code)).toEqual(['20.1', '20.1.01', 'CASSA'])
  })

  it('porta l’accountId sulla riga, per il drill-down verso la prima nota', () => {
    const risultato = aggregaContoEconomico(
      [
        movimento({ account: CORRISPETTIVI, centro: 'STR', creditAmount: 10 }),
        movimento({
          account: BEVERAGE,
          centro: 'STR',
          debitAmount: 10,
          allocations: [fetta(FOOD, 10)],
        }),
      ],
      CENTRI
    )

    expect(risultato.rows.map((r) => [r.code, r.accountId])).toEqual([
      ['10.01', 'acc-10.01'],
      // Anche la riga nata da una fetta porta l'id del conto della fetta
      ['20.2.01', 'acc-20.2.01'],
    ])
  })
})

describe('aggregaContoEconomico — segni', () => {
  it('un ricavo è avere − dare, un costo è dare − avere', () => {
    const risultato = aggregaContoEconomico(
      [
        movimento({ account: CORRISPETTIVI, centro: 'WEISS', creditAmount: 500 }),
        movimento({ account: BEVERAGE, centro: 'WEISS', debitAmount: 200 }),
      ],
      CENTRI
    )

    expect(risultato.rows.find((r) => r.code === '10.01')?.total).toBe(500)
    expect(risultato.rows.find((r) => r.code === '20.1.01')?.total).toBe(200)
    expect(risultato.totals).toEqual({ ricavi: 500, costi: 200, margine: 300 })
  })

  it('le rettifiche del piano vengono fuori negative da sole', () => {
    const risultato = aggregaContoEconomico(
      [
        // Reso su vendite: un RICAVO registrato in dare
        movimento({ account: RESI_SU_VENDITE, centro: 'WEISS', debitAmount: 150.55 }),
        // Rimanenze finali: un COSTO registrato in avere
        movimento({ account: RIMANENZE_FINALI, centro: 'STR', creditAmount: 800 }),
      ],
      CENTRI
    )

    expect(risultato.rows.find((r) => r.code === '10.09')?.total).toBe(-150.55)
    expect(risultato.rows.find((r) => r.code === '20.6.03')?.total).toBe(-800)
    expect(risultato.totals).toEqual({
      ricavi: -150.55,
      costi: -800,
      margine: 649.45,
    })
  })
})

describe('aggregaContoEconomico — movimenti suddivisi', () => {
  it('le fette vincono sulla testata: il conto dominante non conta due volte', () => {
    const risultato = aggregaContoEconomico(
      [
        movimento({
          // Il dominante derivato dalla fetta più grossa: va ignorato
          account: BEVERAGE,
          centro: 'WEISS',
          debitAmount: 500,
          allocations: [fetta(BEVERAGE, 300), fetta(FOOD, 200)],
        }),
      ],
      CENTRI
    )

    expect(risultato.rows.find((r) => r.code === '20.1.01')?.amounts.WEISS).toBe(300)
    expect(risultato.rows.find((r) => r.code === '20.2.01')?.amounts.WEISS).toBe(200)
    expect(risultato.totals.costi).toBe(500)
  })

  it('le fette ereditano il centro del movimento', () => {
    const risultato = aggregaContoEconomico(
      [
        movimento({
          account: BEVERAGE,
          centro: 'VV',
          debitAmount: 90,
          allocations: [fetta(BEVERAGE, 50), fetta(FOOD, 40)],
        }),
      ],
      CENTRI
    )

    expect(risultato.rows.find((r) => r.code === '20.1.01')?.amounts).toEqual({
      STR: 0,
      WEISS: 0,
      VV: 50,
      CAS: 0,
      [UNASSIGNED]: 0,
    })
    expect(risultato.rows.find((r) => r.code === '20.2.01')?.amounts.VV).toBe(40)
  })

  it('un movimento suddiviso in avere dà fette negative (nota di credito)', () => {
    const risultato = aggregaContoEconomico(
      [
        movimento({
          account: BEVERAGE,
          centro: 'VV',
          creditAmount: 100,
          allocations: [fetta(BEVERAGE, 60), fetta(FOOD, 40)],
        }),
      ],
      CENTRI
    )

    expect(risultato.rows.find((r) => r.code === '20.1.01')?.total).toBe(-60)
    expect(risultato.rows.find((r) => r.code === '20.2.01')?.total).toBe(-40)
    expect(risultato.totals.costi).toBe(-100)
  })

  it('scarta le fette su conti patrimoniali senza toccare le altre', () => {
    const risultato = aggregaContoEconomico(
      [
        movimento({
          account: BEVERAGE,
          centro: 'STR',
          debitAmount: 200,
          allocations: [fetta(BEVERAGE, 150), fetta(BANCA, 50)],
        }),
      ],
      CENTRI
    )

    expect(risultato.rows.map((r) => r.code)).toEqual(['20.1.01'])
    expect(risultato.totals.costi).toBe(150)
  })

  it('con le fette la testata non entra nemmeno quando è di tipo diverso', () => {
    const risultato = aggregaContoEconomico(
      [
        movimento({
          account: CORRISPETTIVI,
          centro: 'STR',
          debitAmount: 100,
          allocations: [fetta(BEVERAGE, 100)],
        }),
      ],
      CENTRI
    )

    expect(risultato.rows.map((r) => r.code)).toEqual(['20.1.01'])
    expect(risultato.totals).toEqual({ ricavi: 0, costi: 100, margine: -100 })
  })

  it('lascia sul conto di testata la parte non coperta dalle fette', () => {
    // Bonifico da 2.000 che salda una fattura da 1.222: i restanti 778 sono un
    // acconto non ancora abbinato e restano dove sono. `saldi.ts` e il prospetto
    // di cash flow li contano già così; questo report li faceva sparire.
    const risultato = aggregaContoEconomico(
      [
        movimento({
          account: BEVERAGE,
          centro: 'STR',
          debitAmount: 2000,
          allocations: [fetta(FOOD, 1100), fetta(PULIZIE, 122)],
        }),
      ],
      CENTRI
    )

    expect(risultato.rows.find((r) => r.code === FOOD.code)?.total).toBe(1100)
    expect(risultato.rows.find((r) => r.code === PULIZIE.code)?.total).toBe(122)
    expect(risultato.rows.find((r) => r.code === BEVERAGE.code)?.total).toBe(778)
  })
})

describe('aggregaContoEconomico — coerenza col cash flow', () => {
  it('il residuo di testata coincide con quello che calcola aggregaMovimenti', () => {
    // Fixture canonica, in centesimi: la stessa suddivisione parziale, letta
    // una volta sola e adattata meccanicamente alla forma che vuole ciascun
    // modulo. Il punto del test è verificare che i due moduli DERIVATI da
    // questo unico fatto concordino — non che uno dei due sia uguale a se
    // stesso, cosa che proverebbe solo l'esistenza della funzione.
    const FATTO = {
      testata: BEVERAGE,
      importoTotale: 2000,
      fette: [
        { account: FOOD, importo: 1100 },
        { account: PULIZIE, importo: 122 },
      ],
    }

    const contoEconomico = aggregaContoEconomico(
      [
        movimento({
          account: FATTO.testata,
          centro: 'STR',
          debitAmount: FATTO.importoTotale,
          allocations: FATTO.fette.map((f) => fetta(f.account, f.importo)),
        }),
      ],
      CENTRI
    )
    const residuoContoEconomico =
      contoEconomico.rows.find((r) => r.code === FATTO.testata.code)?.total ?? 0

    const rigaCashFlow: MovimentoPrimaNota = {
      accountId: FATTO.testata.id,
      date: new Date(Date.UTC(2026, 0, 15)),
      debitAmount: FATTO.importoTotale,
      creditAmount: 0,
      vatAmount: 0,
      allocations: FATTO.fette.map((f) => ({
        accountId: f.account.id,
        importo: f.importo,
        iva: null,
      })),
    }
    const [aggregatoCashFlow] = aggregaMovimenti([rigaCashFlow])
    // `aggregaMovimenti` lavora in Money/dare-avere, non in euro con segno:
    // la conversione all'unità comune del confronto avviene qui, dopo aver
    // ricevuto il risultato — non prima, dentro l'input condiviso.
    const residuoCashFlow = aggregatoCashFlow.dare.minus(aggregatoCashFlow.avere).toNumber()

    expect(residuoContoEconomico).toBe(778)
    expect(residuoCashFlow).toBe(778)
    expect(residuoContoEconomico).toBe(residuoCashFlow)
  })
})

describe('aggregaContoEconomico — quello che non va perso', () => {
  it('un movimento senza centro finisce nella colonna UNASSIGNED', () => {
    const risultato = aggregaContoEconomico(
      [movimento({ account: CORRISPETTIVI, centro: null, creditAmount: 90.45 })],
      CENTRI
    )

    expect(risultato.rows[0].amounts[UNASSIGNED]).toBe(90.45)
    expect(risultato.rows[0].amounts.STR).toBe(0)
    expect(risultato.totals.ricavi).toBe(90.45)
  })

  it('un movimento senza conto finisce in senzaContoNetto, per centro', () => {
    const risultato = aggregaContoEconomico(
      [
        movimento({ account: null, centro: 'CAS', debitAmount: 42.3 }),
        movimento({ account: null, centro: null, creditAmount: 12.1 }),
      ],
      CENTRI
    )

    expect(risultato.rows).toHaveLength(0)
    // Senza tipo di conto vale il netto avere − dare: positivo = incasso
    expect(risultato.senzaContoNetto).toEqual({
      STR: 0,
      WEISS: 0,
      VV: 0,
      CAS: -42.3,
      [UNASSIGNED]: 12.1,
    })
    expect(risultato.totals).toEqual({ ricavi: 0, costi: 0, margine: 0 })
  })

  it('un movimento senza conto e senza importi non crea nulla', () => {
    const risultato = aggregaContoEconomico(
      [movimento({ account: null, centro: 'STR' })],
      CENTRI
    )

    expect(risultato.senzaContoNetto).toEqual({
      STR: 0,
      WEISS: 0,
      VV: 0,
      CAS: 0,
      [UNASSIGNED]: 0,
    })
  })

  it('esclude i conti patrimoniali: i giroconti cassa-banca non sono economici', () => {
    const risultato = aggregaContoEconomico(
      [
        movimento({ account: BANCA, centro: 'STR', debitAmount: 5000 }),
        movimento({ account: CORRISPETTIVI, centro: 'STR', creditAmount: 10 }),
      ],
      CENTRI
    )

    expect(risultato.rows.map((r) => r.code)).toEqual(['10.01'])
    expect(risultato.totals).toEqual({ ricavi: 10, costi: 0, margine: 10 })
  })

  it('apre una colonna anche per un centro non passato fra quelli noti', () => {
    const risultato = aggregaContoEconomico(
      [movimento({ account: CORRISPETTIVI, centro: 'DISMESSO', creditAmount: 33 })],
      CENTRI
    )

    expect(risultato.rows[0].amounts.DISMESSO).toBe(33)
    expect(risultato.rows[0].total).toBe(33)
    expect(Object.keys(risultato.senzaContoNetto)).toContain('DISMESSO')
  })

  it('tiene la riga di una voce che netta a zero: è stata usata', () => {
    const risultato = aggregaContoEconomico(
      [
        movimento({ account: CORRISPETTIVI, centro: 'WEISS', creditAmount: 100 }),
        movimento({ account: CORRISPETTIVI, centro: 'WEISS', debitAmount: 100 }),
      ],
      CENTRI
    )

    expect(risultato.rows).toHaveLength(1)
    expect(risultato.rows[0].total).toBe(0)
  })

  it('senza movimenti restituisce le colonne dei centri, vuote', () => {
    const risultato = aggregaContoEconomico([], CENTRI)

    expect(risultato.rows).toEqual([])
    expect(Object.keys(risultato.senzaContoNetto)).toEqual([
      'STR',
      'WEISS',
      'VV',
      'CAS',
      UNASSIGNED,
    ])
    expect(risultato.totals).toEqual({ ricavi: 0, costi: 0, margine: 0 })
  })
})

describe('aggregaContoEconomico — quadratura', () => {
  /**
   * Il fixture mescola tutto quello che il report deve reggere: movimenti
   * semplici in dare e in avere, suddivisi nei due versi, **suddivisi solo in
   * parte**, rettifiche negative, un patrimoniale da escludere, un movimento
   * senza centro e due senza conto.
   *
   * La suddivisione parziale è arrivata insieme al residuo di testata (12 ago
   * 2026) e non è un caso di contorno: finché ogni suddivisione copriva tutto
   * il suo movimento, il residuo era sempre zero e l'oracolo qui sotto poteva
   * ignorare la testata restando verde. Il controllo più forte del modulo —
   * quello che vede un importo perduto o contato due volte — era cieco
   * proprio sul punto che stava cambiando.
   */
  const MOVIMENTI: MovimentoContoEconomico[] = [
    movimento({ account: CORRISPETTIVI, centro: 'WEISS', creditAmount: 1000 }),
    movimento({ account: RESI_SU_VENDITE, centro: 'WEISS', debitAmount: 150.55 }),
    movimento({ account: BEVERAGE, centro: 'VV', debitAmount: 300.1 }),
    movimento({
      account: BEVERAGE,
      centro: 'WEISS',
      debitAmount: 500,
      allocations: [fetta(BEVERAGE, 300), fetta(FOOD, 200)],
    }),
    movimento({ account: RIMANENZE_FINALI, centro: 'STR', creditAmount: 800 }),
    movimento({ account: CORRISPETTIVI, centro: null, creditAmount: 90.45 }),
    movimento({ account: null, centro: 'CAS', debitAmount: 42.3 }),
    movimento({ account: null, centro: null, creditAmount: 12.1 }),
    movimento({ account: BANCA, centro: 'STR', debitAmount: 5000 }),
    movimento({
      account: BEVERAGE,
      centro: 'VV',
      creditAmount: 100,
      allocations: [fetta(BEVERAGE, 60), fetta(FOOD, 40)],
    }),
    movimento({
      account: BEVERAGE,
      centro: 'STR',
      debitAmount: 200,
      allocations: [fetta(BEVERAGE, 150), fetta(BANCA, 50)],
    }),
    // Suddivisione parziale: 600 sul conto della fetta, 400 che restano sulla
    // testata. È l'acconto o il pagamento misto della decisione 3 della
    // specifica — il vincolo di copertura totale è sul documento, non sul
    // movimento.
    movimento({
      account: PULIZIE,
      centro: 'CAS',
      debitAmount: 1000,
      allocations: [fetta(FOOD, 600)],
    }),
  ]

  /**
   * L'oracolo: il netto avere − dare della prima nota, sui soli contributi che
   * il conto economico misura. Non sa nulla di ricavi e costi né di colonne —
   * sa solo quali importi esistono e su quale centro stanno. Deve coincidere
   * con `margine + senzaContoNetto`, perché ricavi (avere − dare) meno costi
   * (dare − avere) è proprio quella somma.
   *
   * Conosce anche il **residuo di testata**: quello che le fette non coprono
   * resta sul conto del movimento. Senza questa parte l'oracolo tornerebbe a
   * dire che un movimento suddiviso vale la somma delle sue fette — la
   * semantica di prima del 12 ago 2026 — e darebbe per buono proprio l'importo
   * che allora spariva.
   */
  function patrimoniale(conto: VoceConto): boolean {
    return conto.type === 'ATTIVO' || conto.type === 'PASSIVO'
  }

  function nettoPrimaNota(
    movimenti: MovimentoContoEconomico[],
    soloCentro?: string
  ): number {
    let centesimi = 0
    for (const mov of movimenti) {
      const centro = mov.costCenter?.code ?? UNASSIGNED
      if (soloCentro !== undefined && centro !== soloCentro) continue

      const dare = inCentesimi(mov.debitAmount)
      const avere = inCentesimi(mov.creditAmount)

      if (mov.allocations.length > 0) {
        // Il verso è quello del lato valorizzato, e le fette lo seguono.
        const versoDare = dare !== 0 || avere === 0
        let coperto = 0

        for (const f of mov.allocations) {
          const quota = inCentesimi(f.importo)
          // Anche la fetta su un conto patrimoniale copre la testata: quel
          // denaro è uscito di lì comunque, e non contarlo lo farebbe
          // ricomparire nel residuo.
          coperto += quota
          if (patrimoniale(f.account)) continue
          centesimi += versoDare ? -quota : quota
        }

        const residuo = (versoDare ? dare : avere) - coperto
        if (residuo > 0 && mov.account && !patrimoniale(mov.account)) {
          centesimi += versoDare ? -residuo : residuo
        }
        continue
      }
      if (mov.account && patrimoniale(mov.account)) {
        continue
      }
      centesimi += avere - dare
    }
    return centesimi
  }

  /** Somma esatta di importi in euro: si passa dai centesimi, mai dal float. */
  function sommaCentesimi(valori: number[]): number {
    return valori.reduce((somma, valore) => somma + inCentesimi(valore), 0)
  }

  it('il totale del report è il netto economico della prima nota', () => {
    const risultato = aggregaContoEconomico(MOVIMENTI, CENTRI)

    const margineCent = inCentesimi(risultato.totals.margine)
    const senzaContoCent = sommaCentesimi(Object.values(risultato.senzaContoNetto))

    expect(margineCent + senzaContoCent).toBe(nettoPrimaNota(MOVIMENTI))
    // Valore atteso del fixture, calcolato a mano
    expect(margineCent + senzaContoCent).toBe(-14040)
  })

  it('quadra colonna per colonna: nessuna fetta finisce sul centro sbagliato', () => {
    const risultato = aggregaContoEconomico(MOVIMENTI, CENTRI)
    const colonne = Object.keys(risultato.senzaContoNetto)

    expect(colonne).toEqual(['STR', 'WEISS', 'VV', 'CAS', UNASSIGNED])

    for (const colonna of colonne) {
      const ricavi = sommaCentesimi(
        risultato.rows.filter((r) => r.type === 'RICAVO').map((r) => r.amounts[colonna])
      )
      const costi = sommaCentesimi(
        risultato.rows.filter((r) => r.type === 'COSTO').map((r) => r.amounts[colonna])
      )
      const netto = ricavi - costi + inCentesimi(risultato.senzaContoNetto[colonna])

      expect({ colonna, netto }).toEqual({
        colonna,
        netto: nettoPrimaNota(MOVIMENTI, colonna),
      })
    }
  })

  it('totalsPerColonna è la somma delle celle di quella colonna', () => {
    const risultato = aggregaContoEconomico(MOVIMENTI, CENTRI)

    expect(Object.keys(risultato.totalsPerColonna)).toEqual([
      'STR',
      'WEISS',
      'VV',
      'CAS',
      UNASSIGNED,
    ])

    for (const [colonna, totali] of Object.entries(risultato.totalsPerColonna)) {
      const ricavi = sommaCentesimi(
        risultato.rows.filter((r) => r.type === 'RICAVO').map((r) => r.amounts[colonna])
      )
      const costi = sommaCentesimi(
        risultato.rows.filter((r) => r.type === 'COSTO').map((r) => r.amounts[colonna])
      )

      expect({
        colonna,
        ricavi: inCentesimi(totali.ricavi),
        costi: inCentesimi(totali.costi),
        margine: inCentesimi(totali.margine),
      }).toEqual({ colonna, ricavi, costi, margine: ricavi - costi })
    }
  })

  it('la somma di totalsPerColonna è totals', () => {
    const risultato = aggregaContoEconomico(MOVIMENTI, CENTRI)
    const colonne = Object.values(risultato.totalsPerColonna)

    expect(sommaCentesimi(colonne.map((t) => t.ricavi))).toBe(
      inCentesimi(risultato.totals.ricavi)
    )
    expect(sommaCentesimi(colonne.map((t) => t.costi))).toBe(
      inCentesimi(risultato.totals.costi)
    )
    expect(sommaCentesimi(colonne.map((t) => t.margine))).toBe(
      inCentesimi(risultato.totals.margine)
    )
  })

  it('il margine di ogni colonna più il suo senzaContoNetto quadra col netto', () => {
    const risultato = aggregaContoEconomico(MOVIMENTI, CENTRI)

    for (const [colonna, totali] of Object.entries(risultato.totalsPerColonna)) {
      const netto =
        inCentesimi(totali.margine) + inCentesimi(risultato.senzaContoNetto[colonna])

      expect({ colonna, netto }).toEqual({
        colonna,
        netto: nettoPrimaNota(MOVIMENTI, colonna),
      })
    }
  })

  it('i totali di riga e i totali generali sono la somma delle celle', () => {
    const risultato = aggregaContoEconomico(MOVIMENTI, CENTRI)

    for (const riga of risultato.rows) {
      expect(inCentesimi(riga.total)).toBe(sommaCentesimi(Object.values(riga.amounts)))
    }

    const ricavi = sommaCentesimi(
      risultato.rows.filter((r) => r.type === 'RICAVO').map((r) => r.total)
    )
    const costi = sommaCentesimi(
      risultato.rows.filter((r) => r.type === 'COSTO').map((r) => r.total)
    )

    expect(inCentesimi(risultato.totals.ricavi)).toBe(ricavi)
    expect(inCentesimi(risultato.totals.costi)).toBe(costi)
    expect(inCentesimi(risultato.totals.margine)).toBe(ricavi - costi)
  })

  it('sui valori attesi del fixture, voce per voce', () => {
    const risultato = aggregaContoEconomico(MOVIMENTI, CENTRI)

    expect(
      risultato.rows.map((r) => [r.code, r.total])
    ).toEqual([
      ['10.01', 1090.45],
      ['10.09', -150.55],
      ['20.1.01', 690.1],
      // 200 dalla fetta del movimento in dare più i 600 della suddivisione
      // parziale; i 400 di residuo restano invece su 20.3.01, la testata.
      ['20.2.01', 760],
      ['20.3.01', 400],
      ['20.6.03', -800],
    ])
    expect(risultato.totals).toEqual({ ricavi: 939.9, costi: 1050.1, margine: -110.2 })
    expect(risultato.senzaContoNetto.CAS).toBe(-42.3)
    expect(risultato.senzaContoNetto[UNASSIGNED]).toBe(12.1)
  })

  it('quadra anche con gli importi come Decimal di Prisma', () => {
    const conDecimal = MOVIMENTI.map((mov) => ({
      ...mov,
      debitAmount:
        mov.debitAmount === null ? null : new Prisma.Decimal(String(mov.debitAmount)),
      creditAmount:
        mov.creditAmount === null ? null : new Prisma.Decimal(String(mov.creditAmount)),
      allocations: mov.allocations.map((f) => ({
        ...f,
        importo: new Prisma.Decimal(String(f.importo)),
      })),
    }))

    const risultato = aggregaContoEconomico(conDecimal, CENTRI)

    expect(risultato.totals).toEqual({ ricavi: 939.9, costi: 1050.1, margine: -110.2 })
    expect(
      inCentesimi(risultato.totals.margine) +
        sommaCentesimi(Object.values(risultato.senzaContoNetto))
    ).toBe(-14040)
  })

  it('quadra su tanti importi a centesimi dispari, dove il float sbaglierebbe', () => {
    // 0.01 + 0.02 + ... sommati in euro accumulano errore: in centesimi no.
    const molti = Array.from({ length: 300 }, (_, i) =>
      movimento({
        account: i % 2 === 0 ? CORRISPETTIVI : BEVERAGE,
        centro: CENTRI[i % CENTRI.length].code,
        creditAmount: i % 2 === 0 ? (i + 1) / 100 : null,
        debitAmount: i % 2 === 0 ? null : (i + 1) / 100,
      })
    )

    const risultato = aggregaContoEconomico(molti, CENTRI)

    // Ricavi: dispari da 1 a 299 centesimi → 150² = 22500 centesimi
    expect(risultato.totals.ricavi).toBe(225)
    // Costi: pari da 2 a 300 centesimi → 150 · 151 = 22650 centesimi
    expect(risultato.totals.costi).toBe(226.5)
    expect(risultato.totals.margine).toBe(-1.5)
    expect(inCentesimi(risultato.totals.margine)).toBe(nettoPrimaNota(molti))
  })
})
