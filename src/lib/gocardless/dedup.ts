/**
 * Deduplicazione dei movimenti che arrivano dalla banca.
 *
 * La chiave è `(bankAccountId, providerTransactionId)` e il conto non è un
 * dettaglio: l'identificativo di GoCardless è un contatore per giorno e per
 * conto, quindi `20260810-6` esiste su ogni conto riferito a un movimento
 * diverso. Misurato sul campo: 244 valori condivisi su 653 movimenti di due
 * conti. Una deduplica senza il conto scarterebbe quei movimenti come
 * duplicati, in silenzio.
 *
 * Si interroga il database invece di affidarsi a `skipDuplicates`: il vincolo
 * è un indice UNIQUE **parziale**, e Prisma non rappresenta gli indici
 * parziali — `skipDuplicates` non saprebbe su cosa appoggiarsi. L'indice resta
 * comunque la rete di sicurezza contro due sincronizzazioni in parallelo.
 */
import type { Prisma, PrismaClient } from '@prisma/client'

import type { MovimentoDaSalvare } from './mapper'

export interface EsitoDeduplica {
  nuovi: MovimentoDaSalvare[]
  duplicati: number
}

export async function filtraGiaPresenti(
  db: PrismaClient | Prisma.TransactionClient,
  parametri: { bankAccountId: string; movimenti: MovimentoDaSalvare[] }
): Promise<EsitoDeduplica> {
  const { bankAccountId, movimenti } = parametri
  if (movimenti.length === 0) return { nuovi: [], duplicati: 0 }

  const presenti = new Set(
    (
      await db.bankTransaction.findMany({
        where: {
          bankAccountId,
          providerTransactionId: { in: movimenti.map((m) => m.providerTransactionId) },
          deletedAt: null,
        },
        select: { providerTransactionId: true },
      })
    ).map((r) => r.providerTransactionId)
  )

  const nuovi: MovimentoDaSalvare[] = []
  let duplicati = 0

  for (const m of movimenti) {
    if (presenti.has(m.providerTransactionId)) {
      duplicati++
      continue
    }
    nuovi.push(m)
    // Lo stesso identificativo ripetuto dentro una sola risposta è la stessa
    // operazione elencata due volte: la seconda comparsa è un duplicato, e
    // senza questo passerebbe il filtro per poi far esplodere la INSERT.
    presenti.add(m.providerTransactionId)
  }

  return { nuovi, duplicati }
}
