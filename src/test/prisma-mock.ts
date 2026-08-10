import type { PrismaPromise } from '@prisma/client'

/**
 * Una `PrismaPromise` vera, per i mock che rimpiazzano un metodo del client.
 *
 * `mockResolvedValue` funziona da sé, ma `mockImplementation` no: i metodi del
 * client Prisma non promettono una `Promise`, promettono una `PrismaPromise`,
 * e una funzione `async` ordinaria non lo è. L'errore che ne esce è lungo tre
 * righe e finisce con «Type 'string' is not assignable to type
 * "PrismaPromise"», che non aiuta a capire cosa manchi.
 *
 * Ciò che manca è solo il tag: `PrismaPromise<T>` è una `Promise<T>` con
 * `[Symbol.toStringTag]` fissato, ed è quello che permette a `$transaction` di
 * raccogliere le query invece di eseguirle subito. Aggiungerlo costa una riga e
 * rende il finto client indistinguibile da quello vero su questo punto —
 * meglio di un cast, che lo nasconderebbe e basta.
 */
export function prismaPromise<T>(valore: T): PrismaPromise<T> {
  return Object.assign(Promise.resolve(valore), {
    [Symbol.toStringTag]: 'PrismaPromise' as const,
  })
}
