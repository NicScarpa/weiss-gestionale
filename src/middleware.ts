import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

// Rotte accessibili agli utenti Staff (portale + API correlate)
const STAFF_ALLOWED_PREFIXES = [
  '/portale',
  '/login',
  '/api/auth',
  '/api/attendance',
  '/api/leave-requests',
  '/api/portal',
  '/api/shift-swaps',
  '/api/leave-balance',
  '/api/leave-types',
  '/api/shift-definitions',
  '/api/shifts',
  '/api/schedules',
]

// Rotte pubbliche (non richiedono autenticazione)
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth',
  '/invito',
]

function isPathAllowed(pathname: string, prefixes: string[]) {
  return prefixes.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'))
}

export default auth((req) => {
  const { pathname } = req.nextUrl
  const token = req.auth

  // Rotte pubbliche: accessibili a tutti
  if (isPathAllowed(pathname, PUBLIC_PREFIXES)) {
    return NextResponse.next()
  }

  // Utente non autenticato su rotta protetta → redirect login
  if (!token) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const role = token.user?.role as string | undefined

  // Staff su rotte non consentite
  if (role === 'staff') {
    // API del gestionale → 403
    if (pathname.startsWith('/api/') && !isPathAllowed(pathname, STAFF_ALLOWED_PREFIXES)) {
      return NextResponse.json(
        { error: 'Accesso non autorizzato' },
        { status: 403 }
      )
    }

    // Pagine del gestionale → redirect portale
    if (!isPathAllowed(pathname, STAFF_ALLOWED_PREFIXES)) {
      return NextResponse.redirect(new URL('/portale', req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|icons|manifest|sw\\.js).*)']
}
