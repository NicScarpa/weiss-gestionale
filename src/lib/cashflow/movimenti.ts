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
import { logger } from '@/lib/logger'
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
  /**
   * Facoltativo perché all'aggregazione non serve: lo porta il solo avviso di
   * `aggregaMovimenti`, che senza un identificativo direbbe a chi legge i log
   * che «un movimento» non quadra, lasciandogli l'anno da spulciare.
   */
  id?: string
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
 * Sotto questa soglia lo sforamento dell'IVA delle fette non è un disaccordo,
 * è l'ultima cifra di una divisione: il ripiego pro-quota divide con venti
 * cifre significative e la somma delle quote può superare l'IVA di testata di
 * un infinitesimo. Mezzo centesimo è la stessa soglia con cui `money.ts`
 * considera chiusa una posizione. Serve solo a decidere se avvisare: il tetto
 * si applica comunque, e su uno scarto simile non sposta nemmeno un centesimo.
 */
const TOLLERANZA_IVA = money('0.005')

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

/**
 * Il contributo di una fetta, messo dal lato che il verso della riga impone.
 * Importo e IVA passano di qui insieme, così non possono finire su lati
 * diversi: sarebbe un movimento che paga da una parte e detrae dall'altra.
 */
function contributo(inDare: boolean, importo: Money, iva: Money): Contributo {
  return {
    dare: inDare ? importo : money(0),
    avere: inDare ? money(0) : importo,
    ivaDare: inDare ? iva : money(0),
    ivaAvere: inDare ? money(0) : iva,
  }
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
 * Nessun database, così le suddivisioni si testano senza scriverle. L'unico
 * effetto fuori dal valore di ritorno è l'avviso sul tetto dell'IVA, in coda
 * al ciclo di ogni riga: non cambia un solo numero del risultato.
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
 * C'è una terza copia, in report/conto-economico.ts (righe 272-322): dal 12
 * agosto 2026 applica la stessa regola. La testata tiene il resto, in tutti e
 * tre i moduli — non solo qui e in saldi.ts. Prima di quella data
 * `aggregaContoEconomico` ignorava del tutto il conto di testata quando un
 * movimento aveva fette, e un'uscita da 1.000 € suddivisa 700/200 mostrava
 * 900 € "persi" invece di restare sul conto di testata: stesso movimento, due
 * numeri diversi fra questo prospetto e il conto economico.
 *
 * **L'IVA di una riga suddivisa viene dalla fetta stessa, quando la
 * dichiara.** `JournalEntryAllocation.iva` porta l'IVA della fetta: se è
 * valorizzato si usa quello, altrimenti si ricade sul pro-quota sull'importo
 * lordo — la stessa ripartizione di prima. Chi scrive cosa, dal 12 agosto
 * 2026: l'ereditarietà dalla fattura scrive l'IVA esatta di ogni aliquota
 * (`ereditaFetteDaFattura` in schedule-reconciliation-service.ts), mentre la
 * suddivisione manuale di un movimento lascia `null` di proposito — chi
 * divide a mano non sta dichiarando un'IVA, sta dicendo che non la conosce.
 * Il ripiego pro-quota non è quindi codice morto: regge le fette manuali e
 * le fatture le cui righe non riportano un'aliquota leggibile.
 *
 * **Cosa il pro-quota da solo sbaglia, e cosa evita una fetta che dichiara
 * la propria IVA.** Il pro-quota è esatto per il caso che il prodotto
 * genera: le fette sono quote del lordo di un pagamento unico, e su
 * un'aliquota uniforme la ripartizione è quella vera. L'errore compare con
 * aliquote miste, e le aliquote miste non sono un caso raro: la fattura che
 * mette insieme alimentari al 10% e detersivi al 22% è la normalità per un
 * fornitore di ristorazione (vedi il commento sui pesi al lordo in
 * schedule-reconciliation-service.ts:245-252). Esempio: 1.000 € di alimentari
 * e 100 € di detersivi danno fette lorde di 1.100 e 122, con 122 € di IVA in
 * tutto; il pro-quota da solo assegnerebbe 109,82 € e 12,18 € invece dei veri
 * 100 e 22 — quasi 10 € spostati dalla famiglia piccola a quella grande. Una
 * fetta che dichiara la propria IVA evita questo scostamento; una che non la
 * dichiara lo subisce ancora, come prima. Il totale resta comunque esatto
 * (è tolto alla testata per differenza, non ricalcolato): è la singola
 * famiglia a poterne risentire.
 *
 * L'aliquota non è un dato ignoto: sta nello snapshot `invoice.lineItems` di
 * ogni riga fattura, e `schedule-reconciliation-service.ts:253` la legge per
 * l'ereditarietà delle fette. Dal 12 agosto 2026 quella lettura non si ferma
 * più al calcolo dei pesi: l'IVA arriva fino alla fetta e ci resta scritta.
 *
 * **La testata non cede alle fette più IVA di quanta ne dichiari.** È il
 * tetto sul totale, non sulla singola fetta: le fette tengono la propria IVA
 * esatta, la testata scende al più fino a zero. Serve perché fino al 12
 * agosto 2026 nessun percorso automatico valorizzava `vatAmount` — l'import
 * bancario, il motore delle regole e l'esecuzione di un pagamento creano il
 * movimento senza IVA — e la testata finiva a −122 di IVA su una fattura
 * mista da 1.222. Non un numero grande, ma un numero che in questo dominio
 * non esiste: e siccome dopo la riconciliazione il conto di testata È quello
 * della fetta dominante, quel negativo si sommava proprio alla famiglia più
 * grossa (alimentari −1.122 invece di −1.000, con pulizia giusta: la piccola
 * guariva esattamente di quanto la grande si ammalava). Nessuno dei quattro
 * controlli di quadratura poteva accorgersene — due contano i conti, uno
 * guarda il lordo, e il quarto quadra per identità algebrica qualunque sia la
 * distribuzione dell'IVA fra i conti.
 *
 * **Conseguenza voluta del tetto:** quando le fette dichiarano più IVA della
 * testata, la somma dell'IVA sui conti supera quella dichiarata dal
 * movimento. È la scelta giusta perché la fattura è la fonte autorevole e un
 * `vatAmount` a `null` significa «non dichiarata», non «zero». Il lordo non
 * ne risente: il controllo di quadratura guarda `dare − avere`, che non
 * cambia comunque si distribuisca l'IVA. Quando il tetto scatta davvero c'è
 * un `logger.warn`: vuol dire che il movimento e le sue fette raccontano due
 * storie diverse, e la cosa va guardata da un essere umano. Dalla stessa data
 * la riconciliazione scrive l'IVA sulla testata, quindi su quel percorso il
 * tetto è normalmente inerte: resta per i movimenti che l'IVA non ce l'hanno
 * per altre ragioni.
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
    const ivaTestata = ivaDare.plus(ivaAvere)

    // Quanta IVA la testata ha ancora da cedere, e quanta le fette hanno
    // dichiarato senza poterla prendere da lei.
    let ivaCedibile = ivaTestata
    let ivaOltreLaTestata = money(0)

    for (const fetta of riga.allocations) {
      const quota = money(fetta.importo)

      // L'IVA della fetta: quella dichiarata se c'è, altrimenti la quota
      // pro-quota dell'IVA di testata. Il ripiego resta perché una fetta
      // creata a mano non dichiara un'aliquota, e perché una fattura le cui
      // righe non riportano l'aliquota non può produrne una esatta.
      //
      // `== null` e non `===`: `MoneyInput` ammette già `undefined`, quindi
      // una fetta priva del campo supera il typecheck; con `===` cadrebbe nel
      // ramo "dichiarata", dove `money(undefined)` vale 0, e un «non lo so»
      // diventerebbe in silenzio un «niente IVA».
      const ivaFetta =
        fetta.iva == null
          ? lordoRiga.isZero()
            ? money(0)
            : ivaTestata.times(quota.div(lordoRiga))
          : money(fetta.iva)

      // Il tetto: dalla testata si toglie l'importo pieno della fetta, ma solo
      // l'IVA che le resta da cedere. Sul ripiego pro-quota è inerte per
      // costruzione — la somma delle fette non supera l'importo utile del
      // movimento, quindi la somma delle loro quote di IVA non supera quella
      // di testata.
      const ivaCeduta = ivaFetta.greaterThan(ivaCedibile) ? ivaCedibile : ivaFetta
      ivaCedibile = ivaCedibile.minus(ivaCeduta)
      ivaOltreLaTestata = ivaOltreLaTestata.plus(ivaFetta.minus(ivaCeduta))

      // Via dal conto di testata…
      aggiungi(riga.accountId, mese, negato(contributo(inDare, quota, ivaCeduta)))
      // …e sul conto della fetta, con la sua IVA intera.
      aggiungi(fetta.accountId, mese, contributo(inDare, quota, ivaFetta))
    }

    if (ivaOltreLaTestata.greaterThan(TOLLERANZA_IVA)) {
      logger.warn('Le fette dichiarano più IVA della testata: il prospetto tiene quella delle fette', {
        journalEntryId: riga.id,
        accountId: riga.accountId,
        data: riga.date.toISOString().slice(0, 10),
        ivaTestata: ivaTestata.toFixed(2),
        ivaOltreLaTestata: ivaOltreLaTestata.toFixed(2),
      })
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
      id: true,
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
