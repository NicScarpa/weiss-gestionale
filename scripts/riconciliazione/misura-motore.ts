/**
 * Misura il motore di riconciliazione sui movimenti veri.
 *
 * Non è un test: è una misurazione. La differenza conta, perché un test verde
 * dice "non è esploso" mentre qui serve sapere *quante* proposte escono, in che
 * fascia, e con quale distribuzione dei fattori. Un motore che non trova niente
 * e un motore che funziona superano gli stessi test finché l'ingresso è vuoto.
 *
 * Uso:
 *   npx tsx scripts/riconciliazione/misura-motore.ts
 *
 * Misura solo la distribuzione dei fattori estraibili dalle causali
 * (riferimento e partita IVA), che è già il dato più utile: dice quanti
 * movimenti hanno un numero fattura leggibile e quanti nominano una
 * controparte. Il motore vero e proprio, con `generaLotto` su un database di
 * prova, è in `misura-lotto.ts`.
 */
import { estraiRiferimentiDocumento, estraiPartiteIva, normalizzaTesto } from '../../src/lib/reconciliation/causale'
import { leggiMovimenti, causaleDi, CARTELLA_SNAPSHOT } from './snapshot'

function main(): void {
  const movimenti = leggiMovimenti()

  if (movimenti.length === 0) {
    console.error(
      'Nessun movimento trovato in ' + CARTELLA_SNAPSHOT + '.\n' +
      'Controlla i nomi dei campi contro un file vero prima di concludere che il motore non funziona.'
    )
    process.exit(1)
  }

  const uscite = movimenti.filter((m) => Number(m.transactionAmount?.amount ?? 0) < 0)
  const entrate = movimenti.filter((m) => Number(m.transactionAmount?.amount ?? 0) >= 0)

  const conRiferimento = (gruppo: typeof movimenti) =>
    gruppo.filter((m) => estraiRiferimentiDocumento(causaleDi(m)).length > 0).length

  const quota = (n: number, su: number) => (su === 0 ? '—' : `${((n / su) * 100).toFixed(1)}%`)

  console.log(`\nMovimenti letti (deduplicati su internalTransactionId): ${movimenti.length}\n`)

  // **Separati per verso, e il motivo non è cosmetico.** Un incasso da SumUp o
  // da Stripe non cita una *nostra* fattura per costruzione: metterlo nello
  // stesso denominatore dei pagamenti ai fornitori produce una percentuale
  // bassa che sembra un difetto delle espressioni regolari e non lo è.
  for (const [nome, gruppo] of [
    ['USCITE', uscite],
    ['ENTRATE', entrate],
    ['TUTTI', movimenti],
  ] as const) {
    const n = conRiferimento(gruppo)
    console.log(
      `${nome.padEnd(8)} ${String(gruppo.length).padStart(4)} movimenti — con riferimento: ${String(n).padStart(3)} (${quota(n, gruppo.length)})`
    )
  }

  const conPartitaIva = movimenti.filter((m) => estraiPartiteIva(causaleDi(m)).length > 0).length
  const conCodice = movimenti.filter((m) => m.proprietaryBankTransactionCode).length
  console.log(`\nCon una partita IVA nella causale:    ${conPartitaIva} (${quota(conPartitaIva, movimenti.length)})`)
  console.log(`Con un codice operazione della banca:  ${conCodice} (${quota(conCodice, movimenti.length)})`)

  // **La tabella che conta davvero.** Non la frequenza del codice, ma il codice
  // incrociato con la presenza di un riferimento e con un esempio di causale:
  // è così che si capisce *cosa* è ciascun codice, e quindi come popolare
  // `mappaCodiciBanca`. Un codice che copre il 30% delle uscite e non ha mai un
  // riferimento non è un difetto: sono le commissioni bancarie, che una fattura
  // non ce l'hanno.
  console.log('\nCodici operazione delle USCITE — frequenza, riferimenti, e un esempio:')
  const perCodice = new Map<string, typeof movimenti>()
  for (const m of uscite) {
    const codice = m.proprietaryBankTransactionCode ?? '(assente)'
    const gruppo = perCodice.get(codice)
    if (gruppo) gruppo.push(m)
    else perCodice.set(codice, [m])
  }
  for (const [codice, gruppo] of [...perCodice.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const n = conRiferimento(gruppo)
    const esempio = normalizzaTesto(causaleDi(gruppo[0])).slice(0, 60)
    console.log(
      `  ${codice.padEnd(10)} ${String(gruppo.length).padStart(4)} (${quota(gruppo.length, uscite.length).padStart(6)})  rif: ${String(n).padStart(3)}  ${esempio}`
    )
  }

  console.log('\nOtto uscite senza riferimento leggibile (col loro codice):')
  let mostrate = 0
  for (const m of uscite) {
    if (mostrate >= 8) break
    const causale = causaleDi(m)
    if (estraiRiferimentiDocumento(causale).length > 0) continue
    console.log(`  [${m.proprietaryBankTransactionCode}] ${normalizzaTesto(causale).slice(0, 100)}`)
    mostrate++
  }
  console.log()
}

main()
