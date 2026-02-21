import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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
  '/forgot-password',
  '/reset-password',
  '/api/auth',
  '/invito',
  '/api/staff/invite/complete',
]

function isPathAllowed(pathname: string, prefixes: string[]) {
  return prefixes.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rotte pubbliche: accessibili a tutti
  if (isPathAllowed(pathname, PUBLIC_PREFIXES)) {
    return NextResponse.next()
  }

  // Verifica la presenza del session token (next-auth JWT)
  const sessionToken = request.cookies.get('authjs.session-token')?.value
    || request.cookies.get('__Secure-authjs.session-token')?.value

  // Utente non autenticato su rotta protetta → redirect login
  if (!sessionToken) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Nota: il controllo ruolo staff viene gestito lato server nelle API routes
  // perché decodificare il JWT nel middleware edge richiede librerie Node.js.
  // Per le pagine, il redirect avviene lato client tramite la sessione.

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|icons|manifest|sw\\.js).*)']
}
