import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { formatCurrency } from '@/lib/formatters'

/**
 * Il giudizio in linguaggio naturale che risponde alla domanda che il
 * titolare fa davvero guardando il cruscotto: «devo preoccuparmi?».
 *
 * Cash King la risolve con due frasi rassicuranti derivate dalla sola
 * proiezione del saldo («Nessuna tensione prevista», «Linea di Credito: non
 * necessaria») — ma restano serene anche con 54.000 € di fornitori già
 * scaduti, perché lo scaduto passivo non entra nel calcolo: è denaro dovuto
 * *oggi*, non una proiezione futura, e la sola proiezione del saldo non lo
 * vede. Qui lo scaduto passivo è un parametro esplicito e può da solo
 * spostare il giudizio da 'sereno' ad 'attenzione', anche quando la
 * proiezione dei prossimi giorni non segnala nulla.
 *
 * Pura: nessuna chiamata di rete, nessun `new Date()` implicito — riceve già
 * i dati calcolati altrove (la previsione da `/api/dashboard/forecast`, lo
 * scaduto da `/api/scadenzario/summary`) e non ne cerca altri.
 */

export type LivelloGiudizio = 'sereno' | 'attenzione' | 'tensione'

export interface Giudizio {
  livello: LivelloGiudizio
  frase: string
}

/** Data per esteso («domenica 20 settembre»), stessa forma di `dataEstesa` in
 * `src/app/api/dashboard/forecast/route.ts`. */
function dataEstesa(isoDate: string): string {
  return format(parseISO(isoDate), 'EEEE d MMMM', { locale: it })
}

function fraseProiezione(
  livello: LivelloGiudizio,
  saldoMinimo: number,
  giornoFormattato: string,
  soglia: number,
  orizzonteGiorni: number
): string {
  switch (livello) {
    case 'tensione':
      return `Il saldo previsto va in negativo intorno a ${giornoFormattato}: minimo stimato ${formatCurrency(saldoMinimo)} nei prossimi ${orizzonteGiorni} giorni.`
    case 'attenzione':
      return `Il saldo scende sotto la soglia di sicurezza (${formatCurrency(soglia)}) intorno a ${giornoFormattato}, quando il minimo previsto è ${formatCurrency(saldoMinimo)}.`
    case 'sereno':
      return `Nessuna tensione prevista: il saldo minimo resta sopra la soglia di sicurezza nei prossimi ${orizzonteGiorni} giorni.`
  }
}

export function giudicaLiquidita(input: {
  /** Saldo proiettato più basso nell'orizzonte di previsione. */
  saldoMinimo: number
  /** Giorno in cui cade `saldoMinimo`, 'yyyy-MM-dd'. */
  giornoSaldoMinimo: string
  /** Soglia di liquidità bassa configurata per la sede. */
  soglia: number
  /** Ampiezza dell'orizzonte di previsione, in giorni. */
  orizzonteGiorni: number
  /** Importo delle scadenze passive già scadute e non pagate, ad oggi. */
  scadutoPassivo: number
}): Giudizio {
  const { saldoMinimo, giornoSaldoMinimo, soglia, orizzonteGiorni, scadutoPassivo } = input

  const livelloProiezione: LivelloGiudizio =
    saldoMinimo < 0 ? 'tensione' : saldoMinimo < soglia ? 'attenzione' : 'sereno'

  // Sotto questa soglia lo scaduto passivo è rumore (un paio di bollette in
  // ritardo di pochi giorni) e nominarlo darebbe un falso allarme. Scala con
  // la soglia di liquidità bassa invece di essere un numero fisso, così una
  // sede più grande — con una soglia più alta — non viene allertata per cifre
  // che per lei sono irrilevanti.
  const sogliaScadutoRilevante = soglia * 0.1
  const scadutoRilevante = scadutoPassivo > sogliaScadutoRilevante

  // Lo scaduto passivo può solo aggravare il giudizio, mai migliorarlo: se la
  // proiezione è già in tensione o in attenzione, quel livello resta (è la
  // proiezione a determinarlo); se la proiezione è serena ma ci sono fatture
  // già scadute, il giudizio non può restare sereno.
  const livello: LivelloGiudizio =
    livelloProiezione === 'sereno' && scadutoRilevante ? 'attenzione' : livelloProiezione

  const giornoFormattato = dataEstesa(giornoSaldoMinimo)
  let frase = fraseProiezione(livelloProiezione, saldoMinimo, giornoFormattato, soglia, orizzonteGiorni)

  if (scadutoRilevante) {
    frase += ` Occhio anche a ${formatCurrency(scadutoPassivo)} di fatture fornitori già scadute.`
  }

  return { livello, frase }
}
