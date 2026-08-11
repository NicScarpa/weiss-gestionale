import { money, toApi, type Money } from '@/lib/money'

/**
 * La proiezione del saldo nel tempo, in un posto solo.
 *
 * Ci sono due difetti distinti a monte, e vale la pena tenerli separati
 * perché questo modulo li chiude entrambi.
 *
 * Il primo è una duplicazione di **modello dati**: `RecurringExpense` e
 * `Recurrence` descrivono entrambi la stessa cosa, un'uscita che si ripete, e
 * sono disgiunti — nessun percorso converte l'uno nell'altro. L'affitto
 * inserito in una sola pagina spariva dall'altra proiezione; inserito in
 * entrambe veniva contato due volte.
 *
 * Il secondo è una duplicazione di **rotta**: la stessa domanda — quanti
 * soldi avrò — aveva tre risposte con tre basi diverse. `/api/dashboard/forecast`
 * proiettava le spese ricorrenti (`RecurringExpense`), `/api/scadenzario/saldo-scalare`
 * le scadenze generate dalle ricorrenze dello scadenzario (`Recurrence` →
 * `Schedule`), `/api/cashflow/projection` i movimenti già registrati in prima
 * nota. Nessuna delle tre vedeva le altre fonti e nessuna dichiarava di non
 * vederle.
 *
 * ## La gerarchia
 *
 * Quando due flussi descrivono **lo stesso denaro** — cioè portano la stessa
 * `chiave` nello stesso giorno — ne sopravvive uno solo, il più affidabile:
 *
 *     movimento registrato  >  scadenza aperta  >  ricorrente non scadenzata  >  stima
 *
 * È la stessa gerarchia che Agicap applica spegnendo le ricorrenze nel breve
 * termine, «il periodo in cui le previsioni sono coperte da altre fonti». La
 * `stima` (proiezione statistica, tipicamente gli incassi da banco dedotti
 * dallo storico chiusure) vince per ultima: non descrive un impegno preso ma
 * una media, quindi cede il passo a chiunque altro descriva lo stesso denaro
 * in modo più preciso.
 *
 * Un flusso **senza chiave** non viene mai scartato: senza chiave non si può
 * affermare che due flussi siano lo stesso denaro, e scartare per somiglianza
 * (stesso importo, descrizione simile) farebbe sparire uscite vere.
 *
 * La funzione è pura: chi legge `RecurringExpense`, `Schedule` e i movimenti
 * dal database per costruire l'elenco di `FlussoPrevisto` sta altrove (Task 4).
 */

export type FontePrevisione = 'movimento' | 'scadenza' | 'ricorrente' | 'stima'

/** Affidabilità decrescente. L'indice più basso vince. */
const PRECEDENZA: FontePrevisione[] = ['movimento', 'scadenza', 'ricorrente', 'stima']

export interface FlussoPrevisto {
  /** Giorno civile, 'yyyy-MM-dd'. */
  giorno: string
  /** Positivo = entrata, negativo = uscita. */
  importo: number
  fonte: FontePrevisione
  descrizione: string
  /**
   * Chiave di sovrapposizione: due flussi con la stessa chiave nello stesso
   * giorno sono lo stesso denaro visto da due fonti diverse. Assente quando la
   * sovrapposizione non è dimostrabile.
   */
  chiave?: string
}

export interface PuntoSerie {
  giorno: string
  saldo: number
  entrate: number
  uscite: number
  perFonte: Record<FontePrevisione, number>
}

function giorniDellaFinestra(dal: string, al: string): string[] {
  const giorni: string[] = []
  const cursore = new Date(`${dal}T00:00:00Z`)
  const fine = new Date(`${al}T00:00:00Z`)

  while (cursore <= fine) {
    giorni.push(cursore.toISOString().slice(0, 10))
    cursore.setUTCDate(cursore.getUTCDate() + 1)
  }

  return giorni
}

/**
 * Toglie i flussi che una fonte più affidabile già copre. Il confronto è per
 * (giorno, chiave): flussi senza chiave passano sempre.
 *
 * Il filtro finale confronta la **fonte** vincitrice, non l'identità del
 * singolo flusso: si scarta chi ha una fonte meno affidabile di un'altra
 * presente sulla stessa chiave e sullo stesso giorno. Ne segue che due flussi
 * con la stessa chiave, lo stesso giorno E la stessa fonte non si escludono
 * mai a vicenda — sopravvivono entrambi, perché due scadenze della stessa
 * ricorrenza nello stesso giorno sono due impegni distinti, non un duplicato.
 */
function risolviSovrapposizioni(flussi: FlussoPrevisto[]): FlussoPrevisto[] {
  const vincitore = new Map<string, FontePrevisione>()

  for (const flusso of flussi) {
    if (!flusso.chiave) continue
    const k = `${flusso.giorno}::${flusso.chiave}`
    const attuale = vincitore.get(k)

    if (attuale === undefined || PRECEDENZA.indexOf(flusso.fonte) < PRECEDENZA.indexOf(attuale)) {
      vincitore.set(k, flusso.fonte)
    }
  }

  return flussi.filter((flusso) => {
    if (!flusso.chiave) return true
    return vincitore.get(`${flusso.giorno}::${flusso.chiave}`) === flusso.fonte
  })
}

/**
 * Serie del saldo giorno per giorno fra `dal` e `al`, estremi compresi, a
 * partire da `saldoIniziale`. Ogni giorno della finestra compare in output
 * anche senza flussi propri.
 */
export function proietta(input: {
  saldoIniziale: number
  dal: string
  al: string
  flussi: FlussoPrevisto[]
}): PuntoSerie[] {
  const giorni = giorniDellaFinestra(input.dal, input.al)
  const dentroFinestra = new Set(giorni)

  const superstiti = risolviSovrapposizioni(
    input.flussi.filter((f) => dentroFinestra.has(f.giorno))
  )

  const perGiorno = new Map<string, FlussoPrevisto[]>()
  for (const flusso of superstiti) {
    const elenco = perGiorno.get(flusso.giorno) ?? []
    elenco.push(flusso)
    perGiorno.set(flusso.giorno, elenco)
  }

  let saldo: Money = money(input.saldoIniziale)
  const serie: PuntoSerie[] = []

  for (const giorno of giorni) {
    const delGiorno = perGiorno.get(giorno) ?? []

    let entrate = money(0)
    let uscite = money(0)
    const perFonte: Record<FontePrevisione, Money> = {
      movimento: money(0),
      scadenza: money(0),
      ricorrente: money(0),
      stima: money(0),
    }

    for (const flusso of delGiorno) {
      const importo = money(flusso.importo)
      if (flusso.importo >= 0) entrate = entrate.plus(importo)
      else uscite = uscite.plus(importo.abs())
      perFonte[flusso.fonte] = perFonte[flusso.fonte].plus(importo)
    }

    saldo = saldo.plus(entrate).minus(uscite)

    serie.push({
      giorno,
      saldo: toApi(saldo),
      entrate: toApi(entrate),
      uscite: toApi(uscite),
      perFonte: {
        movimento: toApi(perFonte.movimento),
        scadenza: toApi(perFonte.scadenza),
        ricorrente: toApi(perFonte.ricorrente),
        stima: toApi(perFonte.stima),
      },
    })
  }

  return serie
}
