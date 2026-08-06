import { beforeEach, vi } from 'vitest'
import { applyTestEnv } from './src/test/integration/env-guard'

/**
 * Setup dei test di integrazione. Gira come `setupFiles`, cioè prima che il
 * file di test (e quindi `src/lib/prisma.ts`) venga importato: è l'unico
 * momento utile per impostare `DATABASE_URL`, perché la Pool di `pg` viene
 * creata al primo import di quel modulo e non rilegge più l'ambiente.
 *
 * Non si riusa `vitest.setup.ts`: quello sovrascrive `DATABASE_URL` con un
 * valore fittizio, pensato per i test unitari dove Prisma è mockato.
 */
applyTestEnv()

/**
 * NextAuth è l'unica dipendenza sostituita: vorrebbe cookie e richieste HTTP
 * vere, mentre tutto il resto deve restare reale. Il mock sta qui e non nei
 * singoli file perché nessun test di integrazione deve poterselo dimenticare e
 * finire per interrogare NextAuth davvero.
 */
vi.mock('@/lib/auth', async () => {
  const { authModuleMock } = await import('./src/test/integration/auth-mock')
  return authModuleMock()
})

/** Ogni test parte sloggato: l'autenticazione va dichiarata, non ereditata. */
beforeEach(async () => {
  const { logout } = await import('./src/test/integration/auth-mock')
  logout()
})
