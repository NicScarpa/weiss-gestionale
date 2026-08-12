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
import { money, type Money, type MoneyInput } from '@/lib/money'
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
 * La riga di prima nota come la legge questo modulo, con le sue fette.
 *
 * I nomi sono quelli di Prisma e non l'italiano del resto del file: così le
 * righe lette dal database soddisfano il tipo senza una conversione di mezzo,
 * che su qualche migliaio di movimenti sarebbe solo lavoro sprecato. Stessa
 * scelta, e stesso motivo, di `MovimentoContoEconomico` in report/conto-economico.ts.
 */
export interface MovimentoPrimaNota {
  accountId: string | null
  date: Date
  debitAmount: MoneyInput
  creditAmount: MoneyInput
  vatAmount: MoneyInput
  allocations: readonly { accountId: string; importo: MoneyInput; iva: MoneyInput | null }[]
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

/** Quanto una riga aggiunge a un conto in un mese. Può essere negativo. */
interface Contributo {
  dare: Money
  avere: Money
  ivaDare: Money
  ivaAvere: Money
}

function negato(c: Contributo): Contributo {
  return {
    dare: c.dare.negated(),
    avere: c.avere.negated(),
    ivaDare: c.ivaDare.negated(),
    ivaAvere: c.ivaAvere.negated(),
  }
}

/**
 * Aggrega le righe di prima nota per conto e mese, rispettando le suddivisioni.
 *
 * Pura: nessun database, così le suddivisioni si testano senza scriverle.
 *
 * **Le suddivisioni spostano l'importo sui conti delle fette.** La regola è
 * quella già stabilita da `movimentiPerContoEMese` in saldi.ts (righe 385-448,
 * dove il commento racconta il guasto che l'ha resa necessaria: un pagamento
 * da 1.000 € diviso 700 «Alimentari» e 300 «Pulizie» compariva nel budget come
 * 1.000 e 0). Dal conto di testata si toglie **solo la somma delle fette**, non
 * l'importo intero: una suddivisione parziale lascia il resto dov'era. Il
 * totale non cambia mai — l'importo si sposta, non si crea e non si perde.
 *
 * La regola è duplicata invece che riusata perché saldi.ts aggrega con una
 * `groupBy` più una seconda query sulle fette, e non conosce affatto la
 * dimensione IVA che qui è metà del lavoro: estrarre un tronco comune avrebbe
 * voluto dire riscrivere la query degli actual di budget, che è in produzione.
 * Se si tocca la semantica qui, va guardato anche lì.
 *
 * C'è una terza copia, in report/conto-economico.ts (righe ~272-296), e lì la
 * regola NON è la stessa: quando un movimento ha fette, quella funzione
 * ignora del tutto il conto di testata invece di lasciargli il resto —
 * un'uscita da 1.000 € suddivisa 700/200 mostra 900 € "persi" invece di
 * restare sul conto di testata. Su una suddivisione parziale questo prospetto
 * e il conto economico raccontano quindi due numeri diversi per lo stesso
 * movimento. Quale dei due comportamenti sia quello giusto è una domanda per
 * chi possiede quel report, non qualcosa da uniformare qui di riflesso.
 *
 * **L'IVA di una riga suddivisa viene dalla fetta stessa, quando la
 * dichiara.** `JournalEntryAllocation.iva` porta l'aliquota della fetta: se
 * è valorizzato si usa quello, altrimenti si ricade sul pro-quota
 * sull'importo lordo — la stessa ripartizione di prima. Il ripiego non è un
 * caso raro: nessun percorso di scrittura valorizza ancora il campo, quindi
 * ogni fetta oggi in produzione ricade sul pro-quota esattamente come prima
 * che questo campo esistesse.
 *
 * **Cosa il pro-quota da solo sbaglia, e cosa evita una fetta che dichiara
 * la propria IVA.** Il pro-quota è esatto per il caso che il prodotto
 * genera: le fette sono quote del lordo di un pagamento unico, e su
 * un'aliquota uniforme la ripartizione è quella vera. L'errore compare con
 * aliquote miste, e le aliquote miste non sono un caso raro: la fattura che
 * mette insieme alimentari al 10% e detersivi al 22% è la normalità per un
 * fornitore di ristorazione (vedi il commento su `aliquoteDelloSnapshot` in
 * schedule-reconciliation-service.ts:170-177). Esempio: 1.000 € di alimentari
 * e 100 € di detersivi danno fette lorde di 1.100 e 122, con 122 € di IVA in
 * tutto; il pro-quota da solo assegnerebbe 109,82 € e 12,18 € invece dei veri
 * 100 e 22 — quasi 10 € spostati dalla famiglia piccola a quella grande. Una
 * fetta che dichiara la propria IVA evita questo scostamento; una che non la
 * dichiara lo subisce ancora, come prima. Il totale resta comunque esatto
 * (è tolto alla testata per differenza, non ricalcolato): è la singola
 * famiglia a poterne risentire.
 *
 * L'aliquota non è un dato ignoto: sta nello snapshot `invoice.lineItems` di
 * ogni riga fattura, e `schedule-reconciliation-service.ts:178` la legge già
 * per l'ereditarietà pro-quota delle fette. Il campo che la persiste su
 * `JournalEntryAllocation` esiste, ma nessun percorso di scrittura lo popola
 * ancora: chi crea una fetta, manuale o ereditata, continua a lasciarla a
 * `null`.
 */
export function aggregaMovimenti(
  righe: readonly MovimentoPrimaNota[]
): MovimentoAggregato[] {
  const perContoEMese = new Map<string, MovimentoAggregato>()

  const aggiungi = (accountId: string | null, mese: number, c: Contributo) => {
    const chiave = `${accountId ?? ''}|${mese}`

    const corrente =
      perContoEMese.get(chiave) ??
      {
        accountId,
        mese,
        dare: money(0),
        avere: money(0),
        ivaDare: money(0),
        ivaAvere: money(0),
      }

    perContoEMese.set(chiave, {
      ...corrente,
      dare: corrente.dare.plus(c.dare),
      avere: corrente.avere.plus(c.avere),
      ivaDare: corrente.ivaDare.plus(c.ivaDare),
      ivaAvere: corrente.ivaAvere.plus(c.ivaAvere),
    })
  }

  for (const riga of righe) {
    const mese = riga.date.getUTCMonth() + 1

    const dare = money(riga.debitAmount)
    const avere = money(riga.creditAmount)
    const { ivaDare, ivaAvere } = ripartisciIva(dare, avere, money(riga.vatAmount))

    aggiungi(riga.accountId, mese, { dare, avere, ivaDare, ivaAvere })

    if (riga.allocations.length === 0) continue

    // Il verso della fetta è quello della riga che la contiene: una
    // suddivisione non cambia il segno di ciò che è stato pagato o incassato.
    // Stessa condizione di `ripartisciIva`, così il verso dell'importo e
    // quello della sua IVA non possono divergere.
    const inDare = !dare.isZero()
    const lordoRiga = dare.plus(avere)

    for (const fetta of riga.allocations) {
      const quota = money(fetta.importo)

      // L'IVA della fetta: quella dichiarata se c'è, altrimenti la quota
      // pro-quota dell'IVA di testata. Il ripiego resta perché una fetta
      // creata a mano non dichiara un'aliquota, e perché una fattura le cui
      // righe non riportano l'aliquota non può produrne una esatta.
      const ivaTestata = ivaDare.plus(ivaAvere)
      const ivaFetta =
        fetta.iva === null
          ? lordoRiga.isZero()
            ? money(0)
            : ivaTestata.times(quota.div(lordoRiga))
          : money(fetta.iva)

      const spostamento: Contributo = {
        dare: inDare ? quota : money(0),
        avere: inDare ? money(0) : quota,
        ivaDare: inDare ? ivaFetta : money(0),
        ivaAvere: inDare ? money(0) : ivaFetta,
      }

      // Via dal conto di testata…
      aggiungi(riga.accountId, mese, negato(spostamento))
      // …e sul conto della fetta.
      aggiungi(fetta.accountId, mese, spostamento)
    }
  }

  return [...perContoEMese.values()]
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
      // Le fette in join e non in una seconda query: sono già ristrette ai
      // movimenti che pesano dal filtro qui sopra, e il commento sul perché
      // di quel filtro resta uno solo.
      allocations: { select: { accountId: true, importo: true, iva: true } },
    },
  })

  return aggregaMovimenti(righe)
}
