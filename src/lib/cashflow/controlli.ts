/**
 * I quattro controlli di quadratura del prospetto.
 *
 * Non sono facoltativi: un prospetto senza di loro è un numero di cui fidarsi
 * sulla parola. Tre su quattro intercettano una classe di errore già presente
 * nel file di contabilità da cui questo modulo nasce.
 */
import { money, toApi, type Money } from '@/lib/money'
import { lordo, type MovimentoAggregato } from './movimenti'
import { vociRiconosciute } from './riclassificazione'
import type { Prospetto } from './prospetto'

export interface EsitoControllo {
  codice: 'C1' | 'C2' | 'C3' | 'C4'
  nome: string
  esito: 'ok' | 'attenzione'
  /** Lo scarto in euro, o il numero di movimenti, a seconda del controllo. */
  valore: number
  spiegazione: string
}

export interface InputControlli {
  prospetto: Prospetto
  movimenti: MovimentoAggregato[]
  codicePerConto: Map<string, string>
  /** Variazione dei saldi di cassa e banca nel periodo, dal loro estratto. */
  variazioneReale: Money
}

/** Sotto il centesimo è arrotondamento, non un errore. */
const TOLLERANZA = 0.005

export function eseguiControlli({
  prospetto,
  movimenti,
  codicePerConto,
  variazioneReale,
}: InputControlli): EsitoControllo[] {
  return [
    quadraturaColSaldo(prospetto, variazioneReale),
    versamentiADueGambe(movimenti, codicePerConto),
    movimentiSenzaConto(movimenti),
    contiNonRiconosciuti(movimenti, codicePerConto),
  ]
}

/**
 * C1 — la somma del prospetto deve spiegare tutta la variazione dei saldi.
 * Se non lo fa, c'è denaro che si è mosso senza comparire da nessuna parte:
 * una voce non mappata, o un movimento su un conto che il prospetto ignora.
 */
function quadraturaColSaldo(prospetto: Prospetto, variazioneReale: Money): EsitoControllo {
  const variazione = prospetto.righe.find((r) => r.codice === 'VAR')
  const dalProspetto = money(variazione?.valori.annual ?? 0)
  const scarto = variazioneReale.minus(dalProspetto)
  const fuoriTolleranza = scarto.abs().greaterThan(TOLLERANZA)

  return {
    codice: 'C1',
    nome: 'Quadratura col saldo reale',
    esito: fuoriTolleranza ? 'attenzione' : 'ok',
    valore: toApi(scarto),
    spiegazione: fuoriTolleranza
      ? `Il prospetto spiega ${toApi(dalProspetto)} € dei ${toApi(variazioneReale)} € ` +
        'di variazione reale: la differenza è denaro che si è mosso senza comparire.'
      : 'Il prospetto spiega tutta la variazione dei saldi.',
  }
}

/**
 * C2 — un versamento di contanti in banca è la stessa somma che esce dalla
 * cassa: le due gambe devono elidersi. Quando non lo fanno, una delle due non
 * è stata registrata.
 */
function versamentiADueGambe(
  movimenti: MovimentoAggregato[],
  codicePerConto: Map<string, string>
): EsitoControllo {
  const CODICI_TESORERIA = ['40.4.01', '40.4.02']

  const saldo = movimenti.reduce((acc, movimento) => {
    if (!movimento.accountId) return acc
    const codice = codicePerConto.get(movimento.accountId)
    if (!codice || !CODICI_TESORERIA.includes(codice)) return acc
    return acc.plus(lordo(movimento))
  }, money(0))

  const fuoriTolleranza = saldo.abs().greaterThan(TOLLERANZA)

  return {
    codice: 'C2',
    nome: 'Versamenti e giroconti a due gambe',
    esito: fuoriTolleranza ? 'attenzione' : 'ok',
    valore: toApi(saldo),
    spiegazione: fuoriTolleranza
      ? `Versamenti e giroconti non si elidono per ${toApi(saldo)} €: ` +
        'una gamba è stata registrata e l\'altra no.'
      : 'Versamenti e giroconti si elidono.',
  }
}

/** C3 — un movimento senza conto non appartiene a nessuna riga: sparisce. */
function movimentiSenzaConto(movimenti: MovimentoAggregato[]): EsitoControllo {
  const quanti = movimenti.filter((m) => !m.accountId).length

  return {
    codice: 'C3',
    nome: 'Movimenti senza voce di conto',
    esito: quanti > 0 ? 'attenzione' : 'ok',
    valore: quanti,
    spiegazione:
      quanti > 0
        ? `${quanti} gruppi di movimenti non hanno un conto: non compaiono in nessuna riga.`
        : 'Ogni movimento ha una voce di conto.',
  }
}

/**
 * C4 — un conto movimentato che la riclassificazione non conosce.
 *
 * È il controllo che rimpiazza la colonna `isCashFlow` scartata in fase di
 * piano: se qualcuno crea un conto nuovo e non lo mappa, qui si vede, invece
 * di sparire in silenzio dal prospetto. Le voci esplicitamente fuori cassa non
 * contano: `vociRiconosciute()` le include già, per costruzione (sono nel
 * piano dei conti, solo escluse dal prospetto perché non toccano mai cassa).
 */
function contiNonRiconosciuti(
  movimenti: MovimentoAggregato[],
  codicePerConto: Map<string, string>
): EsitoControllo {
  const riconosciute = vociRiconosciute()
  const ignoti = new Set<string>()

  for (const movimento of movimenti) {
    if (!movimento.accountId) continue
    const codice = codicePerConto.get(movimento.accountId)
    if (!codice) {
      ignoti.add(movimento.accountId)
      continue
    }
    if (!riconosciute.has(codice)) {
      ignoti.add(codice)
    }
  }

  return {
    codice: 'C4',
    nome: 'Conti non riconosciuti dalla riclassificazione',
    esito: ignoti.size > 0 ? 'attenzione' : 'ok',
    valore: ignoti.size,
    spiegazione:
      ignoti.size > 0
        ? `Movimentati ma non mappati: ${[...ignoti].sort().join(', ')}. ` +
          'Il loro importo non compare nel prospetto.'
        : 'Ogni conto movimentato è mappato o dichiarato fuori cassa.',
  }
}
