import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'

/**
 * Autenticazione finta, database vero.
 *
 * È l'inverso del pattern dei test unitari, dove si mocka Prisma: qui l'unica
 * cosa sostituita è NextAuth, che vorrebbe cookie e richieste HTTP vere. Tutto
 * il resto — permessi, foreign key, transazioni — passa dal database reale, e
 * l'utente della sessione è un utente vero del seed: il suo id finisce davvero
 * nelle colonne `created_by`, `validated_by` e simili, quindi i vincoli di
 * integrità vengono esercitati invece che aggirati.
 */

export type SeedRole = 'admin' | 'manager' | 'staff'

/**
 * La sessione vive su `globalThis` e non in una variabile di modulo: la factory
 * di `vi.mock` e il file di test possono risolvere questo modulo per strade
 * diverse, e due copie dello stato significherebbero un `loginAs` che non ha
 * effetto sulla route sotto test.
 */
const SESSION_SLOT = Symbol.for('weiss.itest.session')

type SessionHolder = { [SESSION_SLOT]?: Session | null }

function holder(): SessionHolder {
  return globalThis as unknown as SessionHolder
}

/** Sessione corrente, `null` se nessuno ha fatto login. */
export function currentSession(): Session | null {
  return holder()[SESSION_SLOT] ?? null
}

/** Imposta a mano una sessione arbitraria (utile per i casi limite). */
export function setSession(session: Session | null): void {
  holder()[SESSION_SLOT] = session
}

/** Azzera la sessione: le route risponderanno 401. */
export function logout(): void {
  setSession(null)
}

function sessionFromUser(user: {
  id: string
  email: string | null
  username: string
  firstName: string
  lastName: string
  roleId: string
  venueId: string | null
  mustChangePassword: boolean
  role: { name: string }
  venue: { name: string; code: string } | null
}): Session {
  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role.name,
      roleId: user.roleId,
      venueId: user.venueId,
      venueName: user.venue?.name ?? null,
      venueCode: user.venue?.code ?? null,
      mustChangePassword: user.mustChangePassword,
    },
    expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  } as Session
}

/**
 * Entra come utente reale del seed con il ruolo richiesto e restituisce la
 * sessione creata (comoda per leggerne l'id o la sede).
 */
export async function loginAs(role: SeedRole): Promise<Session> {
  const user = await prisma.user.findFirst({
    where: { role: { name: role }, isActive: true },
    include: { role: true, venue: true },
    orderBy: { username: 'asc' },
  })

  if (!user) {
    throw new Error(
      `Nessun utente con ruolo "${role}" nel database di test: il seed non è stato applicato.`
    )
  }

  const session = sessionFromUser(user)
  setSession(session)
  return session
}

/** Come `loginAs`, ma per un utente specifico già creato dal test. */
export async function loginAsUser(userId: string): Promise<Session> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true, venue: true },
  })

  if (!user) {
    throw new Error(`Utente ${userId} inesistente: impossibile autenticarlo.`)
  }

  const session = sessionFromUser(user)
  setSession(session)
  return session
}

async function permissionsOf(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  })

  return user?.role.permissions.map((rp) => rp.permission.code) ?? []
}

function notImplemented(name: string) {
  return () => {
    throw new Error(
      `"${name}" non è disponibile nei test di integrazione: usa loginAs()/logout().`
    )
  }
}

/**
 * Sostituto di `@/lib/auth`, da passare alla factory di `vi.mock`. Rimpiazza
 * solo la parte NextAuth: i controlli di permesso restano quelli veri, letti
 * dal database di test.
 */
export function authModuleMock() {
  return {
    auth: async () => currentSession(),
    getServerSession: async () => currentSession(),
    signIn: notImplemented('signIn'),
    signOut: notImplemented('signOut'),
    handlers: { GET: notImplemented('handlers.GET'), POST: notImplemented('handlers.POST') },
    hasPermission: async (userId: string, permissionCode: string) =>
      (await permissionsOf(userId)).includes(permissionCode),
    getUserPermissions: permissionsOf,
  }
}
