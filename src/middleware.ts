import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decodeJwt } from 'jose'

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

  // Handle CORS preflight
  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin') || ''
    const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || ''
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin === allowedOrigin ? allowedOrigin : '',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

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

  // Verifica scadenza JWT (decode senza verifica firma — Edge runtime limitation)
  try {
    const payload = decodeJwt(sessionToken)
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
  } catch {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const response = NextResponse.next()
  if (pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin') || ''
    const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || ''
    if (origin === allowedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
    }
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|icons|manifest|sw\\.js).*)']
}
