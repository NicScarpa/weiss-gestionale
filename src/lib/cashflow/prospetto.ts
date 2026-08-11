/**
 * Il prospetto di cash flow: righe, totali, memo.
 *
 * `costruisciProspetto` è puro — riceve movimenti già aggregati e restituisce
 * righe — così si testa senza database. `prospettoCashFlow` è l'involucro che
 * va a prendere i dati.
 *
 * Convenzione di segno: entrate positive, uscite negative, senza eccezioni per
 * natura del conto. I totali sono somme semplici, e la variazione di cassa è
 * la somma di tutte le famiglie. Le rettifiche funzionano da sole: un reso su
 * vendite è registrato in avere e riduce gli incassi; un reso su acquisti è in
 * dare e riduce il costo.
 */
import { prisma } from '@/lib/prisma'
import { money, toApi, type Money } from '@/lib/money'
import { liquiditaAlGiorno } from '@/lib/saldi'
import {
  type MonthKey,
  type MonthlyValues,
  MONTH_KEYS,
  MONTH_NUMBER_TO_KEY,
} from '@/types/budget'
import { PIANO_CONTI_WEISS_V4 } from '@/lib/accounts/piano-conti-weiss-v4'
import { RICLASSIFICAZIONE_CASH_FLOW, RIGHE_MEMO } from './riclassificazione'
import { movimentiCashFlow, nettoDiIva, type MovimentoAggregato } from './movimenti'

const NOME_VOCE = new Map(PIANO_CONTI_WEISS_V4.map((voce) => [voce.code, voce.nome]))

export type LivelloRiga = 'famiglia' | 'sottogruppo' | 'voce' | 'totale' | 'memo'

export interface RigaProspetto {
  codice: string
  nome: string
  livello: LivelloRiga
  /** Codice della riga di livello superiore: serve alla UI per l'albero. */
  padre?: string
  valori: MonthlyValues & { annual: number }
}

export interface Prospetto {
  anno: number
  righe: RigaProspetto[]
  cassaIniziale: number
  cassaFinale: number
}

type ValoriMensili = Record<MonthKey, Money>

function mesiVuoti(): ValoriMensili {
  return MONTH_KEYS.reduce((acc, key) => {
    acc[key] = money(0)
    return acc
  }, {} as ValoriMensili)
}

function somma(a: ValoriMensili, b: ValoriMensili): ValoriMensili {
  return MONTH_KEYS.reduce((acc, key) => {
    acc[key] = a[key].plus(b[key])
    return acc
  }, {} as ValoriMensili)
}

function totaleAnnuo(valori: ValoriMensili): Money {
  return MONTH_KEYS.reduce((tot, key) => tot.plus(valori[key]), money(0))
}

function versoApi(valori: ValoriMensili): MonthlyValues & { annual: number } {
  const mensili = MONTH_KEYS.reduce((acc, key) => {
    acc[key] = toApi(valori[key])
    return acc
  }, {} as MonthlyValues)

  return { ...mensili, annual: toApi(totaleAnnuo(valori)) }
}

/** I tre totali della scaletta, ognuno somma di righe già calcolate. */
const TOTALI: { codice: string; nome: string; somma: string[] }[] = [
  { codice: 'MDC', nome: 'Margine di contribuzione', somma: ['A', 'B'] },
  { codice: 'CFO', nome: 'Cash flow operativo', somma: ['A', 'B', 'C', 'D', 'E', 'F'] },
  { codice: 'VAR', nome: 'Variazione di cassa', somma: ['CFO', 'G', 'H', 'I'] },
]

export function costruisciProspetto(
  movimenti: MovimentoAggregato[],
  codicePerConto: Map<string, string>,
  cassaIniziale: Money,
  anno: number
): Prospetto {
  // Primo giro: netto per voce, IVA per verso. Un movimento senza conto, o su
  // un conto che la riclassificazione non conosce, non entra nel prospetto: se
  // ne esistono, li segnala il controllo C4.
  const perVoce = new Map<string, ValoriMensili>()
  const ivaEntrate = mesiVuoti()
  const ivaUscite = mesiVuoti()

  for (const movimento of movimenti) {
    const mese = MONTH_NUMBER_TO_KEY[movimento.mese]

    ivaEntrate[mese] = ivaEntrate[mese].plus(movimento.ivaDare)
    ivaUscite[mese] = ivaUscite[mese].minus(movimento.ivaAvere)

    if (!movimento.accountId) continue
    const codice = codicePerConto.get(movimento.accountId)
    if (!codice) continue

    const valori = perVoce.get(codice) ?? mesiVuoti()
    valori[mese] = valori[mese].plus(nettoDiIva(movimento))
    perVoce.set(codice, valori)
  }

  const righe: RigaProspetto[] = []
  const perCodice = new Map<string, ValoriMensili>()

  const aggiungi = (
    codice: string,
    nome: string,
    livello: LivelloRiga,
    valori: ValoriMensili,
    padre?: string
  ) => {
    perCodice.set(codice, valori)
    righe.push({ codice, nome, livello, padre, valori: versoApi(valori) })
  }

  for (const famiglia of RICLASSIFICAZIONE_CASH_FLOW) {
    const righeFamiglia: { codice: string; nome: string; valori: ValoriMensili }[] = []
    const righeVoce: { codice: string; nome: string; padre: string; valori: ValoriMensili }[] = []
    let totaleFamiglia = mesiVuoti()

    for (const sottogruppo of famiglia.sottogruppi) {
      let totaleSottogruppo = mesiVuoti()

      if (sottogruppo.calcolato === 'IVA_ENTRATE') {
        totaleSottogruppo = ivaEntrate
      } else if (sottogruppo.calcolato === 'IVA_USCITE') {
        totaleSottogruppo = ivaUscite
      } else {
        for (const voce of sottogruppo.voci) {
          const valori = perVoce.get(voce) ?? mesiVuoti()
          totaleSottogruppo = somma(totaleSottogruppo, valori)
          righeVoce.push({
            codice: voce,
            nome: NOME_VOCE.get(voce) ?? voce,
            padre: sottogruppo.codice,
            valori,
          })
        }
      }

      righeFamiglia.push({
        codice: sottogruppo.codice,
        nome: sottogruppo.nome,
        valori: totaleSottogruppo,
      })
      totaleFamiglia = somma(totaleFamiglia, totaleSottogruppo)
    }

    aggiungi(famiglia.codice, famiglia.nome, 'famiglia', totaleFamiglia)

    for (const sottogruppo of righeFamiglia) {
      aggiungi(
        sottogruppo.codice,
        sottogruppo.nome,
        'sottogruppo',
        sottogruppo.valori,
        famiglia.codice
      )

      for (const voce of righeVoce.filter((v) => v.padre === sottogruppo.codice)) {
        aggiungi(voce.codice, voce.nome, 'voce', voce.valori, sottogruppo.codice)
      }
    }

    // I totali si inseriscono appena le loro componenti esistono, così la
    // scaletta esce già nell'ordine in cui va letta.
    for (const totale of TOTALI) {
      if (totale.somma.every((c) => perCodice.has(c)) && !perCodice.has(totale.codice)) {
        const valori = totale.somma.reduce(
          (acc, c) => somma(acc, perCodice.get(c)!),
          mesiVuoti()
        )
        aggiungi(totale.codice, totale.nome, 'totale', valori)
      }
    }
  }

  const variazione = perCodice.get('VAR') ?? mesiVuoti()

  // Cassa iniziale e finale sono valori annuali, non mensili: la UI le mostra
  // in testa e in coda alla colonna del totale.
  const cassaFinale = cassaIniziale.plus(totaleAnnuo(variazione))

  for (const memo of RIGHE_MEMO) {
    let valori = mesiVuoti()

    if (memo.somma) {
      valori = memo.somma.reduce((acc, c) => somma(acc, perCodice.get(c) ?? mesiVuoti()), valori)
    }
    for (const voce of memo.voci ?? []) {
      valori = somma(valori, perVoce.get(voce) ?? mesiVuoti())
    }

    righe.push({
      codice: memo.codice,
      nome: memo.nome,
      livello: 'memo',
      valori: versoApi(valori),
    })
  }

  return {
    anno,
    righe,
    cassaIniziale: toApi(cassaIniziale),
    cassaFinale: toApi(cassaFinale),
  }
}

/** Mappa id del conto → codice della voce, per i soli conti attivi. */
async function codiciDeiConti(): Promise<Map<string, string>> {
  const conti = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
  })

  return new Map(conti.map((conto) => [conto.id, conto.code]))
}

export async function prospettoCashFlow(venueId: string, anno: number): Promise<Prospetto> {
  const [movimenti, codicePerConto, liquidita] = await Promise.all([
    movimentiCashFlow(venueId, anno),
    codiciDeiConti(),
    // La cassa a inizio anno è la liquidità all'ultimo giorno di quello prima.
    liquiditaAlGiorno(venueId, `${anno - 1}-12-31`),
  ])

  return costruisciProspetto(movimenti, codicePerConto, money(liquidita), anno)
}
