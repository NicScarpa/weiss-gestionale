import NextAuth, { type DefaultSession } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from './prisma'

// Extend NextAuth types
declare module 'next-auth' {
  interface User {
    id: string
    email: string | null
    username: string
    firstName: string
    lastName: string
    role: string
    roleId: string
    venueId: string | null
    venueName: string | null
    venueCode: string | null
    mustChangePassword: boolean
  }

  interface Session {
    user: User & DefaultSession['user']
  }
}

// JWT type extension
interface _CustomJWT {
  id: string
  email: string | null
  username: string
  firstName: string
  lastName: string
  role: string
  roleId: string
  venueId: string | null
  venueName: string | null
  venueCode: string | null
  mustChangePassword: boolean
}

// Helper per ottenere la sessione lato server (per API routes)
export async function getServerSession() {
  const session = await auth()
  return session
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        identifier: { label: 'Username o Email', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) {
          throw new Error('Username/Email e password richiesti')
        }

        const identifier = credentials.identifier as string

        // Cerca prima per username, poi per email
        let user = await prisma.user.findUnique({
          where: { username: identifier },
          include: {
            role: true,
            venue: true
          }
        })

        // Se non trovato per username, cerca per email
        if (!user) {
          user = await prisma.user.findUnique({
            where: { email: identifier },
            include: {
              role: true,
              venue: true
            }
          })
        }

        if (!user) {
          throw new Error('Credenziali non valide')
        }

        if (!user.isActive) {
          throw new Error('Account disattivato')
        }

        const isValidPassword = await compare(
          credentials.password as string,
          user.passwordHash
        )

        if (!isValidPassword) {
          throw new Error('Credenziali non valide')
        }

        // Aggiorna lastLoginAt
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() }
        })

        return {
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
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.username = user.username
        token.firstName = user.firstName
        token.lastName = user.lastName
        token.role = user.role
        token.roleId = user.roleId
        token.venueId = user.venueId
        token.venueName = user.venueName
        token.venueCode = user.venueCode
        token.mustChangePassword = user.mustChangePassword
      }
      // Verifica periodica che l'utente sia ancora attivo
      if (!user && token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { isActive: true, mustChangePassword: true }
        })
        if (!dbUser || !dbUser.isActive) return {} as typeof token
        token.mustChangePassword = dbUser.mustChangePassword
      }
      // Aggiorna mustChangePassword dopo cambio password
      if (trigger === 'update') {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { mustChangePassword: true }
        })
        if (dbUser) {
          token.mustChangePassword = dbUser.mustChangePassword
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        // Email può essere null per staff che usano solo username
        ;(session.user as { email: string | null }).email = token.email as string | null
        session.user.username = token.username as string
        session.user.firstName = token.firstName as string
        session.user.lastName = token.lastName as string
        session.user.role = token.role as string
        session.user.roleId = token.roleId as string
        session.user.venueId = token.venueId as string | null
        session.user.venueName = token.venueName as string | null
        session.user.venueCode = token.venueCode as string | null
        session.user.mustChangePassword = token.mustChangePassword as boolean
      }
      return session
    }
  },
  pages: {
    signIn: '/login',
    error: '/login'
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 ore
  },
  trustHost: true
})

// Helper per verificare permessi
export async function hasPermission(userId: string, permissionCode: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true
            }
          }
        }
      }
    }
  })

  if (!user) return false

  return user.role.permissions.some(rp => rp.permission.code === permissionCode)
}

// Helper per ottenere tutti i permessi dell'utente
export async function getUserPermissions(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true
            }
          }
        }
      }
    }
  })

  if (!user) return []

  return user.role.permissions.map(rp => rp.permission.code)
}
