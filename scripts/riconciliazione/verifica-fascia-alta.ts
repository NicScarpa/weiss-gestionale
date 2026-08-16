/**
 * Controllo di ambiguità sulle proposte in fascia Alta.
 *
 * Vedere «importo identico» non basta a dire che una proposta è giusta: se
 * quell'importo compare su più scadenze aperte, il motore ha scelto fra
 * candidati indistinguibili e potrebbe aver preso il primo. Se invece è unico,
 * l'abbinamento era obbligato.
 *
 * Uso:
 *   DB_MISURA=misura_alta3 npx tsx scripts/riconciliazione/verifica-fascia-alta.ts
 */
import { Client } from 'pg'

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
  SELECT
    p.punteggio,
    bt.description                              AS causale,
    bt.amount                                   AS importo_movimento,
    s.descrizione                               AS scadenza,
    i.invoice_number                            AS numero_fattura,
    (SELECT count(*) FROM schedules s2
       WHERE s2.deleted_at IS NULL
         AND s2.importo_totale = s.importo_totale) AS scadenze_stesso_importo
  FROM reconciliation_proposals p
  JOIN bank_transactions bt ON bt.id = p.bank_transaction_id
  JOIN reconciliation_proposal_legs g ON g.proposal_id = p.id
  JOIN schedules s ON s.id = g.schedule_id
  LEFT JOIN electronic_invoices i ON i.id = s.invoice_id
  WHERE p.punteggio >= 85
  ORDER BY p.punteggio DESC
`)

console.log(`\nProposte in fascia Alta: ${rows.length}\n`)

let ambigue = 0
let citano = 0

for (const [i, r] of rows.entries()) {
  const numero = (r.numero_fattura ?? '').trim()
  // Il numero compare nella causale? Confronto grezzo ma sufficiente: se c'è,
  // l'abbinamento non poggia sull'importo.
  const citato = numero.length > 2 && r.causale.toUpperCase().includes(numero.toUpperCase())
  const concorrenti = Number(r.scadenze_stesso_importo)

  if (citato) citano++
  if (!citato && concorrenti > 1) ambigue++

  console.log(
    `[${i + 1}] ${String(r.punteggio).padStart(3)}  ` +
      `fattura ${numero.padEnd(22)} ` +
      `${citato ? 'numero NELLA causale' : 'numero assente dalla causale'}  ` +
      `scadenze con lo stesso importo: ${concorrenti}`
  )
  if (!citato) console.log(`      causale intera: ${r.causale}`)
}

console.log(`\nRiepilogo:`)
console.log(`  numero di fattura citato nella causale: ${citano} su ${rows.length}`)
console.log(`  abbinamenti su importo NON univoco:     ${ambigue}`)
console.log(
  ambigue === 0
    ? '\n  Nessuna proposta poggia su un importo ambiguo.\n'
    : `\n  ATTENZIONE: ${ambigue} proposte hanno scelto fra candidati indistinguibili.\n`
)

await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
