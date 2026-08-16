/**
 * Quante proposte perdono i 20 punti del fattore «riferimento» pur avendo il
 * numero di fattura nella causale?
 *
 * `contieneRiferimento` normalizza via i separatori — scelta deliberata, serve
 * a far combaciare `FT/2026/432` con `FT 2026 432` — e poi pretende che l'ago
 * non sia delimitato da cifre, per non riconoscere un numero corto dentro uno
 * lungo. Le due cose si scontrano quando la normalizzazione incolla due campi
 * diversi: `Ft.N.3300/00/2026 30/05/2026` diventa `FtN330000202630052026`, e
 * la data che segue fa fallire la guardia.
 *
 * Questo script conta le proposte in cui l'ago è presente **senza** la
 * guardia ma assente **con** la guardia: sono esattamente quelle che il
 * difetto declassa.
 *
 * Uso:
 *   DB_MISURA=misura_vera npx tsx scripts/riconciliazione/quanto-vale-il-riferimento.ts
 */
import { Client } from 'pg'
import { contieneRiferimento } from '../../src/lib/reconciliation/causale'

function soloAlfanumerici(testo: string): string {
  return testo.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

async function main(): Promise<void> {
  const dbName = process.env.DB_MISURA
  if (!dbName) {
    console.error('DB_MISURA è obbligatorio')
    process.exit(1)
  }

  const client = new Client({
    connectionString: `postgresql://nicolascarpa@127.0.0.1:5433/${dbName}`,
  })
  await client.connect()

  const { rows } = await client.query(`
    SELECT DISTINCT p.id, p.punteggio, p.fattori, bt.description AS causale, i.invoice_number AS numero
    FROM reconciliation_proposals p
    JOIN bank_transactions bt ON bt.id = p.bank_transaction_id
    JOIN reconciliation_proposal_legs g ON g.proposal_id = p.id
    JOIN schedules s ON s.id = g.schedule_id
    JOIN electronic_invoices i ON i.id = s.invoice_id
    ORDER BY p.punteggio DESC
  `)

  // Una proposta con più gambe torna più volte dalla join: si contano le
  // proposte distinte, non le righe, altrimenti il guadagno risulta gonfiato.
  const viste = new Set<string>()
  const declassate: Array<{ punteggio: number; numero: string; causale: string }> = []

  for (const r of rows) {
    const fattori = r.fattori as Record<string, number>
    if ((fattori?.riferimento ?? 0) > 0) continue

    const ago = soloAlfanumerici(r.numero ?? '')
    if (ago.length < 3) continue

    // Presente senza guardia, assente con guardia: è il caso del difetto.
    const presenteCrudo = soloAlfanumerici(r.causale).includes(ago)
    if (presenteCrudo && !contieneRiferimento(r.causale, r.numero) && !viste.has(r.id)) {
      viste.add(r.id)
      declassate.push({ punteggio: Number(r.punteggio), numero: r.numero, causale: r.causale })
    }
  }

  console.log(`\nProposte totali esaminate: ${rows.length}`)
  console.log(`Proposte declassate dal difetto: ${declassate.length}\n`)

  for (const d of declassate) {
    const nuovoPunteggio = d.punteggio + 20
    console.log(
      `  ${String(d.punteggio).padStart(3)} → ${String(nuovoPunteggio).padStart(3)}` +
        `${nuovoPunteggio >= 85 && d.punteggio < 85 ? '  ENTRA IN FASCIA ALTA' : ''}` +
        `   fattura ${d.numero}`
    )
    // Il contesto attorno all'ago: è ciò che distingue un falso negativo vero
    // (numero circondato da separatori) da un numero corto pescato dentro un
    // identificativo lungo, che è proprio ciò che la guardia deve rifiutare.
    const causaleNorm = soloAlfanumerici(d.causale)
    const agoNorm = soloAlfanumerici(d.numero)
    const dove = causaleNorm.indexOf(agoNorm)
    const prima = causaleNorm.slice(Math.max(0, dove - 12), dove)
    const dopo = causaleNorm.slice(dove + agoNorm.length, dove + agoNorm.length + 12)
    console.log(`      normalizzata: ...${prima}[${agoNorm}]${dopo}...`)
    console.log(`      originale:    ${d.causale.slice(0, 100)}`)
  }

  const entrerebbero = declassate.filter((d) => d.punteggio < 85 && d.punteggio + 20 >= 85).length
  console.log(
    `\nCorreggendo il difetto, ${entrerebbero} proposte entrerebbero in fascia Alta.\n`
  )

  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
