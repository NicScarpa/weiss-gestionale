/**
 * Utility per generazione e gestione username
 *
 * Regole:
 * - Admin/Manager: usa email come username
 * - Staff: genera username dal nome (NomeCognome senza accenti/spazi)
 * - Se duplicato, aggiunge suffisso numerico (NomeCognome2, NomeCognome3, ...)
 */

import type { Prisma } from '@prisma/client'

/**
 * Il solo pezzo di client che questa funzione usa.
 *
 * Descritto per struttura e non come `PrismaClient`: i chiamanti passano il
 * client esteso di `@/lib/prisma` (cifratura + soft delete), i cui delegate non
 * sono lo stesso tipo di quelli del client nudo. Prima qui c'era un `| any`,
 * che rendeva `any` l'intero risultato di `findMany` e con esso ogni riga sotto.
 */
type ClientUtenti = {
  user: {
    findMany(args: {
      where: Prisma.UserWhereInput
      select: { username: true }
    }): Promise<Array<{ username: string }>>
  }
}

/**
 * Normalizza una stringa rimuovendo accenti, spazi e caratteri speciali
 */
export function normalizeString(str: string): string {
  return str
    // Normalizza Unicode (NFD separa i caratteri base dai diacritici)
    .normalize('NFD')
    // Rimuove i diacritici (accenti)
    .replace(/[\u0300-\u036f]/g, '')
    // Rimuove apostrofi e caratteri speciali
    .replace(/[''`]/g, '')
    // Rimuove spazi
    .replace(/\s+/g, '')
    // Solo lettere e numeri
    .replace(/[^a-zA-Z0-9]/g, '')
}

/**
 * Genera username base dal nome e cognome
 * Es: "Mario" + "Rossi" → "MarioRossi"
 * Es: "Nicolò" + "De Andrè" → "NicoloDeAndre"
 */
export function generateUsername(firstName: string, lastName: string): string {
  const normalizedFirst = normalizeString(firstName)
  const normalizedLast = normalizeString(lastName)

  // Capitalizza prima lettera di ogni parte
  const capitalizedFirst = normalizedFirst.charAt(0).toUpperCase() + normalizedFirst.slice(1).toLowerCase()
  const capitalizedLast = normalizedLast.charAt(0).toUpperCase() + normalizedLast.slice(1).toLowerCase()

  return `${capitalizedFirst}${capitalizedLast}`
}

/**
 * Genera uno username unico, aggiungendo suffisso numerico se necessario
 *
 * @param prisma - Istanza Prisma per query database
 * @param firstName - Nome utente
 * @param lastName - Cognome utente
 * @param excludeUserId - ID utente da escludere dalla verifica (per aggiornamenti)
 */
export async function generateUniqueUsername(
  prisma: ClientUtenti,
  firstName: string,
  lastName: string,
  excludeUserId?: string
): Promise<string> {
  const baseUsername = generateUsername(firstName, lastName)

  // Cerca username esistenti che iniziano con lo stesso base
  const existingUsers = await prisma.user.findMany({
    where: {
      username: {
        startsWith: baseUsername,
      },
      ...(excludeUserId && { NOT: { id: excludeUserId } }),
    },
    select: { username: true },
  })

  if (existingUsers.length === 0) {
    return baseUsername
  }

  // Estrai i suffissi numerici esistenti
  const existingUsernames = new Set(existingUsers.map(u => u.username))

  // Se il base username non esiste, usalo
  if (!existingUsernames.has(baseUsername)) {
    return baseUsername
  }

  // Trova il primo suffisso disponibile
  let suffix = 2
  while (existingUsernames.has(`${baseUsername}${suffix}`)) {
    suffix++
  }

  return `${baseUsername}${suffix}`
}

/**
 * Genera username per admin/manager (usa email)
 */
export function generateAdminUsername(email: string): string {
  return email.toLowerCase()
}

/**
 * Determina se un utente deve usare email o username generato
 */
export function shouldUseEmailAsUsername(role: string): boolean {
  return role === 'admin' || role === 'manager'
}
