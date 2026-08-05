/**
 * Backfill degli hash di lookup (fiscalCodeHash, ibanHash) per i record
 * esistenti di Supplier e BankAccount.
 *
 * Passando dall'estensione di cifratura, l'update ricifra anche i valori
 * legacy ancora in chiaro (scritti prima dell'attivazione della cifratura),
 * uniformando lo stato dei dati.
 *
 * Uso: npx tsx scripts/backfill-encryption-hashes.ts
 * Idempotente: i record con hash già valorizzato e valore cifrato vengono saltati.
 */
import { prisma } from '../src/lib/prisma'
import { isEncrypted } from '../src/lib/encryption'

async function main() {
  let suppliersUpdated = 0
  let accountsUpdated = 0

  // Supplier: fiscalCode → fiscalCodeHash (+ ricifratura iban legacy)
  const suppliers = await prisma.supplier.findMany({
    select: { id: true, fiscalCode: true, fiscalCodeHash: true, iban: true },
  })
  for (const s of suppliers) {
    const needsHash = s.fiscalCode && !s.fiscalCodeHash
    // findMany decifra: se il valore su disco era in chiaro resta in chiaro.
    // Rileggiamo il raw per capire se serve ricifrare.
    const raw = await prisma.$queryRaw<{ fiscal_code: string | null; iban: string | null }[]>`
      SELECT fiscal_code, iban FROM suppliers WHERE id = ${s.id}`
    const rawCf = raw[0]?.fiscal_code
    const rawIban = raw[0]?.iban
    const cfPlaintext = rawCf && !isEncrypted(rawCf)
    const ibanPlaintext = rawIban && !isEncrypted(rawIban)

    if (!needsHash && !cfPlaintext && !ibanPlaintext) continue

    // L'update passa dall'estensione: calcola l'hash e cifra i valori in chiaro
    await prisma.supplier.update({
      where: { id: s.id },
      data: {
        ...(s.fiscalCode ? { fiscalCode: s.fiscalCode } : {}),
        ...(s.iban && ibanPlaintext ? { iban: s.iban } : {}),
      },
    })
    suppliersUpdated++
  }

  // BankAccount: iban → ibanHash
  const accounts = await prisma.bankAccount.findMany({
    select: { id: true, iban: true, ibanHash: true },
  })
  for (const a of accounts) {
    if (!a.iban) continue
    const raw = await prisma.$queryRaw<{ iban: string | null }[]>`
      SELECT iban FROM bank_accounts WHERE id = ${a.id}`
    const rawIban = raw[0]?.iban
    const ibanPlaintext = rawIban && !isEncrypted(rawIban)

    if (a.ibanHash && !ibanPlaintext) continue

    await prisma.bankAccount.update({
      where: { id: a.id },
      data: { iban: a.iban },
    })
    accountsUpdated++
  }

  console.log(`Fornitori aggiornati: ${suppliersUpdated}/${suppliers.length}`)
  console.log(`Conti bancari aggiornati: ${accountsUpdated}/${accounts.length}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
