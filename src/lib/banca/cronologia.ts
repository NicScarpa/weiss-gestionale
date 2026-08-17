import type { TransactionClient } from '@/lib/prisma'

/**
 * La cronologia delle modifiche a un movimento bancario: una riga per campo
 * cambiato, prima/dopo/chi/quando. Il badge «Modificato» guarda i soli campi
 * del movimento (`CAMPI_BADGE`): spostare di scheda si registra ma non è una
 * modifica del movimento.
 */
export const CAMPI_BADGE = ['descrizione', 'causale', 'note'] as const
export type CampoCronologia = 'descrizione' | 'causale' | 'note' | 'sezione'

export interface Modifica {
  campo: CampoCronologia
  prima: string | null
  dopo: string | null
}

/** Solo ciò che cambia davvero: un valore uguale a prima non lascia traccia. */
export function differenze(
  prima: Record<CampoCronologia, string | null>,
  dopo: Partial<Record<CampoCronologia, string | null>>
): Modifica[] {
  const esito: Modifica[] = []
  for (const campo of Object.keys(dopo) as CampoCronologia[]) {
    const nuovo = dopo[campo] ?? null
    if (nuovo !== prima[campo]) esito.push({ campo, prima: prima[campo], dopo: nuovo })
  }
  return esito
}

// `TransactionClient` da `@/lib/prisma`, non `Prisma.TransactionClient` di
// `@prisma/client`: quello descrive il client *nudo*, mentre `prisma` è esteso
// ($extends per i cancellati logici e i campi cifrati), e i due tipi non
// combaciano — vedi il commento su `TransactionClient` in `src/lib/prisma.ts`.
export async function registraModifiche(
  tx: TransactionClient,
  input: { bankTransactionId: string; userId: string | null; modifiche: Modifica[] }
): Promise<void> {
  if (input.modifiche.length === 0) return
  await tx.bankTransactionEdit.createMany({
    data: input.modifiche.map((m) => ({
      bankTransactionId: input.bankTransactionId,
      campo: m.campo,
      prima: m.prima,
      dopo: m.dopo,
      userId: input.userId,
    })),
  })
}
