/**
 * I movimenti dell'anno aggregati per conto e mese, con l'IVA tenuta distinta
 * fra entrate e uscite.
 *
 * Perché non basta `movimentiPerContoEMese` di saldi.ts: nel gestionale
 * l'importo di un movimento è **lordo** (`creditAmount = invoice.totalAmount`)
 * e l'IVA sta in `vatAmount`. Il prospetto vuole le famiglie A-F al netto — o
 * le percentuali di margine mentono — e l'IVA in un blocco suo, dove si vede
 * per quello che è: denaro che transita. Per farlo serve sapere quanta IVA sta
 * dalla parte delle entrate e quanta da quella delle uscite, e quella
 * distinzione va fatta nella query, non dopo.
 */
import { prisma } from '@/lib/prisma'
import { money, type Money } from '@/lib/money'
import { movimentiChePesano } from '@/lib/saldi'
import { toDateOnlyUtc } from '@/lib/timezone'

export interface MovimentoAggregato {
  accountId: string | null
  /** 1-12. */
  mese: number
  dare: Money
  avere: Money
  /** IVA dei movimenti in dare, cioè quella incassata. */
  ivaDare: Money
  /** IVA dei movimenti in avere, cioè quella pagata. */
  ivaAvere: Money
}

/**
 * Il valore della voce nel prospetto: entrate positive, uscite negative, al
 * netto dell'IVA che viaggia insieme al movimento.
 */
export function nettoDiIva(m: MovimentoAggregato): Money {
  return m.dare.minus(m.ivaDare).minus(m.avere.minus(m.ivaAvere))
}

/** Il valore lordo: quello che tocca davvero il conto. Serve alla quadratura. */
export function lordo(m: MovimentoAggregato): Money {
  return m.dare.minus(m.avere)
}

/**
 * Come si ripartisce l'IVA di una riga fra dare e avere: segue il verso del
 * movimento che la porta, cioè quello con l'importo diverso da zero.
 *
 * Il caso con entrambe le colonne valorizzate non si presenta in questa
 * prima nota; se comparisse, questa funzione manderebbe comunque l'IVA in
 * dare — una scelta arbitraria, non una regola contabile — e **nessuno dei
 * controlli di quadratura se ne accorgerebbe**: la somma dare − avere resta
 * la stessa qualunque verso riceva l'IVA, e nessuno dei quattro controlli
 * guarda questa classificazione. Lo stesso vale per il caso, altrettanto
 * estraneo alla prima nota, di entrambe le colonne a zero con un'IVA diversa
 * da zero: finisce in avere, perché la condizione guarda solo se `dare` è
 * zero.
 */
export function ripartisciIva(
  dare: Money,
  avere: Money,
  iva: Money
): { ivaDare: Money; ivaAvere: Money } {
  return dare.isZero()
    ? { ivaDare: money(0), ivaAvere: iva }
    : { ivaDare: iva, ivaAvere: money(0) }
}

export async function movimentiCashFlow(
  venueId: string,
  anno: number
): Promise<MovimentoAggregato[]> {
  const righe = await prisma.journalEntry.findMany({
    where: {
      ...movimentiChePesano(venueId),
      date: {
        gte: toDateOnlyUtc(`${anno}-01-01`),
        lte: toDateOnlyUtc(`${anno}-12-31`),
      },
    },
    select: {
      accountId: true,
      date: true,
      debitAmount: true,
      creditAmount: true,
      vatAmount: true,
    },
  })

  const perContoEMese = new Map<string, MovimentoAggregato>()

  for (const riga of righe) {
    const mese = riga.date.getUTCMonth() + 1
    const chiave = `${riga.accountId ?? ''}|${mese}`

    const corrente =
      perContoEMese.get(chiave) ??
      {
        accountId: riga.accountId,
        mese,
        dare: money(0),
        avere: money(0),
        ivaDare: money(0),
        ivaAvere: money(0),
      }

    const dare = money(riga.debitAmount ?? 0)
    const avere = money(riga.creditAmount ?? 0)
    const iva = money(riga.vatAmount ?? 0)
    const { ivaDare, ivaAvere } = ripartisciIva(dare, avere, iva)

    perContoEMese.set(chiave, {
      ...corrente,
      dare: corrente.dare.plus(dare),
      avere: corrente.avere.plus(avere),
      ivaDare: corrente.ivaDare.plus(ivaDare),
      ivaAvere: corrente.ivaAvere.plus(ivaAvere),
    })
  }

  return [...perContoEMese.values()]
}
