import { prisma } from '../src/lib/prisma'

async function main() {
  console.log('Deleting all bank transactions...')

  // Prima elimina tutte le transazioni bancarie
  const txResult = await prisma.bankTransaction.deleteMany({})
  console.log(`Deleted ${txResult.count} bank transactions`)

  // Poi elimina tutti i batch di import
  const batchResult = await prisma.importBatch.deleteMany({})
  console.log(`Deleted ${batchResult.count} import batches`)

  console.log('Done!')
}

main()
  .catch(console.error)
  .finally(() => process.exit(0))
