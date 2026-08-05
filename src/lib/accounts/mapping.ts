import { prisma } from '@/lib/prisma'

/**
 * Il conto del piano dei conti è l'unico asse di imputazione: la categoria di
 * budget è un'etichetta derivata dalla mappatura AccountBudgetMapping (1:1).
 * Null quando il conto non è mappato o è escluso dal budget: in quel caso il
 * movimento resta senza categoria derivata, mai inventarne una.
 * Vedi docs/superpowers/specs/2026-08-05-allocation-design.md (Fase 0).
 */
export async function derivaBudgetCategoryDaConto(accountId: string): Promise<string | null> {
  const mapping = await prisma.accountBudgetMapping.findUnique({
    where: { accountId },
    select: { budgetCategoryId: true, includeInBudget: true },
  })
  if (!mapping || !mapping.includeInBudget) return null
  return mapping.budgetCategoryId
}
