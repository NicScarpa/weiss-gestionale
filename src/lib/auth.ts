import NextAuth, { type DefaultSession } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from './prisma'

// Extend NextAuth types
declare module 'next-auth' {
  interface User {
    id: string
    email: string
    firstName: string
    lastName: string
    role: string
    roleId: string
    venueId: string | null
    venueName: string | null
    venueCode: string | null
  }

  interface Session {
    user: User & DefaultSession['user']
  }
}

// JWT type extension
interface CustomJWT {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  roleId: string
  venueId: string | null
  venueName: string | null
  venueCode: string | null
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email e password richiesti')
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            role: true,
            venue: true
          }
        })

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

        return {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role.name,
          roleId: user.roleId,
          venueId: user.venueId,
          venueName: user.venue?.name ?? null,
          venueCode: user.venue?.code ?? null
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.firstName = user.firstName
        token.lastName = user.lastName
        token.role = user.role
        token.roleId = user.roleId
        token.venueId = user.venueId
        token.venueName = user.venueName
        token.venueCode = user.venueCode
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.firstName = token.firstName as string
        session.user.lastName = token.lastName as string
        session.user.role = token.role as string
        session.user.roleId = token.roleId as string
        session.user.venueId = token.venueId as string | null
        session.user.venueName = token.venueName as string | null
        session.user.venueCode = token.venueCode as string | null
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
    maxAge: 30 * 24 * 60 * 60, // 30 giorni
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
